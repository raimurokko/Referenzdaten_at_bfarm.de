#!/usr/bin/env python3
"""
BfArM Fuzzy Lookup v2 — Medikament & Wirkstoff Suche mit Schreibkorrektur

Matching-Strategien (gewichtet kombiniert):
  1. Exakter Match
  2. Normalisierter Match (K↔C, Z↔S, PH↔F, Umlaute)
  3. Präfix-/Contains-Match
  4. Phonetische Ähnlichkeit (Levenshtein auf Kölner Phonetik Codes)
  5. String-Ähnlichkeit (Levenshtein auf normalisiertem Text)
  6. Trigram-Ähnlichkeit

Usage:
    python fuzzy_lookup.py bfarm.db "Barazettamuhl" --type check
    python fuzzy_lookup.py bfarm.db "Methoprolol"
    python fuzzy_lookup.py bfarm.db "Diklofenack" --type substance
    python fuzzy_lookup.py bfarm.db "10203626" --type pzn
"""

import argparse
import sqlite3
import sys
from dataclasses import dataclass, field


# ─── Kölner Phonetik ──────────────────────────────────────────

COLOGNE_MAP = {
    "A": "0", "E": "0", "I": "0", "O": "0", "U": "0",
    "Ä": "0", "Ö": "0", "Ü": "0",
    "H": "",
    "B": "1", "P": "1",
    "D": "2", "T": "2",
    "F": "3", "V": "3", "W": "3",
    "G": "4", "K": "4", "Q": "4",
    "L": "5",
    "M": "6", "N": "6",
    "R": "7",
    "S": "8", "Z": "8",
    "X": "48", "J": "0", "Y": "0",
}


def cologne_phonetic(word: str) -> str:
    """Compute Kölner Phonetik code for a German word."""
    if not word:
        return ""
    word = word.upper().strip()
    word = word.replace("ß", "SS").replace("PH", "F")

    codes = []
    for i, ch in enumerate(word):
        prev_ch = word[i - 1] if i > 0 else ""
        next_ch = word[i + 1] if i < len(word) - 1 else ""

        if ch == "C":
            if i == 0 and next_ch in "AHKLOQRUX":
                code = "4"
            elif prev_ch in "SZ" and next_ch in "AHKOQUX":
                code = "8"
            elif next_ch in "AHKOQUX":
                code = "4"
            else:
                code = "8"
        elif ch in "DT":
            code = "8" if next_ch in "CSZ" else "2"
        elif ch == "P":
            code = "3" if next_ch == "H" else "1"
        elif ch in COLOGNE_MAP:
            code = COLOGNE_MAP[ch]
        else:
            continue
        codes.append(code)

    deduped = []
    for c in codes:
        if not deduped or c != deduped[-1]:
            deduped.append(c)

    result = "".join(deduped).replace("0", "")
    return result or "0"


# ─── String-Distanz & Ähnlichkeit ─────────────────────────────

def levenshtein(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]


def trigrams(s: str) -> set:
    s = f"  {s.lower()}  "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def trigram_similarity(s1: str, s2: str) -> float:
    t1, t2 = trigrams(s1), trigrams(s2)
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


def normalize_pharma(s: str) -> str:
    """
    Normalize German/Latin pharma spelling variants.
    Maps common letter substitutions that don't change pronunciation.
    """
    s = s.lower().strip()
    replacements = [
        ("ck", "k"),
        ("ph", "f"),
        ("th", "t"),
        ("sch", "sh"),
        ("ß", "ss"),
        ("ä", "ae"),
        ("ö", "oe"),
        ("ü", "ue"),
        ("k", "c"),
        ("z", "s"),
        ("y", "i"),
    ]
    for old, new in replacements:
        s = s.replace(old, new)
    # Remove consecutive duplicate letters
    result = []
    for ch in s:
        if not result or ch != result[-1]:
            result.append(ch)
    return "".join(result)


# ─── Scoring ──────────────────────────────────────────────────

