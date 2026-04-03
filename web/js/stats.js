/*  BfArM Referenzdaten — Statistiken  */

var BfarmStats = (function () {
    'use strict';

    function topSubstances(limit) {
        limit = limit || 20;
        var r = BfarmDB.exec(
            'SELECT rse_substance_name AS name, COUNT(DISTINCT rpp_key) AS cnt ' +
            'FROM substance GROUP BY rse_substance_name ORDER BY cnt DESC LIMIT ' + limit
        );
        return r.length ? r[0].values.map(function (row) { return { name: row[0], count: row[1] }; }) : [];
    }

    function topForms(limit) {
        limit = limit || 20;
        var r = BfarmDB.exec(
            'SELECT rmp_pfm_put_long AS form, COUNT(*) AS cnt ' +
            'FROM medicinal_product WHERE rmp_pfm_put_long IS NOT NULL ' +
            'GROUP BY rmp_pfm_put_long ORDER BY cnt DESC LIMIT ' + limit
        );
        return r.length ? r[0].values.map(function (row) { return { name: row[0], count: row[1] }; }) : [];
    }

    function substanceCountDistribution() {
        var r = BfarmDB.exec(
            'SELECT rmp_count_substance AS cnt, COUNT(*) AS num ' +
            'FROM medicinal_product GROUP BY rmp_count_substance ORDER BY cnt'
        );
        return r.length ? r[0].values.map(function (row) { return { substances: row[0], count: row[1] }; }) : [];
    }

    function overview() {
        var r = BfarmDB.exec(
            'SELECT ' +
            '(SELECT COUNT(*) FROM medicinal_product) AS meds, ' +
            '(SELECT COUNT(*) FROM pharmaceutical_product) AS pharma, ' +
            '(SELECT COUNT(DISTINCT rse_substance_name) FROM substance) AS subs, ' +
            '(SELECT COUNT(DISTINCT rmp_pfm_put_long) FROM medicinal_product) AS forms'
        );
        if (!r.length) return {};
        var v = r[0].values[0];
        return { medications: v[0], pharmaProducts: v[1], substances: v[2], dosageForms: v[3] };
    }

    function sankeyData() {
        // Top 10 forms → top 10 substances → medication count
        var r = BfarmDB.exec(
            'SELECT mp.rmp_pfm_put_long AS form, s.rse_substance_name AS sub, COUNT(*) AS cnt ' +
            'FROM medicinal_product mp ' +
            'JOIN pharmaceutical_product pp ON mp.rmp_key = pp.rmp_key ' +
            'JOIN substance s ON pp.rpp_key = s.rpp_key ' +
            'WHERE mp.rmp_pfm_put_long IN (' +
            '  SELECT rmp_pfm_put_long FROM medicinal_product GROUP BY rmp_pfm_put_long ORDER BY COUNT(*) DESC LIMIT 8' +
            ') AND s.rse_substance_name IN (' +
            '  SELECT rse_substance_name FROM substance GROUP BY rse_substance_name ORDER BY COUNT(*) DESC LIMIT 10' +
            ') GROUP BY form, sub ORDER BY cnt DESC LIMIT 60'
        );
        return r.length ? r[0].values.map(function (row) {
            return { source: row[0], target: row[1], value: row[2] };
        }) : [];
    }

    function renderBarChart(containerId, data, maxBars) {
        maxBars = maxBars || 20;
        var el = document.getElementById(containerId);
        if (!el || !data.length) return;
        var max = data[0].count;
        var html = '';
        for (var i = 0; i < Math.min(data.length, maxBars); i++) {
            var pct = Math.round((data[i].count / max) * 100);
            html += '<div class="stat-bar-row">' +
                '<span class="stat-bar-label" title="' + data[i].name + '">' + data[i].name + '</span>' +
                '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="stat-bar-value">' + data[i].count.toLocaleString('de-DE') + '</span>' +
                '</div>';
        }
        el.innerHTML = html;
    }

    return {
        topSubstances: topSubstances,
        topForms: topForms,
        substanceCountDistribution: substanceCountDistribution,
        overview: overview,
        sankeyData: sankeyData,
        renderBarChart: renderBarChart
    };
})();
