// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Farm Input Utilization Analysis"] = {
    "filters": [
        {
            "fieldname": "farm_input",
            "label": __("Specify Farm Input"),
            "fieldtype": "Link",
            "options": "Farm Inputs"
        },
        {
            "fieldname": "timeline",
            "label": __("Specify Timeline"),
            "fieldtype": "Select",
            "options": "\nThis Week\nLast Fortnight\nThis Month\nThis Quarter\nThis Year",
            "default": "This Month",
            "reqd": 1
        }
    ]
};