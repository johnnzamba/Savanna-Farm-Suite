// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Total Feed Expenses"] = {
    "filters": [
        {
            "fieldname": "period",
            "label": __("Period"),
            "fieldtype": "Select",
            "options": [
                "Today",
                "This Week",
                "This Fortnight",
                "This Month",
                "Custom Range"
            ],
            "default": "This Month"
        },
        {
            "fieldname": "from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            // shown only when Custom Range is selected
            "depends_on": "eval:doc.period == 'Custom Range'"
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "depends_on": "eval:doc.period == 'Custom Range'"
        }
    ],

    // onload: function (report) {
    //     // create chart container once at top of page
    //     if (!report.page.wrapper.find(".feed-expenses-chart").length) {
    //         report.page.wrapper.prepend('<div class="feed-expenses-chart" style="height:380px;margin-bottom:18px"></div>');
    //     }

    //     // set default From/To for "This Month"
    //     const set_month_defaults = () => {
    //         const today = new Date();
    //         const first = new Date(today.getFullYear(), today.getMonth(), 1);
    //         // format YYYY-MM-DD
    //         const fmt = d => d.toISOString().slice(0, 10);
    //         report.set_filter_value("from_date", fmt(first));
    //         report.set_filter_value("to_date", fmt(today));
    //     };

    //     // apply defaults on load (if not custom range)
    //     const period = report.get_values() && report.get_values().period;
    //     if (!period || period === "This Month") {
    //         set_month_defaults();
    //     }

    //     // watch for period change: if user picks pre-defined period, clear custom from/to
    //     report.page.wrapper.on("change", "select[data-fieldname='period']", function () {
    //         const val = $(this).val();
    //         if (val !== "Custom Range") {
    //             set_month_defaults();
    //             // hide date pickers are controlled by depends_on, but ensure values set
    //         } else {
    //             report.set_filter_value("from_date", null);
    //             report.set_filter_value("to_date", null);
    //         }
    //         // refresh to redraw
    //         report.refresh();
    //     });
    // },

    // refresh: function (report) {
    //     // default Frappe behavior will call server execute to fill the table
    //     // additionally call the chart endpoint and render chart
    //     const filters = report.get_values() || {};

    //     frappe.call({
    //         method: "farm_management_system.report.total_feed_expenses.total_feed_expenses.get_chart_data",
    //         args: { filters: filters },
    //         freeze: true,
    //         callback: function (r) {
    //             if (!r.message) {
    //                 report.page.wrapper.find(".feed-expenses-chart").empty();
    //                 return;
    //             }
    //             const chart_data = r.message;

    //             // create chart (frappe.Chart)
    //             const container = report.page.wrapper.find(".feed-expenses-chart")[0];
    //             $(container).empty();

    //             // If there is no data, show a friendly message
    //             if (!chart_data.labels.length || !chart_data.datasets.length) {
    //                 $(container).html("<div style='padding:18px;color:#666'>No data to display for the selected period.</div>");
    //                 return;
    //             }

    //             // Use frappe.Chart (Frappe / Chartist wrapper) to draw a line chart.
    //             // Each dataset.name is the animal_feed_name -> will appear on hover
    //             new frappe.Chart(container, {
    //                 title: __("Total Feed Expenses"),
    //                 data: {
    //                     labels: chart_data.labels,
    //                     datasets: chart_data.datasets
    //                 },
    //                 type: 'line',
    //                 height: 380,
    //                 is_animated: true,
    //                 format_tooltip_x: function (d) { return d; } // show date as-is
    //             });
    //         }
    //     });
    // },

    // Make total_cost bold in the table output
    "formatter": function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (column.fieldname === "total_cost") {
            return "<b>" + value + "</b>";
        }
        return value;
    }
};
