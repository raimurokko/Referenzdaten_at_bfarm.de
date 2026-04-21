#!/bin/bash
# BfArM Referenzdaten — Update-Wrapper
# Reicht alle Argumente an update_data.py weiter.
#
# Verwendung:
#   ./src/update.sh                          # Auto-Detect, mit Bestätigung
#   ./src/update.sh --dsv data/20260429-REFERENCE/
#   ./src/update.sh --dry-run
#   ./src/update.sh --no-confirm             # für Cron
#
# Konfiguration: siehe .env (Vorlage: .env.example)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/update_data.py" "$@"
