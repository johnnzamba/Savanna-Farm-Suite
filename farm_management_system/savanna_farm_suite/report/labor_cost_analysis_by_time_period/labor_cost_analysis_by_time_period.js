// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Labor Cost Analysis by Time Period"] = {
    "filters": [
        {
            "fieldname": "employee",
            "label": __("Specify Staff Member"),
            "fieldtype": "Link",
            "options": "Employee",
            "reqd": 0
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