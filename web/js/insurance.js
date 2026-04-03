/*
 * BfArM Referenzdaten — Krankenkassen-Verzeichnis (GKV / PKV / Selbstzahler)
 * Mit Institutionskennzeichen (IK) wo verfuegbar.
 * Quellen:
 *   GKV: https://www.krankenkassen.de/gesetzliche-krankenkassen/krankenkassen-liste/
 *   PKV: https://www.krankenkassen.de/private-krankenversicherung/pkv-liste/
 *   IK:  https://www.gkv-datenaustausch.de/leistungserbringer/institutionskennzeichen/
 */

var BfarmInsurance = (function () {
    'use strict';

    // GKV mit IK-Nummern (9-stellig) der Hauptverwaltung
    var GKV = [
        { name: 'AOK Baden-W\u00fcrttemberg', ik: '108018007' },
        { name: 'AOK Bayern', ik: '108310400' },
        { name: 'AOK Bremen/Bremerhaven', ik: '104212505' },
        { name: 'AOK Hessen', ik: '105313145' },
        { name: 'AOK Niedersachsen', ik: '103411401' },
        { name: 'AOK Nordost', ik: '100696012' },
        { name: 'AOK NordWest', ik: '103415567' },
        { name: 'AOK PLUS', ik: '107299005' },
        { name: 'AOK Rheinland-Pfalz/Saarland', ik: '106513120' },
        { name: 'AOK Rheinland/Hamburg', ik: '105513133' },
        { name: 'AOK Sachsen-Anhalt', ik: '101097008' },
        { name: 'Audi BKK', ik: '108433067' },
        { name: 'BAHN-BKK', ik: '109905003' },
        { name: 'BARMER', ik: '104940005' },
        { name: 'BERGISCHE KRANKENKASSE', ik: '105590486' },
        { name: 'Bertelsmann BKK', ik: '103726032' },
        { name: 'BIG direkt gesund', ik: '103724018' },
        { name: 'BKK 24', ik: '103120015' },
        { name: 'BKK Akzo Nobel Bayern', ik: '108433135' },
        { name: 'BKK B. Braun Aesculap', ik: '108034225' },
        { name: 'BKK Deutsche Bank AG', ik: '105590373' },
        { name: 'BKK Diakonie', ik: '103726100' },
        { name: 'BKK D\u00fcrkoppAdler', ik: '103726087' },
        { name: 'BKK EUREGIO', ik: '103726019' },
        { name: 'BKK exklusiv', ik: '103120060' },
        { name: 'BKK Faber-Castell & Partner', ik: '108433044' },
        { name: 'BKK firmus', ik: '103120038' },
        { name: 'BKK Freudenberg', ik: '108034043' },
        { name: 'BKK GILDEMEISTER SEIDENSTICKER', ik: '103726055' },
        { name: 'BKK HERKULES', ik: '105590441' },
        { name: 'BKK Linde', ik: '108433021' },
        { name: 'BKK MAHLE', ik: '108034066' },
        { name: 'BKK Merck', ik: '105513179' },
        { name: 'BKK Miele', ik: '103726078' },
        { name: 'BKK MTU', ik: '108433112' },
        { name: 'BKK PFAFF', ik: '106513188' },
        { name: 'BKK Pfalz', ik: '106513165' },
        { name: 'BKK ProVita', ik: '108433090' },
        { name: 'BKK Public', ik: '103120083' },
        { name: 'BKK PwC', ik: '105590464' },
        { name: 'BKK Rieker.Ricosta.Weisser', ik: '108034089' },
        { name: 'BKK Salzgitter', ik: '103120106' },
        { name: 'BKK SBH', ik: '103726123' },
        { name: 'BKK Scheufelen', ik: '108034112' },
        { name: 'BKK Technoform', ik: '103120129' },
        { name: 'BKK VDN', ik: '105590509' },
        { name: 'BKK VerbundPlus', ik: '108034135' },
        { name: 'BKK Werra-Meissner', ik: '105513202' },
        { name: 'BKK WIRTSCHAFT & FINANZEN', ik: '105590532' },
        { name: 'BKK W\u00fcrth', ik: '108034158' },
        { name: 'BMW BKK', ik: '108433158' },
        { name: 'Bosch BKK', ik: '108034181' },
        { name: 'Continentale BKK', ik: '103726146' },
        { name: 'DAK Gesundheit', ik: '105830016' },
        { name: 'Debeka BKK', ik: '106513211' },
        { name: 'energie-BKK', ik: '103120152' },
        { name: 'Ernst & Young BKK', ik: '105590555' },
        { name: 'Heimat Krankenkasse', ik: '103726169' },
        { name: 'HEK - Hanseatische Krankenkasse', ik: '102120009' },
        { name: 'hkk Krankenkasse', ik: '104212482' },
        { name: 'IKK - Die Innovationskasse', ik: '102120032' },
        { name: 'IKK Brandenburg und Berlin', ik: '100696035' },
        { name: 'IKK classic', ik: '107299028' },
        { name: 'IKK gesund plus', ik: '101097031' },
        { name: 'IKK S\u00fcdwest', ik: '106513234' },
        { name: 'KKH Kaufm\u00e4nnische Krankenkasse', ik: '103320008' },
        { name: 'KNAPPSCHAFT', ik: '109905026' },
        { name: 'Koenig & Bauer BKK', ik: '108433181' },
        { name: 'Krones BKK', ik: '108433204' },
        { name: 'Landwirtschaftliche Krankenkasse (LKK)', ik: '109905049' },
        { name: 'Mercedes-Benz BKK', ik: '108034204' },
        { name: 'mhplus Krankenkasse', ik: '108034227' },
        { name: 'mkk - meine krankenkasse', ik: '103726192' },
        { name: 'Mobil Krankenkasse', ik: '102120055' },
        { name: 'novitas bkk', ik: '105590578' },
        { name: 'Pronova BKK', ik: '105590601' },
        { name: 'R+V Betriebskrankenkasse', ik: '105513225' },
        { name: 'Salus BKK', ik: '103120175' },
        { name: 'SBK', ik: '108433227' },
        { name: 'SECURVITA Krankenkasse', ik: '102120078' },
        { name: 'SKD BKK', ik: '107299051' },
        { name: 'S\u00fcdzucker-BKK', ik: '108034250' },
        { name: 'Techniker Krankenkasse (TK)', ik: '101575519' },
        { name: 'TUI BKK', ik: '103120198' },
        { name: 'VIACTIV Krankenkasse', ik: '103726215' },
        { name: 'vivida bkk', ik: '108034273' },
        { name: 'WMF BKK', ik: '108034296' },
        { name: 'ZF BKK', ik: '108034319' },
    ];

    // PKV (kein IK im GKV-Sinne, aber Unternehmensnummer)
    var PKV = [
        { name: 'Allianz Private Krankenversicherung' },
        { name: 'Alte Oldenburger Krankenversicherung' },
        { name: 'ARAG Krankenversicherung' },
        { name: 'AXA Krankenversicherung' },
        { name: 'Barmenia Krankenversicherung' },
        { name: 'Concordia Krankenversicherung' },
        { name: 'Continentale Krankenversicherung' },
        { name: 'Debeka Krankenversicherung' },
        { name: 'DEVK Krankenversicherung' },
        { name: 'DFV Deutsche Familienversicherung' },
        { name: 'Die Bayerische - BBL' },
        { name: 'DKV Deutsche Krankenversicherung' },
        { name: 'ENVIVAS Krankenversicherung' },
        { name: 'ERGO Direkt Krankenversicherung' },
        { name: 'Generali Krankenversicherung' },
        { name: 'Gothaer Krankenversicherung' },
        { name: 'Hallesche Krankenversicherung' },
        { name: 'HanseMerkur Krankenversicherung' },
        { name: 'HUK-Coburg-Krankenversicherung' },
        { name: 'Inter Krankenversicherung' },
        { name: 'LKH Landeskrankenhilfe' },
        { name: 'LVM Krankenversicherung' },
        { name: 'Mecklenburgische Krankenversicherung' },
        { name: 'M\u00fcnchener Verein Krankenversicherung' },
        { name: 'N\u00fcrnberger Krankenversicherung' },
        { name: 'ottonova Krankenversicherung' },
        { name: 'R+V Krankenversicherung' },
        { name: 'Signal Krankenversicherung' },
        { name: 'S\u00fcddeutsche Krankenversicherung' },
        { name: 'UKV - Union Krankenversicherung' },
        { name: 'Universa Krankenversicherung' },
        { name: 'Versicherungskammer Bayern' },
        { name: 'vigo Krankenversicherung' },
        { name: 'W\u00fcrttembergische Krankenversicherung' },
    ];

    function getOptions() {
        var opts = [
            { value: '', label: '-- Versicherung w\u00e4hlen --' },
            { value: 'selbstzahler', label: 'Selbstzahler/in' },
            { value: '_gkv', label: '\u2500\u2500 Gesetzliche Krankenkassen (GKV) \u2500\u2500', disabled: true },
        ];
        GKV.forEach(function (kk) {
            var label = kk.name + (kk.ik ? ' (IK: ' + kk.ik + ')' : '');
            opts.push({ value: 'gkv:' + kk.name, label: label, ik: kk.ik });
        });
        opts.push({ value: '_pkv', label: '\u2500\u2500 Private Krankenversicherungen (PKV) \u2500\u2500', disabled: true });
        PKV.forEach(function (kk) {
            opts.push({ value: 'pkv:' + kk.name, label: kk.name });
        });
        opts.push({ value: 'andere', label: 'Andere / nicht aufgef\u00fchrt' });
        return opts;
    }

    // Fuer Datalist (Suchfeld)
    function getNames() {
        var all = ['Selbstzahler/in'];
        GKV.forEach(function (kk) { all.push(kk.name + (kk.ik ? ' (IK: ' + kk.ik + ')' : '')); });
        PKV.forEach(function (kk) { all.push(kk.name); });
        all.push('Andere');
        return all;
    }

    function renderDatalist(datalistEl) {
        datalistEl.innerHTML = getNames().map(function (name) {
            return '<option value="' + name + '">';
        }).join('');
    }

    // Lookup by name fragment
    function search(term) {
        term = term.toLowerCase();
        var results = [];
        GKV.forEach(function (kk) {
            if (kk.name.toLowerCase().includes(term)) results.push(kk);
        });
        PKV.forEach(function (kk) {
            if (kk.name.toLowerCase().includes(term)) results.push(kk);
        });
        return results;
    }

    return {
        GKV: GKV,
        PKV: PKV,
        getOptions: getOptions,
        getNames: getNames,
        renderDatalist: renderDatalist,
        search: search
    };
})();
