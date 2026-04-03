/*  BfArM Referenzdaten — Datenbank-Layer  */

var BfarmDB = (function () {
    'use strict';

    var db = null;
    var substanceCache = null;

    function init(onProgress) {
        return new Promise(function (resolve, reject) {
            if (!onProgress) onProgress = function () {};

            onProgress('Lade sql.js WASM ...');
            initSqlJs({
                locateFile: function (f) { return BFARM_CONFIG.SQLJS_CDN + '/' + f; }
            }).then(function (SQL) {
                // Versuche zuerst gzip-Version (14 MB statt 57 MB)
                var dbUrl = BFARM_CONFIG.DB_URL;
                var isGzip = false;
                var gzUrl = dbUrl + '.gz';

                onProgress('Lade Datenbank ...');

                function fetchWithProgress(url, onProg) {
                    return fetch(url).then(function (resp) {
                        if (!resp.ok) throw new Error('HTTP ' + resp.status);
                        var total = parseInt(resp.headers.get('content-length') || '0');
                        var reader = resp.body.getReader();
                        var chunks = [], loaded = 0;
                        function read() {
                            return reader.read().then(function (r) {
                                if (r.done) return;
                                chunks.push(r.value); loaded += r.value.length;
                                onProg(loaded, total);
                                return read();
                            });
                        }
                        return read().then(function () {
                            var buf = new Uint8Array(loaded); var off = 0;
                            for (var i = 0; i < chunks.length; i++) { buf.set(chunks[i], off); off += chunks[i].length; }
                            return buf;
                        });
                    });
                }

                function decompressGzip(buf) {
                    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
                    var blob = new Blob([buf]);
                    var ds = blob.stream().pipeThrough(new DecompressionStream('gzip'));
                    return new Response(ds).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
                }

                function progress(loaded, total) {
                    if (total > 0) onProgress((loaded / 1048576).toFixed(1) + ' MB (' + ((loaded / total) * 100).toFixed(0) + '%)');
                    else onProgress((loaded / 1048576).toFixed(1) + ' MB geladen ...');
                }

                // Lokal: unkomprimiert laden (schneller). Remote: gzip versuchen, Fallback unkomprimiert
                var isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
                var loadPromise;
                if (isLocal) {
                    loadPromise = fetchWithProgress(dbUrl, progress);
                } else {
                    loadPromise = fetchWithProgress(gzUrl, progress).then(function (buf) {
                        onProgress('Entpacke Datenbank ...');
                        return decompressGzip(buf);
                    }).catch(function () {
                        onProgress('Lade Datenbank ...');
                        return fetchWithProgress(dbUrl, progress);
                    });
                }
                return loadPromise.then(function (buf) {
                    onProgress('Initialisiere ...');
                    db = new SQL.Database(buf);
                    resolve(db);
                });
            }).catch(reject);
        });
    }

    function exec(sql) {
        if (!db) throw new Error('Datenbank nicht geladen');
        return db.exec(sql);
    }

    function getStats() {
        var stats = [
            { sql: 'SELECT COUNT(*) FROM medicinal_product', label: 'Arzneimittel' },
            { sql: 'SELECT COUNT(*) FROM pharmaceutical_product', label: 'Pharma-Produkte' },
            { sql: 'SELECT COUNT(DISTINCT rse_substance_name) FROM substance', label: 'Wirkstoffe' }
        ];
        return stats.map(function (s) {
            var val = db.exec(s.sql)[0].values[0][0];
            return { value: val.toLocaleString('de-DE'), label: s.label };
        });
    }

    function getSubstances() {
        if (!substanceCache) {
            var r = db.exec('SELECT DISTINCT rse_substance_name, rse_substance_id FROM substance WHERE rse_substance_name IS NOT NULL');
            substanceCache = r.length ? r[0].values.map(function (row) {
                return { name: row[0], id: row[1] };
            }) : [];
        }
        return substanceCache;
    }

    function getDataDate() {
        if (!db) return null;
        var r = db.exec("SELECT value FROM _import_meta WHERE key = 'data_date'");
        if (!r.length || !r[0].values.length) return null;
        var raw = r[0].values[0][0]; // "20260401"
        if (!raw || raw.length !== 8) return null;
        var y = raw.substring(0, 4), m = raw.substring(4, 6), d = raw.substring(6, 8);
        var date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        var next = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000);
        var now = new Date();
        var diffDays = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            raw: raw,
            formatted: d + '.' + m + '.' + y,
            nextUpdate: next,
            nextFormatted: next.getDate().toString().padStart(2, '0') + '.' +
                (next.getMonth() + 1).toString().padStart(2, '0') + '.' + next.getFullYear(),
            daysUntilUpdate: Math.max(0, diffDays)
        };
    }

    function getMedicationsForSubstance(substanceName) {
        if (!db) return [];
        var esc = substanceName.replace(/'/g, "''");
        var r = db.exec(
            "SELECT DISTINCT mp.rmp_pzn, mp.rmp_mpd_name, mp.rmp_pfm_put_long, " +
            "s.rse_substance_strength, s.rse_substance_id " +
            "FROM substance s " +
            "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
            "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
            "WHERE s.rse_substance_name = '" + esc + "' " +
            "ORDER BY mp.rmp_mpd_name"
        );
        if (!r.length) return [];
        return r[0].values.map(function (row) {
            return { pzn: row[0], name: row[1], form: row[2], strength: row[3], substanceId: row[4] };
        });
    }

    function isReady() {
        return db !== null;
    }

    function destroy() {
        if (db) {
            try { db.close(); } catch (e) {}
            db = null;
        }
        substanceCache = null;
    }

    return {
        init: init,
        exec: exec,
        getStats: getStats,
        getSubstances: getSubstances,
        getDataDate: getDataDate,
        getMedicationsForSubstance: getMedicationsForSubstance,
        isReady: isReady,
        destroy: destroy
    };
})();