WEIGHTS = {
    "exakt": 1.00,
    "normalisiert": 0.95,
    "norm_enthält": 0.88,     # Normalized query is prefix/substring of normalized target
    "präfix": 0.85,
    "enthält": 0.70,
    "phonetisch": 0.90,
    "levenshtein": 0.60,
    "trigram": 0.40,
}


@dataclass
class ScoredMatch:
    name: str
    id: str = ""
    pzn: str = ""
    scores: dict = field(default_factory=dict)
    best_method: str = ""
    total_score: float = 0.0


def compute_phonetic_similarity(code1: str, code2: str) -> float:
    """Phonetic similarity via Levenshtein on Cologne codes (0.0–1.0)."""
    if not code1 or not code2:
        return 0.0
    if code1 == code2:
        return 1.0
    max_len = max(len(code1), len(code2))
    dist = levenshtein(code1, code2)
    if dist > max_len * 0.4:
        return 0.0
    return 1.0 - (dist / max_len)


def compute_scores(query: str, target_name: str) -> dict[str, float]:
    """Compute all similarity scores for a query against a target."""
    scores = {}
    ql = query.lower()
    tl = target_name.lower()

    # 1. Exact
    if ql == tl:
        scores["exakt"] = 1.0

    # 2. Normalized
    qn = normalize_pharma(query)
    tn = normalize_pharma(target_name)
    if qn == tn:
        scores["normalisiert"] = 1.0
    else:
        nd = levenshtein(qn, tn)
        max_n = max(len(qn), len(tn))
        if max_n > 0 and nd <= 2:
            scores["normalisiert"] = 1.0 - (nd / max_n)

    # 2b. Normalized prefix/contains (catches Methoprolol → Metoprololsuccinat)
    if "normalisiert" not in scores and len(qn) >= 4:
        if tn.startswith(qn):
            # Normalized query is a prefix of normalized target — very strong signal
            # for pharma names (base substance + salt/ester suffix)
            coverage = len(qn) / len(tn)
            # Score based on how much of the target the query covers,
            # with a floor of 0.75 for any prefix match ≥4 chars
            scores["norm_enthält"] = max(0.75, coverage * 1.3)
            scores["norm_enthält"] = min(scores["norm_enthält"], 1.0)
        elif qn in tn:
            scores["norm_enthält"] = len(qn) / len(tn) * 1.1
            scores["norm_enthält"] = min(scores["norm_enthält"], 0.9)
        else:
            # Check with small edit distance on the prefix portion
            if len(qn) <= len(tn):
                prefix_slice = tn[:len(qn) + 1]
                pd = levenshtein(qn, prefix_slice)
                if pd <= 2:
                    scores["norm_enthält"] = max(0.65, 1.0 - (pd / max(len(qn), len(prefix_slice))))

    # 3. Prefix
    if tl.startswith(ql):
        scores["präfix"] = len(ql) / len(tl)

    # 4. Contains
    if ql in tl and "präfix" not in scores:
        scores["enthält"] = len(ql) / len(tl)

    # 5. Phonetic similarity
    q_code = cologne_phonetic(query)
    best_phon = 0.0
    for word in target_name.split():
        t_code = cologne_phonetic(word)
        sim = compute_phonetic_similarity(q_code, t_code)
        best_phon = max(best_phon, sim)
    # Full name without spaces
    t_full_code = cologne_phonetic(target_name.replace(" ", ""))
    best_phon = max(best_phon, compute_phonetic_similarity(q_code, t_full_code))
    if best_phon > 0.5:
        scores["phonetisch"] = best_phon

    # 6. Levenshtein on original
    if len(query) >= 3:
        best_lev = 0.0
        for word in target_name.split():
            if abs(len(word) - len(query)) <= 4:
                dist = levenshtein(ql, word.lower())
                max_len = max(len(query), len(word))
                sim = 1.0 - (dist / max_len)
                best_lev = max(best_lev, sim)
        if best_lev > 0.5:
            scores["levenshtein"] = best_lev

    # 7. Trigram
    if len(query) >= 4:
        sim = trigram_similarity(query, target_name)
        if sim > 0.15:
            scores["trigram"] = sim

    return scores


