# BfArM Arzneimittel-Referenzdaten

Serverlose Datenbank der BfArM-Referenzdaten (Arzneimittel, pharmazeutische Produkte, Wirkstoffe) mit Fuzzy-Suche, Schreibkorrektur, Spracheingabe, Kamera/OCR und Rezeptwunsch-Formular.

Gehostet auf [Codeberg](https://codeberg.org/raimu/Referenzdaten_at_bfarm.de), abfragbar direkt im Browser — kein Server, keine Installation. Alle Daten verbleiben im Browser.

## Live-Zugriff

**Web-Oberfl\u00e4che:**
```
https://raimu.codeberg.page/Referenzdaten_at_bfarm.de/web/
```

**Datasette Lite (SQL-Browser):**
```
https://lite.datasette.io/?url=https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/db/bfarm.db
```

## Funktionen

### Suche
- **Fuzzy-Suche** mit K\u00f6lner Phonetik, Levenshtein-Distanz und Trigram-\u00c4hnlichkeit
- **Automatische Schreibkorrektur** ("Barazettamuhl" \u2192 Paracetamol, "Methoprolol" \u2192 Metoprololsuccinat)
- **Multi-Token-Suche** f\u00fcr Arzneimittel ("Paracetaml Hex" \u2192 Paracetamol HEXAL)
- **Wirkstoff-Drill-Down**: Klick auf Wirkstoff zeigt alle Arzneimittel mit diesem Wirkstoff
- **Wirkstoff-IDs** (BfArM `rse_substance_id`) werden durchg\u00e4ngig mitgef\u00fchrt
- **PZN-Suche** mit automatischer Wirkstoff-Zuordnung
- SQL-Editor f\u00fcr beliebige Abfragen
- JSON-API f\u00fcr Einbindung in externe Formulare

### Spracheingabe
- **Web Speech API** (de-DE) f\u00fcr Suchfeld und alle Formularfelder
- **Diktiermodus**: "Formular diktieren" \u2014 alle Felder nacheinander per Sprache ausf\u00fcllen
- Sprachkommandos: **WEITER** (n\u00e4chstes Feld), **STOPP/FERTIG** (beenden), **\u00dcBERSPRINGEN** (Feld leer lassen)
- 2-Phasen-Erkennung: Eingabe \u2192 Warte auf Kommando (Wert wird nicht \u00fcberschrieben)
- Automatische Gro\u00dfbuchstaben-Konvertierung

### Kamera / OCR / Barcode
- **5 Scan-Modi**: Strichcode/EAN, QR-Code, Text/OCR, **Medikamentenpass**, Foto-Upload
- **Tesseract.js** OCR mit Schwarzwei\u00df-Vorverarbeitung (Binarisierung)
- **html5-qrcode** f\u00fcr Barcode-/QR-Erkennung
- PZN-Extraktion aus EAN-13 Strichcodes
- Erkannte Medikamente direkt zur Liste hinzuf\u00fcgen
- **Medikamentenpass-Scan**: QR-Code vom Medikamentenpass einlesen \u2192 Patientendaten + Medikamentenliste werden automatisch ins Formular \u00fcbernommen

### Medikamentenliste & Rezeptanfrage
- Medikamente aus Suche, Drill-Down oder Kamera-Scan hinzuf\u00fcgen
- **Formular**: Patient/in (Pflichtfeld), E-Mail, Telefon (mind. eines Pflicht), Geburtsdatum (Datepicker + Freitext-Parsing), Versichertennummer (KVNR mit Pr\u00fcfsummen-Validierung), Krankenkasse (GKV/PKV/Selbstzahler mit IK-Nummern), Empf\u00e4nger, Nachricht
- **KVNR-Validierung**: Format A123456789 \u2014 Pr\u00fcfsumme nach Modulo-10 (alternierend Gewicht 1/2). Visuelles Feedback: gr\u00fcn = g\u00fcltig, rot = ung\u00fcltig mit Fehlerbeschreibung
- **E-Mail-Validierung**: RFC 5322 (vereinfacht), visuelles Feedback
- **Telefon-Validierung**: Deutsche Nummern \u2014 erkennt Mobilnetz (0150-0179), Festnetz-Vorwahlen, Sondernummern. Normalisiert +49/0049. Pr\u00fcft L\u00e4nge (10-13 Ziffern)
- **Pflichtfelder**: PDF-Erstellung nur m\u00f6glich wenn Name + (E-Mail oder Telefon) ausgef\u00fcllt
- **Formular diktieren**: Komplettes Formular per Sprache ausf\u00fcllen
- **Formular l\u00f6schen**: Alle Felder auf einmal zur\u00fccksetzen
- Jedes Feld mit Spracheingabe (\ud83c\udf99) und L\u00f6schen-Button (\u00d7)

### Export
- **PDF** (TLP:AMBER+STRICT): Schreibgesch\u00fctzt, Amber-Banner, min. 12pt Schrift, QR-Code mit Klartext-Inhalt, Basisdaten auf jeder Seite, Tabellen-Header auf Folgeseiten, leere Felder als "OHNE ANGABE"
- **QR-Code**: Kompaktes JSON mit PZN + Wirkstoff-ID (~30-40 Bytes/Medikament), als Modal + PNG-Download
- **CSV-Export** mit Wirkstoff-ID-Spalte
- **Verschl\u00fcsselte E-Mail**: AES-256-GCM + PBKDF2 (600.000 Iterationen)
- **Zwischenablage**: Klartext-Kopie

### Lieferengpass-Check & Generika-Abgleich

- **Lieferengpass-Daten**: CSV von PharmNet.Bund wird beim App-Start im Hintergrund geladen
- **Automatischer Abgleich**: Jede PZN in Suchergebnissen und Medikamentenliste wird gegen aktuelle Lieferengp\u00e4sse gepr\u00fcft
- **Warnung**: \u26a0 Lieferengpass mit Grund, Ende-Datum und Hersteller-Alternative (wenn vorhanden)
- **Generika-Vorschl\u00e4ge**: Button "Generika anzeigen" pro Medikament \u2014 sucht per Wirkstoff-ID (`rse_substance_id`) alle Arzneimittel mit identischem Wirkstoff
- **Verf\u00fcgbarkeit**: Jedes Generikum zeigt \u2713 verf\u00fcgbar oder \u26a0 Engpass
- **Im PDF**: Lieferengp\u00e4sse werden rot markiert mit Alternative
- **Im QR-Code**: `e:1` (Engpass-Flag) + `a:"Alternativname"` pro Medikament
- **Zeitstempel**: Datenstand-Zeile zeigt Anzahl Lieferengp\u00e4sse + Stand-Datum + Quelle
- **Klickbare Warnungen**: Klick auf Engpass-Warnung in Suchergebnissen oder Lieferengpass-Tab zeigt sofort alle Generika/Alternativen mit Verf\u00fcgbarkeitsstatus
- **Klassifikation**: Freiverkäuflich (OTC), Apothekenpflichtig, Verschreibungspflichtig \u2014 als Badge und im PDF
- **Filter**: Lieferengpass-Tab mit Chips: Alle | Verschreibungspflichtig | Apothekenpflichtig | Freiverk\u00e4uflich | KKH-relevant

### Statistiken
- Top 20 Wirkstoffe nach H\u00e4ufigkeit
- Darreichungsformen-Verteilung
- Wirkstoffe pro Arzneimittel (Verteilung)
- CSS-Balkendiagramme (kein Chart-Framework)

### Datenstand
- Aktuelles Datum mit Wochentag
- Datenstand mit n\u00e4chstem Update-Countdown (14-Tage-Zyklus)

## Sicherheit

### Datenschutz
- **Komplett serverless**: Alle Daten verbleiben im Browser, kein Upload
- **Nur sessionStorage**: Keine persistenten Daten, alles weg bei Tab-Close
- **AES-256-GCM Verschl\u00fcsselung** des sessionStorage (Session-Key pro Tab)
- **Inaktivit\u00e4ts-Timeout**: Automatische L\u00f6schung nach 5 Minuten
- **beforeunload**: L\u00f6scht sessionStorage + Cache bei Reload/Tab-Close
- **"Sitzung beenden"**: Manueller Button l\u00f6scht alles
- **DB-Zerst\u00f6rung**: Bei Inaktivit\u00e4t/Sitzungsende wird die SQL-Datenbank aus dem RAM entfernt (`db.close()` + null)
- **IndexedDB-L\u00f6schung**: Alle IndexedDB-Datenbanken werden gel\u00f6scht
- Kamera-Bilder werden nach OCR aus dem RAM gel\u00f6scht

### PDF-Sicherheit
- **TLP:AMBER+STRICT** Klassifizierung auf jeder Seite (Amber-Banner)
- Schreibschutz (nur Drucken erlaubt, kein Kopieren/Bearbeiten)
- Vertraulichkeitshinweis in 12pt
- Dateiname: `TLP-AMBER-STRICT_Rezeptwunsch_<UUID>_<DATUM>.pdf`

### E-Mail-Verschl\u00fcsselung
- AES-256-GCM + PBKDF2 (600.000 Iterationen), post-quanten-sicher nach BSI TR-02102-1
- ML-KEM-768 (CRYSTALS-Kyber) Hybrid-Verschl\u00fcsselung optional (WASM)
- Passwort wird nicht mitgesendet \u2014 separate \u00dcbermittlung erforderlich

### Haftungsausschluss
- **Disclaimer-Modal** beim ersten Besuch (muss best\u00e4tigt werden)
- **Footer**: Permanenter Hinweis auf jeder Seite
- Kein Service des BfArM, keine Gew\u00e4hr f\u00fcr Vollst\u00e4ndigkeit/Richtigkeit
- Konsultation einer Fachperson empfohlen

## Krankenkassen-Verzeichnis

87 gesetzliche (GKV) und 34 private Krankenversicherungen (PKV) mit **Institutionskennzeichen (IK)** (9-stellig). Zus\u00e4tzlich: Selbstzahler/in.

Suchbar per Freitext-Autocomplete und Spracheingabe. Bei Mehrdeutigkeit (z.B. "BKK") werden passende Optionen zur Auswahl angezeigt.

## API-Einbindung (serverless)

F\u00fcr die Einbindung in ein Formular auf einer anderen Website:

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
| `init(onProgress?)` | L\u00e4dt sql.js + Datenbank |
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
\u251c\u2500\u2500 data/                      # DSV-Quelldaten (14-t\u00e4gig aktualisiert)
\u2502   \u2514\u2500\u2500 20260401-REFERENCE/
\u2502
\u251c\u2500\u2500 db/                        # Generierte SQLite-Datenbank
\u2502   \u2514\u2500\u2500 bfarm.db
\u2502
\u251c\u2500\u2500 docs/                      # Dokumentation
\u2502   \u2514\u2500\u2500 BfArM-Technische-Dokumentation.pdf
\u2502
\u251c\u2500\u2500 src/                       # Python-Werkzeuge
\u2502   \u251c\u2500\u2500 import_bfarm.py        # DSV + Lieferengp\u00e4sse \u2192 SQLite
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
        \u251c\u2500\u2500 phonetics.js       # K\u00f6lner Phonetik, Levenshtein, Trigram
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
| `p.n` | Patient Name (Gro\u00dfbuchstaben) |
| `p.d` | Geburtsdatum (TT.MM.JJJJ) |
| `p.i` | Versichertennummer |
| `p.k` | Krankenkasse (mit IK-Nummer) |
| `r` | Empf\u00e4nger (Praxis/Apotheke) |
| `m[].z` | PZN (Pharmazentralnummer) |
| `m[].s` | BfArM Wirkstoff-ID (`rse_substance_id`) |
| `m[].q` | St\u00e4rke/Dosierung |
| `m[].n` | Arzneimittelname |
| `m[].e` | Lieferengpass-Flag (1 = Engpass, fehlt = verf\u00fcgbar) |
| `m[].a` | Alternativpr\u00e4parat bei Lieferengpass (lt. Hersteller) |

Im PDF wird der QR-Inhalt zus\u00e4tzlich als Klartext neben dem QR-Code abgedruckt.

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
  <Empf\u00e4nger>Praxis Dr. Schmidt</Empf\u00e4nger>
  <Nachricht>Folgerezept bitte</Nachricht>
  <Arzneimittel anzahl="2">
    <Medikament nr="1">
      <Name>Beloc-Zok 95 mg</Name>
      <PZN>16795349</PZN>
      <Wirkstoff>Metoprololsuccinat</Wirkstoff>
      <WirkstoffId>11953</WirkstoffId>
      <St\u00e4rke>95 mg</St\u00e4rke>
      <Darreichungsform>Retardtablette</Darreichungsform>
    </Medikament>
  </Arzneimittel>
  <Lieferengpaesse quelle="PharmNet.Bund" stand="2026-04-03T14:23:00Z" anzahl="847"/>
  <TLP klassifizierung="AMBER+STRICT">Nur f\u00fcr Fachpersonal.</TLP>
</MedikamentenListe>
```

## PDF-Aufbau (TLP:AMBER+STRICT)

- **Kopfzeile**: Amber-Hintergrund, "TLP:AMBER+STRICT" rechtsb\u00fcndig (Amber auf Schwarz, 12pt)
- **Basisdaten** auf jeder Seite: Titel, Datum, Dok.-ID, Patient, Geburtsdatum, Vers.-Nr., Versicherung, Empf\u00e4nger (leere Felder: "OHNE ANGABE")
- **Medikamenten-Tabelle**: Nr. | Arzneimittel (Umbrechen) | PZN | Wirkstoff [ID] | St\u00e4rke/Form. Tabellen-Header auf Folgeseiten.
- **QR-Code**: Links QR-Bild, rechts Klartext-Inhalt aller Medikamente
- **Vertraulichkeitshinweis**: Volle Seitenbreite, 12pt
- **Fu\u00dfzeile**: Amber-Hintergrund, Seitenzahl, TLP-Badge
- Dateiname: `TLP-AMBER-STRICT_Rezeptwunsch_<UUID>_<YYYY-MM-DD>.pdf`

## Update-Workflow (alle 14 Tage)

### Automatisiert (empfohlen)

```bash
# 1. Neue DSV-Dateien vom BfArM herunterladen
mkdir -p data/20260415-REFERENCE
# DSV-Dateien in data/20260415-REFERENCE/ ablegen

# 2. Komplettes Update (Arzneimittel-DB + Lieferengp\u00e4sse)
./src/update.sh data/20260415-REFERENCE/

# 3. Commit & Push
git add db/bfarm.db data/lieferengpass.csv data/20260415-REFERENCE/
git commit -m "Datenupdate 2026-04-15"
git push
```

Das Update-Skript (`src/update.sh`) f\u00fchrt automatisch aus:
1. Download der aktuellen Lieferengpass-CSV von PharmNet.Bund
2. Import aller DSV-Dateien + Lieferengp\u00e4sse in `db/bfarm.db`
3. Zusammenfassung mit Datenbankgr\u00f6\u00dfe

### Manuell (einzelne Schritte)

```bash
# Nur Arzneimittel-DB (ohne Lieferengp\u00e4sse)
python src/import_bfarm.py data/20260415-REFERENCE/ --no-shortage

# Nur Lieferengpass-CSV aktualisieren
curl -o data/lieferengpass.csv "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv"
python src/import_bfarm.py data/20260415-REFERENCE/
```

### Datenverzeichnisse

```
data/
\u251c\u2500\u2500 20260401-REFERENCE/         # BfArM DSV-Dateien (14-t\u00e4gig)
\u251c\u2500\u2500 20260415-REFERENCE/         # N\u00e4chstes Update
\u2514\u2500\u2500 lieferengpass.csv           # PharmNet.Bund Lieferengp\u00e4sse (bei jedem Update)
```

## Lokale Einrichtung

```bash
git clone https://codeberg.org/raimu/Referenzdaten_at_bfarm.de.git
cd Referenzdaten_at_bfarm.de
python src/import_bfarm.py data/20260401-REFERENCE/
python3 -m http.server 8080
# \u2192 http://localhost:8080/web/index.html
```

## Datenmodell

```
medicinal_product (108.055 Arzneimittel)
  \u251c\u2500\u2500 rmp_key (PK)
  \u251c\u2500\u2500 rmp_pzn (Pharmazentralnummer)
  \u251c\u2500\u2500 rmp_mpd_name (Bezeichnung)
  \u2514\u2500\u2500 rmp_pfm_* (Darreichungsform)
        \u2502
        \u25bc  1:N
pharmaceutical_product (111.475)
  \u251c\u2500\u2500 rpp_key (PK)
  \u251c\u2500\u2500 rmp_key (FK \u2192 medicinal_product)
  \u2514\u2500\u2500 rpp_pfm_* (Darreichungsform Teilprodukt)
        \u2502
        \u25bc  1:N
substance (4.383 Wirkstoffe)
  \u251c\u2500\u2500 rse_key (PK)
  \u251c\u2500\u2500 rpp_key (FK \u2192 pharmaceutical_product)
  \u251c\u2500\u2500 rse_substance_name (Wirkstoffname)
  \u251c\u2500\u2500 rse_substance_id (Wirkstoff-ID, 5-stellig)
  \u2514\u2500\u2500 rse_substance_strength (St\u00e4rke)
```

## Externe Bibliotheken (alle via CDN, lazy-loaded)

| Bibliothek | Zweck | Gr\u00f6\u00dfe |
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
| PharmNet.Bund Lieferengp\u00e4sse (\u00d6ffentlichkeit) | https://www.pharmnet-bund.de/PharmNet/DE/Oeffentlichkeit/Lieferengpaesse/_node.html |
| PharmNet.Bund Portal (\u00d6ffentlichkeit) | https://www.pharmnet-bund.de/PharmNet/DE/Oeffentlichkeit/_node.html |
| GKV-Krankenkassenliste | https://www.krankenkassen.de/gesetzliche-krankenkassen/krankenkassen-liste/ |
| PKV-Versicherungsliste | https://www.krankenkassen.de/private-krankenversicherung/pkv-liste/ |
| IK-Verzeichnis | https://www.gkv-datenaustausch.de/leistungserbringer/institutionskennzeichen/ |

## Medikamentenpass (QR-Karte)

Der Medikamentenpass ist eine digitale Karte im Kreditkartenformat (85.6 \u00d7 54 mm) mit:
- Patientenname, Geburtsdatum, Versichertennummer, Krankenkasse
- Anzahl und Liste der Medikamente
- QR-Code mit allen Daten (kompaktes JSON)
- TLP:AMBER+STRICT Kennzeichnung

**Workflow:**
1. Medikamente zur Liste hinzuf\u00fcgen, Formular ausf\u00fcllen
2. "Medikamentenpass" klicken \u2192 Karte wird als Bild generiert
3. "Als Bild speichern" \u2192 PNG auf dem Ger\u00e4t
4. Beim n\u00e4chsten Besuch: Kamera/OCR \u2192 QR scannen \u2192 Liste wird wiederhergestellt

Kein Server, kein Account, keine Cloud \u2014 der Patient hat die volle Kontrolle \u00fcber seine Daten.

## PWA-Umbau (Progressive Web App)

### Warum PWA?
Die aktuelle Web-App l\u00f6scht alle Daten bei Tab-Close (sessionStorage). Als installierte PWA k\u00f6nnte sie:
- Verschl\u00fcsselten Speicher dauerhaft nutzen (IndexedDB + AES-256-GCM)
- Offline funktionieren (Service Worker cached DB + Assets)
- Wie eine native App installiert werden (Homescreen-Icon)
- Push-Benachrichtigungen f\u00fcr Daten-Updates senden

### Was ist zu tun?

| Schritt | Datei | Beschreibung |
|---------|-------|-------------|
| 1. Manifest | `web/manifest.json` | App-Name, Icons, Theme-Color, Display: standalone |
| 2. Service Worker | `web/sw.js` | Cache-Strategie: DB + Assets precachen, Lieferengp\u00e4sse network-first |
| 3. Icons | `web/icons/` | 192x192 + 512x512 PNG (Maskable + Any) |
| 4. HTTPS | Codeberg Pages | Bereits HTTPS \u2014 Voraussetzung f\u00fcr Service Worker |
| 5. Install-Prompt | `web/js/ui.js` | "Als App installieren" Button, `beforeinstallprompt` Event |
| 6. Speicher-Migration | `web/js/medlist.js` | sessionStorage \u2192 IndexedDB (verschl\u00fcsselt) wenn PWA installiert |
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
Lieferengp\u00e4sse CSV:     Network-First (Fallback: letzter Cache)
Externe CDNs:           Cache-First (versioniert)
```

### Sicherheit bei PWA

- Favoriten/Medikamentenliste in **IndexedDB** statt sessionStorage
- Weiterhin **AES-256-GCM** verschl\u00fcsselt (Session-Key oder Nutzer-PIN)
- **Inaktivit\u00e4ts-Timer** bleibt aktiv (5 Min \u2192 Speicher sperren, nicht l\u00f6schen)
- **PIN/Biometrie** zum Entsperren nach Inaktivit\u00e4t
- "Alle Daten l\u00f6schen" Button l\u00f6scht IndexedDB + Cache + deinstalliert Service Worker

## Roadmap

| Nr. | Feature | Status |
|-----|---------|--------|
| 1 | ~~Wechselwirkungen / Interaktionen~~ | Offen (keine freie Datenquelle, ABDA kostenpflichtig) |
| 2 | ~~Lieferengp\u00e4sse + Generika-Vorschl\u00e4ge~~ | **Umgesetzt** \u2014 PharmNet.Bund CSV + Generika per Wirkstoff-ID |
| 3 | Beipackzettel-Links (pharmnet-bund.de) | Offen |
| 4 | Dosierungshinweise (Morgens/Mittags/Abends pro Medikament) | Offen |
| 5 | Medikationsplan nach BMP-Standard (Bundesmedikationsplan) | Offen |
| 6 | Mehrsprachigkeit (EN/TR/RU/AR) | Offen |
| 7 | Offline-Modus (Service Worker) | Offen |
| 8 | ~~Generika-Vorschl\u00e4ge (gleicher Wirkstoff)~~ | **Umgesetzt** \u2014 Button "Generika anzeigen" pro Medikament |
| 9 | Dark/Light-Mode Toggle | Offen (aktuell nur Dark) |
| 10 | Druckansicht (Browser-Print optimiert) | Offen |
| 11 | ~~Favoritenliste~~ | **Gel\u00f6st** via QR-Medikamentenpass (scannen bei n\u00e4chstem Besuch) |
| 12 | PWA-Umbau (Progressive Web App) | Dokumentiert, Umsetzung offen |
| 13 | ~~QR-Medikamentenpass (Kreditkartenformat)~~ | **Umgesetzt** |

## Credits

- [BfArM](https://www.bfarm.de) f\u00fcr die offizielle Bereitstellung der Referenzdaten
- [krankenkassen.de](https://www.krankenkassen.de) f\u00fcr GKV- und PKV-Verzeichnisse
- Claude Code f\u00fcr Refactoring, Normalisierung, Kommentierung und Dokumentierung
- [Nierenzentrum in Berlin](https://www.Nierenzentrum-in-Berlin.de) und Herrn Dr. Dietz f\u00fcr die Idee

## Lizenz

Die Daten stammen vom [BfArM](https://www.bfarm.de) und unterliegen der
[Datenlizenz Deutschland \u2013 Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0).

Dieses Repository (Skripte und Konfiguration) steht unter der MIT-Lizenz.
