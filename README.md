# BfArM Arzneimittel-Referenzdaten

Serverlose Datenbank der BfArM-Referenzdaten (Arzneimittel, pharmazeutische Produkte, Wirkstoffe) mit Fuzzy-Suche, Schreibkorrektur, Spracheingabe, Kamera/OCR und Rezeptwunsch-Formular.

Gehostet auf [Codeberg](https://codeberg.org/raimu/Referenzdaten_at_bfarm.de), abfragbar direkt im Browser — kein Server, keine Installation. Alle Daten verbleiben im Browser.

## Live-Zugriff

**Web-Oberfläche:**
```
https://raimu.codeberg.page/Referenzdaten_at_bfarm.de/web/
```

**Datasette Lite (SQL-Browser):**
```
https://lite.datasette.io/?url=https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/db/bfarm.db
```

## Funktionen

### Suche
- **Fuzzy-Suche** mit Kölner Phonetik, Levenshtein-Distanz und Trigram-Ähnlichkeit
- **Automatische Schreibkorrektur** ("Barazettamuhl" → Paracetamol, "Methoprolol" → Metoprololsuccinat)
- **Multi-Token-Suche** für Arzneimittel ("Paracetaml Hex" → Paracetamol HEXAL)
- **Wirkstoff-Drill-Down**: Klick auf Wirkstoff zeigt alle Arzneimittel mit diesem Wirkstoff
- **Wirkstoff-IDs** (BfArM `rse_substance_id`) werden durchgängig mitgeführt
- **PZN-Suche** mit automatischer Wirkstoff-Zuordnung
- SQL-Editor für beliebige Abfragen
- JSON-API für Einbindung in externe Formulare

### Spracheingabe
- **Web Speech API** (de-DE) für Suchfeld und alle Formularfelder
- **Diktiermodus**: "Formular diktieren" — alle Felder nacheinander per Sprache ausfüllen
- Sprachkommandos: **WEITER** (nächstes Feld), **STOPP/FERTIG** (beenden), **ÜBERSPRINGEN** (Feld leer lassen)
- 2-Phasen-Erkennung: Eingabe → Warte auf Kommando (Wert wird nicht überschrieben)
- Automatische Großbuchstaben-Konvertierung

### Kamera / OCR / Barcode
- **5 Scan-Modi**: Strichcode/EAN, QR-Code, Text/OCR, **Medikamentenpass**, Foto-Upload
- **Tesseract.js** OCR mit Schwarzweiß-Vorverarbeitung (Binarisierung)
- **html5-qrcode** für Barcode-/QR-Erkennung
- PZN-Extraktion aus EAN-13 Strichcodes
- Erkannte Medikamente direkt zur Liste hinzufügen
- **Medikamentenpass-Scan**: QR-Code vom Medikamentenpass einlesen → Patientendaten + Medikamentenliste werden automatisch ins Formular übernommen

### Medikamentenliste & Rezeptanfrage
- Medikamente aus Suche, Drill-Down oder Kamera-Scan hinzufügen
- **Formular**: Patient/in (Pflichtfeld), E-Mail, Telefon (mind. eines Pflicht), Geburtsdatum (Datepicker + Freitext-Parsing), Versichertennummer (KVNR mit Prüfsummen-Validierung), Krankenkasse (GKV/PKV/Selbstzahler mit IK-Nummern), Empfänger, Nachricht
- **KVNR-Validierung**: Format A123456789 — Prüfsumme nach Modulo-10 (alternierend Gewicht 1/2). Visuelles Feedback: grün = gültig, rot = ungültig mit Fehlerbeschreibung
- **E-Mail-Validierung**: RFC 5322 (vereinfacht), visuelles Feedback
- **Telefon-Validierung**: Deutsche Nummern — erkennt Mobilnetz (0150-0179), Festnetz-Vorwahlen, Sondernummern. Normalisiert +49/0049. Prüft Länge (10-13 Ziffern)
- **Pflichtfelder**: PDF-Erstellung nur möglich wenn Name + (E-Mail oder Telefon) ausgefüllt
- **Formular diktieren**: Komplettes Formular per Sprache ausfüllen
- **Formular löschen**: Alle Felder auf einmal zurücksetzen
- Jedes Feld mit Spracheingabe (\ud83c\udf99) und Löschen-Button (×)

### Export
- **PDF** (TLP:AMBER+STRICT): Schreibgeschützt, Amber-Banner, min. 12pt Schrift, QR-Code mit Klartext-Inhalt, Basisdaten auf jeder Seite, Tabellen-Header auf Folgeseiten, leere Felder als "OHNE ANGABE"
- **QR-Code**: Kompaktes JSON mit PZN + Wirkstoff-ID (~30-40 Bytes/Medikament), als Modal + PNG-Download
- **CSV-Export** mit Wirkstoff-ID-Spalte
- **Verschlüsselte E-Mail**: AES-256-GCM + PBKDF2 (600.000 Iterationen)
- **Zwischenablage**: Klartext-Kopie

### Lieferengpass-Check & Generika-Abgleich

- **Lieferengpass-Daten**: CSV von PharmNet.Bund wird beim App-Start im Hintergrund geladen
- **Automatischer Abgleich**: Jede PZN in Suchergebnissen und Medikamentenliste wird gegen aktuelle Lieferengpässe geprüft
- **Warnung**: ⚠ Lieferengpass mit Grund, Ende-Datum und Hersteller-Alternative (wenn vorhanden)
- **Generika-Vorschläge**: Button "Generika anzeigen" pro Medikament — sucht per Wirkstoff-ID (`rse_substance_id`) alle Arzneimittel mit identischem Wirkstoff
- **Verfügbarkeit**: Jedes Generikum zeigt ✓ verfügbar oder ⚠ Engpass
- **Im PDF**: Lieferengpässe werden rot markiert mit Alternative
- **Im QR-Code**: `e:1` (Engpass-Flag) + `a:"Alternativname"` pro Medikament
- **Zeitstempel**: Datenstand-Zeile zeigt Anzahl Lieferengpässe + Stand-Datum + Quelle
- **Klickbare Warnungen**: Klick auf Engpass-Warnung in Suchergebnissen oder Lieferengpass-Tab zeigt sofort alle Generika/Alternativen mit Verfügbarkeitsstatus
- **Klassifikation**: Freiverkäuflich (OTC), Apothekenpflichtig, Verschreibungspflichtig — als Badge und im PDF
- **Filter**: Lieferengpass-Tab mit Chips: Alle | Verschreibungspflichtig | Apothekenpflichtig | Freiverkäuflich | KKH-relevant

### Statistiken
- Top 20 Wirkstoffe nach Häufigkeit
- Darreichungsformen-Verteilung
- Wirkstoffe pro Arzneimittel (Verteilung)
- CSS-Balkendiagramme (kein Chart-Framework)

### Datenstand
- Aktuelles Datum mit Wochentag
- Datenstand mit nächstem Update-Countdown (14-Tage-Zyklus)

## Sicherheit

### Datenschutz
- **Komplett serverless**: Alle Daten verbleiben im Browser, kein Upload
- **Nur sessionStorage**: Keine persistenten Daten, alles weg bei Tab-Close
- **AES-256-GCM Verschlüsselung** des sessionStorage (Session-Key pro Tab)
- **Inaktivitäts-Timeout**: Automatische Löschung nach 5 Minuten
- **beforeunload**: Löscht sessionStorage + Cache bei Reload/Tab-Close
- **"Sitzung beenden"**: Manueller Button löscht alles
- **DB-Zerstörung**: Bei Inaktivität/Sitzungsende wird die SQL-Datenbank aus dem RAM entfernt (`db.close()` + null)
- **IndexedDB-Löschung**: Alle IndexedDB-Datenbanken werden gelöscht
- Kamera-Bilder werden nach OCR aus dem RAM gelöscht

### PDF-Sicherheit
- **TLP:AMBER+STRICT** Klassifizierung auf jeder Seite (Amber-Banner)
- Schreibschutz (nur Drucken erlaubt, kein Kopieren/Bearbeiten)
- Vertraulichkeitshinweis in 12pt
- Dateiname: `TLP-AMBER-STRICT_Rezeptwunsch_<UUID>_<DATUM>.pdf`

### E-Mail-Verschlüsselung
- AES-256-GCM + PBKDF2 (600.000 Iterationen), post-quanten-sicher nach BSI TR-02102-1
- ML-KEM-768 (CRYSTALS-Kyber) Hybrid-Verschlüsselung optional (WASM)
- Passwort wird nicht mitgesendet — separate Übermittlung erforderlich

### Haftungsausschluss
- **Disclaimer-Modal** beim ersten Besuch (muss bestätigt werden)
- **Footer**: Permanenter Hinweis auf jeder Seite
- Kein Service des BfArM, keine Gewähr für Vollständigkeit/Richtigkeit
- Konsultation einer Fachperson empfohlen

## Krankenkassen-Verzeichnis

87 gesetzliche (GKV) und 34 private Krankenversicherungen (PKV) mit **Institutionskennzeichen (IK)** (9-stellig). Zusätzlich: Selbstzahler/in.

Suchbar per Freitext-Autocomplete und Spracheingabe. Bei Mehrdeutigkeit (z.B. "BKK") werden passende Optionen zur Auswahl angezeigt.

## API-Einbindung (serverless)

Für die Einbindung in ein Formular auf einer anderen Website:

```html
<script src="https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/web/js/bfarm-api.js"></script>
<script>
  var api = new BfarmAPI();
  api.init().then(function() {
    var result = api.checkSpelling('Barazettamuhl');
    // { found: false, suggestions: [{name: "Paracetamol", score: 0.87}] }
  });
</script>
```

### API-Methoden

| Methode | Beschreibung |
|---------|-------------|
| `init(onProgress?)` | Lädt sql.js + Datenbank |
| `checkSpelling(name, type?)` | Schreibkorrektur. `type`: `'substance'` oder `'medication'` |
| `searchSubstance(query, max?)` | Wirkstoff-Fuzzy-Suche |
| `searchMedication(query, max?)` | Arzneimittel-Fuzzy-Suche (Multi-Token) |
| `lookupPZN(pzn)` | PZN-Suche mit Wirkstoff-Details |

## Projektstruktur

```
\u251c\u2500\u2500 README.md
\u251c\u2500\u2500 .gitignore
\u251c\u2500\u2500 metadata.json              # Datasette-Konfiguration
\u2502
\u251c\u2500\u2500 data/                      # DSV-Quelldaten (14-tägig aktualisiert)
\u2502   \u2514\u2500\u2500 20260401-REFERENCE/
\u2502
\u251c\u2500\u2500 db/                        # Generierte SQLite-Datenbank
\u2502   \u2514\u2500\u2500 bfarm.db
\u2502
\u251c\u2500\u2500 docs/                      # Dokumentation
\u2502   \u2514\u2500\u2500 BfArM-Technische-Dokumentation.pdf
\u2502
\u251c\u2500\u2500 src/                       # Python-Werkzeuge
\u2502   \u251c\u2500\u2500 import_bfarm.py        # DSV + Lieferengpässe → SQLite
\u2502   \u251c\u2500\u2500 update.sh              # Automatisiertes Update-Skript
\u2502   \u2514\u2500\u2500 fuzzy_lookup.py        # CLI Fuzzy-Suche
\u2502
\u2514\u2500\u2500 web/                       # Web-Frontend (serverless)
    \u251c\u2500\u2500 index.html
    \u251c\u2500\u2500 api-demo.html          # Demo: API-Einbindung
    \u251c\u2500\u2500 css/
    \u2502   \u2514\u2500\u2500 style.css
    \u2514\u2500\u2500 js/
        \u251c\u2500\u2500 config.js          # DB-URL, Pfade
        \u251c\u2500\u2500 phonetics.js       # Kölner Phonetik, Levenshtein, Trigram
        \u251c\u2500\u2500 scoring.js         # Scoring-Engine
        \u251c\u2500\u2500 db.js              # Datenbank-Layer + Datenstand
        \u251c\u2500\u2500 search.js          # Multi-Token-Fuzzy-Suche
        \u251c\u2500\u2500 crypto.js          # AES-256-GCM + ML-KEM-768
        \u251c\u2500\u2500 medlist.js         # Medikamentenliste + PDF + QR + XML
        \u251c\u2500\u2500 insurance.js       # GKV/PKV mit IK-Nummern
        \u251c\u2500\u2500 qrcode.js          # QR-Code Generator
        \u251c\u2500\u2500 voice.js           # Spracheingabe
        \u251c\u2500\u2500 camera.js          # Kamera, OCR, Barcode
        \u251c\u2500\u2500 stats.js           # Statistiken
        \u251c\u2500\u2500 ui.js              # UI, Diktiermodus, App-Start
        \u2514\u2500\u2500 bfarm-api.js       # Standalone-API

```

## QR-Code Datenformat (kompaktes JSON)

```json
{
  "v": 1,
  "t": "2026-04-02T10:30:00Z",
  "p": {
    "n": "MAX MUSTERMANN",
    "d": "15.03.1985",
    "i": "A123456789",
    "k": "Techniker Krankenkasse (TK) (IK: 101575519)"
  },
  "r": "PRAXIS DR. SCHMIDT",
  "m": [
    {"z": "16795349", "s": "11953", "q": "95 mg", "n": "Beloc-Zok 95 mg"},
    {"z": "00802259", "s": "05127", "q": "5 mg", "n": "Ramipril 5mg 1A Pharma"}
  ]
}
```

| Feld | Beschreibung |
|------|-------------|
| `v` | Schema-Version (aktuell: 1) |
| `t` | Erstellungszeitpunkt (ISO 8601) |
| `p.n` | Patient Name (Großbuchstaben) |
| `p.d` | Geburtsdatum (TT.MM.JJJJ) |
| `p.i` | Versichertennummer |
| `p.k` | Krankenkasse (mit IK-Nummer) |
| `r` | Empfänger (Praxis/Apotheke) |
| `m[].z` | PZN (Pharmazentralnummer) |
| `m[].s` | BfArM Wirkstoff-ID (`rse_substance_id`) |
| `m[].q` | Stärke/Dosierung |
| `m[].n` | Arzneimittelname |
| `m[].e` | Lieferengpass-Flag (1 = Engpass, fehlt = verfügbar) |
| `m[].a` | Alternativpräparat bei Lieferengpass (lt. Hersteller) |

Im PDF wird der QR-Inhalt zusätzlich als Klartext neben dem QR-Code abgedruckt.

## XML-Schema (Medikamentenliste)

Namespace: `urn:bfarm-referenzdaten:medliste:v1`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MedikamentenListe xmlns="urn:bfarm-referenzdaten:medliste:v1" erstellt="2026-04-02T10:30:00Z">
  <Patient>
    <Name>MAX MUSTERMANN</Name>
    <Geburtsdatum>15.03.1985</Geburtsdatum>
    <Versichertennummer>A123456789</Versichertennummer>
    <Versicherung>Techniker Krankenkasse (TK)</Versicherung>
  </Patient>
  <Empfänger>Praxis Dr. Schmidt</Empfänger>
  <Nachricht>Folgerezept bitte</Nachricht>
  <Arzneimittel anzahl="2">
    <Medikament nr="1">
      <Name>Beloc-Zok 95 mg</Name>
      <PZN>16795349</PZN>
      <Wirkstoff>Metoprololsuccinat</Wirkstoff>
      <WirkstoffId>11953</WirkstoffId>
      <Stärke>95 mg</Stärke>
      <Darreichungsform>Retardtablette</Darreichungsform>
    </Medikament>
  </Arzneimittel>
  <Lieferengpaesse quelle="PharmNet.Bund" stand="2026-04-03T14:23:00Z" anzahl="847"/>
  <TLP klassifizierung="AMBER+STRICT">Nur für Fachpersonal.</TLP>
</MedikamentenListe>
```

## PDF-Aufbau (TLP:AMBER+STRICT)

- **Kopfzeile**: Amber-Hintergrund, "TLP:AMBER+STRICT" rechtsbündig (Amber auf Schwarz, 12pt)
- **Basisdaten** auf jeder Seite: Titel, Datum, Dok.-ID, Patient, Geburtsdatum, Vers.-Nr., Versicherung, Empfänger (leere Felder: "OHNE ANGABE")
- **Medikamenten-Tabelle**: Nr. | Arzneimittel (Umbrechen) | PZN | Wirkstoff [ID] | Stärke/Form. Tabellen-Header auf Folgeseiten.
- **QR-Code**: Links QR-Bild, rechts Klartext-Inhalt aller Medikamente
- **Vertraulichkeitshinweis**: Volle Seitenbreite, 12pt
- **Fußzeile**: Amber-Hintergrund, Seitenzahl, TLP-Badge
- Dateiname: `TLP-AMBER-STRICT_Rezeptwunsch_<UUID>_<YYYY-MM-DD>.pdf`

## Update-Workflow (alle 14 Tage)

### Automatisiert (empfohlen)

```bash
# 1. Neue DSV-Dateien vom BfArM herunterladen
mkdir -p data/20260415-REFERENCE
# DSV-Dateien in data/20260415-REFERENCE/ ablegen

# 2. Komplettes Update (Arzneimittel-DB + Lieferengpässe)
./src/update.sh data/20260415-REFERENCE/

# 3. Commit & Push
git add db/bfarm.db data/lieferengpass.csv data/20260415-REFERENCE/
git commit -m "Datenupdate 2026-04-15"
git push
```

Das Update-Skript (`src/update.sh`) führt automatisch aus:
1. Download der aktuellen Lieferengpass-CSV von PharmNet.Bund
2. Import aller DSV-Dateien + Lieferengpässe in `db/bfarm.db`
3. Zusammenfassung mit Datenbankgröße

### Manuell (einzelne Schritte)

```bash
# Nur Arzneimittel-DB (ohne Lieferengpässe)
python src/import_bfarm.py data/20260415-REFERENCE/ --no-shortage

# Nur Lieferengpass-CSV aktualisieren
curl -o data/lieferengpass.csv "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv"
python src/import_bfarm.py data/20260415-REFERENCE/
```

### Datenverzeichnisse

```
data/
\u251c\u2500\u2500 20260401-REFERENCE/         # BfArM DSV-Dateien (14-tägig)
\u251c\u2500\u2500 20260415-REFERENCE/         # Nächstes Update
\u2514\u2500\u2500 lieferengpass.csv           # PharmNet.Bund Lieferengpässe (bei jedem Update)
```

## Lokale Einrichtung

```bash
git clone https://codeberg.org/raimu/Referenzdaten_at_bfarm.de.git
cd Referenzdaten_at_bfarm.de
python src/import_bfarm.py data/20260401-REFERENCE/
python3 -m http.server 8080
# → http://localhost:8080/web/index.html
```

## Datenmodell

```
medicinal_product (108.055 Arzneimittel)
  \u251c\u2500\u2500 rmp_key (PK)
  \u251c\u2500\u2500 rmp_pzn (Pharmazentralnummer)
  \u251c\u2500\u2500 rmp_mpd_name (Bezeichnung)
  \u2514\u2500\u2500 rmp_pfm_* (Darreichungsform)
        \u2502
        ▼  1:N
pharmaceutical_product (111.475)
  \u251c\u2500\u2500 rpp_key (PK)
  \u251c\u2500\u2500 rmp_key (FK → medicinal_product)
  \u2514\u2500\u2500 rpp_pfm_* (Darreichungsform Teilprodukt)
        \u2502
        ▼  1:N
substance (4.383 Wirkstoffe)
  \u251c\u2500\u2500 rse_key (PK)
  \u251c\u2500\u2500 rpp_key (FK → pharmaceutical_product)
  \u251c\u2500\u2500 rse_substance_name (Wirkstoffname)
  \u251c\u2500\u2500 rse_substance_id (Wirkstoff-ID, 5-stellig)
  \u2514\u2500\u2500 rse_substance_strength (Stärke)
```

## Externe Bibliotheken (alle via CDN, lazy-loaded)

| Bibliothek | Zweck | Größe |
|---|---|---|
| sql.js | SQLite im Browser (WASM) | ~1 MB |
| Tesseract.js | OCR-Texterkennung | ~2 MB (bei Bedarf) |
| html5-qrcode | Barcode/QR-Scanner | ~80 KB (bei Bedarf) |
| qrcode-generator | QR-Code Erzeugung | ~15 KB (bei Bedarf) |
| jsPDF | PDF-Export | ~90 KB (bei Bedarf) |

## Datenquellen

| Quelle | URL |
|---|---|
| BfArM Referenzdatenbank | https://www.bfarm.de/DE/Arzneimittel/Arzneimittelinformationen/Referenzdatenbank/_node.html |
| BfArM Technische Dokumentation | https://www.bfarm.de/SharedDocs/Downloads/DE/Arzneimittel/Zulassung/amInformationen/Referenzdatenbank/Technische-Dokumentation.pdf |
| PharmNet.Bund Lieferengpassmeldungen (Suche) | https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/faces/public/meldungen.xhtml |
| PharmNet.Bund Lieferengpassmeldungen (CSV-Export) | https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv |
| PharmNet.Bund Lieferengpässe (Öffentlichkeit) | https://www.pharmnet-bund.de/PharmNet/DE/Oeffentlichkeit/Lieferengpaesse/_node.html |
| PharmNet.Bund Portal (Öffentlichkeit) | https://www.pharmnet-bund.de/PharmNet/DE/Oeffentlichkeit/_node.html |
| GKV-Krankenkassenliste | https://www.krankenkassen.de/gesetzliche-krankenkassen/krankenkassen-liste/ |
| PKV-Versicherungsliste | https://www.krankenkassen.de/private-krankenversicherung/pkv-liste/ |
| IK-Verzeichnis | https://www.gkv-datenaustausch.de/leistungserbringer/institutionskennzeichen/ |

## Medikamentenpass (QR-Karte)

Der Medikamentenpass ist eine digitale Karte im Kreditkartenformat (85.6 × 54 mm) mit:
- Patientenname, Geburtsdatum, Versichertennummer, Krankenkasse
- Anzahl und Liste der Medikamente
- QR-Code mit allen Daten (kompaktes JSON)
- TLP:AMBER+STRICT Kennzeichnung

**Workflow:**
1. Medikamente zur Liste hinzufügen, Formular ausfüllen
2. "Medikamentenpass" klicken → Karte wird als Bild generiert
3. "Als Bild speichern" → PNG auf dem Gerät
4. Beim nächsten Besuch: Kamera/OCR → QR scannen → Liste wird wiederhergestellt

Kein Server, kein Account, keine Cloud — der Patient hat die volle Kontrolle über seine Daten.

## PWA-Umbau (Progressive Web App)

### Warum PWA?
Die aktuelle Web-App löscht alle Daten bei Tab-Close (sessionStorage). Als installierte PWA könnte sie:
- Verschlüsselten Speicher dauerhaft nutzen (IndexedDB + AES-256-GCM)
- Offline funktionieren (Service Worker cached DB + Assets)
- Wie eine native App installiert werden (Homescreen-Icon)
- Push-Benachrichtigungen für Daten-Updates senden

### Was ist zu tun?

| Schritt | Datei | Beschreibung |
|---------|-------|-------------|
| 1. Manifest | `web/manifest.json` | App-Name, Icons, Theme-Color, Display: standalone |
| 2. Service Worker | `web/sw.js` | Cache-Strategie: DB + Assets precachen, Lieferengpässe network-first |
| 3. Icons | `web/icons/` | 192x192 + 512x512 PNG (Maskable + Any) |
| 4. HTTPS | Codeberg Pages | Bereits HTTPS — Voraussetzung für Service Worker |
| 5. Install-Prompt | `web/js/ui.js` | "Als App installieren" Button, `beforeinstallprompt` Event |
| 6. Speicher-Migration | `web/js/medlist.js` | sessionStorage → IndexedDB (verschlüsselt) wenn PWA installiert |
| 7. Offline-DB | `web/sw.js` | bfarm.db im Cache Storage vorhalten (~53 MB) |
| 8. Update-Mechanismus | `web/sw.js` | Bei neuer DB-Version: alten Cache invalidieren |

### manifest.json (Entwurf)

```json
{
  "name": "BfArM Arzneimittel-Datenbank",
  "short_name": "BfArM DB",
  "description": "Medikamentensuche mit Fuzzy-Korrektur, Rezeptanfrage und QR-Medikamentenpass",
  "start_url": "/web/index.html",
  "display": "standalone",
  "background_color": "#0c0f14",
  "theme_color": "#4a7cff",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### Service Worker Strategie

```
Assets (JS/CSS/HTML):    Cache-First (Update im Hintergrund)
bfarm.db:               Cache-First (14-Tage TTL, dann Network)
Lieferengpässe CSV:     Network-First (Fallback: letzter Cache)
Externe CDNs:           Cache-First (versioniert)
```

### Sicherheit bei PWA

- Favoriten/Medikamentenliste in **IndexedDB** statt sessionStorage
- Weiterhin **AES-256-GCM** verschlüsselt (Session-Key oder Nutzer-PIN)
- **Inaktivitäts-Timer** bleibt aktiv (5 Min → Speicher sperren, nicht löschen)
- **PIN/Biometrie** zum Entsperren nach Inaktivität
- "Alle Daten löschen" Button löscht IndexedDB + Cache + deinstalliert Service Worker

## Roadmap

| Nr. | Feature | Status |
|-----|---------|--------|
| 1 | ~~Wechselwirkungen / Interaktionen~~ | Offen (keine freie Datenquelle, ABDA kostenpflichtig) |
| 2 | ~~Lieferengpässe + Generika-Vorschläge~~ | **Umgesetzt** — PharmNet.Bund CSV + Generika per Wirkstoff-ID |
| 3 | Beipackzettel-Links (pharmnet-bund.de) | Offen |
| 4 | Dosierungshinweise (Morgens/Mittags/Abends pro Medikament) | Offen |
| 5 | Medikationsplan nach BMP-Standard (Bundesmedikationsplan) | Offen |
| 6 | Mehrsprachigkeit (EN/TR/RU/AR) | Offen |
| 7 | Offline-Modus (Service Worker) | Offen |
| 8 | ~~Generika-Vorschläge (gleicher Wirkstoff)~~ | **Umgesetzt** — Button "Generika anzeigen" pro Medikament |
| 9 | Dark/Light-Mode Toggle | Offen (aktuell nur Dark) |
| 10 | Druckansicht (Browser-Print optimiert) | Offen |
| 11 | ~~Favoritenliste~~ | **Gelöst** via QR-Medikamentenpass (scannen bei nächstem Besuch) |
| 12 | PWA-Umbau (Progressive Web App) | Dokumentiert, Umsetzung offen |
| 13 | ~~QR-Medikamentenpass (Kreditkartenformat)~~ | **Umgesetzt** |

## Credits

- [BfArM](https://www.bfarm.de) für die offizielle Bereitstellung der Referenzdaten
- [krankenkassen.de](https://www.krankenkassen.de) für GKV- und PKV-Verzeichnisse
- Claude Code für Refactoring, Normalisierung, Kommentierung und Dokumentierung
- [Nierenzentrum in Berlin](https://www.Nierenzentrum-in-Berlin.de) und Herrn Dr. Dietz für die Idee

## Lizenz

Die Daten stammen vom [BfArM](https://www.bfarm.de) und unterliegen der
[Datenlizenz Deutschland – Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0).

Dieses Repository (Skripte und Konfiguration) steht unter der MIT-Lizenz.
