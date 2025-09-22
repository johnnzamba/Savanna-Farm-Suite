# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe

from __future__ import annotations
import frappe
from frappe import _ as __
from frappe.utils import getdate, today, flt
from datetime import date, timedelta
from collections import defaultdict

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
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    return start, end

def execute(filters=None):
    if filters is None:
        filters = {}

    timeline = filters.get("timeline", "This Month")
    farm_input = filters.get("farm_input")
    start_date, end_date = get_date_range_for_timeline(timeline)

    columns = [
        {"label": "Date of Use", "fieldname": "date_of_use", "fieldtype": "Date", "width": 140},
        {"label": "Farming Agent Used", "fieldname": "farming_agent_used", "fieldtype": "Link", "options": "Farm Inputs", "width": 180},
        {"label": "Quantity Used", "fieldname": "quantity_used", "fieldtype": "Float", "width": 120},
        {"label": "Default UOM", "fieldname": "uom", "fieldtype": "Data", "width": 100},
        {"label": "Total Value Used", "fieldname": "total_value_used", "fieldtype": "Currency", "width": 140},
        {"label": "Current Stock Level", "fieldname": "current_stock", "fieldtype": "Float", "width": 140},
        {"label": "Valuation Rate", "fieldname": "valuation_rate", "fieldtype": "Currency", "width": 140},
    ]

    data = []
    agent_stats = defaultdict(lambda: {"qty": 0.0, "value": 0.0})
    agent_cache = {}
    date_values = defaultdict(float)

    crop_intakes = frappe.get_all("Crop Intake", fields=["name"])

    for ci in crop_intakes:
        doc = frappe.get_doc("Crop Intake", ci.name)
        for child in getattr(doc, "table_voqq", []):
            if child.date_of_use < start_date or child.date_of_use > end_date:
                continue
            if farm_input and child.farming_agent_used != farm_input:
                continue
            agent = child.farming_agent_used
            if agent not in agent_cache:
                stock_info = frappe.call("farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_current_stock", item_code=agent)
                agent_cache[agent] = {
                    "qty": flt(stock_info.get("qty_after_transaction", 0)),
                    "rate": flt(stock_info.get("valuation_rate", 0))
                }
            cache = agent_cache[agent]
            qty_used = flt(child.quantity_of_farming_agent_used or 0)
            value_used = cache["rate"] * qty_used
            row = [
                child.date_of_use,
                agent,
                qty_used,
                child.agents_uom,
                value_used,
                cache["qty"],
                cache["rate"]
            ]
            data.append(row)
            agent_stats[agent]["qty"] += qty_used
            agent_stats[agent]["value"] += value_used
            date_values[child.date_of_use] += value_used

    data.sort(key=lambda x: x[0])

    report_summary = []
    for agent in sorted(agent_stats):
        report_summary.append({
            "value": agent_stats[agent]["qty"],
            "label": __(agent + ": Quantity Used"),
            "datatype": "Float"
        })
        report_summary.append({
            "value": agent_stats[agent]["value"],
            "label": __(agent + ": Total Value Used"),
            "datatype": "Currency"
        })

    sorted_dates = sorted(date_values.keys())
    labels = [d.strftime('%b %d, %Y') for d in sorted_dates]
    values = [date_values[d] for d in sorted_dates]

    chart = None
    if labels:
        chart = {
            "title": __("Farm Input Utilization"),
            "data": {
                "labels": labels,
                "datasets": [
                    {"name": __("Total Value Used"), "values": values}
                ]
            },
            "type": "bar",
            "colors": ["#18dfb4"]
        }

    return columns, data, None, chart, report_summary