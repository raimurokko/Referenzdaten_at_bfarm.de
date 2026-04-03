/*  BfArM Referenzdaten — Spracheingabe (Web Speech API)  */

var BfarmVoice = (function () {
    'use strict';

    var recognition = null;
    var isListening = false;
    var button = null;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    function isSupported() {
        return !!SpeechRecognition;
    }

    function init(inputEl, onResult) {
        if (!isSupported()) return null;

        recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = function (event) {
            var transcript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    inputEl.value = transcript;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    if (onResult) onResult(transcript);
                    stop();
                    return;
                }
            }
            inputEl.value = transcript;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            // Ensure clear button visibility
            var clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn && transcript) clearBtn.style.display = '';
        };

        recognition.onerror = function (event) {
            console.warn('Speech error:', event.error);
            stop();
        };

        recognition.onend = function () {
            stop();
        };

        return recognition;
    }

    function start() {
        if (!recognition || isListening) return;
        try {
            recognition.start();
            isListening = true;
            if (button) button.classList.add('voice-active');
        } catch (e) {
            console.warn('Speech start failed:', e);
        }
    }

    function stop() {
        if (!recognition) return;
        try { recognition.stop(); } catch (e) { /* ignore */ }
        isListening = false;
        if (button) button.classList.remove('voice-active');
    }

    function toggle() {
        if (isListening) stop(); else start();
    }

    function setButton(btn) {
        button = btn;
    }

    return {
        isSupported: isSupported,
        init: init,
        start: start,
        stop: stop,
        toggle: toggle,
        setButton: setButton
    };
})();
