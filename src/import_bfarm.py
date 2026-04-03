#!/usr/bin/env python3
"""
BfArM DSV → SQLite Importer
Reads pipe-delimited DSV files from BfArM and creates a structured SQLite database
for use with Datasette (including Datasette Lite).

Usage:
    python src/import_bfarm.py <dsv_directory> [--output db/bfarm.db]

Example:
    python src/import_bfarm.py data/20260401-REFERENCE/ --output db/bfarm.db
"""

import argparse
import csv
import glob
import os
import sqlite3
import sys
from pathlib import Path
from datetime import datetime


# Table definitions: (file_pattern, table_name, schema, indexes)
TABLE_DEFS = [
    {
        "pattern": "REFERENCE_MEDICINAL_PRODUCT",
        "table": "medicinal_product",
        "columns": [
            ("rmp_key", "TEXT PRIMARY KEY"),
            ("rmp_pzn", "TEXT"),
            ("rmp_count_substance", "INTEGER"),
            ("rmp_multiple_ppt", "INTEGER"),
            ("rmp_pfm_put_short", "TEXT"),
            ("rmp_pfm_put_long", "TEXT"),
            ("rmp_pfm_name", "TEXT"),
            ("rmp_pfm_term_id", "TEXT"),
            ("rmp_mpd_name", "TEXT"),
        ],
        "indexes": [
            "CREATE INDEX idx_mp_pzn ON medicinal_product(rmp_pzn)",
            "CREATE INDEX idx_mp_pfm_name ON medicinal_product(rmp_pfm_name)",
            "CREATE INDEX idx_mp_mpd_name ON medicinal_product(rmp_mpd_name)",
        ],
    },
    {
        "pattern": "REFERENCE_PHARMACEUTICAL_PRODUCT",
        "table": "pharmaceutical_product",
        "columns": [
            ("rpp_key", "TEXT PRIMARY KEY"),
            ("rmp_key", "TEXT REFERENCES medicinal_product(rmp_key)"),
            ("rpp_number", "INTEGER"),
            ("rpp_pfm_put_short", "TEXT"),
            ("rpp_pfm_put_long", "TEXT"),
            ("rpp_pfm_name", "TEXT"),
            ("rpp_pfm_term_id", "TEXT"),
            ("rpp_description", "TEXT"),
        ],
        "indexes": [
            "CREATE INDEX idx_pp_rmp_key ON pharmaceutical_product(rmp_key)",
            "CREATE INDEX idx_pp_pfm_name ON pharmaceutical_product(rpp_pfm_name)",
        ],
    },
    {
        "pattern": "REFERENCE_SUBSTANCE",
        "table": "substance",
        "columns": [
            ("rse_key", "TEXT PRIMARY KEY"),
            ("rpp_key", "TEXT REFERENCES pharmaceutical_product(rpp_key)"),
            ("rse_substance_name", "TEXT"),
            ("rse_substance_strength", "TEXT"),
            ("rse_substance_id", "TEXT"),
            ("rse_substance_rank", "INTEGER"),
        ],
        "indexes": [
            "CREATE INDEX idx_sub_rpp_key ON substance(rpp_key)",
            "CREATE INDEX idx_sub_name ON substance(rse_substance_name)",
            "CREATE INDEX idx_sub_id ON substance(rse_substance_id)",
        ],
    },
]


def find_dsv_file(directory, pattern):
    """Find a DSV file matching the given pattern in the directory."""
    matches = glob.glob(os.path.join(directory, f"*{pattern}*.dsv"))
    if not matches:
        matches = glob.glob(os.path.join(directory, f"*{pattern}*.DSV"))
    return matches[0] if matches else None


def detect_encoding(filepath: str) -> str:
    """Try to detect file encoding, default to utf-8."""
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            with open(filepath, "r", encoding=enc) as f:
                f.read(4096)
            return enc
        except UnicodeDecodeError:
            continue
    return "utf-8"


