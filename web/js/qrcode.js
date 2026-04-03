/*
 * BfArM Referenzdaten — QR-Code Generator
 *
 * Kompaktes JSON-Format im QR:
 * {"v":1,"p":{"n":"NAME","d":"DOB","i":"VERSNR","k":"KK"},"r":"EMPF","m":[{"z":"PZN","s":"SUBID","q":"STAERKE"}]}
 *
 * Lib: qrcode-generator via CDN
 */

var BfarmQR = (function () {
    'use strict';

    var _lib = null;

    function loadLib() {
        if (_lib) return Promise.resolve(_lib);
        return new Promise(function (resolve, reject) {
            if (window.qrcode && typeof window.qrcode === 'function') {
                _lib = window.qrcode;
                return resolve(_lib);
            }
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
            script.onload = function () {
                _lib = window.qrcode;
                if (_lib) resolve(_lib);
                else reject(new Error('qrcode-generator nicht verfuegbar'));
            };
            script.onerror = function () { reject(new Error('QR-Code Bibliothek konnte nicht geladen werden')); };
            document.head.appendChild(script);
        });
    }

    // ─── Kompaktes JSON-Format ──────────────────────────

    function buildCompactJSON(formData, list) {
        var data = {
            v: 1,
            t: new Date().toISOString()
        };
        var p = {};
        if (formData.name) p.n = formData.name;
        if (formData.dob) p.d = formData.dob;
        if (formData.insuredNr) p.i = formData.insuredNr;
        if (formData.insurance) p.k = formData.insurance;
        if (Object.keys(p).length) data.p = p;
        if (formData.recipient) data.r = formData.recipient;
        if (formData.note) data.x = formData.note;

        data.m = list.map(function (m) {
            var entry = {};
            if (m.pzn) entry.z = m.pzn;
            if (m.substanceId) entry.s = m.substanceId;
            if (m.strength) entry.q = m.strength;
            if (m.name) entry.n = m.name;
            // Lieferengpass-Status
            if (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && m.pzn) {
                var si = BfarmShortage.checkPZN(m.pzn);
                if (si) {
                    entry.e = 1; // engpass=true
                    if (si.alternativ) entry.a = si.alternativ;
                }
            }
            return entry;
        });

        return JSON.stringify(data);
    }

    // ─── QR als Canvas ──────────────────────────────────

    function generateCanvas(formData, list, size) {
        size = size || 300;
        var json = buildCompactJSON(formData, list);
        var byteLen = new TextEncoder().encode(json).length;

        return loadLib().then(function (qrcode) {
            // Auto-select type based on data size
            var typeNumber = 0; // auto
            var errorLevel = byteLen > 1400 ? 'L' : byteLen > 800 ? 'M' : 'Q';
            var qr = qrcode(typeNumber, errorLevel);
            qr.addData(json);
            qr.make();

            var moduleCount = qr.getModuleCount();
            var cellSize = Math.max(1, Math.floor(size / moduleCount));
            var totalSize = cellSize * moduleCount;

            var canvas = document.createElement('canvas');
            canvas.width = totalSize;
            canvas.height = totalSize;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, totalSize, totalSize);
            ctx.fillStyle = '#000000';

            for (var row = 0; row < moduleCount; row++) {
                for (var col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                    }
                }
            }

            return { canvas: canvas, byteLength: byteLen, json: json };
        });
    }

    // ─── QR als Data-URL ────────────────────────────────

    function generateDataURL(formData, list, size) {
        return generateCanvas(formData, list, size).then(function (result) {
            result.dataURL = result.canvas.toDataURL('image/png');
            return result;
        });
    }

    // ─── Download als PNG ───────────────────────────────

    function downloadPNG(formData, list) {
        return generateCanvas(formData, list, 600).then(function (result) {
            var url = result.canvas.toDataURL('image/png');
            var a = document.createElement('a');
            a.href = url;
            a.download = 'rezeptwunsch_qr.png';
            a.click();
        });
    }

    return {
        loadLib: loadLib,
        buildCompactJSON: buildCompactJSON,
        generateCanvas: generateCanvas,
        generateDataURL: generateDataURL,
        downloadPNG: downloadPNG
    };
})();
