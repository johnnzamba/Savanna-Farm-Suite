// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Crop Batch Count"] = {
    "filters": [
        {
            "fieldname": "timeline",
            "label": __("Specify Timeline"),
            "fieldtype": "Select",
            "options": "\nThis Week\nLast Fortnight\nThis Month\nThis Quarter\nThis Year",
            "default": "This Month",
            "reqd": 1
        },
        {
            "fieldname": "crop_being_planted",
            "label": __("Type of Seedling"),
            "fieldtype": "Link",
            "options": "Crop Seedlings"
        },
        {
            "fieldname": "plot_on_which_planting_is_done",
            "label": __("Plot of Land"),
            "fieldtype": "Link",
            "options": "Farm Plots"
        }
    ],

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        if (['current_seedling_count', 'quantity_of_seedlings_used', 'stock_after'].includes(column.fieldname)) {
            return "<b>" + value + "</b>";
        }
        return value;
    }
};