/*  BfArM Referenzdaten — Suchfunktionen (Multi-Token)  */

var BfarmSearch = (function () {
    'use strict';

    function escapeSQL(s) {
        return s.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    function searchPZN(pzn) {
        pzn = pzn.replace(/\D/g, '').padStart(8, '0');
        var sql = "SELECT mp.rmp_pzn, mp.rmp_mpd_name, mp.rmp_pfm_put_long, " +
            "s.rse_substance_name, s.rse_substance_strength " +
            "FROM medicinal_product mp " +
            "LEFT JOIN pharmaceutical_product pp ON mp.rmp_key = pp.rmp_key " +
            "LEFT JOIN substance s ON pp.rpp_key = s.rpp_key " +
            "WHERE mp.rmp_pzn = '" + pzn + "' " +
            "ORDER BY s.rse_substance_rank";
        var rows = BfarmDB.exec(sql);
        if (!rows.length) return [];
        var grouped = {};
        for (var i = 0; i < rows[0].values.length; i++) {
            var row = rows[0].values[i];
            if (!grouped[row[0]]) {
                grouped[row[0]] = {
                    pzn: row[0], name: row[1], form: row[2],
                    substances: [], bestMethod: 'exakt', totalScore: 1
                };
            }
            if (row[3]) grouped[row[0]].substances.push({ name: row[3], strength: row[4] });
        }
        return Object.values(grouped);
    }

    function searchSubstance(query) {
        var subs = BfarmDB.getSubstances();
        var matches = [], seen = new Set();
        for (var i = 0; i < subs.length; i++) {
            var sc = BfarmScoring.computeScores(query, subs[i].name);
            if (Object.keys(sc).length > 0 && !seen.has(subs[i].name.toLowerCase())) {
                seen.add(subs[i].name.toLowerCase());
                matches.push({ name: subs[i].name, id: subs[i].id, scores: sc, totalScore: 0, bestMethod: '' });
            }
        }
        return BfarmScoring.rankMatches(matches).slice(0, 25);
    }

    // ─── Multi-Token Medication Search ──────────────────

    function tokenize(query) {
        return query.trim().split(/\s+/).filter(function (t) { return t.length > 0; });
    }

    function scoreTokenAgainstName(token, name) {
        // Check if this token matches any word in the name
        var words = name.split(/[\s,/()-]+/).filter(Boolean);
        var tl = token.toLowerCase();
        var nl = name.toLowerCase();
        var best = 0;

        // Direct contains in full name
        if (nl.includes(tl)) {
            best = Math.max(best, 0.9);
        }

        for (var i = 0; i < words.length; i++) {
            var wl = words[i].toLowerCase();
            // Exact word match
            if (wl === tl) { best = Math.max(best, 1.0); continue; }
            // Prefix match
            if (wl.startsWith(tl)) { best = Math.max(best, 0.85 + 0.1 * (tl.length / wl.length)); continue; }
            // Fuzzy on short tokens (likely typos)
            if (tl.length >= 3) {
                var sc = BfarmScoring.computeScores(token, words[i]);
                var weighted = Object.entries(sc).map(function (e) {
                    return (BfarmScoring.WEIGHTS[e[0]] || 0.5) * e[1];
                });
                if (weighted.length) best = Math.max(best, Math.max.apply(null, weighted));
            }
        }
        return best;
    }

    function searchMedication(query) {
        var tokens = tokenize(query);
        if (!tokens.length) return [];

        var candidates = new Map();
        var queries = [];

        // Strategy 1: Direct SQL-LIKE for each token
        for (var t = 0; t < tokens.length; t++) {
            var esc = escapeSQL(tokens[t].toLowerCase());
            queries.push(
                "SELECT rmp_pzn, rmp_mpd_name, rmp_pfm_put_long FROM medicinal_product WHERE LOWER(rmp_mpd_name) LIKE '%" + esc + "%' ESCAPE '\\' LIMIT 200"
            );
        }

        // Strategy 2: Fuzzy-resolve first token via substance names, then search by corrected name
        // This handles typos like "Paracetaml" → "Paracetamol" → all Paracetamol medications
        if (tokens[0].length >= 3) {
            var subs = BfarmDB.getSubstances();
            var bestSub = null, bestScore = 0;
            for (var i = 0; i < subs.length; i++) {
                var sc = BfarmScoring.computeScores(tokens[0], subs[i].name);
                var weighted = Object.entries(sc).map(function (e) {
                    return (BfarmScoring.WEIGHTS[e[0]] || 0.5) * e[1];
                });
                if (weighted.length) {
                    var maxW = Math.max.apply(null, weighted);
                    if (maxW > bestScore) { bestScore = maxW; bestSub = subs[i].name; }
                }
            }
            if (bestSub && bestScore > 0.5) {
                var escSub = escapeSQL(bestSub.toLowerCase());
                queries.push(
                    "SELECT rmp_pzn, rmp_mpd_name, rmp_pfm_put_long FROM medicinal_product WHERE LOWER(rmp_mpd_name) LIKE '%" + escSub + "%' ESCAPE '\\' LIMIT 300"
                );
            }

            // Also try short prefix for broader matching
            var prefix = escapeSQL(tokens[0].toLowerCase().substring(0, Math.max(3, Math.floor(tokens[0].length * 0.6))));
            queries.push(
                "SELECT rmp_pzn, rmp_mpd_name, rmp_pfm_put_long FROM medicinal_product WHERE LOWER(rmp_mpd_name) LIKE '%" + prefix + "%' ESCAPE '\\' LIMIT 150"
            );
        }

        for (var q = 0; q < queries.length; q++) {
            var r = BfarmDB.exec(queries[q]);
            if (r.length) {
                for (var i = 0; i < r[0].values.length; i++) {
                    var row = r[0].values[i];
                    var key = row[0]; // PZN als Key (nicht Name, da gleiche Namen verschiedene PZNs haben)
                    if (!candidates.has(key)) candidates.set(key, { pzn: row[0], name: row[1], form: row[2] });
                }
            }
        }

        // Score each candidate against ALL tokens
        var matches = [];
        candidates.forEach(function (m) {
            var tokenScores = tokens.map(function (token) {
                return scoreTokenAgainstName(token, m.name);
            });

            // All tokens must have some match (minimum threshold)
            var allMatch = tokenScores.every(function (s) { return s > 0.3; });
            if (!allMatch && tokens.length > 1) return;

            // Combined score: geometric mean of token scores (rewards all-match)
            var combined;
            if (tokens.length === 1) {
                combined = tokenScores[0];
            } else {
                var product = tokenScores.reduce(function (a, b) { return a * b; }, 1);
                combined = Math.pow(product, 1 / tokens.length);
                // Bonus for all tokens matching well
                if (tokenScores.every(function (s) { return s > 0.7; })) {
                    combined = Math.min(combined * 1.15, 1.0);
                }
            }

            if (combined > 0.25) {
                matches.push({
                    pzn: m.pzn, name: m.name, form: m.form,
                    totalScore: combined,
                    bestMethod: combined > 0.85 ? 'exakt' : combined > 0.6 ? 'normalisiert' : 'phonetisch',
                    _tokenScores: tokenScores
                });
            }
        });

        // Sort: Lieferengpass-Medikamente nach oben, dann nach Score
        matches.sort(function (a, b) {
            var aShort = (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && a.pzn && BfarmShortage.checkPZN(a.pzn)) ? 1 : 0;
            var bShort = (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && b.pzn && BfarmShortage.checkPZN(b.pzn)) ? 1 : 0;
            if (aShort !== bShort) return bShort - aShort; // Engpass zuerst
            return b.totalScore - a.totalScore;
        });

        return matches.slice(0, 40);
    }

    return {
        searchPZN: searchPZN,
        searchSubstance: searchSubstance,
        searchMedication: searchMedication
    };
})();
