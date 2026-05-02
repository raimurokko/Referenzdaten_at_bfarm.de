#!/usr/bin/env python3
"""
BfArM Referenzdaten — Automatisiertes 14-Tage-Update

Workflow:
  1. Neuestes DSV-Verzeichnis finden (oder via --dsv)
  2. Lieferengpass-CSV von PharmNet.Bund herunterladen
  3. SQLite-DB neu generieren (Arzneimittel + Lieferengpaesse)
  4. WAL-Modus bereinigen + gzip-Version erstellen
  5. README.md aktualisieren (Zahlen, Datumsangaben)
  6. Git-Diff anzeigen + Bestaetigung einholen
  7. Commit + Parallel-Push (GitHub + Codeberg via Remote "all")

Konfiguration ueber .env (siehe .env.example)

Verwendung:
  python3 src/update_data.py                        # Auto-Detect, mit Bestaetigung
  python3 src/update_data.py --dsv data/20260429-REFERENCE/
  python3 src/update_data.py --dry-run              # Nur anzeigen
  python3 src/update_data.py --no-confirm           # Vollautomatisch (Cron)
  python3 src/update_data.py --skip-csv             # CSV nicht neu laden
  python3 src/update_data.py --skip-push            # Nur committen
"""

import argparse
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request
from pathlib import Path


# ─── .env Loader (ohne Dependency) ──────────────────────────

def load_env(env_file='.env'):
    if not os.path.exists(env_file):
        return
    with open(env_file, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k.strip(), v)


def cfg(key, default=None):
    return os.environ.get(key, default)


# ─── Hilfsfunktionen ────────────────────────────────────────

def de(n):
    """Deutsche Tausender-Formatierung: 108328 -> 108.328"""
    return f"{n:,}".replace(',', '.')


def fmt_date(yyyymmdd):
    """20260415 -> 15.04.2026"""
    if not yyyymmdd or len(yyyymmdd) != 8:
        return yyyymmdd or ''
    return f"{yyyymmdd[6:8]}.{yyyymmdd[4:6]}.{yyyymmdd[0:4]}"


def find_newest_dsv_dir(data_dir, pattern):
    """Lexikografisch neuestes Verzeichnis das auf Pattern matcht."""
    data_path = Path(data_dir)
    if not data_path.is_dir():
        return None
    candidates = sorted([d for d in data_path.glob(pattern) if d.is_dir()])
    return str(candidates[-1]) if candidates else None


def get_db_stats(db_path):
    """Liest Statistiken aus der DB (oder gibt Defaults)."""
    if not os.path.exists(db_path):
        return {'arzneimittel': 0, 'pharma': 0, 'wirkstoffe': 0,
                'lieferengpass': 0, 'data_date': '', 'le_stand': ''}
    conn = sqlite3.connect(db_path)
    try:
        def q(sql, default=0):
            try:
                r = conn.execute(sql).fetchone()
                return r[0] if r else default
            except sqlite3.OperationalError:
                return default
        return {
            'arzneimittel': q('SELECT COUNT(*) FROM medicinal_product'),
            'pharma': q('SELECT COUNT(*) FROM pharmaceutical_product'),
            'wirkstoffe': q('SELECT COUNT(DISTINCT rse_substance_name) FROM substance'),
            'lieferengpass': q('SELECT COUNT(*) FROM lieferengpass'),
            'le_indexed': q(
                "SELECT COUNT(*) FROM lieferengpass "
                "WHERE pzn IS NOT NULL AND pzn != '' AND pzn != '00000000'"
            ),
            'le_unique': q(
                "SELECT COUNT(DISTINCT pzn) FROM lieferengpass "
                "WHERE pzn IS NOT NULL AND pzn != '' AND pzn != '00000000'"
            ),
            'data_date': q("SELECT value FROM _import_meta WHERE key='data_date'", ''),
            'le_stand': q(
                "SELECT datum_letzte_meldung FROM lieferengpass "
                "ORDER BY substr(datum_letzte_meldung,7,4)||"
                "substr(datum_letzte_meldung,4,2)||"
                "substr(datum_letzte_meldung,1,2) DESC LIMIT 1",
                ''
            ),
        }
    finally:
        conn.close()


# ─── Schritte ───────────────────────────────────────────────