def rank_results(matches: list[ScoredMatch]) -> list[ScoredMatch]:
    for m in matches:
        if m.scores:
            weighted = [(WEIGHTS.get(method, 0.5) * score, method)
                        for method, score in m.scores.items()]
            best_weighted, best_method = max(weighted, key=lambda x: x[0])

            # Convergence bonus: multiple independent signals agreeing
            strong_signals = sum(1 for w, _ in weighted if w > 0.4)
            if strong_signals >= 3:
                convergence_bonus = 0.08
            elif strong_signals >= 2:
                convergence_bonus = 0.04
            else:
                convergence_bonus = 0.0

            # False-positive penalty: phonetic-only matches with no supporting
            # evidence (no trigram, no levenshtein, no normalized) are likely noise.
            # Only penalize if phonetic score < 0.95 (very high phonetic = trust it)
            if (best_method == "phonetisch"
                    and len(m.scores) == 1
                    and m.scores.get("phonetisch", 0) < 0.95):
                best_weighted *= 0.65  # significant penalty

            m.total_score = min(best_weighted + convergence_bonus, 1.0)
            m.best_method = best_method
    matches.sort(key=lambda m: m.total_score, reverse=True)
    return matches


# ─── Lookup Engine ────────────────────────────────────────────

class BfarmLookup:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._substance_cache = None
        self._medication_cache = None

    def _get_substances(self) -> list[dict]:
        if self._substance_cache is None:
            rows = self.conn.execute(
                "SELECT DISTINCT rse_substance_name, rse_substance_id FROM substance ORDER BY rse_substance_name"
            ).fetchall()
            self._substance_cache = [
                {"name": r["rse_substance_name"], "id": r["rse_substance_id"]}
                for r in rows if r["rse_substance_name"]
            ]
        return self._substance_cache

    def _get_medications(self) -> list[dict]:
        if self._medication_cache is None:
            rows = self.conn.execute(
                "SELECT DISTINCT rmp_mpd_name, rmp_pzn FROM medicinal_product ORDER BY rmp_mpd_name"
            ).fetchall()
            self._medication_cache = [
                {"name": r["rmp_mpd_name"], "pzn": r["rmp_pzn"]}
                for r in rows if r["rmp_mpd_name"]
            ]
        return self._medication_cache

    def lookup_pzn(self, pzn: str) -> list[dict]:
        pzn = pzn.strip().zfill(8)
        rows = self.conn.execute("""
            SELECT mp.rmp_pzn, mp.rmp_mpd_name, mp.rmp_pfm_put_long,
                   s.rse_substance_name, s.rse_substance_strength
            FROM medicinal_product mp
            LEFT JOIN pharmaceutical_product pp ON mp.rmp_key = pp.rmp_key
            LEFT JOIN substance s ON pp.rpp_key = s.rpp_key
            WHERE mp.rmp_pzn = ?
            ORDER BY s.rse_substance_rank
        """, (pzn,)).fetchall()
        return [dict(r) for r in rows]

    def lookup_substance(self, query: str, max_results: int = 20) -> list[ScoredMatch]:
        query = query.strip()
        if not query:
            return []
        substances = self._get_substances()
        matches = []
        for s in substances:
            scores = compute_scores(query, s["name"])
            if scores:
                matches.append(ScoredMatch(name=s["name"], id=s["id"], scores=scores))
        return rank_results(matches)[:max_results]

    def lookup_medication(self, query: str, max_results: int = 20) -> list[ScoredMatch]:
        query = query.strip()
        if not query:
            return []
        medications = self._get_medications()
        seen = set()
        matches = []
        for m in medications:
            name_key = m["name"].lower()
            if name_key in seen:
                continue
            scores = compute_scores(query, m["name"])
            if scores:
                seen.add(name_key)
                matches.append(ScoredMatch(name=m["name"], pzn=m["pzn"], scores=scores))
        return rank_results(matches)[:max_results]

    def check_spelling(self, name: str, entity_type: str = "substance") -> dict:
        lookup_fn = self.lookup_substance if entity_type == "substance" else self.lookup_medication
        results = lookup_fn(name, max_results=10)
        exact = None
        for r in results:
            if r.name.lower() == name.lower():
                exact = r.name
                break
        return {
            "input": name,
            "found": exact is not None,
            "exact_match": exact,
            "suggestions": [
                {
                    "name": r.name,
                    "method": r.best_method,
                    "score": round(r.total_score, 3),
                    "detail": {k: round(v, 3) for k, v in r.scores.items()},
                }
                for r in results if r.name.lower() != name.lower()
            ],
        }

    def close(self):
        self.conn.close()


