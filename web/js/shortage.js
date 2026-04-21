/*
 * BfArM Referenzdaten — Lieferengp\u00e4sse + Generika-Vorschl\u00e4ge
 *
 * Lieferengpass-Daten: In bfarm.db importiert (Tabelle: lieferengpass)
 * Quelle: PharmNet.Bund CSV (beim 14-Tage-Update importiert)
 * Generika: Gleicher Wirkstoff (rse_substance_id)
 *
 * Datenmodell (nach Analyse der Diskrepanz 1002/995/983):
 *   _entries = [meldung, ...]                  // ALLE Meldungen (inkl. ohne PZN,
 *                                                 z.B. Importe, Klinikpackungen,
 *                                                 Rezeptursubstanzen)
 *   _cache[pzn] = [meldung1, meldung2, ...]   // Nur Meldungen MIT echter PZN;
 *                                                Array, weil dieselbe PZN mehrfach
 *                                                gemeldet sein kann (unterschied-
 *                                                liche Zeitr\u00e4ume, Gr\u00fcnde, etc.)
 *
 *   checkPZN(pzn)      \u2192 erste Meldung (rueckwaertskompat.), bei >1 mit .meldungen[]
 *   checkAllPZN(pzn)   \u2192 alle Meldungen fuer die PZN
 *   getAll()           \u2192 alle Meldungen (flach) \u2192 Shortage-Panel zeigt alle 1002
 *   getCount()         \u2192 Gesamt-Meldungen (z.B. 1002)
 *   getIndexedCount()  \u2192 Meldungen mit echter PZN (z.B. 995)
 *   getUniqueCount()   \u2192 Anzahl unique PZNs (z.B. 983)
 */

var BfarmShortage = (function () {
    'use strict';

    var _loaded = false;
    var _cache = {};      // PZN -> Array<MeldungObj>  (nur Meldungen mit echter PZN)
    var _entries = [];    // flat list ALLER Meldungen (inkl. Meldungen ohne PZN,
                          //   z.B. Importe, Klinikpackungen, Rezeptursubstanzen)
    var _count = 0;       // == _entries.length  (Gesamt-Meldungen)
    var _indexedCount = 0; // Meldungen mit echter PZN (fuer PZN-Lookup)

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
                    var rawPzn = (row[0] || '').padStart(8, '0');
                    var hasPzn = !!(rawPzn && rawPzn !== '00000000');
                    var entry = {
                        pzn: hasPzn ? rawPzn : '',   // '' statt '00000000' fuer UI
                        hasPzn: hasPzn,
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
                    // ALLE Meldungen in die flache Liste (inkl. PZN-lose)
                    _entries.push(entry);
                    // Nur Meldungen mit echter PZN in den Lookup-Cache
                    if (hasPzn) {
                        if (!_cache[rawPzn]) _cache[rawPzn] = [];
                        _cache[rawPzn].push(entry);
                        _indexedCount++;
                    }
                });
                _count = _entries.length;
            }
        } catch (e) {
            // Tabelle existiert nicht (alte DB ohne Lieferengpass-Import)
            console.warn('Lieferengpass-Tabelle nicht vorhanden:', e.message);
        }
        _loaded = true;
        return Promise.resolve(_cache);
    }

    // Interner Helper: aus Array<MeldungObj> einen rueckwaertskompatiblen
    // Rueckgabewert bauen (erstes Element; bei >1 mit .meldungen annotiert).
    function _firstOrMerged(arr) {
        if (!arr || !arr.length) return null;
        if (arr.length === 1) return arr[0];
        // Kopie, damit Konsumenten, die Felder \u00fcberschreiben, das Cache-Array
        // nicht mutieren. meldungen[] enth\u00e4lt alle Originaleintr\u00e4ge.
        var first = arr[0];
        var merged = {};
        for (var k in first) {
            if (Object.prototype.hasOwnProperty.call(first, k)) merged[k] = first[k];
        }
        merged.meldungen = arr;
        return merged;
    }

    function checkPZN(pzn) {
        if (!_loaded) return null;
        pzn = String(pzn).trim().padStart(8, '0');
        return _firstOrMerged(_cache[pzn]);
    }

    function checkAllPZN(pzn) {
        if (!_loaded) return [];
        pzn = String(pzn).trim().padStart(8, '0');
        return (_cache[pzn] || []).slice();
    }

    function checkList(medList) {
        if (!_loaded) return [];
        return medList.filter(function (m) {
            return m.pzn && _cache[String(m.pzn).padStart(8, '0')];
        }).map(function (m) {
            return { med: m, shortage: _firstOrMerged(_cache[String(m.pzn).padStart(8, '0')]) };
        });
    }

    function isLoaded() { return _loaded; }
    function getCount() { return _count; }                   // alle Meldungen (inkl. PZN-lose)
    function getIndexedCount() { return _indexedCount; }     // Meldungen mit echter PZN
    function getUniqueCount() { return Object.keys(_cache).length; }  // unique PZNs

    function getAll() {
        if (!_loaded) return [];
        return _entries.slice();
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
                shortage: _firstOrMerged(_cache[String(pzn).padStart(8, '0')])
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
        checkAllPZN: checkAllPZN,
        checkList: checkList,
        isLoaded: isLoaded,
        getCount: getCount,
        getIndexedCount: getIndexedCount,
        getUniqueCount: getUniqueCount,
        getAll: getAll,
        findGenerika: findGenerika,
        countGenerika: countGenerika
    };
})();
