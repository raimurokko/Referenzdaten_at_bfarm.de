/*  BfArM Referenzdaten — Konfiguration  */

var BFARM_CONFIG = {
    DB_URL: (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
        ? '/db/bfarm.db'
        : 'https://codeberg.org/raimu/Referenzdaten_at_bfarm.de/raw/branch/main/db/bfarm.db',

    SQLJS_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3',
};
