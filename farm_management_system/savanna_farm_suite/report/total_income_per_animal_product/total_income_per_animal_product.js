// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Total Income per Animal Product"] = {
    "filters": [
        {
            fieldname: "period",
            label: __("Period"),
            fieldtype: "Select",
            options: ["Today", "This Week", "This Fortnight", "This Month", "Custom Range"],
            default: "This Month",
            onchange: function() {
                set_date_range_from_period(this.get_value());
            }
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            depends_on: "eval:doc.period == 'Custom Range'"
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            depends_on: "eval:doc.period == 'Custom Range'"
        }
    ],

    onload: function(report) {
        // ensure default date-range is set on load
        var period_filter = report.get_filter('period');
        var period = period_filter ? period_filter.get_value() : "This Month";
        set_date_range_from_period(period);
    }
};

/* ---------- helper to compute & set dates ---------- */
function set_date_range_from_period(period) {
    var today, from;
    if (typeof moment !== 'undefined') {
        today = moment().format('YYYY-MM-DD');
        if (period === "Today") {
            from = today;
        } else if (period === "This Week") {
            from = moment().startOf('week').format('YYYY-MM-DD');
        } else if (period === "This Fortnight") {
            from = moment().subtract(13, 'days').format('YYYY-MM-DD');
        } else if (period === "This Month") {
            from = moment().startOf('month').format('YYYY-MM-DD');
        } else {
            // custom range - don't force dates
            return;
        }
    } else {
        var d = new Date();
        today = d.toISOString().slice(0,10);
        if (period === "Today") {
            from = today;
        } else if (period === "This Week") {
            var day = d.getDay();
            var start = new Date(d);
            start.setDate(d.getDate() - day);
            from = start.toISOString().slice(0,10);
        } else if (period === "This Fortnight") {
            var start = new Date(d);
            start.setDate(d.getDate() - 13);
            from = start.toISOString().slice(0,10);
        } else if (period === "This Month") {
            var first = new Date(d.getFullYear(), d.getMonth(), 1);
            from = first.toISOString().slice(0,10);
        } else {
            return;
        }
    }

    frappe.query_report.set_filter_value('from_date', from);
    frappe.query_report.set_filter_value('to_date', today);
    // refresh report
    frappe.query_report.refresh();
}

