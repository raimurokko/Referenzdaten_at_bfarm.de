/*  BfArM Referenzdaten — Konfiguration  */

var BFARM_CONFIG = (function () {
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
    var isGitHubPages = location.hostname.indexOf('github.io') >= 0;
    var isCodebergPages = location.hostname.indexOf('codeberg.page') >= 0;

    var dbBase;
    if (isLocal) {
        dbBase = '/db/bfarm.db';
    } else if (isGitHubPages) {
        // Same-Origin auf GitHub Pages — kein CORS
        dbBase = '/Referenzdaten_at_bfarm.de/db/bfarm.db';
    } else if (isCodebergPages) {
        // Cross-Origin zu GitHub Pages (GitHub setzt CORS: *)
        dbBase = 'https://raimurokko.github.io/Referenzdaten_at_bfarm.de/db/bfarm.db';
    } else {
        dbBase = 'https://raimurokko.github.io/Referenzdaten_at_bfarm.de/db/bfarm.db';
    }

    return {
        DB_URL: dbBase,
        SQLJS_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3'
    };
})();
