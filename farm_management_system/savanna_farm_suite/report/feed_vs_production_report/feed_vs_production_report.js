// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Feed vs Production Report"] = {
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
        }
    ],

    onload: function(report) {
        if (!$("#feed-vs-production-chart-wrap").length) {
            const $wrap = $(
                "<div id='feed-vs-production-chart-wrap' style='width:100%;height:420px;margin-bottom:18px;'>" +
                    "<div id='feed-vs-production-summary' style='padding:12px;'></div>" +
                    "<div id='feed-vs-production-chart' style='width:100%;height:340px;'></div>" +
                "</div>"
            );
            let $insertBefore = $(".report-grid:visible, .report-body:visible, .page-content:visible, .layout-main:visible").first();
            if ($insertBefore && $insertBefore.length) {
                $insertBefore.before($wrap);
            } else {
                $("body").prepend($wrap);
            }
        }

        this.report_page = report;
        this.render_dashboard_chart(report);
    },

    refresh: function(report) {
        this.render_dashboard_chart(report);
    },

    render_dashboard_chart: function(report) {
		const me = this;
		const $chart = $("#feed-vs-production-chart");
		const $summary = $("#feed-vs-production-summary");

		$chart.empty().append("<div style='padding:16px;color:#777'>Loading chart...</div>");
		$summary.empty();

		// read report filters
		let report_filters = {};
		try {
			if (report && typeof report.get_values === "function") {
				report_filters = report.get_values() || {};
			} else if (me.report_page && typeof me.report_page.get_values === "function") {
				report_filters = me.report_page.get_values() || {};
			}
		} catch (err) { console.warn(err); }

		frappe.call({
			method: "frappe.desk.query_report.run",
			args: {
				report_name: "Feed vs Production Report",
				filters: report_filters
			}
		}).then(res => {
			if (!res || !res.message) {
				$chart.html("<div style='padding:16px;color:#a00'>No data returned from report.</div>");
				return;
			}

			// normalize rows and columns
			let raw = res.message;
			if (raw.result) raw = { ...raw, rows: raw.result };
			if (raw.data && !raw.rows) raw = { ...raw, rows: raw.data };

			const rawRows = raw.rows || raw.message || raw || [];
			const rawCols = raw.columns || res.message.columns || [];

			// helper - build column keys from columns list (handles string "Name:Data:120" or dict {label, fieldname})
			function buildColKeys(cols) {
				const keys = [];
				if (!Array.isArray(cols) || !cols.length) return keys;
				cols.forEach(c => {
					if (typeof c === "string") {
						const label = c.split(":")[0].trim();
						const key = label.toLowerCase().replace(/[^\w]+/g, "_");
						keys.push(key);
					} else if (c && typeof c === "object") {
						const label = (c.fieldname || c.label || "").toString().trim();
						const key = label.toLowerCase().replace(/[^\w]+/g, "_");
						keys.push(key);
					} else {
						keys.push(String(c));
					}
				});
				return keys;
			}

			let rows = rawRows;

			// if rows are arrays, convert to objects using columns
			if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
				const keys = buildColKeys(rawCols);
				rows = rows.map(r => {
					const obj = {};
					for (let i = 0; i < r.length; i++) {
						const k = keys[i] || ("col_" + i);
						obj[k] = r[i];
					}
					return obj;
				});
			}

			if (!rows || !rows.length) {
				$chart.html("<div style='padding:16px;color:#777'>No data for selected filters.</div>");
				return;
			}

			// getters
			function getFeedName(row) {
				return row.animal_feed_name || row.feed_item || row.feed_item_code || row.feed_issued || row.display_name || Object.values(row)[0];
			}
			function getFCR(row) {
				const candidates = ["fcr", "FCR", "feed_fcr", "feed_fcr_value"];
				for (let k of candidates) {
					if (row[k] !== undefined && row[k] !== null && row[k] !== "") return parseFloat(row[k]) || 0;
				}
				const vals = Object.values(row).slice(-1);
				if (vals.length && (typeof vals[0] === "number" || !isNaN(parseFloat(vals[0])))) {
					const maybe = parseFloat(vals[0]);
					if (!isNaN(maybe)) return maybe;
				}
				return 0;
			}
			function getFeedQtyAfter(row) {
				return row.feed_qty_after_transaction != null ? row.feed_qty_after_transaction : (row.total_qty_issued != null ? row.total_qty_issued : "");
			}
			function getFeedUOM(row) {
				return row.feed_stock_uom || row.feed_uom || "";
			}
			function getFeedStockValue(row) {
				// check common keys, then try to infer by column names
				return (row.feed_stock_value != null ? row.feed_stock_value :
						(row.feed_stock_val != null ? row.feed_stock_val :
						(row.stock_value != null ? row.stock_value : "")));
			}

			function getProductName(row) {
				return row.product_item_code || row.product_item || row.product_name || "";
			}
			function getProductQtyAfter(row) {
				return row.product_qty_after_transaction != null ? row.product_qty_after_transaction : "";
			}
			function getProductUOM(row) {
				return row.product_stock_uom || row.product_uom || "";
			}
			function getProductStockValue(row) {
				return (row.product_stock_value != null ? row.product_stock_value :
						(row.product_stock_val != null ? row.product_stock_val : ""));
			}

			// separate feed and product rows
			const feedRows = rows.filter(r => {
				const fn = getFeedName(r);
				const hasProduct = (r.product_item_code || r.product_item || r.product_name);
				if (!fn && hasProduct) return false;
				return fn !== undefined && fn !== null && String(fn).trim() !== "";
			});
			const productRows = rows.filter(r => {
				return (r.product_item_code || r.product_item || r.product_name || r.product_qty_after_transaction || r.product_stock_uom);
			});
			// Build chart data
			const labels = [];
			const values = [];
			feedRows.forEach(fr => {
				const name = String(getFeedName(fr));
				const fcrValue = getFCR(fr);
				if (name && name.trim() !== "") {
					labels.push(name);
					values.push(Math.round((fcrValue + Number.EPSILON) * 100) / 100);
				}
			});

			$chart.empty();
			if (!labels.length || values.every(v => v === 0)) {
				$chart.html("<div style='padding:16px;color:#777'>No FCR data to chart for the selected filters.</div>");
				return;
			}

			try {
				const chart_data = { labels: labels, datasets: [{ name: "FCR", values: values }] };
				try { $("#feed-vs-production-chart").data("frappeChart")?.destroy?.(); } catch(e){/*ignore*/}

				new frappe.Chart("#feed-vs-production-chart", {
					data: chart_data,
					type: "bar",
					height: 320,
					is_series: 0,
					tooltip_opts: { formatTooltipX: d => d, formatTooltipY: d => d }
				});
			} catch (err) {
				console.error("Chart render error:", err);
				$chart.html("<div style='padding:12px;color:#a00'>Failed to render chart. See console logs.</div>");
			}
		}).catch(err => {
			console.error("Report call error:", err);
			$chart.html("<div style='padding:16px;color:#a00'>Error loading report (see console logs).</div>");
		});
	}

};
