# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe

from __future__ import annotations
import frappe
from frappe.utils import getdate, today, flt
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
        start = date(td_today.year, td_today.month, 1)
        end = td_today
    return start, end

def execute(filters=None):
    if filters is None:
        filters = {}

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    crop_filter = (filters.get("crop") or "").strip() or None
    start_date, end_date = get_date_range_for_timeline(timeline)

    # Columns: Crop | Crop Intake | Total Farm Input Expense | Total Labor Cost Expense
    columns = [
        {"label": "Crop", "fieldname": "crop", "fieldtype": "Data", "width": 180},
        {"label": "Crop Intake", "fieldname": "crop_intake", "fieldtype": "Link", "options": "Crop Intake", "width": 220},
        {"label": "Total Farm Input Expense", "fieldname": "total_farm_input_expense", "fieldtype": "Currency", "width": 180},
        {"label": "Total Labor Cost Expense", "fieldname": "total_labor_cost_expense", "fieldtype": "Currency", "width": 180},
    ]

    data = []
    # totals aggregated per crop for chart
    totals_per_crop_inputs = defaultdict(float)
    totals_per_crop_labor = defaultdict(float)

    # cache valuation_rate per item_code to avoid repeated server calls
    valuation_rate_cache = {}

    # helper to get valuation_rate for an item_code via the specified method
    def get_valuation_rate(item_code):
        if not item_code:
            return 0.0
        if item_code in valuation_rate_cache:
            return valuation_rate_cache[item_code]
        try:
            # call the server method described in your spec
            fn = frappe.get_attr(
                "farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_current_stock"
            )
            # the function seems to accept kwargs like item_code
            resp = fn(item_code=item_code)
            # resp may be a dict containing valuation_rate
            vr = 0.0
            if isinstance(resp, dict):
                vr = flt(resp.get("valuation_rate") or 0.0)
            else:
                # If method returns frappe._dict or similar
                try:
                    vr = flt(resp.valuation_rate)
                except Exception:
                    vr = 0.0
        except Exception:
            vr = 0.0
        valuation_rate_cache[item_code] = vr
        return vr

    # fetch crops (either one selected or all)
    crop_filters = {}
    if crop_filter:
        crop_filters = {"name": crop_filter}
    crops = frappe.get_all("Crop", filters=crop_filters, fields=["name"], order_by="name asc")

    for c in crops:
        crop_name = c.name

        # find Crop Intake records where crop_being_planted LIKE crop_name
        intakes = frappe.get_all(
            "Crop Intake",
            filters=[["crop_being_planted", "like", f"%{crop_name}%"]],
            fields=["name", "crop_being_planted"]
        )

        # if no intake found, we still want to report zero rows? We'll skip creating rows but could show 0 in summary.
        if not intakes:
            # you may want a row that shows zeroes; for now, skip creating a row with no intake.
            continue

        for intake in intakes:
            intake_name = intake.name

            # fetch all Farm Operation Log docs linked to this intake in the timeline
            farm_logs = frappe.get_all(
                "Farm Operation Log",
                filters=[
                    ["farming_activity_tied_to_which_crop_batch", "=", intake_name],
                    ["specify_the_date_of_activity", "between", [start_date, end_date]]
                ],
                fields=["name"],
            )

            total_input_expense_for_intake = 0.0
            total_labor_expense_for_intake = 0.0

            if farm_logs:
                log_names = [l.name for l in farm_logs]

                # fetch child tables for these logs in one go to reduce queries
                # labourer_records
                labour_rows = frappe.db.get_all(
                    "Farm Operations Labour Table",
                    filters=[["parent", "in", log_names]],
                    fields=["parent", "employee_involved", "full_names", "total_man_hours_spent", "voucher_amount", "generated_voucher"]
                )

                for lr in labour_rows:
                    amt = flt(lr.get("voucher_amount") or 0.0)
                    total_labor_expense_for_intake += amt

                # material_records
                material_rows = frappe.db.get_all(
                    "Farm Operations Material Table",
                    filters=[["parent", "in", log_names]],
                    fields=["parent", "farm_input_used", "quantity_of_agent_used"]
                )
                for mr in material_rows:
                    item = mr.get("farm_input_used")
                    qty = flt(mr.get("quantity_of_agent_used") or 0.0)
                    if not item or qty == 0:
                        continue
                    vr = get_valuation_rate(item)
                    total_input_expense_for_intake += (qty * vr)

            # append row for this intake
            data.append([
                crop_name,
                intake_name,
                total_input_expense_for_intake,
                total_labor_expense_for_intake
            ])

            # aggregate per crop totals for chart and summary
            totals_per_crop_inputs[crop_name] += total_input_expense_for_intake
            totals_per_crop_labor[crop_name] += total_labor_expense_for_intake

    # Build chart: x-axis = Crop, y-axis has two datasets (input expense and labor expense)
    input_color = "#f48fb1"   # pink-ish for Total Farm Input Expense
    labor_color = "#2196f3"   # blue for Total Labor Cost Expense
    neutral_color = "#333"    # text color

    # Build chart: x-axis = Crop, y-axis has two datasets (input expense and labor expense)
    chart = None
    labels = sorted(totals_per_crop_inputs.keys()) if totals_per_crop_inputs else []
    input_values = [totals_per_crop_inputs[k] for k in labels]
    labor_values = [totals_per_crop_labor.get(k, 0.0) for k in labels]

    if labels:
        chart = {
            "title": _("ROI per Crop (Inputs vs Labor)"),
            "data": {
                "labels": labels,
                "datasets": [
                    {"name": _("Total Farm Input Expense"), "values": input_values, "chartType": "bar"},
                    {"name": _("Total Labor Cost Expense"), "values": labor_values, "chartType": "bar"}
                ]
            },
            "type": "bar",
            "height": 320,
            # matching colors so legend and message align visually
            "colors": [input_color, labor_color]
        }

    # Build message (HTML) — a bigger bold informative header plus a coloured summary per crop.
    total_inputs_all = sum(totals_per_crop_inputs.values()) if totals_per_crop_inputs else 0.0
    total_labor_all = sum(totals_per_crop_labor.values()) if totals_per_crop_labor else 0.0

    # Header: big, bold and informative
    header_html = (
        f"<div style='font-size:15px;font-weight:700;color:{neutral_color};"
        f"margin-bottom:8px;'>"
        f"ROI per Crop — Inputs vs Labor"
        f"</div>"
    )

    # Sub-header: timeline + overall totals
    sub_header_html = (
        f"<div style='font-size:13px;color:{neutral_color};margin-bottom:10px;'>"
        f"<strong>Timeline:</strong> {timeline} &nbsp; | &nbsp;"
        f"<strong>Total Inputs:</strong> {total_inputs_all:,.2f} &nbsp; | &nbsp;"
        f"<strong>Total Labor:</strong> {total_labor_all:,.2f}"
        f"</div>"
    )

    # Per-crop lines: swatch, crop name (bold) and colored bold amounts
    message_lines = []
    for crop_name in sorted(set(list(totals_per_crop_inputs.keys()) + list(totals_per_crop_labor.keys()))):
        inp = totals_per_crop_inputs.get(crop_name, 0.0)
        lab = totals_per_crop_labor.get(crop_name, 0.0)

        # percentage shares (guard against zero totals)
        inp_pct = (inp / total_inputs_all * 100) if total_inputs_all else 0.0
        lab_pct = (lab / total_labor_all * 100) if total_labor_all else 0.0

        line = (
            f"<div style='font-size:13px;margin-bottom:6px;display:flex;align-items:center;'>"
            # crop name
            f"<div style='flex:0 0 220px;font-weight:700;color:{neutral_color};'>{crop_name}</div>"
            # input swatch + value + pct
            f"<div style='flex:0 0 240px;display:flex;align-items:center;'>"
            f"<span style='display:inline-block;width:12px;height:12px;background:{input_color};"
            f"margin-right:8px;border-radius:2px;'></span>"
            f"<span style='font-weight:700;color:{input_color};margin-right:8px;'>{inp:,.2f}</span>"
            f"<small style='color:#666;'>{inp_pct:0.1f}%</small>"
            f"</div>"
            # labor swatch + value + pct
            f"<div style='flex:0 0 240px;display:flex;align-items:center;'>"
            f"<span style='display:inline-block;width:12px;height:12px;background:{labor_color};"
            f"margin-right:8px;border-radius:2px;'></span>"
            f"<span style='font-weight:700;color:{labor_color};margin-right:8px;'>{lab:,.2f}</span>"
            f"<small style='color:#666;'>{lab_pct:0.1f}%</small>"
            f"</div>"
            "</div>"
        )
        message_lines.append(line)

    # Combine header, sub-header and lines
    if message_lines:
        message = "<div style='padding:6px 0 12px 0;'>" + header_html + sub_header_html + "".join(message_lines) + "</div>"
    else:
        # fallback informative message when no data
        message = (
            "<div style='font-size:14px;font-weight:700;color:{nc};'>"
            "No data available for the selected crop/timeline."
            "</div>".format(nc=neutral_color)
        )

    # Optionally, you can build a concise report_summary (empty here)
    report_summary = []

    # return columns, data, message, chart, report_summary
    return columns, data, message, chart, report_summary
