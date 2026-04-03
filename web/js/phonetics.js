/*  BfArM Referenzdaten — Phonetik & String-Algorithmen  */

var BfarmPhonetics = (function () {
    'use strict';

    // Kölner Phonetik Mapping
    var CM = {
        'A':'0','E':'0','I':'0','O':'0','U':'0',
        'Ä':'0','Ö':'0','Ü':'0','H':'',
        'B':'1','P':'1','D':'2','T':'2',
        'F':'3','V':'3','W':'3',
        'G':'4','K':'4','Q':'4',
        'L':'5','M':'6','N':'6','R':'7',
        'S':'8','Z':'8','X':'48','J':'0','Y':'0'
    };

    function colognePhonetic(w) {
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
            } else if (c === 'D' || c === 'T') {
                code = 'CSZ'.includes(n) ? '8' : '2';
            } else if (c === 'P') {
                code = n === 'H' ? '3' : '1';
            } else if (CM[c] !== undefined) {
                code = CM[c];
            } else {
                continue;
            }
            codes.push(code);
        }
        return codes.filter(function (c, i) {
            return i === 0 || c !== codes[i - 1];
        }).join('').replace(/0/g, '') || '0';
    }

    function levenshtein(a, b) {
        if (a.length < b.length) return levenshtein(b, a);
        if (!b.length) return a.length;
        var prev = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
        for (var i = 0; i < a.length; i++) {
            var curr = [i + 1];
            for (var j = 0; j < b.length; j++) {
                curr.push(Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (a[i] !== b[j] ? 1 : 0)));
            }
            prev = curr;
        }
        return prev[b.length];
    }

    function trigrams(s) {
        s = '  ' + s.toLowerCase() + '  ';
        var set = new Set();
        for (var i = 0; i < s.length - 2; i++) set.add(s.substr(i, 3));
        return set;
    }

    function trigramSimilarity(a, b) {
        var t1 = trigrams(a), t2 = trigrams(b);
        if (!t1.size || !t2.size) return 0;
        var inter = 0;
        t1.forEach(function (x) { if (t2.has(x)) inter++; });
        return inter / (t1.size + t2.size - inter);
    }

    function normalizePharma(s) {
        s = s.toLowerCase().trim();
        var replacements = [
            ['ck','k'], ['ph','f'], ['th','t'], ['sch','sh'],
            ['ß','ss'], ['ä','ae'], ['ö','oe'], ['ü','ue'],
            ['k','c'], ['z','s'], ['y','i']
        ];
        for (var i = 0; i < replacements.length; i++) {
            s = s.split(replacements[i][0]).join(replacements[i][1]);
        }
        return s.split('').filter(function (c, i, a) {
            return i === 0 || c !== a[i - 1];
        }).join('');
    }

    function phoneticSimilarity(c1, c2) {
        if (!c1 || !c2) return 0;
        if (c1 === c2) return 1;
        var ml = Math.max(c1.length, c2.length);
        var d = levenshtein(c1, c2);
        return d > ml * 0.4 ? 0 : 1 - d / ml;
    }

    return {
        colognePhonetic: colognePhonetic,
        levenshtein: levenshtein,
        trigramSimilarity: trigramSimilarity,
        normalizePharma: normalizePharma,
        phoneticSimilarity: phoneticSimilarity
    };
})();
