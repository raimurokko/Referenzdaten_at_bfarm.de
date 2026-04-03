/*
 * BfArM Referenzdaten — Lieferengp\u00e4sse + Generika-Vorschl\u00e4ge
 *
 * Lieferengpass-Daten: In bfarm.db importiert (Tabelle: lieferengpass)
 * Quelle: PharmNet.Bund CSV (beim 14-Tage-Update importiert)
 * Generika: Gleicher Wirkstoff (rse_substance_id)
 */

var BfarmShortage = (function () {
    'use strict';

    var _loaded = false;
    var _cache = {}; // PZN -> shortage info
    var _count = 0;

    // ─── Lieferengp\u00e4sse aus lokaler DB laden ────────────

    function loadShortages() {
        if (_loaded) return Promise.resolve(_cache);
        if (!BfarmDB.isReady()) return Promise.resolve(_cache);

        try {
            var r = BfarmDB.exec(
                "SELECT pzn, arzneimittel, beginn, ende, grund, anm_grund, " +
                "alternativpraeparat, meldungsart, wirkstoffe, atc_code, " +
                "krankenhausrelevant, zulassungsinhaber, darreichungsform, klassifikation " +
                "FROM lieferengpass"
            );
            if (r.length && r[0].values.length) {
                r[0].values.forEach(function (row) {
                    var pzn = (row[0] || '').padStart(8, '0');
                    if (!pzn || pzn === '00000000') return;
                    _cache[pzn] = {
                        pzn: pzn,
                        name: row[1] || '',
                        beginn: row[2] || '',
                        ende: row[3] || '',
                        grund: row[4] || '',
                        anmGrund: row[5] || '',
                        alternativ: (row[6] && row[6] !== 'N/A') ? row[6] : '',
                        art: row[7] || '',
                        wirkstoffe: row[8] || '',
                        atc: row[9] || '',
                        kkhRelevant: row[10] || '',
                        zulassungsinhaber: row[11] || '',
                        form: row[12] || '',
                        klassifikation: row[13] || ''
                    };
                });
                _count = Object.keys(_cache).length;
            }
        } catch (e) {
            // Tabelle existiert nicht (alte DB ohne Lieferengpass-Import)
            console.warn('Lieferengpass-Tabelle nicht vorhanden:', e.message);
        }
        _loaded = true;
        return Promise.resolve(_cache);
    }

    function checkPZN(pzn) {
        if (!_loaded) return null;
        pzn = String(pzn).trim().padStart(8, '0');
        return _cache[pzn] || null;
    }

    function checkList(medList) {
        if (!_loaded) return [];
        return medList.filter(function (m) {
            return m.pzn && _cache[String(m.pzn).padStart(8, '0')];
        }).map(function (m) {
            return { med: m, shortage: _cache[String(m.pzn).padStart(8, '0')] };
        });
    }

    function isLoaded() { return _loaded; }
    function getCount() { return _count; }

    function getAll() {
        if (!_loaded) return [];
        return Object.values(_cache);
    }

    // ─── Generika-Vorschl\u00e4ge ────────────────────────────

    function findGenerika(substanceId, currentPzn, maxResults) {
        if (!substanceId || !BfarmDB.isReady()) return [];
        maxResults = maxResults || 10;
        var esc = substanceId.replace(/'/g, "''");
        var pznExclude = currentPzn ? " AND mp.rmp_pzn != '" + currentPzn.replace(/'/g, "''") + "'" : '';
        var r = BfarmDB.exec(
            "SELECT DISTINCT mp.rmp_pzn, mp.rmp_mpd_name, mp.rmp_pfm_put_long, s.rse_substance_strength " +
            "FROM substance s " +
            "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
            "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
            "WHERE s.rse_substance_id = '" + esc + "'" + pznExclude +
            " ORDER BY mp.rmp_mpd_name LIMIT " + maxResults
        );
        if (!r.length) return [];
        return r[0].values.map(function (row) {
            var pzn = row[0];
            return {
                pzn: pzn,
                name: row[1],
                form: row[2],
                strength: row[3],
                shortage: _cache[String(pzn).padStart(8, '0')] || null
            };
        });
    }

    function countGenerika(substanceId, strength) {
        if (!substanceId || !BfarmDB.isReady()) return { total: 0, exact: 0 };
        var esc = substanceId.replace(/'/g, "''");
        // Gesamt: alle mit gleichem Wirkstoff
        var rTotal = BfarmDB.exec(
            "SELECT COUNT(DISTINCT mp.rmp_pzn) FROM substance s " +
            "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
            "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
            "WHERE s.rse_substance_id = '" + esc + "'"
        );
        var total = (rTotal.length && rTotal[0].values.length) ? rTotal[0].values[0][0] : 0;

        // Exakt: gleicher Wirkstoff + gleiche St\u00e4rke
        var exact = total;
        if (strength) {
            var escS = strength.replace(/'/g, "''");
            var rExact = BfarmDB.exec(
                "SELECT COUNT(DISTINCT mp.rmp_pzn) FROM substance s " +
                "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
                "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
                "WHERE s.rse_substance_id = '" + esc + "' AND s.rse_substance_strength = '" + escS + "'"
            );
            exact = (rExact.length && rExact[0].values.length) ? rExact[0].values[0][0] : 0;
        }
        return { total: total, exact: exact };
    }

    return {
        loadShortages: loadShortages,
        checkPZN: checkPZN,
        checkList: checkList,
        isLoaded: isLoaded,
        getCount: getCount,
        getAll: getAll,
        findGenerika: findGenerika,
        countGenerika: countGenerika
    };
})();