def import_dsv(conn: sqlite3.Connection, filepath: str, table_def: dict) -> int:
    """Import a single DSV file into the database. Returns row count."""
    table = table_def["table"]
    columns = table_def["columns"]

    # Create table
    col_defs = ", ".join(f"{name} {typ}" for name, typ in columns)
    conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.execute(f"CREATE TABLE {table} ({col_defs})")

    # Detect encoding
    encoding = detect_encoding(filepath)

    # Read and insert
    col_names = [name for name, _ in columns]
    placeholders = ", ".join(["?"] * len(col_names))
    insert_sql = f"INSERT OR IGNORE INTO {table} ({', '.join(col_names)}) VALUES ({placeholders})"

    row_count = 0
    with open(filepath, "r", encoding=encoding) as f:
        reader = csv.reader(f, delimiter="|")
        header = next(reader)  # skip header

        # Validate header matches expected columns
        header_lower = [h.strip().lower() for h in header]
        expected = [name for name, _ in columns]
        if header_lower != expected:
            print(f"  ⚠ Header mismatch in {os.path.basename(filepath)}")
            print(f"    Expected: {expected}")
            print(f"    Got:      {header_lower}")

        batch = []
        for row in reader:
            if len(row) < len(col_names):
                row.extend([""] * (len(col_names) - len(row)))
            elif len(row) > len(col_names):
                row = row[: len(col_names)]

            # Type coercion for INTEGER columns
            processed = []
            for i, (_, typ) in enumerate(columns):
                val = row[i].strip() if i < len(row) else ""
                if "INTEGER" in typ and val:
                    try:
                        val = int(val)
                    except ValueError:
                        val = None
                processed.append(val if val != "" else None)

            batch.append(processed)
            row_count += 1

            if len(batch) >= 5000:
                conn.executemany(insert_sql, batch)
                batch.clear()

        if batch:
            conn.executemany(insert_sql, batch)

    # Create indexes
    for idx_sql in table_def["indexes"]:
        conn.execute(idx_sql)

    return row_count


def create_fts(conn: sqlite3.Connection):
    """Create full-text search tables for Datasette."""
    conn.execute("DROP TABLE IF EXISTS medicinal_product_fts")
    conn.execute("""
        CREATE VIRTUAL TABLE medicinal_product_fts USING fts5(
            rmp_mpd_name, rmp_pfm_name, rmp_pzn,
            content=medicinal_product,
            content_rowid=rowid
        )
    """)
    conn.execute("""
        INSERT INTO medicinal_product_fts(rowid, rmp_mpd_name, rmp_pfm_name, rmp_pzn)
        SELECT rowid, rmp_mpd_name, rmp_pfm_name, rmp_pzn FROM medicinal_product
    """)

    conn.execute("DROP TABLE IF EXISTS substance_fts")
    conn.execute("""
        CREATE VIRTUAL TABLE substance_fts USING fts5(
            rse_substance_name,
            content=substance,
            content_rowid=rowid
        )
    """)
    conn.execute("""
        INSERT INTO substance_fts(rowid, rse_substance_name)
        SELECT rowid, rse_substance_name FROM substance
    """)


