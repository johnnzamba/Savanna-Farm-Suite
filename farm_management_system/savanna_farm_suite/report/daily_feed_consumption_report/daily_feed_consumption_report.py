# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# daily_feed_consumption_report.py
# Server-side for "Daily Feed Consumption Report"

from __future__ import unicode_literals
import frappe
from frappe.utils import today

def execute(filters=None):
    """
    Returns (columns, data) for Daily Feed Consumption Report.

    Expected filters:
      - date_of_nourishment (Date) [required]
      - animal_feed (Link to 'Animal Feed') [optional]
      - user (Link to 'User') [optional]
    """
    filters = filters or {}

    # required date filter (fallback to today if not provided)
    selected_date = filters.get("date_of_nourishment") or today()

    # Build where/filter dict for frappe.get_all
    where_filters = {
        "date_of_nourishment": selected_date
    }

    # Optional filters
    if filters.get("animal_feed"):
        # Assumes Nourishment Log has field 'animal_feed' (Link to 'Animal Feed')
        where_filters["feed_issued"] = filters.get("animal_feed")

    if filters.get("user"):
        where_filters["user"] = filters.get("user")

    # Columns: label, fieldname, fieldtype, width
    columns = [
        {"label": "Date of Nourishment", "fieldname": "date_of_nourishment", "fieldtype": "Date", "width": 120},
        {"label": "Poultry Batch", "fieldname": "poultry_batch", "fieldtype": "Data", "width": 150},
        # {"label": "Log for Poultry Shed", "fieldname": "log_for_poultry_shed", "fieldtype": "Check", "width": 120},
        {"label": "Log intended for Cattle Shed", "fieldname": "log_intended_for_cattle_shed", "fieldtype": "Link","options": "Cattle Shed" , "width": 180},
        {"label": "Feed Issued", "fieldname": "feed_issued", "fieldtype": "Data", "width": 140},
        {"label": "Animal Feed Name", "fieldname": "animal_feed_name", "fieldtype": "Data", "width": 160},
        {"label": "Default UOM", "fieldname": "default_uom", "fieldtype": "Data", "width": 90},
        {"label": "Qty Issued", "fieldname": "qty_issued", "fieldtype": "Float", "width": 110},
        {"label": "Avg Consumption", "fieldname": "avg_consumption", "fieldtype": "Float", "width": 120},
        {"label": "User", "fieldname": "user", "fieldtype": "Data", "width": 120},
        {"label": "Hydration Confirmed", "fieldname": "hydration_was_confirmed", "fieldtype": "Check", "width": 140},
        {"label": "Water Consumed", "fieldname": "water_consumed", "fieldtype": "Float", "width": 120},
    ]

    # Fields to fetch from the doctype
    fetch_fields = [
        "date_of_nourishment",
        "poultry_batch",
        "log_for_poultry_shed",
        "log_intended_for_cattle_shed",
        "feed_issued",
        "animal_feed_name",
        "default_uom",
        "qty_issued",
        "avg_consumption",
        "user",
        "hydration_was_confirmed",
        "water_consumed",
    ]

    # Query Nourishment Log (change the doctype name here if different)
    data = frappe.get_all(
        "Nourishment Log",
        filters=where_filters,
        fields=fetch_fields,
        order_by="poultry_batch asc, date_of_nourishment asc"
    )

    # If you prefer to return rows as lists rather than dicts (older reports), transform here.
    # But returning list of dicts is fine for modern query reports.
    return columns, data
