# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate, nowdate
from datetime import datetime, timedelta

def execute(filters=None):
    filters = filters or {}
    from_date, to_date = _compute_date_range(filters)

    # Aggregate per item_code (Animal Products)
    # posting_datetime: latest posting_date + posting_time within the period
    # total_qty: SUM(actual_qty)
    # total_production_value: SUM(actual_qty * valuation_rate)
    # valuation_rate: weighted average valuation_rate = SUM(actual_qty*valuation_rate)/SUM(actual_qty)
    data = frappe.db.sql("""
        SELECT
            ap.name AS item_code,
            MAX(CONCAT(sle.posting_date, ' ', COALESCE(sle.posting_time, '00:00:00'))) AS posting_datetime,
            COALESCE(SUM(sle.actual_qty), 0) AS total_actual_qty,
            COALESCE(SUM(sle.actual_qty * COALESCE(sle.valuation_rate, 0)), 0) AS total_production_value,
            CASE
                WHEN COALESCE(SUM(sle.actual_qty), 0) = 0 THEN COALESCE(MAX(sle.valuation_rate), 0)
                ELSE COALESCE(SUM(sle.actual_qty * COALESCE(sle.valuation_rate, 0)) / SUM(sle.actual_qty), 0)
            END AS valuation_rate,
            MAX(ap.creation) AS creation_ts
        FROM `tabStock Ledger Entry` sle
        JOIN `tabAnimal Products` ap ON ap.name = sle.item_code
        WHERE sle.posting_date BETWEEN %(from_date)s AND %(to_date)s
        GROUP BY ap.name
        ORDER BY creation_ts DESC
    """, {"from_date": from_date, "to_date": to_date}, as_dict=True)

    # Columns exactly as you requested
    columns = [
        {"label": "Item Code", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 180},
        {"label": "Latest Posting Datetime", "fieldname": "posting_datetime", "fieldtype": "Datetime", "width": 180},
        {"label": "Sum of Actual Qty", "fieldname": "total_actual_qty", "fieldtype": "Float", "width": 120},
        {"label": "Total Production Value", "fieldname": "total_production_value", "fieldtype": "Currency", "width": 160},
        {"label": "Valuation Rate (weighted)", "fieldname": "valuation_rate", "fieldtype": "Currency", "width": 140}
    ]

    # If you prefer rounding of valuation_rate or total_production_value, do it here:
    # for row in data: row['valuation_rate'] = round(row['valuation_rate'], 4)

    return columns, data


def _compute_date_range(filters):
    """
    Same semantics you requested:
    - Period: Today, This Week, This Fortnight, This Month, Custom Range
    - Default: This Month (1st -> today)
    """
    period = (filters.get("period") or "This Month").strip()
    today = getdate(nowdate())

    if period == "Custom Range":
        from_date = filters.get("from_date") or today
        to_date = filters.get("to_date") or today
        return getdate(from_date), getdate(to_date)

    if period == "Today":
        return today, today

    if period == "This Week":
        # Monday start
        weekday = today.weekday()  # Monday=0
        start = today - timedelta(days=weekday)
        return start, today

    if period == "This Fortnight":
        start = today - timedelta(days=13)
        return start, today

    # default: This Month
    start = today.replace(day=1)
    return start, today
