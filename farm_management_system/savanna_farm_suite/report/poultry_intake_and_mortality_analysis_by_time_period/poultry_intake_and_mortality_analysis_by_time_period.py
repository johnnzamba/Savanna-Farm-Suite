# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe

from __future__ import annotations
import frappe
from frappe.utils import getdate, today
from datetime import date, timedelta, datetime
from collections import defaultdict
from frappe import _

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

def get_group_key(dt, group_by):
    if group_by == 'day':
        return dt.strftime('%Y-%m-%d')
    elif group_by == 'week':
        year = dt.year
        month = dt.month
        week = (dt.day - 1) // 7 + 1
        return f'{year}-{month:02d}-W{week}'
    else:  # month
        return dt.strftime('%Y-%m')

def format_group_label(key, group_by):
    if group_by == 'day':
        y, m, d = key.split('-')
        return f'{int(m)}/{int(d)}'
    elif group_by == 'week':
        parts = key.split('-W')
        ym = parts[0]
        y, m = map(int, ym.split('-'))
        w = parts[1]
        month_name = datetime(y, m, 1).strftime('%b')
        return f'{month_name} Week {w}'
    else:  # month
        y, m = map(int, key.split('-'))
        return datetime(y, m, 1).strftime('%b')

def execute(filters=None):
    if filters is None:
        filters = {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    # columns to return
    columns = [
        {"label": "Batch", "fieldname": "batch", "fieldtype": "Link", "options": "Poultry Batches", "width": 200},
        {"label": "Animals Received On", "fieldname": "animals_received_on", "fieldtype": "Date", "width": 140},
        {"label": "Total Animals", "fieldname": "total_animals", "fieldtype": "Int", "width": 120},
        {"label": "Mortality Count", "fieldname": "mortality_count", "fieldtype": "Int", "width": 120}
    ]

    # fetch filtered poultry batches
    batches = frappe.get_all(
        "Poultry Batches",
        filters={"animals_received_on": ["between", [start_date, end_date]]},
        fields=["name", "animals_received_on", "total_animals", "mortality_count"]
    )

    data = []
    sum_total = 0
    sum_mort = 0
    for b in batches:
        total = b.total_animals or 0
        mort = b.mortality_count or 0
        data.append([b.name, b.animals_received_on, total, mort])
        sum_total += total
        sum_mort += mort

    remaining = sum_total - sum_mort

    # Determine grouping for chart
    group_by = 'month'
    if timeline in ['This Week', 'Last Fortnight']:
        group_by = 'day'
    elif timeline == 'This Month':
        group_by = 'week'

    # Group data by time period
    groups = defaultdict(lambda: {'total': 0, 'mort': 0})
    for row in data:
        dt = row[1]
        if not dt:
            continue
        key = get_group_key(dt, group_by)
        groups[key]['total'] += row[2]
        groups[key]['mort'] += row[3]

    sorted_keys = sorted(groups)
    labels = [format_group_label(k, group_by) for k in sorted_keys]
    received = [groups[k]['total'] for k in sorted_keys]
    mort_values = [groups[k]['mort'] for k in sorted_keys]
    remaining_values = [groups[k]['total'] - groups[k]['mort'] for k in sorted_keys]

    chart = None
    if labels:
        chart = {
            "title": _("Poultry Overview"),
            "data": {
                "labels": labels,
                "datasets": [
                    {"name": _("Poultry Received"), "values": received, "chartType": "bar"},
                    {"name": _("Mortality Count"), "values": mort_values, "chartType": "bar"},
                    {"name": _("Remaining Poultry"), "values": remaining_values, "chartType": "line"}
                ]
            },
            "type": "bar",
            "height": 260,
            "colors": ["#2e7d32", "#c62828", "#1565c0"]
        }

    report_summary = [
        {"value": sum_total, "label": _("Poultry Received"), "datatype": "Int"},
        {"value": sum_mort, "label": _("Mortality Count"), "datatype": "Int",  "indicator": "Red" if remaining >= 0 else "Yellow"},
        {"value": remaining, "label": _("Remaining Poultry"), "datatype": "Int", "indicator": "Green" if remaining >= 0 else "Red"}
    ]

    return columns, data, None, chart, report_summary