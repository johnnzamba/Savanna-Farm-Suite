# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe

from __future__ import annotations
import frappe
from frappe.utils import getdate, today
from datetime import date, timedelta
import re
from frappe import _

def parse_float(value):
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value or '0')
    # Look for number before "Nos"
    match = re.search(r'(\d+(\.\d+)?)\s*Nos', s, re.IGNORECASE)
    if match:
        return float(match.group(1))
    # Else, first number
    match = re.search(r'-?\d+(\.\d+)?', s)
    if match:
        return float(match.group(0))
    return 0.0

def get_date_range_for_timeline(timeline: str):
    td_today = getdate(today())
    if timeline == "This Week":
        start = td_today - timedelta(days=td_today.weekday())
        end = td_today
    elif timeline == "Last Fortnight":
        start = td_today - timedelta(days=13)
        end = td_today
    elif timeline == "This Month":
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    elif timeline == "This Quarter":
        quarter_index = (td_today.month - 1) // 3
        start_month = quarter_index * 3 + 1
        start = date(td_today.year, start_month, 1)
        end = td_today
    elif timeline == "This Year":
        start = date(td_today.year, 1, 1)
        end = td_today
    else:
        # default -> this month
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    return start, end

def execute(filters=None):
    if filters is None:
        filters = {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    conditions = {"date_of_planting": ["between", [start_date, end_date]]}
    if filters.get("crop_being_planted"):
        conditions["crop_being_planted"] = filters["crop_being_planted"]
    if filters.get("plot_on_which_planting_is_done"):
        conditions["plot_on_which_planting_is_done"] = filters["plot_on_which_planting_is_done"]

    columns = [
        {"label": "Farming Season", "fieldname": "farming_season", "fieldtype": "Data", "width": 150},
        {"label": "Plot on which Planting is Done", "fieldname": "plot_on_which_planting_is_done", "fieldtype": "Link", "options": "Farm Plots", "width": 200},
        {"label": "Crop Being Planted", "fieldname": "crop_being_planted", "fieldtype": "Link", "options": "Crop Seedlings", "width": 180},
        {"label": "Stock Before Planting", "fieldname": "current_seedling_count", "fieldtype": "Int", "width": 160},
        {"label": "Date of Planting", "fieldname": "date_of_planting", "fieldtype": "Date", "width": 140},
        {"label": "Quantity of Seedlings Used", "fieldname": "quantity_of_seedlings_used", "fieldtype": "Int", "width": 180},
        {"label": "Stock After Planting", "fieldname": "stock_after", "fieldtype": "Int", "width": 160}
    ]

    data = []
    intakes = frappe.get_all(
        "Crop Intake",
        filters=conditions,
        fields=["farming_season", "plot_on_which_planting_is_done", "crop_being_planted", "current_seedling_count", "date_of_planting", "quantity_of_seedlings_used"]
    )
    sum_before = 0
    sum_used = 0
    sum_after = 0
    for intake in intakes:
        before = parse_float(intake.current_seedling_count)
        used = parse_float(intake.quantity_of_seedlings_used)
        after = before - used
        data.append([
            intake.farming_season,
            intake.plot_on_which_planting_is_done,
            intake.crop_being_planted,
            int(before),
            intake.date_of_planting,
            int(used),
            int(after)
        ])
        sum_before += before
        sum_used += used
        sum_after += after

    report_summary = [
        {"value": int(sum_before), "label": _("Stock Before Planting"), "datatype": "Int"},
        {"value": int(sum_used), "label": _("Quantity Used"), "datatype": "Int"},
        {"value": int(sum_after), "label": _("Stock After Planting"), "datatype": "Int", "indicator": "Green" if sum_after >= 0 else "Red"},
    ]

    chart = {
        "title": _("Crop Batch Overview"),
        "data": {
            "labels": ["Stock Before Planting", "Quantity Used", "Stock After Planting"],
            "datasets": [
                {"name": _(""), "values": [sum_before, sum_used, sum_after]}
            ]
        },
        "type": "bar",
        "colors": ["#2e7d32", "#c62828", "#1565c0"],
        "barOptions": {
            "stacked": False
        }
    }

    return columns, data, None, chart, report_summary