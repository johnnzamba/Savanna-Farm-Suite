// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Daily Feed Consumption Report"] = {
    "filters": [
        {
            "fieldname": "date_of_nourishment",
            "label": __("Choose a Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        },
        {
            "fieldname": "animal_feed",
            "label": __("Specify Animal Feed"),
            "fieldtype": "Link",
            "options": "Animal Feeds"
        },
        {
            "fieldname": "user",
            "label": __("Specify User"),
            "fieldtype": "Link",
            "options": "User"
        }
    ],

    onload: function(report) {
        // robust insertion of chart container (try several selectors)
        if (!$("#daily-feed-consumption-chart").length) {
            const $chart_wrap = $("<div id='daily-feed-consumption-chart' style='width:100%;height:380px;margin-bottom:18px;'></div>");
            let $insertBefore = $(".report-grid:visible, .report-body:visible, .page-content:visible, .layout-main:visible").first();
            if ($insertBefore && $insertBefore.length) {
                $insertBefore.before($chart_wrap);
            } else {
                // fallback to top of body
                $("body").prepend($chart_wrap);
            }
        }

        this.report_page = report;
        // initial render
        this.render_dashboard_chart(report);
    },

    refresh: function(report) {
        // re-render on refresh so chart responds to filter changes
        this.render_dashboard_chart(report);
    },

    render_dashboard_chart: function(report) {
        const me = this;
        const chart_name = "Daily Feed Consumption Chart-1";
        const $chart = $("#daily-feed-consumption-chart");
        $chart.empty().append("<div style='padding:16px;color:#777'>Loading chart...</div>");

        // Use frappe.client.get (via frappe.call) to fetch whole doc (avoids permitted-field error)
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Dashboard Chart",
                name: chart_name
            }
        }).then(r => {
            if (!r || !r.message) {
                $chart.html("<div style='padding:16px;color:#a00'>Dashboard Chart not found or inaccessible (check permissions).</div>");
                console.error("Dashboard Chart fetch returned empty:", r);
                return;
            }

            const doc = r.message;
            console.info("Dashboard Chart doc:", doc);

            // determine x_field and y_field, with robust parsing
            let x_field = doc.x_field || null;
            let y_field = null;
            let color = null;
            try {
                // parse y_axis (may be array or stringified)
                if (doc.y_axis) {
                    let ya = doc.y_axis;
                    if (typeof ya === "string") {
                        try { ya = JSON.parse(ya); } catch(e) { /* leave as string */ }
                    }
                    if (Array.isArray(ya) && ya.length) {
                        y_field = ya[0].y_field || ya[0].fieldname || ya[0].yField || ya[0].field;
                        color = ya[0].color || null;
                    } else if (typeof ya === "object" && ya.y_field) {
                        y_field = ya.y_field;
                        color = ya.color || null;
                    }
                }

                // fallback to custom_options (stringified JSON sometimes)
                if ((!x_field || !y_field) && doc.custom_options) {
                    const opts = (typeof doc.custom_options === "string") ? JSON.parse(doc.custom_options) : doc.custom_options;
                    x_field = x_field || opts.x_field || opts.xaxis || opts.xField;
                    if (!y_field && opts.y_axis_fields && opts.y_axis_fields.length) {
                        y_field = opts.y_axis_fields[0].y_field || opts.y_axis_fields[0].y_fieldname;
                        color = color || (opts.colors && opts.colors[0]);
                    } else if (!y_field && opts.y_fields && opts.y_fields.length) {
                        y_field = opts.y_fields[0];
                        color = color || (opts.colors && opts.colors[0]);
                    } else if (!y_field && opts.y_axis && opts.y_axis.length) {
                        y_field = opts.y_axis[0].y_field || opts.y_axis[0].fieldname;
                    }
                }
            } catch (err) {
                console.warn("Error parsing chart config:", err, doc.custom_options, doc.y_axis);
            }

            if (!x_field || !y_field) {
                $chart.html("<div style='padding:16px;color:#a00'>Dashboard Chart missing x_field or y_field configuration. Check Dashboard Chart settings.</div>");
                console.error("Missing x_field/y_field:", { x_field, y_field, doc });
                return;
            }

            // Build filters: merge chart.filters_json with report filters (report filters override)
            let chart_filters = {};
            if (doc.filters_json) {
                try { chart_filters = JSON.parse(doc.filters_json); } catch(e) { chart_filters = {}; }
            }

            // Read report filters values (report.get_values preferred)
            let report_filters = {};
            try {
                if (report && typeof report.get_values === "function") {
                    report_filters = report.get_values() || {};
                } else if (me.report_page && typeof me.report_page.get_values === "function") {
                    report_filters = me.report_page.get_values() || {};
                } else {
                    $(".report-filter .filter-field input, .report-filter .filter-field select").each(function () {
                        const $f = $(this);
                        const fn = $f.attr("data-fieldname") || $f.attr("name");
                        if (fn) report_filters[fn] = $f.val();
                    });
                }
            } catch (err) {
                console.warn("Could not read report filters", err);
            }

            const filters = Object.assign({}, chart_filters, report_filters);
            console.info("Using filters for report call:", filters);

            // Call the report with filters
            return frappe.call({
                method: "frappe.desk.query_report.run",
                args: {
                    report_name: doc.report_name || "Daily Feed Consumption Report",
                    filters: filters
                }
            }).then(res => {
                if (!res || !res.message) {
                    $chart.html("<div style='padding:16px;color:#a00'>No data returned from report.</div>");
                    console.error("No response from report call", res);
                    return;
                }

                // res.message may have .result, .data, or be array
                const rows = res.message.result || res.message.data || res.message || [];
                console.info("Report rows:", rows);

                if (!rows || !rows.length) {
                    $chart.html("<div style='padding:16px;color:#777'>No data for selected filters.</div>");
                    return;
                }

                // Aggregate rows by x_field summing y_field (case-insensitive keys)
                const agg = {};
                rows.forEach(rw => {
                    // prefer exact key, then lowercased key
                    const keys = Object.keys(rw || {});
                    const exactX = rw[x_field] !== undefined ? rw[x_field] : rw[x_field.toLowerCase()];
                    const exactY = rw[y_field] !== undefined ? rw[y_field] : rw[y_field.toLowerCase()];

                    const xval = (exactX !== undefined && exactX !== null) ? exactX : (keys.length ? rw[keys[0]] : "[No value]");
                    const yraw = (exactY !== undefined && exactY !== null) ? exactY : 0;
                    const yval = parseFloat(yraw) || 0;
                    const key = (xval === null || xval === undefined) ? "[No value]" : String(xval);
                    agg[key] = (agg[key] || 0) + yval;
                });

                const labels = Object.keys(agg);
                const values = labels.map(l => Math.round((agg[l] + Number.EPSILON) * 100) / 100);

                const chart_data = {
                    labels: labels,
                    datasets: [
                        { name: y_field, values: values }
                    ]
                };

                // Render chart (frappe.Chart)
                $chart.empty();
                try {
                    const colors = color ? [color] : ((doc.colors && doc.colors.length) ? doc.colors : ["#ED6396"]);
                    new frappe.Chart("#daily-feed-consumption-chart", {
                        data: chart_data,
                        type: (doc.type || "bar").toLowerCase(),
                        height: (doc.height || 360),
                        colors: colors,
                        is_series: 0,
                        tooltip_opts: { formatTooltipX: d => d, formatTooltipY: d => d }
                    });
                } catch (errRender) {
                    console.error("Chart render error:", errRender);
                    $chart.html("<div style='padding:12px;color:#a00'>Failed to render chart. See console logs.</div>");
                }
            });
        }).catch(err => {
            console.error("Error fetching Dashboard Chart:", err);
            $chart.html("<div style='padding:16px;color:#a00'>Error loading Dashboard Chart (see console logs).</div>");
        });
    }
};