# ─── CLI ──────────────────────────────────────────────────────

METHOD_ICONS = {
    "exakt": "✓", "normalisiert": "≈", "norm_enthält": "≋", "präfix": "→", "enthält": "⊃",
    "phonetisch": "♪", "levenshtein": "~", "trigram": "△",
}


def main():
    parser = argparse.ArgumentParser(description="BfArM Fuzzy Lookup v2")
    parser.add_argument("db", help="Path to bfarm.db")
    parser.add_argument("query", help="Search term (name or PZN)")
    parser.add_argument("--type", "-t", choices=["substance", "medication", "pzn", "check"],
                        default="substance", help="Search type")
    parser.add_argument("--limit", "-n", type=int, default=15, help="Max results")
    parser.add_argument("--detail", "-d", action="store_true", help="Show score details")
    args = parser.parse_args()

    lookup = BfarmLookup(args.db)
    try:
        if args.type == "pzn":
            results = lookup.lookup_pzn(args.query)
            if results:
                print(f"✅ PZN {args.query}:")
                for r in results:
                    print(f"   {r['rmp_mpd_name']}")
                    if r.get("rse_substance_name"):
                        print(f"   → {r['rse_substance_name']} {r['rse_substance_strength'] or ''}")
            else:
                print(f"❌ PZN {args.query} nicht gefunden")

        elif args.type == "check":
            result = lookup.check_spelling(args.query, "substance")
            if result["found"]:
                print(f"✅ \"{args.query}\" → korrekt: {result['exact_match']}")
            else:
                print(f"❌ \"{args.query}\" nicht gefunden")
            if result["suggestions"]:
                print("   Meintest du:")
                for s in result["suggestions"][:8]:
                    icon = METHOD_ICONS.get(s["method"], "?")
                    print(f"   {icon} {s['name']:30s}  [{s['method']:14s}  score={s['score']:.3f}]")
                    if args.detail:
                        for k, v in s["detail"].items():
                            print(f"     ├─ {k}: {v:.3f}")

        elif args.type == "substance":
            results = lookup.lookup_substance(args.query, args.limit)
            if results:
                print(f"🧪 Wirkstoffe für \"{args.query}\":")
                for r in results:
                    icon = METHOD_ICONS.get(r.best_method, "?")
                    print(f"   {icon} {r.name:30s}  [{r.best_method:14s}  score={r.total_score:.3f}]")
            else:
                print(f"❌ Keine Treffer für \"{args.query}\"")

        elif args.type == "medication":
            results = lookup.lookup_medication(args.query, args.limit)
            if results:
                print(f"💊 Arzneimittel für \"{args.query}\":")
                for r in results:
                    icon = METHOD_ICONS.get(r.best_method, "?")
                    print(f"   {icon} {r.name:40s}  [{r.best_method:14s}  score={r.total_score:.3f}]")
            else:
                print(f"❌ Keine Treffer für \"{args.query}\"")
    finally:
        lookup.close()


if __name__ == "__main__":
    main()
