/*  BfArM Referenzdaten — UI & App-Start (v2)  */

(function () {
    'use strict';

    var currentMode = 'substance';
    var currentTab = 'search';
    var searchTimeout = null;

    function h(s) {
        return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    }

    // ─── Disclaimer Modal ───────────────────────────────

    function showDisclaimerIfNeeded() {
        if (sessionStorage.getItem('bfarm_disclaimer_accepted')) return;
        var modal = document.getElementById('disclaimerModal');
        if (modal) modal.style.display = 'flex';
    }

    function acceptDisclaimer() {
        sessionStorage.setItem('bfarm_disclaimer_accepted', '1');
        var modal = document.getElementById('disclaimerModal');
        if (modal) modal.style.display = 'none';
    }

    // ─── Tabs ───────────────────────────────────────────

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.main-tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-panel').forEach(function (p) {
            p.style.display = p.id === 'panel-' + tab ? '' : 'none';
        });
        if (tab === 'stats') renderStatsPanel();
        if (tab === 'shortage') renderShortagePanel();
        if (tab === 'list') renderMedListPanel();
    }

    // ─── Mode Switching ─────────────────────────────────

    function setMode(mode) {
        currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        var input = document.getElementById('searchInput');
        var hints = {
            substance: ['Wirkstoff eingeben (auch mit Tippfehler) ...', 'Tipp: "Barazettamuhl" -> Paracetamol, "Diklofenack" -> Diclofenac'],
            medication: ['Arzneimittelname eingeben (z.B. "Paracetaml Hex") ...', 'Tipp: Mehrere Woerter moeglich, Tippfehler werden korrigiert'],
            pzn: ['PZN eingeben (z.B. 10203626) ...', 'Tipp: 7- oder 8-stellige Pharmazentralnummer']
        };
        input.placeholder = hints[mode][0];
        document.getElementById('searchHint').textContent = hints[mode][1];
        if (input.value) doSearch();
    }

    // ─── Search ─────────────────────────────────────────

    function doSearch() {
        var q = document.getElementById('searchInput').value.trim();
        if (!q || !BfarmDB.isReady()) {
            document.getElementById('emptyState').style.display = '';
            document.getElementById('resultsContainer').style.display = 'none';
            return;
        }
        var results;
        if (currentMode === 'pzn') results = BfarmSearch.searchPZN(q);
        else if (currentMode === 'medication') results = BfarmSearch.searchMedication(q);
        else results = BfarmSearch.searchSubstance(q);
        renderResults(results);
    }

    // ─── Render Results ─────────────────────────────────

    function renderResults(results) {
        var container = document.getElementById('resultsContainer');
        var empty = document.getElementById('emptyState');

        if (!results.length) {
            empty.innerHTML = '<div class="icon">&#128269;</div><p>Keine Treffer gefunden</p>';
            empty.style.display = '';
            container.style.display = 'none';
            return;
        }
        empty.style.display = 'none';
        container.style.display = '';

        var html = '<div class="results-header"><h2>Ergebnisse</h2>' +
            '<span class="results-count">' + results.length + ' Treffer</span></div>';

        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            var method = r.bestMethod || 'exakt';
            var score = r.totalScore != null ? r.totalScore : 1;
            var tag = '<span class="tag tag-' + method + '">' + method + '</span>';
            var bar = '<span class="score-bar" style="width:' + Math.round(score * 60) + 'px"></span>';
            var scoreText = '<span style="font-family:\'JetBrains Mono\';font-size:11px;color:var(--text-muted)">' + (score * 100).toFixed(0) + '%</span>';

            // Add-to-list button
            var addBtn = '<button class="add-to-list-btn" data-name="' + h(r.name) + '" data-pzn="' + h(r.pzn || '') +
                '" data-form="' + h(r.form || '') + '" title="Zur Liste hinzufuegen">+</button>';

            if (currentMode === 'pzn') {
                var subsHtml = '';
                if (r.substances && r.substances.length) {
                    subsHtml = '<div style="margin-top:8px">';
                    for (var j = 0; j < r.substances.length; j++) {
                        subsHtml += '<div class="substance-row">' +
                            '<span class="substance-name">' + h(r.substances[j].name) + '</span>' +
                            '<span class="substance-strength">' + h(r.substances[j].strength || '') + '</span></div>';
                    }
                    subsHtml += '</div>';
                }
                html += '<div class="result-card">' + addBtn + '<div class="result-name">' + h(r.name) + '</div>' +
                    '<div class="result-meta"><span class="pzn-badge">PZN ' + h(r.pzn) + '</span>' +
                    '<span class="form-badge">' + h(r.form || '') + '</span>' + tag + '</div>' + subsHtml + '</div>';

            } else if (currentMode === 'medication') {
                var shortageHtml = '';
                var generikaHtml = '';
                if (typeof BfarmShortage !== 'undefined' && r.pzn) {
                    // Lieferengpass
                    if (BfarmShortage.isLoaded()) {
                        var si = BfarmShortage.checkPZN(r.pzn);
                        if (si) {
                            shortageHtml = '<div class="shortage-warning shortage-clickable" data-pzn="' + h(r.pzn) + '">' +
                                '\u26a0 Lieferengpass' +
                                (si.grund ? ': ' + h(si.grund) : '') +
                                (si.ende ? ' (bis ' + h(si.ende) + ')' : '') +
                                (si.alternativ ? ' \u2014 Alternative: ' + h(si.alternativ) : '') +
                                '<span class="shortage-click-hint"> \u25b6 Alternativen anzeigen</span>' +
                                '</div>';
                        }
                    }
                    // Wirkstoff + Generika-Anzahl per PZN nachschlagen
                    try {
                        var subRows = BfarmDB.exec(
                            "SELECT s.rse_substance_name, s.rse_substance_id, s.rse_substance_strength FROM substance s " +
                            "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
                            "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
                            "WHERE mp.rmp_pzn = '" + (r.pzn || '').replace(/'/g,"''") + "' LIMIT 1"
                        );
                        if (subRows.length && subRows[0].values.length) {
                            var subName = subRows[0].values[0][0];
                            var subId = subRows[0].values[0][1];
                            var subStrength = subRows[0].values[0][2] || '';
                            var genCounts = BfarmShortage.countGenerika(subId, subStrength);
                            if (genCounts.exact > 1) {
                                generikaHtml = '<span class="generika-badge">' + genCounts.exact + ' Pr\u00e4parate mit ' + h(subName) + ' ' + h(subStrength) + '</span>';
                            } else if (genCounts.total > 1) {
                                generikaHtml = '<span class="generika-badge">' + genCounts.total + ' Pr\u00e4parate mit ' + h(subName) + ' (alle St\u00e4rken)</span>';
                            }
                        }
                    } catch (e) { /* ignore */ }
                }
                html += '<div class="result-card">' + addBtn + '<div class="result-name">' + h(r.name) + '</div>' +
                    '<div class="result-meta"><span class="pzn-badge">PZN ' + h(r.pzn || '') + '</span>' +
                    '<span class="form-badge">' + h(r.form || '') + '</span>' + tag + bar + scoreText +
                    generikaHtml + '</div>' +
                    shortageHtml + '</div>';

            } else {
                // Substance mode — clickable for drill-down
                html += '<div class="result-card substance-expandable" data-substance="' + h(r.name) + '">' +
                    '<div class="result-name">' + h(r.name) + ' <span class="expand-hint">&#9654; Arzneimittel anzeigen</span></div>' +
                    '<div class="result-meta"><span class="pzn-badge">ID ' + h(r.id || '') + '</span>' +
                    tag + bar + scoreText + '</div>' +
                    '<div class="substance-medications" id="sub-meds-' + i + '" style="display:none"></div></div>';
            }
        }
        container.innerHTML = html;

        // Attach drill-down listeners
        container.querySelectorAll('.substance-expandable').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.add-to-list-btn')) return;
                var name = this.dataset.substance;
                var medsDiv = this.querySelector('.substance-medications');
                if (medsDiv.style.display !== 'none') {
                    medsDiv.style.display = 'none';
                    this.querySelector('.expand-hint').innerHTML = '&#9654; Arzneimittel anzeigen';
                    return;
                }
                var meds = BfarmDB.getMedicationsForSubstance(name);
                if (!meds.length) {
                    medsDiv.innerHTML = '<div style="padding:8px;color:var(--text-muted)">Keine Arzneimittel gefunden</div>';
                } else {
                    var mhtml = '<div class="sub-meds-header">' + meds.length + ' Arzneimittel mit ' + h(name) +
                        ' <span class="generika-badge">Generika/Pr\u00e4parate mit gleichem Wirkstoff</span></div>';
                    meds.forEach(function (m) {
                        // Lieferengpass-Check pro Pr\u00e4parat
                        var sWarn = '';
                        if (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && m.pzn) {
                            var si = BfarmShortage.checkPZN(m.pzn);
                            sWarn = si ? '<span class="shortage-badge">\u26a0 Engpass</span>' : '<span class="available-badge">\u2713</span>';
                        }
                        mhtml += '<div class="sub-med-item">' +
                            '<button class="add-to-list-btn" data-name="' + h(m.name) + '" data-pzn="' + h(m.pzn || '') +
                            '" data-form="' + h(m.form || '') + '" data-substance="' + h(name) + '" data-substance-id="' + h(m.substanceId || '') +
                            '" data-strength="' + h(m.strength || '') + '" title="Zur Liste">+</button>' +
                            '<span class="sub-med-name">' + h(m.name) + '</span>' +
                            '<span class="pzn-badge">PZN ' + h(m.pzn || '') + '</span>' +
                            '<span class="form-badge">' + h(m.form || '') + '</span>' +
                            sWarn +
                            (m.strength ? '<span class="substance-strength">' + h(m.strength) + '</span>' : '') +
                            '</div>';
                    });
                    medsDiv.innerHTML = mhtml;
                }
                medsDiv.style.display = '';
                this.querySelector('.expand-hint').innerHTML = '&#9660; Zuklappen';
            });
        });

        // Add-to-list: event delegation on container (handles dynamically added buttons)
        container.addEventListener('click', function (e) {
            var btn = e.target.closest('.add-to-list-btn');
            if (!btn) return;
            e.stopPropagation();
            var item = {
                name: btn.dataset.name,
                pzn: btn.dataset.pzn,
                form: btn.dataset.form || '',
                substance: btn.dataset.substance || '',
                substanceId: btn.dataset.substanceId || '',
                strength: btn.dataset.strength || ''
            };
            // Wenn kein Wirkstoff vorhanden (z.B. Arzneimittel-Modus), per PZN nachladen
            if (!item.substance && item.pzn && BfarmDB.isReady()) {
                var rows = BfarmDB.exec(
                    "SELECT s.rse_substance_name, s.rse_substance_id, s.rse_substance_strength " +
                    "FROM medicinal_product mp " +
                    "JOIN pharmaceutical_product pp ON mp.rmp_key = pp.rmp_key " +
                    "JOIN substance s ON pp.rpp_key = s.rpp_key " +
                    "WHERE mp.rmp_pzn = '" + item.pzn.replace(/'/g, "''") + "' " +
                    "AND s.rse_substance_name IS NOT NULL AND length(s.rse_substance_name) > 2 " +
                    "ORDER BY s.rse_substance_rank LIMIT 1"
                );
                if (rows.length && rows[0].values.length) {
                    var r = rows[0].values[0];
                    item.substance = r[0] || '';
                    item.substanceId = r[1] || '';
                    if (!item.strength) item.strength = r[2] || '';
                }
            }
            BfarmMedList.add(item);
            btn.textContent = '\u2713';
            btn.classList.add('added');
        });

        // Klick auf Engpass-Warnung: Generika/Alternativen anzeigen
        container.addEventListener('click', function (e) {
            var warn = e.target.closest('.shortage-clickable');
            if (!warn) return;
            var pzn = warn.dataset.pzn;
            if (!pzn) return;
            // Expandable Generika-Liste unterhalb der Warnung
            var existing = warn.querySelector('.shortage-alternatives');
            if (existing) { existing.remove(); return; }
            // Wirkstoff-ID per PZN nachschlagen
            var subId = '';
            try {
                var sr = BfarmDB.exec("SELECT s.rse_substance_id, s.rse_substance_name FROM substance s JOIN pharmaceutical_product pp ON s.rpp_key=pp.rpp_key JOIN medicinal_product mp ON pp.rmp_key=mp.rmp_key WHERE mp.rmp_pzn='" + pzn.replace(/'/g,"''") + "' LIMIT 1");
                if (sr.length && sr[0].values.length) { subId = sr[0].values[0][0]; }
            } catch (ex) {}
            if (!subId) { return; }
            var generika = BfarmShortage.findGenerika(subId, pzn, 20);
            var altDiv = document.createElement('div');
            altDiv.className = 'shortage-alternatives';
            if (!generika.length) {
                altDiv.innerHTML = '<div style="padding:4px;font-size:12px">Keine Alternativen gefunden</div>';
            } else {
                var ghtml = '<div class="sub-meds-header" style="margin-top:8px">' + generika.length + ' Alternativen:</div>';
                generika.forEach(function (g) {
                    var sWarn = g.shortage ? '<span class="shortage-badge">\u26a0</span>' : '<span class="available-badge">\u2713</span>';
                    ghtml += '<div class="sub-med-item"><button class="add-to-list-btn" data-name="' + h(g.name) + '" data-pzn="' + h(g.pzn||'') + '" data-substance-id="' + h(subId) + '" data-strength="' + h(g.strength||'') + '" data-form="' + h(g.form||'') + '">+</button>' +
                        '<span class="sub-med-name">' + h(g.name) + '</span> <span class="pzn-badge">' + h(g.pzn||'') + '</span> ' + sWarn + '</div>';
                });
                altDiv.innerHTML = ghtml;
            }
            warn.appendChild(altDiv);
        });
    }

    // ─── Data Date ──────────────────────────────────────

    function showDataDate() {
        var info = BfarmDB.getDataDate();
        if (!info) return;
        var el = document.getElementById('dataDateInfo');
        if (!el) return;
        var now = new Date();
        var wochentage = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
        var heute = wochentage[now.getDay()] + ', ' +
            now.getDate().toString().padStart(2,'0') + '.' +
            (now.getMonth()+1).toString().padStart(2,'0') + '.' +
            now.getFullYear();
        var text = 'Heute: ' + heute + ' \u00b7 Arzneimittel-DB: ' + info.formatted;
        if (info.daysUntilUpdate > 0) {
            text += ' (Update in ' + info.daysUntilUpdate + 'T)';
        } else {
            text += ' (Update f\u00e4llig)';
        }
        el.textContent = text;
        el.style.display = '';
    }

    // ─── Stats Panel ────────────────────────────────────

    function showStats() {
        var stats = BfarmDB.getStats();
        var bar = document.getElementById('statsBar');
        bar.innerHTML = stats.map(function (s) {
            return '<div class="stat"><div class="stat-value">' + s.value + '</div>' +
                '<div class="stat-label">' + s.label + '</div></div>';
        }).join('');
        bar.style.display = 'flex';
    }

    // ─── Shortage Panel ───────────────────────────────

    var currentShortageFilter = 'alle';

    function renderShortagePanel(textFilter) {
        var el = document.getElementById('shortageContent');
        if (!el || typeof BfarmShortage === 'undefined' || !BfarmShortage.isLoaded()) {
            if (el) el.innerHTML = '<div class="empty-state"><p>Lieferengpass-Daten werden geladen...</p></div>';
            return;
        }
        var all = BfarmShortage.getAll();
        textFilter = (textFilter || '').toLowerCase();

        // Text-Filter
        var filtered = textFilter ? all.filter(function (s) {
            return (s.name + ' ' + s.wirkstoffe + ' ' + s.pzn + ' ' + s.grund + ' ' + s.atc + ' ' + s.zulassungsinhaber).toLowerCase().includes(textFilter);
        }) : all;

        // Chip-Filter
        if (currentShortageFilter === 'verskri') {
            filtered = filtered.filter(function (s) { return (s.klassifikation || '').indexOf('verskri') >= 0; });
        } else if (currentShortageFilter === 'versrel') {
            filtered = filtered.filter(function (s) { return s.klassifikation === 'versrel'; });
        } else if (currentShortageFilter === 'frei') {
            filtered = filtered.filter(function (s) { return (s.klassifikation || '').indexOf('weder') >= 0; });
        } else if (currentShortageFilter === 'kkh') {
            filtered = filtered.filter(function (s) { return s.kkhRelevant === 'ja'; });
        }

        if (!filtered.length) {
            el.innerHTML = '<div class="empty-state"><p>' + (filter ? 'Keine Treffer f\u00fcr "' + h(filter) + '"' : 'Keine Lieferengp\u00e4sse in der Datenbank') + '</p></div>';
            return;
        }

        var html = '<div class="results-header"><h2>' + filtered.length + ' Lieferengp\u00e4sse</h2></div>';
        filtered.forEach(function (s) {
            var kkhBadge = s.kkhRelevant === 'ja' ? '<span class="shortage-badge">KKH-relevant</span>' : '';
            var klassBadge = '';
            if (s.klassifikation) {
                if (s.klassifikation.indexOf('weder') >= 0) klassBadge = '<span class="available-badge">FREIVERKAEUFLICH</span>';
                else if (s.klassifikation.indexOf('verskri') >= 0) klassBadge = '<span class="shortage-badge">VERSCHREIBUNGSPFLICHTIG</span>';
                else if (s.klassifikation === 'versrel') klassBadge = '<span class="tag tag-phonetisch">APOTHEKENPFLICHTIG</span>';
            }
            html += '<div class="result-card shortage-card shortage-expandable" data-pzn="' + h(s.pzn) + '" data-wirkstoffe="' + h(s.wirkstoffe) + '">' +
                '<div class="result-name">' + h(s.name) + '</div>' +
                '<div class="result-meta">' +
                '<span class="pzn-badge">PZN ' + h(s.pzn) + '</span>' +
                (s.atc ? '<span class="pzn-badge">ATC ' + h(s.atc) + '</span>' : '') +
                (s.form ? '<span class="form-badge">' + h(s.form) + '</span>' : '') +
                kkhBadge + klassBadge +
                '</div>' +
                '<div class="shortage-details">' +
                '<div><strong>Wirkstoff:</strong> ' + h(s.wirkstoffe || 'k.A.') + '</div>' +
                '<div><strong>Grund:</strong> ' + h(s.grund || 'k.A.') + (s.anmGrund ? ' \u2014 ' + h(s.anmGrund) : '') + '</div>' +
                '<div><strong>Zeitraum:</strong> ' + h(s.beginn || '?') + ' bis ' + h(s.ende || 'unbekannt') + '</div>' +
                (s.alternativ ? '<div><strong>Alternative:</strong> ' + h(s.alternativ) + '</div>' : '') +
                '<div><strong>Hersteller:</strong> ' + h(s.zulassungsinhaber || 'k.A.') + '</div>' +
                '</div>' +
                '<div class="shortage-click-hint" style="margin-top:6px">\u25b6 Alternativen anzeigen</div>' +
                '<div class="shortage-alt-container" style="display:none"></div>' +
                '</div>';
        });
        el.innerHTML = html;

        // Klick auf Engpass-Karte: Alternativen anzeigen
        el.querySelectorAll('.shortage-expandable').forEach(function (card) {
            card.addEventListener('click', function () {
                var altContainer = this.querySelector('.shortage-alt-container');
                if (!altContainer) return;
                if (altContainer.style.display !== 'none') {
                    altContainer.style.display = 'none';
                    this.querySelector('.shortage-click-hint').textContent = '\u25b6 Alternativen anzeigen';
                    return;
                }
                var pzn = this.dataset.pzn;
                // Wirkstoff-ID per PZN
                var subId = '';
                try {
                    var sr = BfarmDB.exec("SELECT s.rse_substance_id FROM substance s JOIN pharmaceutical_product pp ON s.rpp_key=pp.rpp_key JOIN medicinal_product mp ON pp.rmp_key=mp.rmp_key WHERE mp.rmp_pzn='" + (pzn||'').replace(/'/g,"''") + "' LIMIT 1");
                    if (sr.length && sr[0].values.length) subId = sr[0].values[0][0];
                } catch (e) {}
                if (!subId) {
                    altContainer.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:12px">Kein Wirkstoff in der BfArM-DB gefunden f\u00fcr PZN ' + h(pzn) + '</div>';
                    altContainer.style.display = '';
                    return;
                }
                var generika = BfarmShortage.findGenerika(subId, pzn, 20);
                var ghtml = '<div class="sub-meds-header" style="margin-top:8px">' + generika.length + ' Pr\u00e4parate mit gleichem Wirkstoff:</div>';
                generika.forEach(function (g) {
                    var sWarn = g.shortage ? '<span class="shortage-badge">\u26a0 Engpass</span>' : '<span class="available-badge">\u2713 verf\u00fcgbar</span>';
                    ghtml += '<div class="sub-med-item"><span class="sub-med-name">' + h(g.name) + '</span> <span class="pzn-badge">' + h(g.pzn||'') + '</span> ' +
                        (g.strength ? '<span class="substance-strength">' + h(g.strength) + '</span> ' : '') + sWarn + '</div>';
                });
                if (!generika.length) ghtml = '<div style="padding:8px;color:var(--text-muted);font-size:12px">Keine Alternativen gefunden</div>';
                altContainer.innerHTML = ghtml;
                altContainer.style.display = '';
                this.querySelector('.shortage-click-hint').textContent = '\u25bc Alternativen ausblenden';
            });
        });
    }

    function updateShortageBadge() {
        var badge = document.getElementById('shortageBadge');
        if (!badge || typeof BfarmShortage === 'undefined') return;
        var cnt = BfarmShortage.getCount();
        if (cnt > 0) {
            badge.textContent = cnt;
            badge.style.display = '';
        }
    }

    function renderStatsPanel() {
        if (!BfarmDB.isReady()) return;

        var topSubs = BfarmStats.topSubstances(20);
        BfarmStats.renderBarChart('chart-substances', topSubs);

        var topForms = BfarmStats.topForms(15);
        BfarmStats.renderBarChart('chart-forms', topForms);

        var dist = BfarmStats.substanceCountDistribution();
        var distEl = document.getElementById('chart-distribution');
        if (distEl && dist.length) {
            var max = Math.max.apply(null, dist.map(function (d) { return d.count; }));
            distEl.innerHTML = dist.map(function (d) {
                var pct = Math.round((d.count / max) * 100);
                return '<div class="stat-bar-row">' +
                    '<span class="stat-bar-label">' + d.substances + ' Wirkstoff(e)</span>' +
                    '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<span class="stat-bar-value">' + d.count.toLocaleString('de-DE') + '</span></div>';
            }).join('');
        }
    }

    // ─── Med List Panel ─────────────────────────────────

    function renderMedListPanel() {
        var list = BfarmMedList.getList();
        var el = document.getElementById('medListContent');
        if (!el) return;

        var html = '';
        if (!list.length) {
            html += '<div class="empty-state"><div class="icon">&#128203;</div>' +
                '<p>Keine Medikamente auf der Liste.<br>F\u00fcge Medikamente \u00fcber die Suche oder den Kamera-Scan hinzu.</p></div>';
        }

        if (list.length) {
        html += '<div class="medlist-header">' +
            '<span>' + list.length + ' Medikament' + (list.length > 1 ? 'e' : '') + '</span>' +
            '<div class="medlist-actions">' +
            '<button class="btn-small" id="exportCSV">CSV</button>' +
            '<button class="btn-small" id="showQR">QR-Code</button>' +
            '<button class="btn-small" id="showMedPass">Medikamentenpass</button>' +
            '<button class="btn-small" id="exportCopy">Kopieren</button>' +
            '<button class="btn-small btn-danger" id="clearList">Alle entfernen</button>' +
            '</div></div>';

        list.forEach(function (m, i) {
            var shortageHtml = '';
            var generikaBtn = '';
            if (typeof BfarmShortage !== 'undefined' && BfarmShortage.isLoaded() && m.pzn) {
                var si = BfarmShortage.checkPZN(m.pzn);
                if (si) {
                    shortageHtml = '<div class="shortage-warning">\u26a0 <strong>Lieferengpass</strong>' +
                        (si.grund ? ': ' + h(si.grund) : '') +
                        (si.ende ? ' (bis ' + h(si.ende) + ')' : '') +
                        (si.alternativ ? '<br>Alternative lt. Hersteller: ' + h(si.alternativ) : '') +
                        '</div>';
                }
            }
            if (m.substanceId) {
                generikaBtn = '<button class="btn-small btn-generika" data-substance-id="' + h(m.substanceId) +
                    '" data-pzn="' + h(m.pzn || '') + '" data-idx="' + i + '">Generika anzeigen</button>';
            }
            html += '<div class="medlist-item">' +
                '<div class="medlist-item-main">' +
                '<span class="medlist-item-qty">' +
                '<button class="qty-btn qty-minus" data-idx="' + i + '">-</button>' +
                '<span class="qty-value">' + (m.quantity || '1') + '</span>' +
                '<button class="qty-btn qty-plus" data-idx="' + i + '">+</button>' +
                '</span>' +
                '<span class="medlist-item-name">' + h(m.name) + ' [' + h(m.pzn || '') + ']</span>' +
                '</div>' +
                '<div class="medlist-item-detail">' +
                (m.substance ? '<span>' + h(m.substance) + (m.substanceId ? ' [' + h(m.substanceId) + ']' : '') + (m.strength ? ' ' + h(m.strength) : '') + '</span>' : '') +
                (m.form ? '<span class="form-badge">' + h(m.form) + '</span>' : '') +
                generikaBtn +
                '</div>' +
                shortageHtml +
                '<div class="generika-list" id="generika-' + i + '" style="display:none"></div>' +
                '<button class="medlist-remove" data-index="' + i + '" title="Entfernen">&times;</button>' +
                '</div>';
        });
        } // end if (list.length) — Medikamenten-Karten (CORRECT POSITION)

        // Contact form — helper for input rows with voice + clear
        var micSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
        var hasVoice = BfarmVoice.isSupported();
        function formRow(id, placeholder, tag, type) {
            tag = tag || 'input';
            type = type || 'text';
            var inp = tag === 'textarea'
                ? '<textarea id="' + id + '" placeholder="' + placeholder + '" class="contact-input" rows="3"></textarea>'
                : '<input type="' + type + '" id="' + id + '" placeholder="' + placeholder + '" class="contact-input">';
            return '<div class="input-with-voice">' + inp +
                '<button class="field-clear-btn" data-target="' + id + '" title="Feld loeschen" style="display:none">&times;</button>' +
                (hasVoice ? '<button class="voice-btn-inline" data-target="' + id + '" title="Spracheingabe">' + micSvg + '</button>' : '') +
                '</div>';
        }

        // Formular wird IMMER angezeigt (auch ohne Medikamente)
        html += '<div class="contact-section">' +
            '<h3>Rezeptanfrage / Kontakt</h3>' +
            '<div class="form-top-actions">' +
            (hasVoice ? '<button class="btn-dictate" id="dictateBtn">' + micSvg + ' Formular diktieren</button>' : '') +
            '<button class="btn-small btn-danger" id="resetFormBtn">Formular l\u00f6schen</button>' +
            '</div>' +
            (hasVoice ? '<div class="dictate-hint">Sprachkommandos: <strong>WEITER</strong> = n\u00e4chstes Feld · <strong>STOP</strong> / <strong>FERTIG</strong> = Diktat beenden · <strong>\u00dcBERSPRINGEN</strong> = Feld leer lassen</div>' : '') +
            (hasVoice ? '<div class="dictate-status" id="dictateStatus" style="display:none"></div>' : '') +
            '<div class="contact-form">' +
            '<div class="form-row-group">' +
            '<label class="form-label">Patient/in <span class="required-mark">*</span></label>' +
            formRow('contactName', 'Vor- und Nachname') +
            '</div>' +
            '<div class="form-row-pair">' +
            '<div class="form-row-group form-half">' +
            '<label class="form-label">E-Mail <span class="required-alt">*</span></label>' +
            formRow('contactEmail', 'E-Mail-Adresse', 'input', 'email') +
            '</div>' +
            '<div class="form-row-group form-half">' +
            '<label class="form-label">Telefon <span class="required-alt">*</span></label>' +
            formRow('contactPhone', 'Telefonnummer', 'input', 'tel') +
            '</div></div>' +
            '<div class="hint" style="margin-bottom:8px"><span class="required-mark">*</span> Pflichtfeld. <span class="required-alt">*</span> Mindestens E-Mail oder Telefon erforderlich.</div>' +
            '<div class="form-row-pair">' +
            '<div class="form-row-group form-half">' +
            '<label class="form-label">Geburtsdatum</label>' +
            '<div class="input-with-voice">' +
            '<input type="text" id="contactDOB" placeholder="TT.MM.JJJJ" class="contact-input" inputmode="numeric">' +
            '<input type="date" id="contactDOBPicker" class="date-picker-hidden" max="' + new Date().toISOString().split('T')[0] + '" min="1900-01-01">' +
            '<button class="field-clear-btn" data-target="contactDOB" title="Feld l\u00f6schen" style="display:none">&times;</button>' +
            (hasVoice ? '<button class="voice-btn-inline" data-target="contactDOB" title="Spracheingabe">' + micSvg + '</button>' : '') +
            '</div></div>' +
            '<div class="form-row-group form-half">' +
            '<label class="form-label">Versichertennummer</label>' +
            formRow('contactInsuredNr', 'z.B. A123456789') +
            '</div></div>' +
            '<div class="form-row-group">' +
            '<label class="form-label">Versicherung</label>' +
            '<div class="input-with-voice">' +
            '<input type="text" id="contactInsuranceSearch" placeholder="Krankenkasse suchen..." class="contact-input" list="insuranceDatalist">' +
            '<datalist id="insuranceDatalist"></datalist>' +
            '<button class="field-clear-btn" data-target="contactInsuranceSearch" title="Feld loeschen" style="display:none">&times;</button>' +
            (hasVoice ? '<button class="voice-btn-inline" data-target="contactInsuranceSearch" title="Spracheingabe">' + micSvg + '</button>' : '') +
            '</div></div>' +
            '<div class="form-row-group">' +
            '<label class="form-label">Empf\u00e4nger (Praxis / Apotheke)</label>' +
            formRow('contactRecipient', 'Name der Praxis oder Apotheke') +
            '</div>' +
            '<div class="form-row-group">' +
            '<label class="form-label">Nachricht / Anmerkung</label>' +
            formRow('contactNote', 'Optionale Nachricht...', 'textarea') +
            '</div>' +
            '<div class="contact-actions">' +
            '<button class="btn-primary" id="exportPDF">PDF herunterladen</button>' +
            '<button class="btn-secondary" id="sendEncrypted">Verschluesselt per E-Mail senden</button>' +
            '<button class="btn-secondary" id="contactCopy">In Zwischenablage kopieren</button>' +
            '</div>' +
            '<div id="encryptionUI" style="display:none">' +
            '<div class="encryption-form">' +
            '<label class="encryption-label">Passwort fuer Verschluesselung (AES-256-GCM, BSI-konform):</label>' +
            '<input type="password" id="encPassword" class="contact-input" placeholder="Mindestens 8 Zeichen" minlength="8">' +
            '<input type="email" id="encEmail" class="contact-input" placeholder="E-Mail-Adresse des Empfaengers">' +
            '<button class="btn-primary" id="doEncryptSend">Verschluesselt senden</button>' +
            '<div class="hint">Das Passwort muss dem Empfaenger separat mitgeteilt werden (telefonisch, persoenlich).</div>' +
            '</div></div>' +
            '<div class="security-hint">' +
            '<strong>Verschluesselung:</strong> Medikamentenlisten werden mit <strong>AES-256-GCM</strong> ' +
            '(PBKDF2, 600.000 Iterationen) verschluesselt — post-quanten-sicher nach BSI TR-02102-1. ' +
            'Das Passwort wird <em>nicht</em> mitgesendet. Teilen Sie es dem Empfaenger persoenlich oder telefonisch mit.' +
            '</div>' +
            '</div></div>';

        el.innerHTML = html;

        // Medikamentenpass-Daten ins Formular einfuellen (falls vorhanden)
        var passFields = {
            '_medpass_name': 'contactName',
            '_medpass_dob': 'contactDOB',
            '_medpass_insuredNr': 'contactInsuredNr',
            '_medpass_insurance': 'contactInsuranceSearch',
            '_medpass_recipient': 'contactRecipient',
            '_medpass_note': 'contactNote'
        };
        Object.keys(passFields).forEach(function (ssKey) {
            var val = sessionStorage.getItem(ssKey);
            if (val) {
                var field = document.getElementById(passFields[ssKey]);
                if (field && !field.value) {
                    field.value = val;
                    var clearBtn = field.parentElement && field.parentElement.querySelector('.field-clear-btn');
                    if (clearBtn) clearBtn.style.display = '';
                }
                sessionStorage.removeItem(ssKey); // Einmalig anwenden
            }
        });
        // E-Mail und Telefon aus Pass (falls im JSON erweitert)
        ['_medpass_email', '_medpass_phone'].forEach(function (ssKey) {
            var val = sessionStorage.getItem(ssKey);
            if (val) {
                var fid = ssKey === '_medpass_email' ? 'contactEmail' : 'contactPhone';
                var field = document.getElementById(fid);
                if (field && !field.value) field.value = val;
                sessionStorage.removeItem(ssKey);
            }
        });

        // Event listeners
        el.querySelectorAll('.medlist-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                BfarmMedList.remove(parseInt(this.dataset.index));
                renderMedListPanel();
            });
        });
        // Mengen-Buttons
        el.querySelectorAll('.qty-plus').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var list = BfarmMedList.getList();
                var idx = parseInt(this.dataset.idx);
                if (idx >= 0 && idx < list.length) {
                    list[idx].quantity = String((parseInt(list[idx].quantity) || 1) + 1);
                    BfarmMedList.saveListDirect(list);
                    renderMedListPanel();
                }
            });
        });
        el.querySelectorAll('.qty-minus').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var list = BfarmMedList.getList();
                var idx = parseInt(this.dataset.idx);
                if (idx >= 0 && idx < list.length) {
                    var qty = parseInt(list[idx].quantity) || 1;
                    if (qty > 1) {
                        list[idx].quantity = String(qty - 1);
                        BfarmMedList.saveListDirect(list);
                        renderMedListPanel();
                    }
                }
            });
        });

        // Generika-Buttons
        el.querySelectorAll('.btn-generika').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var subId = this.dataset.substanceId;
                var pzn = this.dataset.pzn;
                var idx = this.dataset.idx;
                var container = document.getElementById('generika-' + idx);
                if (!container) return;
                if (container.style.display !== 'none') {
                    container.style.display = 'none';
                    this.textContent = 'Generika anzeigen';
                    return;
                }
                var generika = BfarmShortage.findGenerika(subId, pzn, 15);
                if (!generika.length) {
                    container.innerHTML = '<div style="padding:6px;color:var(--text-muted);font-size:12px">Keine Generika gefunden</div>';
                } else {
                    var ghtml = '<div class="sub-meds-header">' + generika.length + ' Generika/Alternativen:</div>';
                    generika.forEach(function (g) {
                        var sWarn = g.shortage ? ' <span class="shortage-badge">\u26a0 Engpass</span>' : ' <span class="available-badge">\u2713</span>';
                        var dataAttrs = 'data-name="' + h(g.name) + '" data-pzn="' + h(g.pzn || '') +
                            '" data-form="' + h(g.form || '') + '" data-substance-id="' + h(subId) +
                            '" data-strength="' + h(g.strength || '') + '"';
                        ghtml += '<div class="sub-med-item">' +
                            '<button class="btn-substitute" ' + dataAttrs + ' data-replace-idx="' + idx + '" title="Ersetzen">\u21c4</button>' +
                            '<button class="add-to-list-btn" ' + dataAttrs + ' title="Zus\u00e4tzlich hinzuf\u00fcgen">+</button>' +
                            '<span class="sub-med-name">' + h(g.name) + '</span>' +
                            '<span class="pzn-badge">' + h(g.pzn || '') + '</span>' +
                            (g.strength ? '<span class="substance-strength">' + h(g.strength) + '</span>' : '') +
                            sWarn + '</div>';
                    });
                    container.innerHTML = ghtml;

                    // Substitution: Ersetzen-Buttons
                    container.querySelectorAll('.btn-substitute').forEach(function (sbtn) {
                        sbtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            var replaceIdx = parseInt(this.dataset.replaceIdx);
                            var list = BfarmMedList.getList();
                            if (replaceIdx >= 0 && replaceIdx < list.length) {
                                // Wirkstoff vom alten VOR dem Remove sichern
                                var oldSubstance = list[replaceIdx].substance || '';
                                var newPzn = this.dataset.pzn || '';
                                var newSubId = this.dataset.substanceId || '';
                                var newStrength = this.dataset.strength || '';
                                // Wirkstoff per PZN nachladen falls noetig
                                if (!oldSubstance && newPzn && BfarmDB.isReady()) {
                                    try {
                                        var sr = BfarmDB.exec(
                                            "SELECT s.rse_substance_name, s.rse_substance_strength FROM substance s " +
                                            "JOIN pharmaceutical_product pp ON s.rpp_key = pp.rpp_key " +
                                            "JOIN medicinal_product mp ON pp.rmp_key = mp.rmp_key " +
                                            "WHERE mp.rmp_pzn = '" + newPzn.replace(/'/g,"''") + "' LIMIT 1"
                                        );
                                        if (sr.length && sr[0].values.length) {
                                            oldSubstance = sr[0].values[0][0] || '';
                                            if (!newStrength) newStrength = sr[0].values[0][1] || '';
                                        }
                                    } catch (ex) {}
                                }
                                BfarmMedList.remove(replaceIdx);
                                BfarmMedList.add({
                                    name: this.dataset.name,
                                    pzn: newPzn,
                                    form: this.dataset.form || '',
                                    substance: oldSubstance,
                                    substanceId: newSubId,
                                    strength: newStrength
                                });
                                renderMedListPanel();
                            }
                        });
                    });
                }
                container.style.display = '';
                this.textContent = 'Generika ausblenden';
            });
        });

        var csvBtn = document.getElementById('exportCSV');
        if (csvBtn) csvBtn.addEventListener('click', function () { BfarmMedList.downloadCSV(); });

        // QR-Code Button
        var qrBtn = document.getElementById('showQR');
        if (qrBtn && typeof BfarmQR !== 'undefined') {
            qrBtn.addEventListener('click', function () {
                var fd = getFormData();
                qrBtn.textContent = 'Generiere...';
                BfarmQR.generateDataURL(fd, BfarmMedList.getList(), 400).then(function (result) {
                    qrBtn.textContent = 'QR-Code';
                    // Show modal
                    var modal = document.createElement('div');
                    modal.className = 'modal-overlay';
                    // Formatiere JSON lesbar
                    var prettyJSON = '';
                    try {
                        var parsed = JSON.parse(result.json);
                        prettyJSON = JSON.stringify(parsed, null, 2);
                    } catch (e) { prettyJSON = result.json; }

                    modal.innerHTML = '<div class="modal" style="text-align:center;max-width:560px">' +
                        '<h2>QR-Code \u2014 Rezeptwunsch</h2>' +
                        '<img src="' + result.dataURL + '" style="max-width:300px;border-radius:8px;margin:16px auto;display:block" alt="QR-Code">' +
                        '<p style="font-size:12px;color:var(--text-muted)">' + result.byteLength + ' Bytes \u00b7 ' +
                        BfarmMedList.count() + ' Medikament(e)</p>' +
                        '<details style="text-align:left;margin:12px 0">' +
                        '<summary style="cursor:pointer;color:var(--text-dim);font-size:13px">Gespeicherte Daten anzeigen</summary>' +
                        '<pre style="background:var(--bg);padding:12px;border-radius:6px;font-size:11px;' +
                        'overflow-x:auto;max-height:200px;margin-top:8px;color:var(--accent);white-space:pre-wrap">' +
                        h(prettyJSON) + '</pre></details>' +
                        '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">' +
                        '<button class="btn-primary" id="qrDownload">PNG herunterladen</button>' +
                        '<button class="btn-secondary" id="qrClose">Schlie\u00dfen</button>' +
                        '</div></div>';
                    document.body.appendChild(modal);
                    document.getElementById('qrClose').addEventListener('click', function () { modal.remove(); });
                    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
                    document.getElementById('qrDownload').addEventListener('click', function () {
                        BfarmQR.downloadPNG(fd, BfarmMedList.getList());
                    });
                }).catch(function (err) {
                    qrBtn.textContent = 'QR-Code';
                    alert('QR-Fehler: ' + err.message);
                });
            });
        }

        // Medikamentenpass (Kreditkartenformat mit QR)
        var medPassBtn = document.getElementById('showMedPass');
        if (medPassBtn && typeof BfarmQR !== 'undefined') {
            medPassBtn.addEventListener('click', function () {
                var fd = getFormData();
                medPassBtn.textContent = 'Generiere...';
                generateMedPass(fd, BfarmMedList.getList()).then(function (dataURL) {
                    medPassBtn.textContent = 'Medikamentenpass';
                    var modal = document.createElement('div');
                    modal.className = 'modal-overlay';
                    modal.innerHTML = '<div class="modal" style="text-align:center;max-width:520px">' +
                        '<h2>Medikamentenpass</h2>' +
                        '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' +
                        'Speichern Sie dieses Bild auf Ihrem Handy (Screenshot oder Download). ' +
                        'Beim n\u00e4chsten Besuch: Kamera / OCR \u2192 QR scannen \u2192 Liste wird wiederhergestellt.</p>' +
                        '<img src="' + dataURL + '" style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.4)" alt="Medikamentenpass">' +
                        '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px">' +
                        '<button class="btn-primary" id="passDownload">Als Bild speichern</button>' +
                        '<button class="btn-secondary" id="passClose">Schlie\u00dfen</button>' +
                        '</div></div>';
                    document.body.appendChild(modal);
                    document.getElementById('passClose').addEventListener('click', function () { modal.remove(); });
                    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
                    document.getElementById('passDownload').addEventListener('click', function () {
                        var a = document.createElement('a');
                        a.href = dataURL;
                        a.download = 'medikamentenpass.png';
                        a.click();
                    });
                }).catch(function (err) {
                    medPassBtn.textContent = 'Medikamentenpass';
                    alert('Fehler: ' + err.message);
                });
            });
        }

        function generateMedPass(formData, list) {
            return BfarmQR.generateCanvas(formData, list, 220).then(function (qr) {
                var W = 1012;
                // H\u00f6he dynamisch: Kopf (300) + Medikamente (pro Zeile 40) + Footer (60)
                var medLineH = 40;
                var headerH = 340;
                var footerH = 60;
                var H = headerH + list.length * medLineH + footerH;
                H = Math.max(H, 700); // Mindestens 700px

                var canvas = document.createElement('canvas');
                canvas.width = W; canvas.height = H;
                var ctx = canvas.getContext('2d');

                // Hintergrund
                var grad = ctx.createLinearGradient(0, 0, W, H);
                grad.addColorStop(0, '#0c1929');
                grad.addColorStop(1, '#1a2d4a');
                ctx.fillStyle = grad;
                ctx.roundRect(0, 0, W, H, 24);
                ctx.fill();

                // Amber-Streifen oben
                ctx.fillStyle = '#ffbf00';
                ctx.fillRect(0, 0, W, 6);

                // ─── Kopfbereich: Links Patientendaten, rechts QR ───
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 28px sans-serif';
                ctx.fillText('MEDIKAMENTENPASS', 30, 45);

                ctx.fillStyle = '#7a839a';
                ctx.font = '14px sans-serif';
                ctx.fillText('Erstellt: ' + new Date().toLocaleDateString('de-DE') + ' ' + new Date().toLocaleTimeString('de-DE'), 30, 68);

                // Patientendaten
                var yP = 100;
                var fields = [
                    { label: 'Patient/in:', value: formData.name },
                    { label: 'E-Mail:', value: formData.email },
                    { label: 'Telefon:', value: formData.phone },
                    { label: 'Geb.-Datum:', value: formData.dob },
                    { label: 'Vers.-Nr.:', value: formData.insuredNr },
                    { label: 'Versicherung:', value: formData.insurance },
                    { label: 'Empf\u00e4nger:', value: formData.recipient }
                ];
                fields.forEach(function (f) {
                    if (!f.value) return;
                    ctx.fillStyle = '#7a839a';
                    ctx.font = '14px sans-serif';
                    ctx.fillText(f.label, 30, yP);
                    ctx.fillStyle = '#e4e8f1';
                    ctx.font = 'bold 16px sans-serif';
                    var val = f.value.length > 45 ? f.value.substring(0, 42) + '...' : f.value;
                    ctx.fillText(val, 140, yP);
                    yP += 24;
                });

                // QR-Code rechts oben
                var qrSize = 220;
                var qrX = W - qrSize - 30;
                var qrY = 30;
                ctx.fillStyle = '#ffffff';
                ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12);
                ctx.fill();
                ctx.drawImage(qr.canvas, qrX, qrY, qrSize, qrSize);
                ctx.fillStyle = '#7a839a';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Zum Einlesen scannen (' + qr.byteLength + ' Bytes)', qrX + qrSize / 2, qrY + qrSize + 18);
                ctx.textAlign = 'left';

                // ─── Trennlinie ───
                var tableY = Math.max(yP + 20, 300);
                ctx.strokeStyle = '#ffbf00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(30, tableY);
                ctx.lineTo(W - 30, tableY);
                ctx.stroke();
                tableY += 15;

                // ─── Medikamenten-Tabelle ───
                ctx.fillStyle = '#7a839a';
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText('Nr.', 30, tableY);
                ctx.fillText('Arzneimittel [PZN]', 60, tableY);
                ctx.fillText('Wirkstoff [ID]', 500, tableY);
                ctx.fillText('St\u00e4rke / Form', 780, tableY);
                tableY += 8;
                ctx.strokeStyle = '#2a3550';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(30, tableY); ctx.lineTo(W - 30, tableY); ctx.stroke();
                tableY += 18;

                list.forEach(function (m, i) {
                    // Nr
                    ctx.fillStyle = '#4a7cff';
                    ctx.font = 'bold 16px monospace';
                    ctx.fillText(String(i + 1) + '.', 30, tableY);

                    // Arzneimittel [PZN]
                    ctx.fillStyle = '#e4e8f1';
                    ctx.font = 'bold 15px sans-serif';
                    var nameStr = (m.name || '') + (m.pzn ? ' [' + m.pzn + ']' : '');
                    if (nameStr.length > 55) nameStr = nameStr.substring(0, 52) + '...';
                    ctx.fillText(nameStr, 60, tableY);

                    // Wirkstoff [ID]
                    ctx.fillStyle = '#7a839a';
                    ctx.font = '14px sans-serif';
                    var subStr = (m.substance || '') + (m.substanceId ? ' [' + m.substanceId + ']' : '');
                    if (subStr.length > 35) subStr = subStr.substring(0, 32) + '...';
                    ctx.fillText(subStr, 500, tableY);

                    // St\u00e4rke / Form
                    var sfStr = [m.strength, m.form].filter(Boolean).join(' / ');
                    if (sfStr.length > 25) sfStr = sfStr.substring(0, 22) + '...';
                    ctx.fillText(sfStr, 780, tableY);

                    tableY += medLineH;

                    // Trennlinie
                    ctx.strokeStyle = '#1a2540';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(60, tableY - 20); ctx.lineTo(W - 30, tableY - 20); ctx.stroke();
                });

                // ─── Footer ───
                var footY = H - 50;
                ctx.fillStyle = '#ffbf00';
                ctx.fillRect(0, H - 6, W, 6);

                ctx.fillStyle = '#4d5570';
                ctx.font = '11px sans-serif';
                ctx.fillText('TLP:AMBER+STRICT \u2014 Nur f\u00fcr Fachpersonal der benannten Praxis/Apotheke. Weitergabe untersagt.', 30, footY);
                ctx.fillText(list.length + ' Medikament' + (list.length !== 1 ? 'e' : '') + ' \u00b7 Keine Gew\u00e4hr f\u00fcr Vollst\u00e4ndigkeit/Richtigkeit.', 30, footY + 16);

                return canvas.toDataURL('image/png');
            });
        }

        var copyBtn = document.getElementById('exportCopy');
        if (copyBtn) copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(BfarmMedList.toText()).then(function () {
                copyBtn.textContent = 'Kopiert!';
                setTimeout(function () { copyBtn.textContent = 'Kopieren'; }, 2000);
            });
        });

        // Insurance datalist (searchable with IK numbers)
        var insDatalist = document.getElementById('insuranceDatalist');
        if (insDatalist && typeof BfarmInsurance !== 'undefined') {
            if (BfarmInsurance.renderDatalist) {
                BfarmInsurance.renderDatalist(insDatalist);
            } else if (BfarmInsurance.getNames) {
                insDatalist.innerHTML = BfarmInsurance.getNames().map(function (n) {
                    return '<option value="' + n + '">';
                }).join('');
            } else {
                // Fallback for old insurance.js
                var allKK = ['Selbstzahler/in'];
                BfarmInsurance.GKV.forEach(function (kk) {
                    allKK.push(typeof kk === 'string' ? kk : kk.name + (kk.ik ? ' (IK: ' + kk.ik + ')' : ''));
                });
                BfarmInsurance.PKV.forEach(function (kk) {
                    allKK.push(typeof kk === 'string' ? kk : kk.name);
                });
                insDatalist.innerHTML = allKK.map(function (n) { return '<option value="' + n + '">'; }).join('');
            }
        }

        // Voice input for form fields
        if (BfarmVoice.isSupported()) {
            el.querySelectorAll('.voice-btn-inline').forEach(function (btn) {
                var activeRec = null;
                btn.addEventListener('click', function () {
                    // If already recording, just stop — do NOT clear
                    if (activeRec) {
                        try { activeRec.stop(); } catch (e) {}
                        activeRec = null;
                        btn.classList.remove('voice-active');
                        return;
                    }

                    var targetId = this.dataset.target;
                    var targetEl = document.getElementById(targetId);
                    if (!targetEl) return;
                    var clearBtn = this.parentElement.querySelector('.field-clear-btn');
                    var prevValue = targetEl.value; // Preserve existing text
                    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    var rec = new SpeechRecognition();
                    rec.lang = 'de-DE';
                    rec.continuous = false;
                    rec.interimResults = true;
                    activeRec = rec;
                    btn.classList.add('voice-active');

                    rec.onresult = function (e) {
                        var text = e.results[0][0].transcript;
                        // b) Grossbuchstaben-Konvertierung fuer alle Felder
                        var upper = text.toUpperCase();
                        if (e.results[0].isFinal) {
                            if (targetEl.tagName === 'TEXTAREA') {
                                targetEl.value = prevValue + (prevValue ? ' ' : '') + upper;
                            } else {
                                targetEl.value = (prevValue ? prevValue + ' ' : '') + upper;
                            }
                            activeRec = null;
                            btn.classList.remove('voice-active');

                            // Special: Geburtsdatum — parse spoken date
                            if (targetId === 'contactDOB') {
                                targetEl.value = parseDateInput(targetEl.value);
                            }
                            // Special: KK field — match against list
                            if (targetId === 'contactInsuranceSearch') {
                                handleInsuranceVoice(targetEl, text);
                            }
                        } else {
                            // Interim preview
                            if (targetEl.tagName === 'TEXTAREA') {
                                targetEl.value = prevValue + (prevValue ? ' ' : '') + upper;
                            } else {
                                targetEl.value = upper;
                            }
                        }
                        if (clearBtn && targetEl.value) clearBtn.style.display = '';
                    };
                    rec.onerror = function () { activeRec = null; btn.classList.remove('voice-active'); };
                    rec.onend = function () { activeRec = null; btn.classList.remove('voice-active'); };
                    rec.start();
                });
            });
        }

        // c) Insurance voice matching: show matching KK options
        function handleInsuranceVoice(inputEl, spokenText) {
            var term = spokenText.toLowerCase().trim();
            if (!BfarmInsurance) return;
            var matches;
            if (BfarmInsurance.search) {
                matches = BfarmInsurance.search(term);
            } else {
                // Fallback for old format (array of strings)
                var all = BfarmInsurance.GKV.concat(BfarmInsurance.PKV);
                matches = all.filter(function (kk) {
                    var name = typeof kk === 'string' ? kk : kk.name;
                    return name.toLowerCase().includes(term);
                }).map(function (kk) {
                    return typeof kk === 'string' ? { name: kk } : kk;
                });
            }

            // Exact or single match → auto-fill
            if (matches.length === 1) {
                var label = matches[0].name + (matches[0].ik ? ' (IK: ' + matches[0].ik + ')' : '');
                inputEl.value = label;
                return;
            }

            // Multiple matches → show disambiguation
            if (matches.length > 1 && matches.length <= 15) {
                var container = inputEl.parentElement.parentElement;
                var existing = container.querySelector('.kk-suggestions');
                if (existing) existing.remove();
                var div = document.createElement('div');
                div.className = 'kk-suggestions';
                div.innerHTML = '<div class="kk-suggestions-header">' + matches.length +
                    ' Treffer f\u00fcr "' + h(spokenText) + '" \u2014 bitte w\u00e4hlen:</div>' +
                    matches.map(function (kk) {
                        var label = kk.name + (kk.ik ? ' (IK: ' + kk.ik + ')' : '');
                        return '<button class="kk-suggestion-btn" data-name="' + h(label) + '">' + h(label) + '</button>';
                    }).join('');
                container.appendChild(div);
                div.querySelectorAll('.kk-suggestion-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        inputEl.value = this.dataset.name;
                        div.remove();
                    });
                });
            } else if (matches.length > 15) {
                inputEl.value = spokenText;
                // Too many — let datalist handle it
            }
        }

        // Field clear buttons
        el.querySelectorAll('.field-clear-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var targetEl = document.getElementById(this.dataset.target);
                if (targetEl) { targetEl.value = ''; targetEl.focus(); }
                this.style.display = 'none';
            });
        });

        // Show/hide clear buttons on input
        el.querySelectorAll('.input-with-voice .contact-input').forEach(function (inp) {
            inp.addEventListener('input', function () {
                var clearBtn = this.parentElement.querySelector('.field-clear-btn');
                if (clearBtn) clearBtn.style.display = this.value ? '' : 'none';
            });
        });

        // ─── Diktiermodus: alle Felder nacheinander ────
        var dictateBtn = document.getElementById('dictateBtn');
        var dictateStatus = document.getElementById('dictateStatus');
        if (dictateBtn && hasVoice) {
            var dictateFields = [
                { id: 'contactName', prompt: 'Bitte sagen Sie Ihren Namen (Pflichtfeld)' },
                { id: 'contactEmail', prompt: 'Bitte sagen Sie Ihre E-Mail-Adresse' },
                { id: 'contactPhone', prompt: 'Bitte sagen Sie Ihre Telefonnummer' },
                { id: 'contactDOB', prompt: 'Bitte sagen Sie Ihr Geburtsdatum' },
                { id: 'contactInsuredNr', prompt: 'Bitte sagen Sie Ihre Versichertennummer' },
                { id: 'contactInsuranceSearch', prompt: 'Bitte sagen Sie Ihre Krankenkasse' },
                { id: 'contactRecipient', prompt: 'Bitte sagen Sie den Empf\u00e4nger (Praxis oder Apotheke)' },
                { id: 'contactNote', prompt: 'Optionale Nachricht \u2014 sagen Sie FERTIG zum Beenden' }
            ];
            var dictateActive = false;

            dictateBtn.addEventListener('click', function () {
                if (dictateActive) {
                    dictateActive = false;
                    dictateBtn.classList.remove('voice-active');
                    dictateStatus.style.display = 'none';
                    return;
                }
                dictateActive = true;
                dictateBtn.classList.add('voice-active');
                dictateStatus.style.display = '';
                dictateNextField(0);
            });

            function dictateNextField(idx) {
                if (!dictateActive || idx >= dictateFields.length) {
                    dictateActive = false;
                    dictateBtn.classList.remove('voice-active');
                    dictateStatus.style.display = 'none';
                    return;
                }
                var field = dictateFields[idx];
                var targetEl = document.getElementById(field.id);
                if (!targetEl) { dictateNextField(idx + 1); return; }

                dictateStatus.textContent = field.prompt;
                targetEl.focus();
                targetEl.style.borderColor = 'var(--accent)';

                // Einfache Zustandsmaschine:
                // hasValue=false: Warte auf Eingabe (Interim wird angezeigt)
                // hasValue=true:  Wert gespeichert, warte auf Kommando (Interim wird IGNORIERT)
                var savedValue = targetEl.value || '';
                var hasValue = !!savedValue;
                var stopped = false;

                function applyFieldLogic() {
                    if (field.id === 'contactDOB') targetEl.value = parseDateInput(targetEl.value);
                    if (field.id === 'contactInsuranceSearch') handleInsuranceVoice(targetEl, targetEl.value);
                }

                function showClearBtn() {
                    var cb = targetEl.parentElement.querySelector('.field-clear-btn');
                    if (cb && targetEl.value) cb.style.display = '';
                }

                function endDictation() {
                    stopped = true;
                    dictateActive = false;
                    targetEl.style.borderColor = '';
                    dictateBtn.classList.remove('voice-active');
                    dictateStatus.style.display = 'none';
                }

                function goNext() {
                    stopped = true;
                    targetEl.style.borderColor = '';
                    dictateNextField(idx + 1);
                }

                function listen() {
                    if (stopped || !dictateActive) return;
                    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
                    var rec = new SR();
                    rec.lang = 'de-DE';
                    rec.continuous = false;
                    rec.interimResults = !hasValue; // Interim NUR wenn noch kein Wert

                    rec.onresult = function (e) {
                        if (stopped) return;
                        var text = e.results[0][0].transcript.toUpperCase().trim();
                        var isFinal = e.results[0].isFinal;

                        if (isFinal) {
                            var bare = text.trim();

                            // Kommandos — IMMER pruefen, auch mit gespeichertem Wert
                            if (/^(STOP|STOPP|FERTIG)$/.test(bare)) {
                                if (hasValue) targetEl.value = savedValue;
                                endDictation();
                                return;
                            }
                            if (/^(WEITER|NEXT)$/.test(bare)) {
                                if (hasValue) targetEl.value = savedValue;
                                goNext();
                                return;
                            }
                            if (/^(UEBERSPRINGEN|\u00dcBERSPRINGEN|SKIP)$/.test(bare)) {
                                targetEl.value = '';
                                goNext();
                                return;
                            }
                            // "TEXT WEITER" zusammen
                            if (/\bWEITER\b/.test(bare)) {
                                var clean = bare.replace(/\bWEITER\b/g, '').trim();
                                if (clean) { targetEl.value = clean; applyFieldLogic(); showClearBtn(); }
                                goNext();
                                return;
                            }
                            // "TEXT STOPP" zusammen
                            if (/\b(STOP|STOPP|FERTIG)\b/.test(bare)) {
                                var cleanS = bare.replace(/\b(STOP|STOPP|FERTIG)\b/g, '').trim();
                                if (cleanS) { targetEl.value = cleanS; applyFieldLogic(); showClearBtn(); }
                                endDictation();
                                return;
                            }

                            // Normaler Text — speichern
                            targetEl.value = text;
                            applyFieldLogic();
                            savedValue = targetEl.value;
                            hasValue = true;
                            showClearBtn();
                            dictateStatus.textContent = '\u2713 "' + savedValue + '" \u2014 WEITER / STOPP / oder korrigieren';
                        } else if (!hasValue) {
                            // Interim nur wenn noch kein Wert
                            targetEl.value = text;
                        }
                        // hasValue=true + interim → wird ignoriert, Feld bleibt
                    };

                    rec.onerror = function (ev) {
                        if (stopped || !dictateActive) return;
                        // Wert wiederherstellen falls ueberschrieben
                        if (hasValue) targetEl.value = savedValue;
                        setTimeout(listen, 800);
                    };

                    rec.onend = function () {
                        if (stopped || !dictateActive) return;
                        // Wert IMMER wiederherstellen vor Neustart
                        if (hasValue) targetEl.value = savedValue;
                        // Laengere Pause vor Neustart damit Kommandos ankommen
                        setTimeout(listen, 600);
                    };

                    try { rec.start(); } catch (ex) { setTimeout(listen, 800); }
                }

                if (hasValue) {
                    dictateStatus.textContent = '\u2713 "' + savedValue + '" \u2014 WEITER / STOP / oder korrigieren';
                }
                listen();
                rec.start();
            }
        }

        // Formular komplett loeschen
        var resetBtn = document.getElementById('resetFormBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                ['contactName', 'contactEmail', 'contactPhone', 'contactDOB', 'contactInsuredNr', 'contactInsuranceSearch', 'contactRecipient', 'contactNote'].forEach(function (id) {
                    var f = document.getElementById(id);
                    if (f) { f.value = ''; f.style.borderColor = ''; }
                });
                el.querySelectorAll('.field-clear-btn').forEach(function (b) { b.style.display = 'none'; });
                el.querySelectorAll('.kk-suggestions').forEach(function (s) { s.remove(); });
            });
        }

        // Datepicker → Textfeld sync
        var dobPicker = document.getElementById('contactDOBPicker');
        if (dobPicker) {
            dobPicker.addEventListener('change', function () {
                var dobField = document.getElementById('contactDOB');
                if (dobField && this.value) {
                    var parts = this.value.split('-');
                    dobField.value = parts[2] + '.' + parts[1] + '.' + parts[0];
                    var clearBtn = dobField.parentElement.querySelector('.field-clear-btn');
                    if (clearBtn) clearBtn.style.display = '';
                }
            });
        }

        // Geburtsdatum: parse and validate on blur
        var dobField = document.getElementById('contactDOB');
        if (dobField) {
            dobField.addEventListener('blur', function () {
                if (this.value) {
                    var parsed = parseDateInput(this.value);
                    if (parsed !== this.value) {
                        this.value = parsed;
                    }
                    // Visual feedback if invalid
                    var isValid = /^\d{2}\.\d{2}\.\d{4}$/.test(parsed);
                    this.style.borderColor = isValid ? '' : 'var(--red)';
                }
            });
        }

        // KVNR-Validierung mit sichtbarer R\u00fcckmeldung
        var kvnrField = document.getElementById('contactInsuredNr');
        if (kvnrField) {
            // Hinweiszeile erzeugen
            var kvnrHint = document.createElement('div');
            kvnrHint.className = 'kvnr-hint';
            kvnrHint.style.display = 'none';
            kvnrField.closest('.form-row-group').appendChild(kvnrHint);

            kvnrField.addEventListener('blur', function () {
                var val = this.value.trim();
                if (!val) { this.style.borderColor = ''; kvnrHint.style.display = 'none'; return; }
                var result = validateKVNR(val);
                this.style.borderColor = result.valid ? 'var(--green)' : 'var(--red)';
                kvnrHint.style.display = '';
                if (result.valid) {
                    kvnrHint.innerHTML = '<span style="color:var(--green)">\u2713 KVNR g\u00fcltig (Pr\u00fcfsumme korrekt)</span>';
                } else {
                    kvnrHint.innerHTML = '<span style="color:var(--red)">\u2717 ' + h(result.error) + '</span>';
                }
            });
        }

        // E-Mail-Validierung
        var emailField = document.getElementById('contactEmail');
        if (emailField) {
            emailField.addEventListener('blur', function () {
                var val = this.value.trim();
                if (!val) { this.style.borderColor = ''; return; }
                var result = validateEmail(val);
                this.style.borderColor = result.valid ? 'var(--green)' : 'var(--red)';
                this.title = result.valid ? 'E-Mail g\u00fcltig' : result.error;
            });
        }

        // Telefon-Validierung
        var phoneField = document.getElementById('contactPhone');
        if (phoneField) {
            var phoneHint = document.createElement('div');
            phoneHint.className = 'kvnr-hint';
            phoneHint.style.display = 'none';
            phoneField.closest('.form-row-group').appendChild(phoneHint);

            phoneField.addEventListener('blur', function () {
                var val = this.value.trim();
                if (!val) { this.style.borderColor = ''; phoneHint.style.display = 'none'; return; }
                var result = validatePhone(val);
                this.style.borderColor = result.valid ? 'var(--green)' : 'var(--red)';
                phoneHint.style.display = '';
                if (result.valid) {
                    var typeLabel = result.type === 'mobil' ? 'Mobilnetz' : result.type === 'festnetz' ? 'Festnetz' : result.type === 'sonder' ? 'Sondernummer' : 'Telefon';
                    phoneHint.innerHTML = '<span style="color:var(--green)">\u2713 ' + typeLabel + (result.prefix ? ' (' + result.prefix + ')' : '') + '</span>';
                } else {
                    phoneHint.innerHTML = '<span style="color:var(--red)">\u2717 ' + h(result.error) + '</span>';
                }
            });
        }

        // PDF export
        // Collect form data helper
        function getFormData() {
            return {
                name: (document.getElementById('contactName') || {}).value || '',
                email: (document.getElementById('contactEmail') || {}).value || '',
                phone: (document.getElementById('contactPhone') || {}).value || '',
                dob: (document.getElementById('contactDOB') || {}).value || '',
                insuredNr: (document.getElementById('contactInsuredNr') || {}).value || '',
                insurance: (document.getElementById('contactInsuranceSearch') || {}).value || '',
                recipient: (document.getElementById('contactRecipient') || {}).value || '',
                note: (document.getElementById('contactNote') || {}).value || ''
            };
        }

        function validateFormForPDF(fd) {
            var errors = [];
            if (!fd.name.trim()) errors.push('Name ist ein Pflichtfeld');
            if (!fd.email.trim() && !fd.phone.trim()) {
                errors.push('E-Mail oder Telefon muss angegeben werden');
            } else {
                if (fd.email.trim()) {
                    var emailResult = validateEmail(fd.email);
                    if (!emailResult.valid) errors.push('E-Mail: ' + emailResult.error);
                }
                if (fd.phone.trim()) {
                    var phoneResult = validatePhone(fd.phone);
                    if (!phoneResult.valid) errors.push('Telefon: ' + phoneResult.error);
                }
            }
            return errors;
        }

        var pdfBtn = document.getElementById('exportPDF');
        if (pdfBtn) pdfBtn.addEventListener('click', function () {
            var fd = getFormData();
            var errors = validateFormForPDF(fd);
            if (errors.length) {
                alert('PDF kann nicht erstellt werden:\n\n\u2022 ' + errors.join('\n\u2022 '));
                // Felder rot markieren
                if (!fd.name.trim()) { var n = document.getElementById('contactName'); if (n) n.style.borderColor = 'var(--red)'; }
                if (!fd.email.trim() && !fd.phone.trim()) {
                    var e = document.getElementById('contactEmail'); if (e) e.style.borderColor = 'var(--red)';
                    var p = document.getElementById('contactPhone'); if (p) p.style.borderColor = 'var(--red)';
                }
                return;
            }
            pdfBtn.textContent = 'PDF wird erstellt...';
            BfarmMedList.downloadPDF(fd).then(function () {
                pdfBtn.textContent = 'PDF herunterladen';
            }).catch(function (err) {
                pdfBtn.textContent = 'PDF herunterladen';
                alert('PDF-Fehler: ' + err.message);
            });
        });

        // Copy to clipboard
        var contactCopy = document.getElementById('contactCopy');
        if (contactCopy) contactCopy.addEventListener('click', function () {
            navigator.clipboard.writeText(BfarmMedList.toText()).then(function () {
                contactCopy.textContent = 'Kopiert!';
                setTimeout(function () { contactCopy.textContent = 'In Zwischenablage kopieren'; }, 2000);
            });
        });

        var clearBtn = document.getElementById('clearList');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (confirm('Alle Medikamente von der Liste entfernen?')) {
                BfarmMedList.clear();
                renderMedListPanel();
            }
        });

        // Encrypted email
        var sendEncBtn = document.getElementById('sendEncrypted');
        if (sendEncBtn) sendEncBtn.addEventListener('click', function () {
            var encUI = document.getElementById('encryptionUI');
            encUI.style.display = encUI.style.display === 'none' ? '' : 'none';
        });

        var doEncBtn = document.getElementById('doEncryptSend');
        if (doEncBtn) doEncBtn.addEventListener('click', function () {
            var pw = (document.getElementById('encPassword') || {}).value || '';
            var email = (document.getElementById('encEmail') || {}).value || '';
            if (pw.length < 8) { alert('Passwort muss mindestens 8 Zeichen haben.'); return; }
            if (!email) { alert('Bitte E-Mail-Adresse angeben.'); return; }

            var fd = getFormData();
            var content = 'Patient: ' + fd.name +
                '\nGeburtsdatum: ' + fd.dob +
                '\nVersichertennummer: ' + fd.insuredNr +
                '\nVersicherung: ' + fd.insurance +
                '\nEmpfaenger: ' + fd.recipient +
                '\n\n' + BfarmMedList.toText() +
                (fd.note ? '\n\nAnmerkung: ' + fd.note : '');

            doEncBtn.textContent = 'Verschluessele...';
            BfarmCrypto.createEncryptedMessage(content, pw).then(function (encrypted) {
                var subject = 'Verschluesselte Medikamentenliste';
                var body = 'Diese Nachricht enthaelt eine verschluesselte Medikamentenliste.\n\n' +
                    'WICHTIG: Das Passwort zur Entschluesselung wird Ihnen separat mitgeteilt.\n\n' +
                    encrypted;
                window.location.href = 'mailto:' + encodeURIComponent(email) +
                    '?subject=' + encodeURIComponent(subject) +
                    '&body=' + encodeURIComponent(body);
                doEncBtn.textContent = 'Verschluesselt senden';
            }).catch(function (err) {
                alert('Verschluesselungsfehler: ' + err.message);
                doEncBtn.textContent = 'Verschluesselt senden';
            });
        });
    }

    // ─── Med List Badge ─────────────────────────────────

    function updateListBadge() {
        var badge = document.getElementById('listBadge');
        if (!badge) return;
        var c = BfarmMedList.count();
        badge.textContent = c > 0 ? c : '';
        badge.style.display = c > 0 ? '' : 'none';
    }

    // ─── Camera Panel ───────────────────────────────────

    var currentScanMode = 'barcode';
    var cameraActive = false;

    function initCameraPanel() {
        var fileInput = document.getElementById('cameraFileInput');
        var scanBtn = document.getElementById('startScanBtn');
        var uploadLabel = document.getElementById('uploadLabel');
        var resultDiv = document.getElementById('cameraResults');
        var viewport = document.getElementById('cameraViewport');
        var videoEl = document.getElementById('cameraVideo');

        // Scan mode buttons
        document.querySelectorAll('.scan-mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                currentScanMode = this.dataset.scan;
                document.querySelectorAll('.scan-mode-btn').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.scan === currentScanMode);
                });
                // Toggle info panels
                document.querySelectorAll('.scan-info-content').forEach(function (el) { el.style.display = 'none'; });
                var infoId = { barcode: 'scanInfoBarcode', qr: 'scanInfoQr', ocr: 'scanInfoOcr', medpass: 'scanInfoMedpass', photo: 'scanInfoPhoto' };
                var infoEl = document.getElementById(infoId[currentScanMode]);
                if (infoEl) infoEl.style.display = '';

                // Show/hide buttons
                if (currentScanMode === 'photo') {
                    scanBtn.style.display = 'none';
                    uploadLabel.style.display = '';
                } else {
                    scanBtn.style.display = '';
                    uploadLabel.style.display = 'none';
                }

                // Stop any active scan
                stopAllScans();
            });
        });

        // File upload (photo + OCR mode)
        if (fileInput) {
            fileInput.addEventListener('change', function (e) {
                var file = e.target.files[0];
                if (!file) return;
                resultDiv.innerHTML = '<div class="loading-text">OCR laeuft ...</div>';
                BfarmCamera.recognizeTextPreprocessed(file, function (pct) {
                    resultDiv.innerHTML = '<div class="loading-text">Texterkennung: ' + pct + '%</div>';
                }).then(function (text) {
                    var parsed = BfarmCamera.parseMedicationText(text);
                    renderCameraResults(parsed, text, resultDiv);
                }).catch(function (err) {
                    resultDiv.innerHTML = '<div class="error-msg">' + h(err.message) + '</div>';
                });
            });
        }

        // Start scan button
        if (scanBtn) {
            scanBtn.addEventListener('click', function () {
                if (cameraActive) {
                    stopAllScans();
                    return;
                }

                if (currentScanMode === 'medpass') {
                    startMedpassScan();
                } else if (currentScanMode === 'barcode' || currentScanMode === 'qr') {
                    startBarcodeMode();
                } else if (currentScanMode === 'ocr') {
                    startOCRCameraMode();
                }
            });
        }

        // Capture button (for OCR camera mode)
        var captureBtn = document.getElementById('captureBtn');
        if (captureBtn) {
            captureBtn.addEventListener('click', function () {
                if (!videoEl || !videoEl.videoWidth) return;
                var canvas = BfarmCamera.captureFrame(videoEl);
                stopAllScans();
                resultDiv.innerHTML = '<div class="loading-text">OCR laeuft ...</div>';
                BfarmCamera.recognizeTextPreprocessed(canvas, function (pct) {
                    resultDiv.innerHTML = '<div class="loading-text">Texterkennung: ' + pct + '%</div>';
                }).then(function (text) {
                    var parsed = BfarmCamera.parseMedicationText(text);
                    renderCameraResults(parsed, text, resultDiv);
                }).catch(function (err) {
                    resultDiv.innerHTML = '<div class="error-msg">' + h(err.message) + '</div>';
                });
            });
        }

        // Stop camera button
        var stopBtn = document.getElementById('stopCameraBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', stopAllScans);
        }

        function startBarcodeMode() {
            var scannerDiv = document.getElementById('barcodeScanner');
            scannerDiv.style.display = '';
            scanBtn.textContent = 'Scanner stoppen';
            cameraActive = true;
            BfarmCamera.startBarcodeScanner('barcodeScanner', function (digits, raw) {
                BfarmCamera.stopBarcodeScanner();
                scannerDiv.style.display = 'none';
                scanBtn.textContent = 'Kamera starten';
                cameraActive = false;
                // Try as PZN
                var pzn = digits.length >= 7 && digits.length <= 8 ? digits.padStart(8, '0') : null;
                // EAN-13: strip check digit, try last 8 digits as PZN
                if (!pzn && digits.length === 13) {
                    pzn = digits.substring(5, 12).padStart(8, '0');
                }
                if (pzn) {
                    var result = BfarmSearch.searchPZN(pzn);
                    if (result.length) {
                        var rhtml = '<div class="sub-meds-header">PZN ' + h(pzn) + ' erkannt:</div>';
                        result.forEach(function (r) {
                            rhtml += '<div class="sub-med-item">' +
                                '<button class="add-to-list-btn" data-name="' + h(r.name) + '" data-pzn="' + h(pzn) + '">+</button>' +
                                '<span class="sub-med-name">' + h(r.name) + '</span>' +
                                (r.form ? '<span class="form-badge">' + h(r.form) + '</span>' : '') + '</div>';
                        });
                        resultDiv.innerHTML = rhtml;
                        wireAddButtons(resultDiv);
                    } else {
                        resultDiv.innerHTML = '<div class="error-msg">Code erkannt: ' + h(raw) + '<br>PZN ' + h(pzn) + ' nicht in der Datenbank</div>';
                    }
                } else {
                    resultDiv.innerHTML = '<div class="scan-info-content">Code erkannt: <strong>' + h(raw) + '</strong><br>Kein PZN-Format. Versuche den Strichcode auf der Packung (nicht Blister).</div>';
                }
            }).catch(function (err) {
                resultDiv.innerHTML = '<div class="error-msg">Kamera-Zugriff fehlgeschlagen: ' + h(err.message) + '</div>';
                cameraActive = false;
            });
        }

        function startOCRCameraMode() {
            viewport.style.display = '';
            scanBtn.textContent = 'Kamera stoppen';
            cameraActive = true;
            BfarmCamera.startCamera(videoEl).catch(function (err) {
                resultDiv.innerHTML = '<div class="error-msg">Kamera-Zugriff fehlgeschlagen: ' + h(err.message) + '</div>';
                viewport.style.display = 'none';
                scanBtn.textContent = 'Kamera starten';
                cameraActive = false;
            });
        }

        function stopAllScans() {
            BfarmCamera.stopCamera();
            BfarmCamera.stopBarcodeScanner();
            var viewport = document.getElementById('cameraViewport');
            if (viewport) viewport.style.display = 'none';
            var scannerDiv = document.getElementById('barcodeScanner');
            if (scannerDiv) scannerDiv.style.display = 'none';
            if (scanBtn) scanBtn.textContent = 'Kamera starten';
            cameraActive = false;
        }

        // ─── Medikamentenpass scannen ───────────────────
        function startMedpassScan() {
            var scannerDiv = document.getElementById('barcodeScanner');
            scannerDiv.style.display = '';
            scanBtn.textContent = 'Scanner stoppen';
            cameraActive = true;
            BfarmCamera.startBarcodeScanner('barcodeScanner', function (raw, decodedText) {
                BfarmCamera.stopBarcodeScanner();
                scannerDiv.style.display = 'none';
                scanBtn.textContent = 'Kamera starten';
                cameraActive = false;

                // Versuche QR-JSON zu parsen
                var data = null;
                try { data = JSON.parse(decodedText); } catch (e) {}
                if (!data || !data.v) {
                    resultDiv.innerHTML = '<div class="error-msg">Kein g\u00fcltiger Medikamentenpass-QR erkannt.<br>Inhalt: ' + h(decodedText.substring(0, 200)) + '</div>';
                    return;
                }

                // Formularfelder bef\u00fcllen
                var imported = importMedpassData(data);
                resultDiv.innerHTML = '<div class="sub-meds-header" style="color:var(--green)">\u2713 Medikamentenpass erfolgreich eingelesen</div>' +
                    '<div style="font-size:13px;color:var(--text-dim);margin-top:8px">' +
                    (imported.name ? '<div>Patient: <strong>' + h(imported.name) + '</strong></div>' : '') +
                    (imported.insurance ? '<div>Versicherung: ' + h(imported.insurance) + '</div>' : '') +
                    '<div><strong>' + imported.medCount + ' Medikament' + (imported.medCount !== 1 ? 'e' : '') + '</strong> zur Liste hinzugef\u00fcgt</div>' +
                    '</div>' +
                    '<div style="margin-top:12px"><button class="btn-primary" id="goToListAfterScan">Zur Medikamentenliste</button></div>';

                var goBtn = document.getElementById('goToListAfterScan');
                if (goBtn) goBtn.addEventListener('click', function () { switchTab('list'); });
            }).catch(function (err) {
                resultDiv.innerHTML = '<div class="error-msg">Kamera-Zugriff fehlgeschlagen: ' + h(err.message) + '</div>';
                cameraActive = false;
            });
        }

        function importMedpassData(data) {
            var result = { name: '', insurance: '', medCount: 0 };

            // Patientendaten ins Formular
            if (data.p) {
                if (data.p.n) {
                    result.name = data.p.n;
                    // Formular befuellen (wird bei Tab-Wechsel zu "list" sichtbar)
                    sessionStorage.setItem('_medpass_name', data.p.n);
                }
                if (data.p.d) sessionStorage.setItem('_medpass_dob', data.p.d);
                if (data.p.i) sessionStorage.setItem('_medpass_insuredNr', data.p.i);
                if (data.p.k) { result.insurance = data.p.k; sessionStorage.setItem('_medpass_insurance', data.p.k); }
            }
            if (data.r) sessionStorage.setItem('_medpass_recipient', data.r);
            if (data.x) sessionStorage.setItem('_medpass_note', data.x);

            // Medikamente zur Liste hinzufuegen
            if (data.m && data.m.length) {
                data.m.forEach(function (m) {
                    // Wirkstoffname per ID nachschlagen
                    var substanceName = '';
                    if (m.s && BfarmDB.isReady()) {
                        try {
                            var sr = BfarmDB.exec("SELECT DISTINCT rse_substance_name FROM substance WHERE rse_substance_id = '" + (m.s || '').replace(/'/g,"''") + "' LIMIT 1");
                            if (sr.length && sr[0].values.length) substanceName = sr[0].values[0][0];
                        } catch (e) {}
                    }
                    BfarmMedList.add({
                        name: m.n || '',
                        pzn: m.z || '',
                        substance: substanceName,
                        substanceId: m.s || '',
                        strength: m.q || '',
                        form: ''
                    });
                });
                result.medCount = data.m.length;
            }

            return result;
        }
    }

    function wireAddButtons(container) {
        container.querySelectorAll('.add-to-list-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                BfarmMedList.add({ name: this.dataset.name, pzn: this.dataset.pzn });
                this.textContent = '✓';
                this.classList.add('added');
            });
        });
    }

    function renderCameraResults(parsed, rawText, container) {
        if (!parsed.length) {
            container.innerHTML = '<div class="error-msg">Kein Text erkannt. Versuche ein schaerferes Bild.</div>';
            return;
        }
        var html = '<div class="sub-meds-header">Erkannte Eintraege:</div>';
        var pzns = parsed.filter(function (p) { return p.type === 'pzn'; });
        var texts = parsed.filter(function (p) { return p.type === 'text'; });

        pzns.forEach(function (p) {
            var result = BfarmSearch.searchPZN(p.value);
            if (result.length) {
                html += '<div class="sub-med-item">' +
                    '<button class="add-to-list-btn" data-name="' + h(result[0].name) + '" data-pzn="' + h(p.value) + '">+</button>' +
                    '<span class="pzn-badge">PZN ' + h(p.value) + '</span> ' +
                    '<span class="sub-med-name">' + h(result[0].name) + '</span></div>';
            } else {
                html += '<div class="sub-med-item"><span class="pzn-badge">PZN ' + h(p.value) + '</span> nicht gefunden</div>';
            }
        });

        texts.slice(0, 10).forEach(function (p) {
            var check = null;
            if (BfarmDB.isReady() && typeof BfarmScoring !== 'undefined') {
                // Try as medication first
                var meds = BfarmSearch.searchMedication(p.value);
                if (meds.length && meds[0].totalScore > 0.5) {
                    check = meds[0];
                }
            }
            html += '<div class="sub-med-item">';
            if (check) {
                html += '<button class="add-to-list-btn" data-name="' + h(check.name) + '" data-pzn="' + h(check.pzn || '') + '">+</button>' +
                    '<span class="sub-med-name">' + h(p.value) + ' &#8594; ' + h(check.name) + '</span>';
            } else {
                html += '<span style="color:var(--text-muted)">' + h(p.value) + '</span>';
            }
            html += '</div>';
        });

        container.innerHTML = html;

        // Wire up add buttons
        container.querySelectorAll('.add-to-list-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                BfarmMedList.add({ name: this.dataset.name, pzn: this.dataset.pzn });
                this.textContent = '✓';
                this.classList.add('added');
            });
        });
    }

    // ─── SQL Editor ─────────────────────────────────────

    function toggleSQL() {
        document.getElementById('sqlEditor').classList.toggle('visible');
    }

    function runSQL() {
        var sql = document.getElementById('sqlInput').value.trim();
        var out = document.getElementById('sqlResults');
        if (!sql || !BfarmDB.isReady()) return;
        try {
            var results = BfarmDB.exec(sql);
            if (!results.length) {
                out.innerHTML = '<div class="error-msg" style="border-color:var(--border);color:var(--text-dim)">Keine Ergebnisse</div>';
                return;
            }
            var r = results[0];
            var thtml = '<table class="sql-results"><thead><tr>' +
                r.columns.map(function (c) { return '<th>' + h(c) + '</th>'; }).join('') +
                '</tr></thead><tbody>';
            var limit = Math.min(r.values.length, 200);
            for (var i = 0; i < limit; i++) {
                thtml += '<tr>' + r.values[i].map(function (v) {
                    var s = h(String(v != null ? v : ''));
                    return '<td title="' + s + '">' + s + '</td>';
                }).join('') + '</tr>';
            }
            thtml += '</tbody></table>';
            if (r.values.length > 200) {
                thtml += '<div class="hint" style="margin-top:8px">Zeige 200 von ' + r.values.length + ' Zeilen</div>';
            }
            out.innerHTML = thtml;
        } catch (e) {
            out.innerHTML = '<div class="error-msg">' + h(e.message) + '</div>';
        }
    }

    // ─── Geburtsdatum Parsing & Validierung ────────────

    var MONATSNAMEN = {
        'JANUAR':1,'FEBRUAR':2,'MAERZ':3,'MÄRZ':3,'APRIL':4,'MAI':5,'JUNI':6,
        'JULI':7,'AUGUST':8,'SEPTEMBER':9,'OKTOBER':10,'NOVEMBER':11,'DEZEMBER':12,
        'JAN':1,'FEB':2,'MRZ':3,'MAR':3,'APR':4,'JUN':6,'JUL':7,'AUG':8,'SEP':9,'OKT':10,'NOV':11,'DEZ':12
    };

    function parseDateInput(raw) {
        if (!raw) return '';
        raw = raw.trim().toUpperCase();

        var day, month, year;

        // Pattern: "13.08.1983" or "13.08.83" or "13/08/1983"
        var m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
        if (m) {
            day = parseInt(m[1]); month = parseInt(m[2]); year = parseInt(m[3]);
        }

        // Pattern: "13. AUGUST 1983" or "13 AUGUST 89" or "DREIZEHNTER AUGUST 83"
        if (!m) {
            var m2 = raw.match(/^(\d{1,2})\.?\s+([A-ZÄÖÜ]+)\s+(\d{2,4})$/);
            if (m2) {
                day = parseInt(m2[1]);
                month = MONATSNAMEN[m2[2]] || 0;
                year = parseInt(m2[3]);
            }
        }

        // Pattern: "13 08 83" or "13 08 1983" (space-separated, common in speech)
        if (!m && !day) {
            var m3 = raw.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$/);
            if (m3) {
                day = parseInt(m3[1]); month = parseInt(m3[2]); year = parseInt(m3[3]);
            }
        }

        if (!day || !month || !year) return raw; // Can't parse, return as-is

        // Fix 2-digit year
        if (year < 100) {
            year += year <= 30 ? 2000 : 1900; // 83 → 1983, 05 → 2005
        }

        // Validate ranges
        if (year < 1900 || year > new Date().getFullYear()) return raw;
        if (month < 1 || month > 12) return raw;
        if (day < 1 || day > 31) return raw;

        // Validate date exists
        var testDate = new Date(year, month - 1, day);
        if (testDate.getDate() !== day || testDate.getMonth() !== month - 1 || testDate.getFullYear() !== year) {
            return raw; // Invalid date (e.g. 31.02)
        }

        // Must not be in the future
        if (testDate > new Date()) return raw;

        // Format as dd.mm.yyyy
        return String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year;
    }

    // ─── KVNR-Validierung ─────────────────────────────

    function validateKVNR(kvnr) {
        // Format: 1 Grossbuchstabe + 9 Ziffern (= 10 Zeichen)
        // Letzte Ziffer ist Pruefsumme (Modulo 10, abwechselnd Gewicht 1 und 2)
        if (!kvnr) return { valid: false, error: '' };
        kvnr = kvnr.toUpperCase().replace(/\s/g, '');
        if (kvnr.length !== 10) return { valid: false, error: 'KVNR muss 10 Zeichen lang sein (1 Buchstabe + 9 Ziffern)' };
        if (!/^[A-Z]\d{9}$/.test(kvnr)) return { valid: false, error: 'Format: 1 Buchstabe + 9 Ziffern (z.B. A123456789)' };

        // Pruefsumme: Buchstabe wird durch zweistellige Nummer ersetzt (A=01..Z=26)
        var letterNum = (kvnr.charCodeAt(0) - 64); // A=1, B=2, ...
        var digits = String(letterNum).padStart(2, '0') + kvnr.substring(1, 9); // 10 Ziffern ohne Pruefsumme
        var checkDigit = parseInt(kvnr[9]);

        // Alternierende Quersumme (Gewichte 1, 2, 1, 2, ...)
        var sum = 0;
        for (var i = 0; i < digits.length; i++) {
            var d = parseInt(digits[i]);
            var weighted = d * (i % 2 === 0 ? 1 : 2);
            sum += weighted > 9 ? Math.floor(weighted / 10) + (weighted % 10) : weighted;
        }
        var expected = (10 - (sum % 10)) % 10;

        if (checkDigit !== expected) {
            return { valid: false, error: 'Pr\u00fcfsumme ung\u00fcltig (erwartet: ' + expected + ')' };
        }
        return { valid: true, error: '' };
    }

    // ─── E-Mail-Validierung ────────────────────────────

    function validateEmail(email) {
        if (!email) return { valid: false, error: '' };
        email = email.trim();
        // RFC 5322 simplified
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            return { valid: false, error: 'Ung\u00fcltiges E-Mail-Format (z.B. name@beispiel.de)' };
        }
        return { valid: true, error: '' };
    }

    // ─── Telefon-Validierung (Deutschland) ───────────────

    var DE_MOBILE_PREFIXES = ['150','151','152','155','157','159','160','162','163','170','171','172','173','174','175','176','177','178','179'];
    var DE_FESTNETZ_PREFIXES = ['030','040','069','089','0201','0211','0221','0228','0231','0241','0251','0261','0271','0281','0291','0341','0351','0361','0371','0381','0391','0395','0421','0431','0441','0451','0461','0471','0481','0511','0521','0531','0541','0551','0561','0571','0581','0591','0611','0621','0631','0641','0651','0661','0671','0681','0711','0721','0731','0741','0751','0761','0771','0781','0791','0811','0821','0831','0841','0851','0861','0871','0881','0891','0901','0911','0921','0931','0941','0951','0961','0971','0981','0991'];

    function validatePhone(phone) {
        if (!phone) return { valid: false, error: '' };
        // Normalisieren: Leerzeichen, Klammern, Bindestriche entfernen
        var raw = phone.trim();
        var clean = raw.replace(/[\s\-\(\)\/]/g, '');
        // +49 → 0
        if (clean.startsWith('+49')) clean = '0' + clean.substring(3);
        if (clean.startsWith('0049')) clean = '0' + clean.substring(4);

        // Muss mit 0 anfangen und nur Ziffern enthalten
        if (!/^0\d+$/.test(clean)) {
            return { valid: false, error: 'Muss mit 0 oder +49 beginnen und nur Ziffern enthalten' };
        }

        // L\u00e4nge pr\u00fcfen (Gesamtl\u00e4nge 10-13 Ziffern inkl. Vorwahl)
        if (clean.length < 10 || clean.length > 13) {
            return { valid: false, error: 'L\u00e4nge ung\u00fcltig (' + clean.length + ' Ziffern, erwartet: 10-13)' };
        }

        // Mobilnetz pr\u00fcfen
        var prefix3 = clean.substring(1, 4); // z.B. "170" aus "0170..."
        if (DE_MOBILE_PREFIXES.indexOf(prefix3) >= 0) {
            if (clean.length < 11 || clean.length > 12) {
                return { valid: false, error: 'Mobilnummer: ' + clean.length + ' Ziffern (erwartet: 11-12)' };
            }
            return { valid: true, error: '', type: 'mobil', prefix: '0' + prefix3 };
        }

        // Festnetz: Vorwahl 2-5 Ziffern nach der 0
        var isFestnetz = false;
        for (var fi = 0; fi < DE_FESTNETZ_PREFIXES.length; fi++) {
            if (clean.startsWith(DE_FESTNETZ_PREFIXES[fi])) { isFestnetz = true; break; }
        }
        if (isFestnetz || /^0\d{2,5}/.test(clean)) {
            return { valid: true, error: '', type: 'festnetz' };
        }

        // Sondernummern (0800, 0900, etc.)
        if (/^0[89]00/.test(clean)) {
            return { valid: true, error: '', type: 'sonder' };
        }

        return { valid: true, error: '', type: 'unbekannt' };
    }

    // ─── Session Security ───────────────────────────────

    function clearAllData() {
        // 1. sessionStorage (Medikamentenliste, Disclaimer, etc.)
        sessionStorage.clear();
        // 2. localStorage (Sicherheitshalber, falls Altdaten)
        try { localStorage.clear(); } catch (e) {}
        // 3. Cache API
        if (window.caches) {
            caches.keys().then(function (names) {
                names.forEach(function (name) { caches.delete(name); });
            });
        }
        // 4. SQL-Datenbank aus RAM loeschen (close + null)
        if (typeof BfarmDB !== 'undefined' && BfarmDB.destroy) {
            try { BfarmDB.destroy(); } catch (e) {}
        }
        // 6. IndexedDB loeschen (falls vorhanden, z.B. von Tesseract)
        if (window.indexedDB) {
            try {
                indexedDB.databases().then(function (dbs) {
                    dbs.forEach(function (db) { indexedDB.deleteDatabase(db.name); });
                });
            } catch (e) {}
        }
    }

    // c) Browser-Reload = Sitzung beenden (beforeunload)
    window.addEventListener('beforeunload', function () {
        clearAllData();
    });

    // d) Inaktivitaets-Timer: 5 Minuten
    var INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 Minuten
    var inactivityTimer = null;

    function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(function () {
            clearAllData();
            // Zeige Hinweis und lade neu
            document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;' +
                'height:100vh;background:#0c0f14;color:#e4e8f1;font-family:sans-serif;text-align:center;padding:20px">' +
                '<div><h2 style="margin-bottom:12px">Sitzung abgelaufen</h2>' +
                '<p style="color:#7a839a;margin-bottom:20px">Aus Sicherheitsgruenden wurden alle lokalen Daten nach 5 Minuten Inaktivitaet geloescht.</p>' +
                '<button onclick="location.reload()" style="background:#4a7cff;color:#fff;border:none;' +
                'padding:12px 24px;border-radius:8px;font-size:16px;cursor:pointer">Neu starten</button></div></div>';
        }, INACTIVITY_TIMEOUT);
    }

    // Aktivitaet tracken
    ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(function (evt) {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();

    // ─── Init ───────────────────────────────────────────

    function initApp() {
        showDisclaimerIfNeeded();

        var progress = document.getElementById('loadingProgress');

        BfarmDB.init(function (msg) {
            progress.textContent = msg;
        }).then(function () {
            showStats();
            showDataDate();
            // Lieferengp\u00e4sse aus der DB laden
            if (typeof BfarmShortage !== 'undefined') {
                BfarmShortage.loadShortages().then(function () {
                    var cnt = BfarmShortage.getCount();
                    var info = document.getElementById('dataDateInfo');
                    if (info) {
                        if (cnt > 0) {
                            // Datum der letzten Meldung aus DB holen
                            var datumStand = '';
                            try {
                                var dr = BfarmDB.exec("SELECT datum_letzte_meldung FROM lieferengpass ORDER BY substr(datum_letzte_meldung,7,4)||substr(datum_letzte_meldung,4,2)||substr(datum_letzte_meldung,1,2) DESC LIMIT 1");
                                if (dr.length && dr[0].values.length) datumStand = dr[0].values[0][0] || '';
                            } catch (e) {}
                            info.textContent += ' \u00b7 Lieferengp\u00e4sse: ' + cnt +
                                (datumStand ? ' (Stand: ' + datumStand + ', PharmNet.Bund)' : ' (PharmNet.Bund)');
                        } else {
                            info.textContent += ' \u00b7 Lieferengp\u00e4sse: keine Daten in DB';
                        }
                    }
                    updateShortageBadge();
                });
            }

            // Shortage filter chips
            document.querySelectorAll('.filter-chip').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    currentShortageFilter = this.dataset.filter;
                    document.querySelectorAll('.filter-chip').forEach(function (c) {
                        c.classList.toggle('active', c.dataset.filter === currentShortageFilter);
                    });
                    var searchVal = (document.getElementById('shortageSearch') || {}).value || '';
                    renderShortagePanel(searchVal);
                });
            });

            // Shortage search filter
            var shortageSearch = document.getElementById('shortageSearch');
            if (shortageSearch) {
                var shortageTimeout = null;
                shortageSearch.addEventListener('input', function () {
                    clearTimeout(shortageTimeout);
                    var val = this.value;
                    shortageTimeout = setTimeout(function () { renderShortagePanel(val); }, 300);
                });
            }
            document.getElementById('loadingScreen').classList.add('hidden');
            document.getElementById('searchInput').focus();
            updateListBadge();
        }).catch(function (e) {
            progress.textContent = 'Fehler: ' + e.message;
            progress.style.color = 'var(--red)';
        });

        // Search events
        var searchInput = document.getElementById('searchInput');
        var clearSearchBtn = document.getElementById('clearSearchBtn');
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(doSearch, 300);
            if (clearSearchBtn) clearSearchBtn.style.display = this.value ? '' : 'none';
        });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { clearTimeout(searchTimeout); doSearch(); }
        });
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function () {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                document.getElementById('emptyState').style.display = '';
                document.getElementById('resultsContainer').style.display = 'none';
                searchInput.focus();
            });
        }

        // SQL editor
        var sqlInput = document.getElementById('sqlInput');
        if (sqlInput) {
            sqlInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runSQL();
            });
        }

        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { setMode(this.dataset.mode); });
        });

        // Tab buttons
        document.querySelectorAll('.main-tab').forEach(function (btn) {
            btn.addEventListener('click', function () { switchTab(this.dataset.tab); });
        });

        // SQL toggle + run
        var sqlToggle = document.querySelector('.sql-toggle');
        if (sqlToggle) sqlToggle.addEventListener('click', toggleSQL);
        var sqlRun = document.querySelector('.sql-run');
        if (sqlRun) sqlRun.addEventListener('click', runSQL);

        // Disclaimer accept
        var disclaimerBtn = document.getElementById('disclaimerAccept');
        if (disclaimerBtn) disclaimerBtn.addEventListener('click', acceptDisclaimer);

        // Voice
        if (BfarmVoice.isSupported()) {
            var voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) {
                voiceBtn.style.display = '';
                BfarmVoice.setButton(voiceBtn);
                BfarmVoice.init(searchInput, function () { doSearch(); });
                voiceBtn.addEventListener('click', function () { BfarmVoice.toggle(); });
            }
        }

        // Camera
        initCameraPanel();

        // Med list badge
        BfarmMedList.onChange(function () {
            updateListBadge();
            if (currentTab === 'list') renderMedListPanel();
        });

        // End session — clear all personal data
        var endBtn = document.getElementById('endSessionBtn');
        if (endBtn) {
            endBtn.addEventListener('click', function () {
                if (!confirm('Alle persoenlichen Daten loeschen?\n\n' +
                    'Dies entfernt:\n' +
                    '- Medikamentenliste\n' +
                    '- Disclaimer-Akzeptanz\n' +
                    '- Alle gespeicherten Einstellungen\n\n' +
                    'Die Seite wird anschliessend neu geladen.')) return;
                clearAllData();
                window.location.reload();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
