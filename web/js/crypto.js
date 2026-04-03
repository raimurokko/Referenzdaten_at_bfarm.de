/*
 * BfArM Referenzdaten — Post-Quanten-Verschluesselung
 *
 * Hybrid-Verschluesselung nach BSI-Empfehlung:
 *   ML-KEM-768 (CRYSTALS-Kyber) fuer Schluesselaustausch
 *   + AES-256-GCM fuer symmetrische Verschluesselung
 *
 * Workflow:
 *   1. Empfaenger-Schluesselpar wird generiert (einmalig)
 *   2. Sender kapselt einen gemeinsamen Schluessel (encapsulate)
 *   3. Inhalt wird mit AES-256-GCM verschluesselt
 *   4. Ciphertext + Kapsel werden uebermittelt
 *   5. Empfaenger dekapsuliert und entschluesselt
 *
 * Fuer den Patienten-Use-Case:
 *   - Passwortbasiert: Schluessel wird aus Passwort abgeleitet (PBKDF2 + AES-256-GCM)
 *   - PQ-Modus: ML-KEM-768 Keypair, Public Key wird geteilt
 */

var BfarmCrypto = (function () {
    'use strict';

    var _kyberLoaded = false;
    var _kyberModule = null;

    // ─── Kyber/ML-KEM laden (WASM) ──────────────────────

    function loadKyber() {
        if (_kyberModule) return Promise.resolve(_kyberModule);
        return new Promise(function (resolve, reject) {
            // Try crystals-kyber WASM package
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/crystals-kyber@5/dist/kyber.min.js';
            script.onload = function () {
                if (window.kyber768) {
                    _kyberModule = window.kyber768;
                    _kyberLoaded = true;
                    resolve(_kyberModule);
                } else {
                    reject(new Error('Kyber-Modul nicht verfuegbar'));
                }
            };
            script.onerror = function () {
                reject(new Error('Kyber WASM konnte nicht geladen werden'));
            };
            document.head.appendChild(script);
        });
    }

    function isKyberAvailable() {
        return _kyberLoaded;
    }

    // ─── AES-256-GCM (Web Crypto API) ──────────────────

    function deriveKeyFromPassword(password, salt) {
        var enc = new TextEncoder();
        return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
            .then(function (baseKey) {
                return crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' },
                    baseKey,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
            });
    }

    function aesEncrypt(key, plaintext) {
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var data = new TextEncoder().encode(plaintext);
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data)
            .then(function (ct) {
                return { iv: iv, ciphertext: new Uint8Array(ct) };
            });
    }

    function aesDecrypt(key, iv, ciphertext) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext)
            .then(function (pt) {
                return new TextDecoder().decode(pt);
            });
    }

    // ─── Passwort-basierte Verschluesselung ─────────────
    // (Immer verfuegbar, kein Kyber noetig)

    function encryptWithPassword(plaintext, password) {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        return deriveKeyFromPassword(password, salt)
            .then(function (key) {
                return aesEncrypt(key, plaintext);
            })
            .then(function (result) {
                // Pack: salt(16) + iv(12) + ciphertext
                var packed = new Uint8Array(16 + 12 + result.ciphertext.length);
                packed.set(salt, 0);
                packed.set(result.iv, 16);
                packed.set(result.ciphertext, 28);
                return packed;
            });
    }

    function decryptWithPassword(packed, password) {
        var salt = packed.slice(0, 16);
        var iv = packed.slice(16, 28);
        var ct = packed.slice(28);
        return deriveKeyFromPassword(password, salt)
            .then(function (key) {
                return aesDecrypt(key, iv, ct);
            });
    }

    // ─── PQ Hybrid: ML-KEM-768 + AES-256-GCM ───────────

    function generateKeyPair() {
        return loadKyber().then(function (kyber) {
            var keys = kyber.keypair();
            return {
                publicKey: keys.publicKey,
                secretKey: keys.secretKey
            };
        });
    }

    function encryptWithPublicKey(plaintext, publicKey) {
        return loadKyber().then(function (kyber) {
            // ML-KEM encapsulate: get shared secret + ciphertext
            var encap = kyber.encapsulate(publicKey);
            var sharedSecret = encap.sharedSecret; // 32 bytes
            var kyberCiphertext = encap.ciphertext;

            // Use shared secret as AES key
            return crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, ['encrypt'])
                .then(function (aesKey) {
                    return aesEncrypt(aesKey, plaintext);
                })
                .then(function (aesResult) {
                    // Pack: kyberCiphertext + iv(12) + aesCiphertext
                    var kyberLen = kyberCiphertext.length;
                    var packed = new Uint8Array(4 + kyberLen + 12 + aesResult.ciphertext.length);
                    // First 4 bytes: kyber ciphertext length (big-endian)
                    packed[0] = (kyberLen >> 24) & 0xff;
                    packed[1] = (kyberLen >> 16) & 0xff;
                    packed[2] = (kyberLen >> 8) & 0xff;
                    packed[3] = kyberLen & 0xff;
                    packed.set(kyberCiphertext, 4);
                    packed.set(aesResult.iv, 4 + kyberLen);
                    packed.set(aesResult.ciphertext, 4 + kyberLen + 12);
                    return packed;
                });
        });
    }

    function decryptWithSecretKey(packed, secretKey) {
        return loadKyber().then(function (kyber) {
            var kyberLen = (packed[0] << 24) | (packed[1] << 16) | (packed[2] << 8) | packed[3];
            var kyberCt = packed.slice(4, 4 + kyberLen);
            var iv = packed.slice(4 + kyberLen, 4 + kyberLen + 12);
            var aesCt = packed.slice(4 + kyberLen + 12);

            // ML-KEM decapsulate
            var sharedSecret = kyber.decapsulate(kyberCt, secretKey);

            return crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, ['decrypt'])
                .then(function (aesKey) {
                    return aesDecrypt(aesKey, iv, aesCt);
                });
        });
    }

    // ─── Hilfsfunktionen ────────────────────────────────

    function toBase64(uint8arr) {
        return btoa(String.fromCharCode.apply(null, uint8arr));
    }

    function fromBase64(b64) {
        return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    }

    function toHex(uint8arr) {
        return Array.from(uint8arr).map(function (b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    }

    // ─── Verschluesselte E-Mail erstellen ───────────────

    function createEncryptedMessage(content, password) {
        return encryptWithPassword(content, password).then(function (packed) {
            var b64 = toBase64(packed);
            return '-----BEGIN ENCRYPTED MEDICATION LIST-----\n' +
                'Algorithm: AES-256-GCM + PBKDF2-SHA256 (600000 iterations)\n' +
                'BSI-Compliance: Symmetric post-quantum resistant (AES-256)\n' +
                'Content-Type: application/x-bfarm-medlist\n\n' +
                b64.match(/.{1,76}/g).join('\n') + '\n' +
                '-----END ENCRYPTED MEDICATION LIST-----\n\n' +
                'Zum Entschluesseln: https://raimu.codeberg.page/Referenzdaten_at_bfarm.de/web/decrypt.html';
        });
    }

    function decryptMessage(armoredText, password) {
        var lines = armoredText.split('\n');
        var b64Lines = [];
        var inBody = false;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] === '') inBody = true;
            else if (lines[i].startsWith('-----END')) break;
            else if (inBody) b64Lines.push(lines[i].trim());
        }
        var packed = fromBase64(b64Lines.join(''));
        return decryptWithPassword(packed, password);
    }

    return {
        // Password-based (always available, PQ-resistant via AES-256)
        encryptWithPassword: encryptWithPassword,
        decryptWithPassword: decryptWithPassword,
        createEncryptedMessage: createEncryptedMessage,
        decryptMessage: decryptMessage,
        // ML-KEM hybrid (requires Kyber WASM)
        loadKyber: loadKyber,
        isKyberAvailable: isKyberAvailable,
        generateKeyPair: generateKeyPair,
        encryptWithPublicKey: encryptWithPublicKey,
        decryptWithSecretKey: decryptWithSecretKey,
        // Helpers
        toBase64: toBase64,
        fromBase64: fromBase64
    };
})();