def download_csv(url, dest, timeout=60):
    print(f"  URL: {url}")
    print(f"  Ziel: {dest}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    with open(dest, 'wb') as f:
        f.write(data)
    lines = data.count(b'\n')
    print(f"  OK: {lines} Zeilen ({len(data)/1024:.0f} KB)")
    return lines


def run_import(import_script, dsv_dir):
    print(f"  Befehl: python3 {import_script} {dsv_dir}")
    result = subprocess.run(['python3', import_script, dsv_dir])
    if result.returncode != 0:
        raise RuntimeError(f"Import fehlgeschlagen (exit {result.returncode})")


def cleanup_and_gzip(db_path, gz_path):
    """WAL -> DELETE, Journal entfernen, gzip erzeugen."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute('PRAGMA journal_mode=DELETE')
        conn.execute('VACUUM')
    finally:
        conn.close()
    for suffix in ['-shm', '-wal']:
        f = db_path + suffix
        if os.path.exists(f):
            os.remove(f)
    # gzip -k -9 -f
    subprocess.run(['gzip', '-k', '-9', '-f', db_path], check=True)
    db_mb = os.path.getsize(db_path) / 1024 / 1024
    gz_mb = os.path.getsize(gz_path) / 1024 / 1024
    print(f"  DB: {db_mb:.1f} MB  |  gzip: {gz_mb:.1f} MB")


def update_readme(readme_path, old_stats, new_stats, new_dsv_dir):
    """Aktualisiert die dynamischen Stellen in README.md."""
    if not os.path.exists(readme_path):
        print(f"  README nicht gefunden: {readme_path}")
        return False
    with open(readme_path, 'r', encoding='utf-8') as f:
        content = f.read()
    before = content

    bfarm_date = fmt_date(new_stats['data_date'])
    le_date = new_stats['le_stand']
    arz = de(new_stats['arzneimittel'])
    pharma = de(new_stats['pharma'])
    wirk = de(new_stats['wirkstoffe'])
    le = de(new_stats['lieferengpass'])
    le_idx = de(new_stats.get('le_indexed', 0))
    le_uniq = de(new_stats.get('le_unique', 0))

    # Datenstand-Tabelle: BfArM Zeile
    content = re.sub(
        r'(\| BfArM Referenzdaten \| )\d{2}\.\d{2}\.\d{4}( \| )[\d.]+ Arzneimittel · [\d.]+ Pharma-Produkte · [\d.]+ Wirkstoffe( \|)',
        rf'\g<1>{bfarm_date}\g<2>{arz} Arzneimittel · {pharma} Pharma-Produkte · {wirk} Wirkstoffe\g<3>',
        content
    )
    # Datenstand-Tabelle: Lieferengpaesse Zeile
    # Akzeptiert beide Formate (alt: "X aktive Meldungen", neu: "X Meldungen · Y mit PZN · Z unique PZNs")
    new_le_cell = f'{le} Meldungen · {le_idx} mit PZN · {le_uniq} unique PZNs'
    content = re.sub(
        r'(\| PharmNet\.Bund Lieferengpässe \| )\d{2}\.\d{2}\.\d{4}( \| )[^|]+?( \|)',
        rf'\g<1>{le_date}\g<2>{new_le_cell}\g<3>',
        content
    )
    # Datenmodell-Box
    content = re.sub(
        r'medicinal_product \([\d.]+ Arzneimittel\)',
        f'medicinal_product ({arz} Arzneimittel)', content
    )
    content = re.sub(
        r'pharmaceutical_product \([\d.]+\)',
        f'pharmaceutical_product ({pharma})', content
    )
    content = re.sub(
        r'substance \([\d.]+ Wirkstoffe\)',
        f'substance ({wirk} Wirkstoffe)', content
    )

    # XML-Beispiel: <Lieferengpaesse … stand="…" anzahl="…"/>
    # le_stand ist im DD.MM.YYYY-Format -> in YYYY-MM-DD umwandeln fuer ISO-XML-Stil
    le_iso = ''
    if le_date and re.match(r'^\d{2}\.\d{2}\.\d{4}$', le_date):
        d, m, y = le_date.split('.')
        le_iso = f'{y}-{m}-{d}'
    if le_iso:
        le_plain = str(new_stats['lieferengpass'])  # ohne Tausenderpunkt fuer XML-Attribut
        content = re.sub(
            r'(<Lieferengpaesse quelle="PharmNet\.Bund" stand=")[^"]+(" anzahl=")\d+("/>)',
            rf'\g<1>{le_iso}\g<2>{le_plain}\g<3>',
            content
        )

    # Beispielpfade: alte DSV-Verzeichnisnamen durch neuen ersetzen
    new_dir_name = os.path.basename(new_dsv_dir.rstrip('/'))
    if old_stats.get('data_date'):
        old_dir_name = old_stats['data_date'] + '-REFERENCE'
        if old_dir_name != new_dir_name:
            content = content.replace(old_dir_name, new_dir_name)

    if content == before:
        print("  README unveraendert")
        return False

    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  README aktualisiert")
    return True


def build_commit_message(old, new):
    bfarm_date = fmt_date(new['data_date'])
    def delta(n, o):
        d = n - o
        return f"{'+' if d >= 0 else ''}{d}"
    lines = [
        f"Datenupdate {bfarm_date}: BfArM + Lieferengpässe",
        "",
        f"- BfArM-Referenzdaten (Stand: {bfarm_date})",
        f"  - {de(new['arzneimittel'])} Arzneimittel ({delta(new['arzneimittel'], old.get('arzneimittel', 0))})",
        f"  - {de(new['pharma'])} Pharma-Produkte ({delta(new['pharma'], old.get('pharma', 0))})",
        f"  - {de(new['wirkstoffe'])} Wirkstoffe ({delta(new['wirkstoffe'], old.get('wirkstoffe', 0))})",
        f"- Lieferengpässe (Stand: {new['le_stand']})",
        f"  - {de(new['lieferengpass'])} Meldungen ({delta(new['lieferengpass'], old.get('lieferengpass', 0))})",
        f"  - davon {de(new.get('le_indexed', 0))} mit PZN · {de(new.get('le_unique', 0))} unique PZNs",
        "",
        "Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>",
    ]
    return '\n'.join(lines)


def git_commit_and_push(old_stats, new_stats, remote, branch, confirm, skip_push):
    subprocess.run(['git', 'add', '-A'], check=True)
    # Check ob es was zu committen gibt
    r = subprocess.run(['git', 'diff', '--cached', '--quiet'])
    if r.returncode == 0:
        print("  Keine Aenderungen zum Committen.")
        return False
    print("  Geaenderte Dateien:")
    subprocess.run(['git', 'diff', '--cached', '--stat'])
    message = build_commit_message(old_stats, new_stats)
    print("\n  Commit-Message:")
    print('  ' + message.replace('\n', '\n  '))
    if confirm:
        action = "Commit" if skip_push else f"Commit + Push nach '{remote}'"
        answer = input(f"\n  {action}? [Y/n] ").strip().lower()
        if answer and answer != 'y':
            print("  Abgebrochen. Aenderungen bleiben staged.")
            return False
    subprocess.run(['git', 'commit', '-m', message], check=True)
    print("  Commit erstellt")
    if skip_push:
        print("  (Push uebersprungen via --skip-push)")
        return True
    print(f"  Push nach '{remote}' ...")
    subprocess.run(['git', 'push', remote, branch], check=True)
    print("  Push erfolgreich")
    return True


# ─── Main ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='BfArM Referenzdaten Update (14-Tage-Turnus)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('--dsv', help='DSV-Verzeichnis (Default: neuestes passend zu DSV_PATTERN)')
    parser.add_argument('--dry-run', action='store_true', help='Nichts veraendern, nur anzeigen')
    parser.add_argument('--no-confirm', action='store_true', help='Kein Bestaetigungs-Prompt (Cron)')
    parser.add_argument('--skip-csv', action='store_true', help='Lieferengpass-CSV nicht neu laden')
    parser.add_argument('--skip-push', action='store_true', help='Nur committen, nicht pushen')
    args = parser.parse_args()

    # Projektroot ermitteln (dort wo .env liegt)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    os.chdir(project_root)

    # .env laden
    load_env()

    # Konfiguration
    db_path = cfg('DB_PATH', 'db/bfarm.db')
    gz_path = cfg('DB_GZ_PATH', 'db/bfarm.db.gz')
    data_dir = cfg('DATA_DIR', 'data')
    csv_url = cfg('LIEFERENGPASS_CSV_URL',
                  'https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv')
    csv_path = cfg('CSV_PATH', 'data/lieferengpass.csv')
    import_script = cfg('IMPORT_SCRIPT', 'src/import_bfarm.py')
    readme_path = cfg('README_PATH', 'README.md')
    git_remote = cfg('GIT_REMOTE', 'all')
    git_branch = cfg('GIT_BRANCH', 'main')
    dsv_pattern = cfg('DSV_PATTERN', '*-REFERENCE')
    timeout = int(cfg('DOWNLOAD_TIMEOUT', '60'))

    print("=" * 64)
    print("BfArM Referenzdaten Update")
    print("=" * 64)
    print(f"Projekt: {project_root}")
    if args.dry_run:
        print("DRY-RUN: Keine Aenderungen werden geschrieben")

    # ─── Schritt 1: DSV-Verzeichnis ─────────────────────────
    dsv_dir = args.dsv or find_newest_dsv_dir(data_dir, dsv_pattern)
    if not dsv_dir or not os.path.isdir(dsv_dir):
        print(f"\nFEHLER: Kein DSV-Verzeichnis gefunden in {data_dir} (Pattern: {dsv_pattern})")
        print(f"   Lege ein Verzeichnis an wie: data/YYYYMMDD-REFERENCE/")
        sys.exit(1)
    print(f"\n[1/6] DSV-Verzeichnis: {dsv_dir}")
    dsv_files = list(Path(dsv_dir).glob('*.dsv'))
    print(f"      {len(dsv_files)} DSV-Dateien gefunden")

    old_stats = get_db_stats(db_path)
    if old_stats['data_date']:
        print(f"      Bisheriger Datenstand: {fmt_date(old_stats['data_date'])}")

    # ─── Schritt 2: Lieferengpass-CSV ───────────────────────
    print(f"\n[2/6] Lieferengpass-CSV aktualisieren")
    if args.skip_csv:
        print("      (uebersprungen via --skip-csv)")
    elif args.dry_run:
        print(f"      (dry-run: Download von {csv_url})")
    else:
        try:
            download_csv(csv_url, csv_path, timeout=timeout)
        except Exception as e:
            print(f"      WARNUNG: Download fehlgeschlagen ({e})")
            print(f"      Verwende vorhandene CSV: {csv_path}")
            if not os.path.exists(csv_path):
                print(f"      FEHLER: Keine CSV vorhanden. Abbruch.")
                sys.exit(1)

    # ─── Schritt 3: DB generieren ───────────────────────────
    print(f"\n[3/6] Datenbank neu generieren")
    if args.dry_run:
        print(f"      (dry-run: {import_script} {dsv_dir})")
    else:
        run_import(import_script, dsv_dir)

    # ─── Schritt 4: Cleanup + gzip ──────────────────────────
    print(f"\n[4/6] WAL bereinigen + gzip erstellen")
    if args.dry_run:
        print("      (dry-run)")
    else:
        cleanup_and_gzip(db_path, gz_path)

    new_stats = get_db_stats(db_path) if not args.dry_run else old_stats

    # ─── Schritt 5: README ──────────────────────────────────
    print(f"\n[5/6] README.md aktualisieren")
    if args.dry_run:
        print("      (dry-run)")
    else:
        update_readme(readme_path, old_stats, new_stats, dsv_dir)

    # ─── Schritt 6: Git ─────────────────────────────────────
    print(f"\n[6/6] Git commit" + ("" if args.skip_push else " + push"))
    if args.dry_run:
        print("      (dry-run)")
    else:
        git_commit_and_push(
            old_stats, new_stats,
            remote=git_remote, branch=git_branch,
            confirm=not args.no_confirm,
            skip_push=args.skip_push
        )

    # ─── Zusammenfassung ────────────────────────────────────
    print("\n" + "=" * 64)
    print("Update abgeschlossen")
    print("=" * 64)
    if not args.dry_run:
        def delta(n, o):
            d = n - o
            s = f"+{d}" if d >= 0 else str(d)
            return s
        print(f"  Datenstand:      {fmt_date(new_stats['data_date'])}")
        print(f"  Arzneimittel:    {de(new_stats['arzneimittel'])} ({delta(new_stats['arzneimittel'], old_stats.get('arzneimittel', 0))})")
        print(f"  Pharma-Produkte: {de(new_stats['pharma'])} ({delta(new_stats['pharma'], old_stats.get('pharma', 0))})")
        print(f"  Wirkstoffe:      {de(new_stats['wirkstoffe'])} ({delta(new_stats['wirkstoffe'], old_stats.get('wirkstoffe', 0))})")
        print(f"  Lieferengpaesse: {de(new_stats['lieferengpass'])} ({delta(new_stats['lieferengpass'], old_stats.get('lieferengpass', 0))})"
              f"  [{de(new_stats.get('le_indexed', 0))} mit PZN, {de(new_stats.get('le_unique', 0))} unique]")
        print(f"  LE-Stand:        {new_stats['le_stand']}")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nAbgebrochen.")
        sys.exit(130)
