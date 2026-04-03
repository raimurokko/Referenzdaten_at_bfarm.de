/*  BfArM Referenzdaten — Scoring-Engine  */

var BfarmScoring = (function () {
    'use strict';

    var P = BfarmPhonetics;

    var WEIGHTS = {
        exakt: 1.00,
        normalisiert: 0.95,
        'norm_enthält': 0.88,
        'präfix': 0.85,
        'enthält': 0.70,
        phonetisch: 0.90,
        levenshtein: 0.60,
        trigram: 0.40
    };

    function computeScores(query, target) {
        var sc = {};
        var ql = query.toLowerCase(), tl = target.toLowerCase();

        // 1. Exact
        if (ql === tl) sc.exakt = 1;

        // 2. Normalized
        var qn = P.normalizePharma(query), tn = P.normalizePharma(target);
        if (qn === tn) {
            sc.normalisiert = 1;
        } else {
            var nd = P.levenshtein(qn, tn);
            var mx = Math.max(qn.length, tn.length);
            if (mx > 0 && nd <= 2) sc.normalisiert = 1 - nd / mx;
        }

        // 2b. Normalized contains
        if (!sc.normalisiert && qn.length >= 4) {
            if (tn.startsWith(qn)) {
                sc['norm_enthält'] = Math.min(Math.max(0.75, qn.length / tn.length * 1.3), 1);
            } else if (tn.includes(qn)) {
                sc['norm_enthält'] = Math.min(qn.length / tn.length * 1.1, 0.9);
            } else if (qn.length <= tn.length) {
                var ps = tn.slice(0, qn.length + 1);
                var pd = P.levenshtein(qn, ps);
                if (pd <= 2) sc['norm_enthält'] = Math.max(0.65, 1 - pd / Math.max(qn.length, ps.length));
            }
        }

        // 3. Prefix
        if (tl.startsWith(ql)) sc['präfix'] = ql.length / tl.length;

        // 4. Contains
        if (ql.length > 0 && tl.includes(ql) && !sc['präfix']) sc['enthält'] = ql.length / tl.length;

        // 5. Phonetic
        var qc = P.colognePhonetic(query);
        var bp = 0;
        target.split(/[\s,]+/).forEach(function (w) {
            bp = Math.max(bp, P.phoneticSimilarity(qc, P.colognePhonetic(w)));
        });
        bp = Math.max(bp, P.phoneticSimilarity(qc, P.colognePhonetic(target.replace(/\s/g, ''))));
        if (bp > 0.5) sc.phonetisch = bp;

        // 6. Levenshtein
        if (query.length >= 3) {
            var bl = 0;
            target.split(/[\s,]+/).forEach(function (w) {
                if (Math.abs(w.length - query.length) <= 4) {
                    var d = P.levenshtein(ql, w.toLowerCase());
                    var ml = Math.max(query.length, w.length);
                    bl = Math.max(bl, 1 - d / ml);
                }
            });
            if (bl > 0.5) sc.levenshtein = bl;
        }

        // 7. Trigram
        if (query.length >= 4) {
            var ts = P.trigramSimilarity(query, target);
            if (ts > 0.15) sc.trigram = ts;
        }

        return sc;
    }

    function rankMatches(matches) {
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var weighted = Object.entries(m.scores).map(function (e) {
                return [(WEIGHTS[e[0]] || 0.5) * e[1], e[0]];
            });
            var best = 0, method = '';
            for (var j = 0; j < weighted.length; j++) {
                if (weighted[j][0] > best) {
                    best = weighted[j][0];
                    method = weighted[j][1];
                }
            }
            var strong = weighted.filter(function (w) { return w[0] > 0.4; }).length;
            var bonus = strong >= 3 ? 0.08 : strong >= 2 ? 0.04 : 0;

            if (method === 'phonetisch' && Object.keys(m.scores).length === 1 && (m.scores.phonetisch || 0) < 0.95) {
                best *= 0.65;
            }

            m.totalScore = Math.min(best + bonus, 1);
            m.bestMethod = method;
        }
        return matches.sort(function (a, b) { return b.totalScore - a.totalScore; });
    }

    return {
        WEIGHTS: WEIGHTS,
        computeScores: computeScores,
        rankMatches: rankMatches
    };
})();
