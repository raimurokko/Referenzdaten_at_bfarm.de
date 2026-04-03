/*
 * BfArM Arzneimittel-API — Standalone-Modul fuer externe Einbindung
 *
 * Serverless: Laeuft komplett im Browser (sql.js WASM + Codeberg-hosted DB).
 * Keine Server-Infrastruktur noetig.
 *
 * Einbindung auf einer Drittseite:
 *
 *   <script src="https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/web/js/bfarm-api.js"></script>
 *   <script>
 *     var api = new BfarmAPI();
 *     api.init().then(function() {
 *       api.checkSpelling('Barazettamuhl').then(function(result) {
 *         console.log(result);
 *         // { found: false, suggestions: [{name: "Paracetamol", score: 0.87, method: "phonetisch"}] }
 *       });
 *     });
 *   </script>
 */

(function (global) {
    'use strict';

    var DEFAULTS = {
        dbURL: 'https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/db/bfarm.db',
        sqljsCDN: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3'
    };

    // ─── Embedded Phonetics (standalone, no dependencies) ───

    var CM = {
        'A':'0','E':'0','I':'0','O':'0','U':'0',
        'Ä':'0','Ö':'0','Ü':'0','H':'',
        'B':'1','P':'1','D':'2','T':'2',
        'F':'3','V':'3','W':'3',
        'G':'4','K':'4','Q':'4',
        'L':'5','M':'6','N':'6','R':'7',
        'S':'8','Z':'8','X':'48','J':'0','Y':'0'
    };

    function colPhon(w) {
        if (!w) return '';
        w = w.toUpperCase().trim().replace(/ß/g, 'SS').replace(/PH/g, 'F');
        var codes = [];
        for (var i = 0; i < w.length; i++) {
            var c = w[i], p = w[i - 1] || '', n = w[i + 1] || '';
            var code;
            if (c === 'C') {
                if (i === 0 && 'AHKLOQRUX'.includes(n)) code = '4';
                else if ('SZ'.includes(p) && 'AHKOQUX'.includes(n)) code = '8';
                else if ('AHKOQUX'.includes(n)) code = '4';
                else code = '8';
            } else if (c === 'D' || c === 'T') code = 'CSZ'.includes(n) ? '8' : '2';
            else if (c === 'P') code = n === 'H' ? '3' : '1';
            else if (CM[c] !== undefined) code = CM[c];
            else continue;
            codes.push(code);
        }
        return codes.filter(function (c, i) { return i === 0 || c !== codes[i - 1]; }).join('').replace(/0/g, '') || '0';
    }

    function lev(a, b) {
        if (a.length < b.length) return lev(b, a);
        if (!b.length) return a.length;
        var prev = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
        for (var i = 0; i < a.length; i++) {
            var curr = [i + 1];
            for (var j = 0; j < b.length; j++)
                curr.push(Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (a[i] !== b[j] ? 1 : 0)));
            prev = curr;
        }
        return prev[b.length];
    }

    function trigSim(a, b) {
        var t = function (s) {
            s = '  ' + s.toLowerCase() + '  ';
            var r = new Set();
            for (var i = 0; i < s.length - 2; i++) r.add(s.substr(i, 3));
            return r;
        };
        var t1 = t(a), t2 = t(b);
        if (!t1.size || !t2.size) return 0;
        var inter = 0;
        t1.forEach(function (x) { if (t2.has(x)) inter++; });
        return inter / (t1.size + t2.size - inter);
    }

    function normPharma(s) {
        s = s.toLowerCase().trim();
        var reps = [['ck','k'],['ph','f'],['th','t'],['sch','sh'],['ß','ss'],['ä','ae'],['ö','oe'],['ü','ue'],['k','c'],['z','s'],['y','i']];
        for (var i = 0; i < reps.length; i++) s = s.split(reps[i][0]).join(reps[i][1]);
        return s.split('').filter(function (c, i, a) { return i === 0 || c !== a[i - 1]; }).join('');
    }

    function phonSim(c1, c2) {
        if (!c1 || !c2) return 0;
        if (c1 === c2) return 1;
        var ml = Math.max(c1.length, c2.length), d = lev(c1, c2);
        return d > ml * 0.4 ? 0 : 1 - d / ml;
    }

    // ─── Embedded Scoring ───────────────────────────────

    var WEIGHTS = { exakt:1, normalisiert:0.95, 'norm_enthält':0.88, 'präfix':0.85, 'enthält':0.7, phonetisch:0.9, levenshtein:0.6, trigram:0.4 };

    function computeScores(query, target) {
        var sc = {}, ql = query.toLowerCase(), tl = target.toLowerCase();
        if (ql === tl) sc.exakt = 1;
        var qn = normPharma(query), tn = normPharma(target);
        if (qn === tn) sc.normalisiert = 1;
        else { var nd = lev(qn, tn), mx = Math.max(qn.length, tn.length); if (mx > 0 && nd <= 2) sc.normalisiert = 1 - nd / mx; }
        if (!sc.normalisiert && qn.length >= 4) {
            if (tn.startsWith(qn)) sc['norm_enthält'] = Math.min(Math.max(0.75, qn.length / tn.length * 1.3), 1);
            else if (tn.includes(qn)) sc['norm_enthält'] = Math.min(qn.length / tn.length * 1.1, 0.9);
            else if (qn.length <= tn.length) { var ps = tn.slice(0, qn.length + 1), pd = lev(qn, ps); if (pd <= 2) sc['norm_enthält'] = Math.max(0.65, 1 - pd / Math.max(qn.length, ps.length)); }
        }
        if (tl.startsWith(ql)) sc['präfix'] = ql.length / tl.length;
        if (ql.length > 0 && tl.includes(ql) && !sc['präfix']) sc['enthält'] = ql.length / tl.length;
        var qc = colPhon(query), bp = 0;
        target.split(/[\s,]+/).forEach(function (w) { bp = Math.max(bp, phonSim(qc, colPhon(w))); });
        bp = Math.max(bp, phonSim(qc, colPhon(target.replace(/\s/g, ''))));
        if (bp > 0.5) sc.phonetisch = bp;
        if (query.length >= 3) { var bl = 0; target.split(/[\s,]+/).forEach(function (w) { if (Math.abs(w.length - query.length) <= 4) { var d = lev(ql, w.toLowerCase()), ml = Math.max(query.length, w.length); bl = Math.max(bl, 1 - d / ml); } }); if (bl > 0.5) sc.levenshtein = bl; }
        if (query.length >= 4) { var ts = trigSim(query, target); if (ts > 0.15) sc.trigram = ts; }
        return sc;
    }

    function rankMatches(matches) {
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var weighted = Object.entries(m.scores).map(function (e) { return [(WEIGHTS[e[0]] || 0.5) * e[1], e[0]]; });
            var best = 0, method = '';
            for (var j = 0; j < weighted.length; j++) { if (weighted[j][0] > best) { best = weighted[j][0]; method = weighted[j][1]; } }
            var strong = weighted.filter(function (w) { return w[0] > 0.4; }).length;
            var bonus = strong >= 3 ? 0.08 : strong >= 2 ? 0.04 : 0;
            if (method === 'phonetisch' && Object.keys(m.scores).length === 1 && (m.scores.phonetisch || 0) < 0.95) best *= 0.65;
            m.totalScore = Math.min(best + bonus, 1);
            m.bestMethod = method;
        }
        return matches.sort(function (a, b) { return b.totalScore - a.totalScore; });
    }

    // ─── API Class ──────────────────────────────────────

    function BfarmAPI(options) {
        options = options || {};
        this._dbURL = options.dbURL || DEFAULTS.dbURL;
        this._sqljsCDN = options.sqljsCDN || DEFAULTS.sqljsCDN;
        this._db = null;
        this._substanceCache = null;
        this._medicationCache = null;
        this._ready = false;
    }

    BfarmAPI.prototype.init = function (onProgress) {
        var self = this;
        if (!onProgress) onProgress = function () {};

        return new Promise(function (resolve, reject) {
            // Load sql.js if not already present
            var loadSqlJs;
            if (typeof initSqlJs === 'function') {
                loadSqlJs = Promise.resolve();
            } else {
                loadSqlJs = new Promise(function (res, rej) {
                    var script = document.createElement('script');
                    script.src = self._sqljsCDN + '/sql-wasm.js';
                    script.onload = res;
                    script.onerror = function () { rej(new Error('sql.js konnte nicht geladen werden')); };
                    document.head.appendChild(script);
                });
            }

            loadSqlJs.then(function () {
                onProgress('Lade sql.js WASM ...');
                return initSqlJs({ locateFile: function (f) { return self._sqljsCDN + '/' + f; } });
            }).then(function (SQL) {
                onProgress('Lade Datenbank ...');
                return fetch(self._dbURL).then(function (resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    var total = parseInt(resp.headers.get('content-length') || '0');
                    var reader = resp.body.getReader();
                    var chunks = [], loaded = 0;
                    function read() {
                        return reader.read().then(function (r) {
                            if (r.done) return;
                            chunks.push(r.value); loaded += r.value.length;
                            if (total > 0) onProgress((loaded / 1048576).toFixed(1) + ' MB (' + ((loaded / total) * 100).toFixed(0) + '%)');
                            return read();
                        });
                    }
                    return read().then(function () {
                        var buf = new Uint8Array(loaded); var off = 0;
                        for (var i = 0; i < chunks.length; i++) { buf.set(chunks[i], off); off += chunks[i].length; }
                        self._db = new SQL.Database(buf);
                        self._ready = true;
                        resolve();
                    });
                });
            }).catch(reject);
        });
    };

    BfarmAPI.prototype.isReady = function () { return this._ready; };

    BfarmAPI.prototype._getSubstances = function () {
        if (!this._substanceCache) {
            var r = this._db.exec('SELECT DISTINCT rse_substance_name, rse_substance_id FROM substance WHERE rse_substance_name IS NOT NULL');
            this._substanceCache = r.length ? r[0].values.map(function (row) { return { name: row[0], id: row[1] }; }) : [];
        }
        return this._substanceCache;
    };

    BfarmAPI.prototype._getMedications = function () {
        if (!this._medicationCache) {
            var r = this._db.exec('SELECT DISTINCT rmp_mpd_name, rmp_pzn FROM medicinal_product WHERE rmp_mpd_name IS NOT NULL');
            this._medicationCache = r.length ? r[0].values.map(function (row) { return { name: row[0], pzn: row[1] }; }) : [];
        }
        return this._medicationCache;
    };

    BfarmAPI.prototype.checkSpelling = function (name, type) {
        type = type || 'substance';
        var results = type === 'medication' ? this.searchMedication(name) : this.searchSubstance(name);
        var exact = null;
        for (var i = 0; i < results.length; i++) {
            if (results[i].name.toLowerCase() === name.toLowerCase()) { exact = results[i].name; break; }
        }
        return {
            input: name,
            found: exact !== null,
            exact_match: exact,
            suggestions: results.filter(function (r) { return r.name.toLowerCase() !== name.toLowerCase(); }).slice(0, 10).map(function (r) {
                return { name: r.name, score: Math.round(r.totalScore * 1000) / 1000, method: r.bestMethod };
            })
        };
    };

    BfarmAPI.prototype.searchSubstance = function (query, maxResults) {
        maxResults = maxResults || 25;
        var subs = this._getSubstances(), matches = [], seen = new Set();
        for (var i = 0; i < subs.length; i++) {
            var sc = computeScores(query, subs[i].name);
            if (Object.keys(sc).length && !seen.has(subs[i].name.toLowerCase())) {
                seen.add(subs[i].name.toLowerCase());
                matches.push({ name: subs[i].name, id: subs[i].id, scores: sc, totalScore: 0, bestMethod: '' });
            }
        }
        return rankMatches(matches).slice(0, maxResults);
    };

    BfarmAPI.prototype.searchMedication = function (query, maxResults) {
        maxResults = maxResults || 25;
        var meds = this._getMedications(), matches = [], seen = new Set();
        for (var i = 0; i < meds.length; i++) {
            var sc = computeScores(query, meds[i].name);
            if (Object.keys(sc).length && !seen.has(meds[i].name.toLowerCase())) {
                seen.add(meds[i].name.toLowerCase());
                matches.push({ name: meds[i].name, pzn: meds[i].pzn, scores: sc, totalScore: 0, bestMethod: '' });
            }
        }
        return rankMatches(matches).slice(0, maxResults);
    };

    BfarmAPI.prototype.lookupPZN = function (pzn) {
        pzn = String(pzn).replace(/\D/g, '').padStart(8, '0');
        var rows = this._db.exec(
            "SELECT mp.rmp_pzn, mp.rmp_mpd_name, mp.rmp_pfm_put_long, " +
            "s.rse_substance_name, s.rse_substance_strength " +
            "FROM medicinal_product mp " +
            "LEFT JOIN pharmaceutical_product pp ON mp.rmp_key = pp.rmp_key " +
            "LEFT JOIN substance s ON pp.rpp_key = s.rpp_key " +
            "WHERE mp.rmp_pzn = '" + pzn + "' ORDER BY s.rse_substance_rank"
        );
        if (!rows.length) return null;
        var result = { pzn: null, name: null, form: null, substances: [] };
        for (var i = 0; i < rows[0].values.length; i++) {
            var r = rows[0].values[i];
            if (!result.pzn) { result.pzn = r[0]; result.name = r[1]; result.form = r[2]; }
            if (r[3]) result.substances.push({ name: r[3], strength: r[4] });
        }
        return result;
    };

    // Export
    global.BfarmAPI = BfarmAPI;

})(typeof window !== 'undefined' ? window : this);
