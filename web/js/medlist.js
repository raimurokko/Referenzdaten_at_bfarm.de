/*  BfArM Referenzdaten — Medikamentenliste (sessionStorage, AES-256-GCM)  */

var BfarmMedList = (function () {
    'use strict';

    var STORAGE_KEY = 'bfarm_ml';
    var STORAGE_IV = 'bfarm_ml_iv';
    var STORAGE_DK = 'bfarm_sk';
    var listeners = [];

    // ─── AES-256-GCM on sessionStorage ──────────────────
    // Session-Key wird pro Tab-Session generiert und nie persistiert.

    var _aesKey = null;

    function getSessionKey() {
        if (_aesKey) return Promise.resolve(_aesKey);
        if (!window.crypto || !window.crypto.subtle) return Promise.resolve(null);
        var raw = sessionStorage.getItem(STORAGE_DK);
        var keyBytes;
        if (raw) {
            keyBytes = Uint8Array.from(atob(raw), function (c) { return c.charCodeAt(0); });
        } else {
            keyBytes = crypto.getRandomValues(new Uint8Array(32));
            sessionStorage.setItem(STORAGE_DK, btoa(String.fromCharCode.apply(null, keyBytes)));
        }
        return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
            .then(function (key) { _aesKey = key; return key; })
            .catch(function () { return null; });
    }

    function encryptAndStore(json) {
        return getSessionKey().then(function (key) {
            if (!key) { sessionStorage.setItem(STORAGE_KEY, json); return; }
            var iv = crypto.getRandomValues(new Uint8Array(12));
            return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(json))
                .then(function (buf) {
                    sessionStorage.setItem(STORAGE_KEY, btoa(String.fromCharCode.apply(null, new Uint8Array(buf))));
                    sessionStorage.setItem(STORAGE_IV, btoa(String.fromCharCode.apply(null, iv)));
                });
        });
    }

    function decryptFromStore() {
        var ct = sessionStorage.getItem(STORAGE_KEY);
        var ivStr = sessionStorage.getItem(STORAGE_IV);
        if (!ct) return Promise.resolve(null);
        if (!ivStr) return Promise.resolve(ct); // unencrypted fallback
        return getSessionKey().then(function (key) {
            if (!key) return ct;
            var ctBuf = Uint8Array.from(atob(ct), function (c) { return c.charCodeAt(0); });
            var iv = Uint8Array.from(atob(ivStr), function (c) { return c.charCodeAt(0); });
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ctBuf)
                .then(function (buf) { return new TextDecoder().decode(buf); });
        }).catch(function () { return null; });
    }

    // ─── List Operations ────────────────────────────────

    var _cache = [];

    function getList() {
        return _cache;
    }

    function loadList() {
        decryptFromStore().then(function (json) {
            if (json) {
                try { _cache = JSON.parse(json) || []; } catch (e) { _cache = []; }
            }
        });
        return _cache;
    }

    function saveList(list) {
        _cache = list;
        encryptAndStore(JSON.stringify(list));
        notify();
    }

    // Init
    loadList();

    function add(item) {
        var list = getList();
        // Bei identischer PZN: nicht nochmal hinzufuegen
        for (var di = 0; di < list.length; di++) {
            var dup = false;
            if (item.pzn && list[di].pzn) dup = list[di].pzn === item.pzn;
            else dup = list[di].name === item.name;
            if (dup) return false; // Bereits vorhanden
        }
        list.push({
            name: item.name || '',
            pzn: item.pzn || '',
            substance: item.substance || '',
            substanceId: item.substanceId || '',
            strength: item.strength || '',
            form: item.form || '',
            quantity: item.quantity || '1',
            note: item.note || '',
            addedAt: new Date().toISOString()
        });
        saveList(list);
        return true;
    }

    function remove(index) {
        var list = getList();
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            saveList(list);
        }
    }

    function clear() {
        saveList([]);
    }

    function count() {
        return getList().length;
    }

    function onChange(fn) {
        listeners.push(fn);
    }

    function notify() {
        var list = getList();
        for (var i = 0; i < listeners.length; i++) listeners[i](list);
    }

    function toCSV() {
        var list = getList();
        if (!list.length) return '';
        var header = 'Name;PZN;Wirkstoff;Wirkstoff-ID;Staerke;Darreichungsform;Notiz';
        var rows = list.map(function (m) {
            return [m.name, m.pzn, m.substance, m.substanceId || '', m.strength, m.form, m.note]
                .map(function (v) { return '"' + (v || '').replace(/"/g, '""') + '"'; })
                .join(';');
        });
        return header + '\n' + rows.join('\n');
    }

    function toText() {
        var list = getList();
        if (!list.length) return 'Keine Medikamente auf der Liste.';
        var lines = ['Medikamentenliste (' + list.length + ' Eintraege)', ''];
        list.forEach(function (m, i) {
            lines.push((i + 1) + '. ' + m.name);
            if (m.pzn) lines.push('   PZN: ' + m.pzn);
            if (m.substance) lines.push('   Wirkstoff: ' + m.substance + (m.substanceId ? ' [ID:' + m.substanceId + ']' : '') + (m.strength ? ' ' + m.strength : ''));
            if (m.form) lines.push('   Form: ' + m.form);
            if (m.note) lines.push('   Notiz: ' + m.note);
            lines.push('');
        });
        return lines.join('\n');
    }

    function downloadCSV() {
        var csv = toCSV();
        if (!csv) return;
        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'medikamentenliste.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── PDF Export (jsPDF, passwortgeschuetzt) ─────────

    function loadJsPDF() {
        return new Promise(function (resolve, reject) {
            if (window.jspdf) return resolve(window.jspdf);
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
            script.onload = function () { resolve(window.jspdf); };
            script.onerror = function () { reject(new Error('jsPDF konnte nicht geladen werden')); };
            document.head.appendChild(script);
        });
    }

    // ─── TLP:AMBER+STRICT Banner ─────────────────────────

    var TLP_COLOR = [255, 191, 0]; // Amber/Orange
    var TLP_TEXT = 'TLP:AMBER+STRICT';

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function pdfDateString() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function drawTLPBadge(doc, x, y, align) {
        // "TLP:AMBER+STRICT" — Amber font on black background, 12pt
        var text = TLP_TEXT;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        var textWidth = doc.getTextWidth(text);
        var padX = 4, padY = 2;
        var boxX = align === 'right' ? x - textWidth - padX * 2 : x;
        // Black background
        doc.setFillColor(0, 0, 0);
        doc.rect(boxX, y - 4 - padY, textWidth + padX * 2, 6 + padY * 2, 'F');
        // Amber text
        doc.setTextColor(TLP_COLOR[0], TLP_COLOR[1], TLP_COLOR[2]);
        doc.text(text, boxX + padX, y);
        doc.setFont(undefined, 'normal');
    }

    function drawTLPHeader(doc, pageNum, totalPages) {
        // Amber background bar
        doc.setFillColor(TLP_COLOR[0], TLP_COLOR[1], TLP_COLOR[2]);
        doc.rect(0, 0, 210, 16, 'F');
        // Confidentiality text — 12pt, black on amber
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0);
        doc.text('Nur f\u00fcr Fachpersonal. Weitergabe untersagt.', 14, 10);
        // TLP badge — right-aligned, amber on black
        drawTLPBadge(doc, 196, 10, 'right');
    }

    function drawTLPFooter(doc, pageNum, totalPages) {
        // Amber background bar
        doc.setFillColor(TLP_COLOR[0], TLP_COLOR[1], TLP_COLOR[2]);
        doc.rect(0, 281, 210, 16, 'F');
        // Left: page number + disclaimer — 12pt
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0);
        doc.text('Seite ' + pageNum + '/' + totalPages, 14, 290);
        // Right: TLP badge
        drawTLPBadge(doc, 196, 290, 'right');
    }

    function buildXML(formData, list) {
        var esc = function (s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        var now = new Date();
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<MedikamentenListe xmlns="urn:bfarm-referenzdaten:medliste:v1" erstellt="' + now.toISOString() + '">\n';
        xml += '  <Patient>\n';
        xml += '    <Name>' + esc(formData.name) + '</Name>\n';
        xml += '    <Geburtsdatum>' + esc(formData.dob) + '</Geburtsdatum>\n';
        xml += '    <Versichertennummer>' + esc(formData.insuredNr) + '</Versichertennummer>\n';
        xml += '    <Versicherung>' + esc(formData.insurance) + '</Versicherung>\n';
        xml += '  </Patient>\n';
        xml += '  <Empf\u00e4nger>' + esc(formData.recipient) + '</Empf\u00e4nger>\n';
        xml += '  <Nachricht>' + esc(formData.note) + '</Nachricht>\n';
        xml += '  <Arzneimittel anzahl="' + list.length + '">\n';
        list.forEach(function (m, i) {
            xml += '    <Medikament nr="' + (i + 1) + '">\n';
            xml += '      <Name>' + esc(m.name) + '</Name>\n';
            xml += '      <PZN>' + esc(m.pzn) + '</PZN>\n';
            xml += '      <Wirkstoff>' + esc(m.substance) + '</Wirkstoff>\n';
            xml += '      <WirkstoffId>' + esc(m.substanceId || '') + '</WirkstoffId>\n';
            xml += '      <St\u00e4rke>' + esc(m.strength) + '</St\u00e4rke>\n';
            xml += '      <Darreichungsform>' + esc(m.form) + '</Darreichungsform>\n';
            xml += '      <Notiz>' + esc(m.note) + '</Notiz>\n';
            xml += '    </Medikament>\n';
        });
        xml += '  </Arzneimittel>\n';
        xml += '  <TLP klassifizierung="AMBER+STRICT">Nur f\u00fcr Fachpersonal der benannten Praxis/Apotheke.</TLP>\n';
        xml += '</MedikamentenListe>\n';
        return xml;
    }

    function downloadPDF(formData) {
        var list = getList();
        if (!list.length) return Promise.resolve();
        formData = formData || {};

        return loadJsPDF().then(function (jspdf) {
            var doc = new jspdf.jsPDF();
            var pageCount = 1;
            var MIN = 12;
            var docId = generateUUID();
            var datStr = pdfDateString();
            var now = new Date();
            var wochentage = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
            var datumStr = wochentage[now.getDay()] + ', ' + now.toLocaleDateString('de-DE') + ' ' + now.toLocaleTimeString('de-DE');

            // ─── Basisdaten (auf jeder Seite, gleiches Layout) ─
            var OHNE = 'OHNE ANGABE';

            function drawPageHeader(isFirstPage) {
                var y = 20;
                drawTLPHeader(doc, pageCount, pageCount);

                // a) Abstand zwischen Kopfzeile und Titel
                y += 4;

                doc.setFontSize(16);
                doc.setTextColor(0);
                doc.setFont(undefined, 'bold');
                doc.text('Rezeptanfrage / Medikamentenliste', 14, y);
                y += 10;

                // b) Abstand zwischen Erstellt und Patient
                doc.setFontSize(MIN);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(60);
                doc.text('Erstellt: ' + datumStr + '  |  Dok.-ID: ' + docId, 14, y);
                y += 8; // Abstand

                // d) Gleiches Layout auf allen Seiten (12pt, jedes Feld eigene Zeile)
                doc.setFontSize(MIN);
                doc.setTextColor(0);
                var fields = [
                    ['Patient/in:', formData.name],
                    ['E-Mail:', formData.email],
                    ['Telefon:', formData.phone],
                    ['Geb.-Datum:', formData.dob],
                    ['Vers.-Nr.:', formData.insuredNr],
                    ['Versicherung:', formData.insurance],
                    ['Empf\u00e4nger:', formData.recipient]
                ];
                fields.forEach(function (f) {
                    doc.setFont(undefined, 'bold');
                    doc.text(f[0], 14, y);
                    doc.setFont(undefined, 'normal');
                    // c) OHNE ANGABE bei leeren Feldern
                    var val = f[1] || OHNE;
                    if (val === OHNE) doc.setTextColor(160);
                    doc.text(val, 58, y);
                    doc.setTextColor(0);
                    y += 6;
                });
                y += 4;

                doc.setDrawColor(TLP_COLOR[0], TLP_COLOR[1], TLP_COLOR[2]);
                doc.setLineWidth(0.5);
                doc.line(14, y, 196, y);
                y += 6;
                return y;
            }

            function newPage() {
                pageCount++;
                doc.addPage();
                return drawPageHeader(false);
            }

            var y = drawPageHeader(true);

            // ─── Table header (12pt) ────────────────────
            // Spalten: Nr(14-20) | Mge(22-28) | Arzneimittel(30-94) | Wirkstoff[ID](96-148) | St\u00e4rke/Form(150-196)
            function drawTableHeader() {
                doc.setFontSize(MIN);
                doc.setTextColor(60);
                doc.setFont(undefined, 'bold');
                doc.text('Nr.', 14, y);
                doc.text('Mge', 22, y);
                doc.text('Arzneimittel', 30, y);
                doc.text('Wirkstoff [ID]', 96, y);
                doc.text('St\u00e4rke / Form', 150, y);
                y += 2;
                doc.setDrawColor(180);
                doc.setLineWidth(0.2);
                doc.line(14, y, 196, y); y += 6;
            }
            drawTableHeader();

            // ─── Rows (12pt) — 2-zeiliges Layout pro Medikament ─
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0);
            list.forEach(function (m, i) {
                if (y > 245) {
                    y = newPage();
                    drawTableHeader();
                }
                doc.setFontSize(MIN);

                // Zeile 1: Nr | Menge | Arzneimittelname | Wirkstoff [ID] | St\u00e4rke/Form
                doc.setFont(undefined, 'bold');
                doc.setTextColor(0);
                doc.text(String(i + 1) + '.', 14, y);
                doc.text(String(m.quantity || '1') + 'x', 22, y);
                var nameText = m.name || '';
                var nameLines = doc.splitTextToSize(nameText, 64);
                doc.text(nameLines, 30, y);

                doc.setFont(undefined, 'normal');
                doc.setTextColor(60);
                var subText = (m.substance || '') + (m.substanceId ? ' [' + m.substanceId + ']' : '');
                doc.text(doc.splitTextToSize(subText, 52), 96, y);
                var sfText = [m.strength, m.form].filter(Boolean).join(' / ');
                doc.text(doc.splitTextToSize(sfText, 46), 150, y);
                y += Math.max(nameLines.length, 1) * 5;

                // Zeile 2: [PZN] + Lieferengpass-Warnung (eingerueckt)
                doc.setFontSize(10);
                doc.setTextColor(100);
                var line2 = m.pzn ? '[PZN ' + m.pzn + ']' : '';
                if (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && m.pzn) {
                    var si = BfarmShortage.checkPZN(m.pzn);
                    if (si) {
                        line2 += '  \u26a0 LIEFERENGPASS: ' + (si.grund || '') + (si.ende ? ' (bis ' + si.ende + ')' : '');
                        doc.setTextColor(200, 50, 50);
                    }
                    if (si && si.klassifikation) {
                        if (si.klassifikation.indexOf('weder') >= 0) line2 += '  | FREIVERKAEUFLICH';
                        else if (si.klassifikation.indexOf('verskri') >= 0) line2 += '  | VERSCHREIBUNGSPFLICHTIG';
                        else if (si.klassifikation === 'versrel') line2 += '  | APOTHEKENPFLICHTIG';
                    }
                }
                if (line2) {
                    var line2Lines = doc.splitTextToSize(line2, 164);
                    doc.text(line2Lines, 30, y);
                    y += line2Lines.length * 4;
                }

                doc.setTextColor(0);
                y += 2;
                doc.setDrawColor(230);
                doc.setLineWidth(0.1);
                doc.line(14, y, 196, y); y += 3;
            });

            // ─── Note (12pt) ────────────────────────────
            var note = formData.note;
            if (note) {
                if (y > 252) { y = newPage(); }
                y += 4;
                doc.setDrawColor(TLP_COLOR[0], TLP_COLOR[1], TLP_COLOR[2]);
                doc.setLineWidth(0.5);
                doc.line(14, y, 196, y); y += 6;
                doc.setFontSize(MIN);
                doc.setFont(undefined, 'bold');
                doc.text('Anmerkung:', 14, y); y += 6;
                doc.setFont(undefined, 'normal');
                var noteLines = doc.splitTextToSize(note, 178);
                doc.text(noteLines, 14, y);
                y += noteLines.length * 5;
            }

            // ─── QR-Code ────────────────────────────────
            var qrPromise = Promise.resolve();
            if (typeof BfarmQR !== 'undefined') {
                qrPromise = BfarmQR.generateCanvas(formData, list, 200).then(function (qr) {
                    if (y > 180) { y = newPage(); }
                    var qrY = y + 2;

                    // QR-Code links
                    doc.addImage(qr.canvas.toDataURL('image/png'), 'PNG', 14, qrY, 40, 40);

                    // \u00dcberschrift rechts neben QR
                    doc.setFontSize(8);
                    doc.setTextColor(80);
                    doc.setFont(undefined, 'bold');
                    doc.text('QR-Code Inhalt (' + qr.byteLength + ' Bytes):', 58, qrY + 4);
                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(100);

                    // Inhaltsliste UNTER der \u00dcberschrift, strikt neben dem QR
                    var qrTextX = 58;
                    var qrTextW = 136;
                    var qrTextY = qrY + 10; // 6mm unter \u00dcberschrift
                    var maxQRLines = Math.floor(30 / 3.5); // Max Zeilen neben QR (~8, abz\u00fcgl. \u00dcberschrift)
                    var printed = 0;
                    for (var li = 0; li < list.length && printed < maxQRLines; li++) {
                        var m = list[li];
                        var qty = (m.quantity && m.quantity !== '1') ? m.quantity + 'x ' : '';
                        var line = qty + (m.name || '') + ' [' + (m.pzn || '-') + ']';
                        if (m.substanceId) line += ' | ' + (m.substance || '') + '[' + m.substanceId + ']';
                        // Kuerzen auf Spaltenbreite
                        while (doc.getTextWidth(line) > qrTextW && line.length > 15) {
                            line = line.substring(0, line.length - 4) + '..';
                        }
                        doc.text(line, qrTextX, qrTextY);
                        qrTextY += 3.5;
                        printed++;
                    }
                    if (printed < list.length) {
                        doc.text('+ ' + (list.length - printed) + ' weitere (siehe QR)', qrTextX, qrTextY);
                    }

                    y = Math.max(y, qrY + 48);
                }).catch(function () { /* QR optional */ });
            }

            return qrPromise.then(function () {

            // ─── Disclaimer (smaller, metadata) ─────────
            if (y > 252) { y = newPage(); }
            y += 6;
            // Volle Seitenbreite (Rand zu Rand)
            doc.setFillColor(240, 240, 240);
            doc.rect(0, y - 4, 210, 22, 'F');
            doc.setFontSize(12);
            doc.setTextColor(80);
            doc.setFont(undefined, 'bold');
            doc.text('VERTRAULICHKEITSHINWEIS', 14, y + 2);
            doc.setFont(undefined, 'normal');
            var disclaimerText = 'Dies ist kein Service des BfArM. Basiert auf offiziell bereitgestellten Referenzdaten. ' +
                'Keine Gew\u00e4hr f\u00fcr Vollst\u00e4ndigkeit/Richtigkeit. Konsultieren Sie immer eine Fachperson.';
            var disclaimerLines = doc.splitTextToSize(disclaimerText, 182);
            doc.text(disclaimerLines, 14, y + 8);

            // ─── Draw TLP on all pages ──────────────────
            var total = doc.internal.getNumberOfPages();
            for (var p = 1; p <= total; p++) {
                doc.setPage(p);
                drawTLPFooter(doc, p, total);
                drawTLPHeader(doc, p, total);
            }

            // ─── Properties + Save ──────────────────────
            var xmlData = buildXML(formData, list);
            doc.setProperties({
                title: 'TLP:AMBER+STRICT Rezeptanfrage ' + docId,
                subject: 'Rezeptanfrage fuer ' + (formData.name || 'unbekannt'),
                author: 'BfArM Referenzdaten Tool',
                keywords: 'TLP:AMBER+STRICT, Medikamentenliste, Rezeptanfrage, ' + docId,
                creator: 'bfarm-referenzdaten v1.0'
            });

            var filename = 'TLP-AMBER-STRICT_Rezeptwunsch_' + docId + '_' + datStr + '.pdf';
            doc.save(filename, {
                encryption: {
                    userPassword: '',
                    ownerPassword: crypto.getRandomValues(new Uint8Array(16)).join(''),
                    userPermissions: ['print']
                }
            });

            }); // end qrPromise.then
        }); // end loadJsPDF.then
    }

    return {
        getList: getList,
        add: add,
        remove: remove,
        clear: clear,
        count: count,
        onChange: onChange,
        toCSV: toCSV,
        toText: toText,
        saveListDirect: saveList,
        downloadCSV: downloadCSV,
        downloadPDF: downloadPDF,
        buildXML: buildXML
    };
})();
