#!/bin/bash
# BfArM Referenzdaten — Automatisiertes Update-Skript
# Verwendung: ./src/update.sh data/20260415-REFERENCE/
#
# Schritte:
# 1. Lieferengpass-CSV von PharmNet.Bund herunterladen
# 2. SQLite-Datenbank neu generieren (Arzneimittel + Lieferengpaesse)
# 3. Datenbankgroesse anzeigen

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$1" ]; then
    echo "Verwendung: $0 <dsv-verzeichnis>"
    echo "Beispiel:   $0 data/20260415-REFERENCE/"
    exit 1
fi

DSV_DIR="$1"

echo "=== BfArM Referenzdaten Update ==="
echo ""

# 1. Lieferengpass-CSV aktualisieren
echo "1. Lieferengpass-CSV herunterladen..."
curl -s -o "$PROJECT_DIR/data/lieferengpass.csv" \
    "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv"
LE_LINES=$(wc -l < "$PROJECT_DIR/data/lieferengpass.csv" | tr -d ' ')
echo "   Heruntergeladen: $LE_LINES Zeilen"

# 2. Datenbank generieren
echo ""
echo "2. Datenbank generieren..."
cd "$PROJECT_DIR"
python3 src/import_bfarm.py "$DSV_DIR"

# 3. Gzip-Version erstellen
echo ""
echo "3. Gzip-Version erstellen..."
gzip -k -9 -f "$PROJECT_DIR/db/bfarm.db"
echo "   db/bfarm.db.gz ($(du -h "$PROJECT_DIR/db/bfarm.db.gz" | cut -f1))"

# 4. Zusammenfassung
echo ""
echo "=== Zusammenfassung ==="
echo "DSV-Verzeichnis:    $DSV_DIR"
echo "Lieferengpaesse:    $LE_LINES Zeilen"
echo "Datenbank:          db/bfarm.db ($(du -h db/bfarm.db | cut -f1))"
echo ""
echo "Naechste Schritte:"
echo "  git add db/bfarm.db db/bfarm.db.gz data/lieferengpass.csv $DSV_DIR"
echo "  git commit -m 'Datenupdate $(date +%Y-%m-%d)'"
echo "  git push"