def add_metadata_table(conn: sqlite3.Connection, dsv_directory: str):
    """Store import metadata in the database itself."""
    conn.execute("DROP TABLE IF EXISTS _import_meta")
    conn.execute("""
        CREATE TABLE _import_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    # Extract date from directory or file name
    dirname = os.path.basename(dsv_directory.rstrip("/"))
    date_part = dirname[:8] if len(dirname) >= 8 and dirname[:8].isdigit() else None

    meta = {
        "import_timestamp": datetime.now().isoformat(),
        "source_directory": dirname,
        "data_date": date_part or "unknown",
        "source": "BfArM – Bundesinstitut für Arzneimittel und Medizinprodukte",
        "url": "https://www.bfarm.de",
    }
    conn.executemany(
        "INSERT INTO _import_meta (key, value) VALUES (?, ?)", meta.items()
    )


def import_lieferengpass(conn: sqlite3.Connection, csv_path: str) -> int:
    """Import PharmNet.Bund Lieferengpass CSV into the database."""
    conn.execute("DROP TABLE IF EXISTS lieferengpass")
    conn.execute("""
        CREATE TABLE lieferengpass (
            pzn TEXT,
            enr TEXT,
            meldungsart TEXT,
            beginn TEXT,
            ende TEXT,
            datum_letzte_meldung TEXT,
            art_des_grundes TEXT,
            arzneimittel TEXT,
            atc_code TEXT,
            wirkstoffe TEXT,
            krankenhausrelevant TEXT,
            zulassungsinhaber TEXT,
            grund TEXT,
            anm_grund TEXT,
            alternativpraeparat TEXT,
            datum_erstmeldung TEXT,
            darreichungsform TEXT,
            klassifikation TEXT
        )
    """)

    row_count = 0
    encoding = "utf-8"
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            with open(csv_path, "r", encoding=enc) as f:
                f.read(4096)
            encoding = enc
            break
        except UnicodeDecodeError:
            continue

    with open(csv_path, "r", encoding=encoding) as f:
        reader = csv.reader(f, delimiter=";")
        header = next(reader)  # skip header
        batch = []
        for row in reader:
            if len(row) < 15:
                continue
            pzn = row[0].strip().zfill(8) if row[0].strip() else ""
            # Nur aktive Meldungen (nicht Löschmeldungen)
            meldungsart = row[4].strip() if len(row) > 4 else ""
            if "ösch" in meldungsart.lower():
                continue
            entry = (
                pzn,
                row[1].strip() if len(row) > 1 else "",   # ENR
                meldungsart,
                row[5].strip() if len(row) > 5 else "",   # Beginn
                row[6].strip() if len(row) > 6 else "",   # Ende
                row[7].strip() if len(row) > 7 else "",   # Datum letzte Meldung
                row[8].strip() if len(row) > 8 else "",   # Art des Grundes
                row[9].strip() if len(row) > 9 else "",   # Arzneimittel
                row[10].strip() if len(row) > 10 else "",  # ATC
                row[11].strip() if len(row) > 11 else "",  # Wirkstoffe
                row[12].strip() if len(row) > 12 else "",  # KKH-relevant
                row[13].strip() if len(row) > 13 else "",  # Zulassungsinhaber
                row[16].strip() if len(row) > 16 else "",  # Grund
                row[17].strip() if len(row) > 17 else "",  # Anm. zum Grund
                row[18].strip() if len(row) > 18 else "",  # Alternativpräparat
                row[19].strip() if len(row) > 19 else "",  # Datum Erstmeldung
                row[21].strip() if len(row) > 21 else "",  # Darreichungsform
                row[22].strip() if len(row) > 22 else "",  # Klassifikation
            )
            batch.append(entry)
            row_count += 1
            if len(batch) >= 1000:
                conn.executemany(
                    "INSERT INTO lieferengpass VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    batch,
                )
                batch.clear()
        if batch:
            conn.executemany(
                "INSERT INTO lieferengpass VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                batch,
            )

    conn.execute("CREATE INDEX IF NOT EXISTS idx_le_pzn ON lieferengpass(pzn)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_le_atc ON lieferengpass(atc_code)")
    return row_count


def download_lieferengpass(output_dir):
    """Download current Lieferengpass CSV from PharmNet.Bund."""
    import urllib.request
    url = "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv"
    csv_path = os.path.join(output_dir, "lieferengpass.csv")
    try:
        print(f"📥 Downloading Lieferengpass CSV from PharmNet.Bund...")
        urllib.request.urlretrieve(url, csv_path)
        return csv_path
    except Exception as e:
        print(f"⚠ Could not download Lieferengpass data: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Import BfArM DSV files into SQLite")
    parser.add_argument("directory", help="Directory containing DSV files")
    parser.add_argument("--output", "-o", default="db/bfarm.db", help="Output SQLite file")
    parser.add_argument("--no-shortage", action="store_true", help="Skip Lieferengpass import")
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"❌ Directory not found: {args.directory}")
        sys.exit(1)

    print(f"📂 Source: {args.directory}")
    print(f"💾 Output: {args.output}")
    print()

    # Remove existing DB for clean import
    if os.path.exists(args.output):
        os.remove(args.output)

    conn = sqlite3.connect(args.output)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    for table_def in TABLE_DEFS:
        filepath = find_dsv_file(args.directory, table_def["pattern"])
        if not filepath:
            print(f"⚠ File not found for pattern: {table_def['pattern']}")
            continue

        print(f"📥 Importing {os.path.basename(filepath)} → {table_def['table']}")
        count = import_dsv(conn, filepath, table_def)
        print(f"   ✓ {count:,} rows imported")

    # FTS-Tabellen werden nicht mehr benötigt (Suche läuft client-seitig per JS)
    # print("\n🔍 Creating full-text search indexes...")
    # create_fts(conn)

    # Lieferengpass import
    if not args.no_shortage:
        csv_path = os.path.join(args.directory, "..", "lieferengpass.csv")
        if not os.path.exists(csv_path):
            csv_path = os.path.join("data", "lieferengpass.csv")
        if not os.path.exists(csv_path):
            csv_path = download_lieferengpass("data")
        if csv_path and os.path.exists(csv_path):
            print(f"\n📥 Importing Lieferengpass data...")
            le_count = import_lieferengpass(conn, csv_path)
            print(f"   ✓ {le_count:,} Lieferengpass-Meldungen imported")
        else:
            print("⚠ No Lieferengpass data available")

    print("📋 Writing import metadata...")
    add_metadata_table(conn, args.directory)

    conn.commit()

    # Database stats
    db_size = os.path.getsize(args.output) / (1024 * 1024)
    print(f"\n✅ Done! Database size: {db_size:.1f} MB")
    print(f"\n🌐 Use with Datasette Lite:")
    print(f"   https://lite.datasette.io/?url=<URL_TO_bfarm.db>")

    conn.close()


if __name__ == "__main__":
    main()
