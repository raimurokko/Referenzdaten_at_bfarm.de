/*  BfArM Referenzdaten — Kamera / OCR / Barcode  */

var BfarmCamera = (function () {
    'use strict';

    var videoStream = null;
    var tesseractWorker = null;
    var html5QrScanner = null;

    function isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    // ─── OCR via Tesseract.js ───────────────────────────

    function loadTesseract() {
        return new Promise(function (resolve, reject) {
            if (window.Tesseract) return resolve(window.Tesseract);
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
            script.onload = function () { resolve(window.Tesseract); };
            script.onerror = function () { reject(new Error('Tesseract.js konnte nicht geladen werden')); };
            document.head.appendChild(script);
        });
    }

    function recognizeText(imageSource, onProgress) {
        return loadTesseract().then(function (Tesseract) {
            return Tesseract.recognize(imageSource, 'deu', {
                logger: function (m) {
                    if (onProgress && m.status === 'recognizing text') {
                        onProgress(Math.round(m.progress * 100));
                    }
                }
            });
        }).then(function (result) {
            return result.data.text;
        });
    }

    // ─── Parse OCR text for medication info ─────────────

    function parseMedicationText(text) {
        var results = [];
        var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

        // PZN pattern: PZN followed by 7-8 digits, or standalone 7-8 digit number
        var pznPattern = /(?:PZN[:\s-]*)?(\d{7,8})/gi;
        var pznMatches = text.match(pznPattern) || [];
        pznMatches.forEach(function (m) {
            var digits = m.replace(/\D/g, '');
            if (digits.length >= 7 && digits.length <= 8) {
                results.push({ type: 'pzn', value: digits.padStart(8, '0'), raw: m });
            }
        });

        // Dosage patterns: number + mg/ml/g/IE etc.
        var dosePattern = /(\d+(?:[.,]\d+)?)\s*(mg|g|ml|IE|µg|mcg|mmol)/gi;
        var doseMatches = text.match(dosePattern) || [];

        // Return text lines as potential medication names (for fuzzy lookup)
        lines.forEach(function (line) {
            if (line.length >= 4 && line.length <= 80 && !/^\d+$/.test(line)) {
                results.push({ type: 'text', value: line, raw: line });
            }
        });

        return results;
    }

    // ─── Barcode Scanner (html5-qrcode) ─────────────────

    function loadQRScanner() {
        return new Promise(function (resolve, reject) {
            if (window.Html5Qrcode) return resolve(window.Html5Qrcode);
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
            script.onload = function () { resolve(window.Html5Qrcode); };
            script.onerror = function () { reject(new Error('Barcode-Scanner konnte nicht geladen werden')); };
            document.head.appendChild(script);
        });
    }

    function startBarcodeScanner(elementId, onDetected) {
        return loadQRScanner().then(function (Html5Qrcode) {
            html5QrScanner = new Html5Qrcode(elementId);
            // Versuche zuerst Rueckkamera, dann Frontkamera
            return html5QrScanner.start(
                { facingMode: 'environment' },
                {
                    fps: 15,
                    qrbox: function (viewfinderWidth, viewfinderHeight) {
                        return { width: Math.min(300, viewfinderWidth * 0.8), height: Math.min(120, viewfinderHeight * 0.4) };
                    },
                    formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // Alle Formate
                },
                function (decodedText) {
                    var digits = decodedText.replace(/\D/g, '');
                    if (onDetected) onDetected(digits, decodedText);
                },
                function () {} // Ignore scan failures
            ).catch(function () {
                // Fallback: versuche ohne facingMode (Desktop-Webcam)
                return html5QrScanner.start(
                    { facingMode: 'user' },
                    { fps: 15, qrbox: { width: 300, height: 120 } },
                    function (decodedText) {
                        var digits = decodedText.replace(/\D/g, '');
                        if (onDetected) onDetected(digits, decodedText);
                    },
                    function () {}
                );
            });
        });
    }

    function stopBarcodeScanner() {
        if (html5QrScanner) {
            return html5QrScanner.stop().then(function () {
                html5QrScanner.clear();
                html5QrScanner = null;
            });
        }
        return Promise.resolve();
    }

    // ─── Camera stream ──────────────────────────────────

    function startCamera(videoEl) {
        return navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        }).then(function (stream) {
            videoStream = stream;
            videoEl.srcObject = stream;
            return videoEl.play();
        });
    }

    function captureFrame(videoEl) {
        var canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        canvas.getContext('2d').drawImage(videoEl, 0, 0);
        return canvas;
    }

    function clearImageData(canvas) {
        if (canvas && canvas.getContext) {
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
        }
    }

    // a) Bildvorverarbeitung: Schwarzweiss + Kontrast fuer bessere OCR
    function preprocessImage(source) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // Grayscale + Kontrast erhoehen
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var data = imageData.data;
                for (var i = 0; i < data.length; i += 4) {
                    // Grayscale
                    var gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    // Kontrast + Schwellwert (Binarisierung)
                    gray = gray > 140 ? 255 : 0;
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas);
            };
            img.onerror = function () { resolve(source); }; // Fallback: Original
            if (source instanceof HTMLCanvasElement) {
                img.src = source.toDataURL();
            } else if (source instanceof File || source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else {
                resolve(source); // Unknown type, pass through
            }
        });
    }

    function recognizeTextPreprocessed(imageSource, onProgress) {
        return preprocessImage(imageSource).then(function (processed) {
            return recognizeText(processed, onProgress);
        });
    }

    function stopCamera() {
        if (videoStream) {
            videoStream.getTracks().forEach(function (t) { t.stop(); });
            videoStream = null;
        }
    }

    return {
        isSupported: isSupported,
        recognizeText: recognizeText,
        recognizeTextPreprocessed: recognizeTextPreprocessed,
        preprocessImage: preprocessImage,
        parseMedicationText: parseMedicationText,
        clearImageData: clearImageData,
        startBarcodeScanner: startBarcodeScanner,
        stopBarcodeScanner: stopBarcodeScanner,
        startCamera: startCamera,
        captureFrame: captureFrame,
        stopCamera: stopCamera
    };
})();
