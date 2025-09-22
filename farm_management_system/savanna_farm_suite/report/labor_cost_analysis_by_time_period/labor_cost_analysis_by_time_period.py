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
		# default -> this month
		start = date(td_today.year, td_today.month, 1)
		end = td_today
	return start, end

def execute(filters=None):
	if filters is None:
		filters = {}

	staff_filter = (filters.get("staff_member") or "").strip() or None
	timeline = (filters.get("timeline") or "").strip() or "This Month"
	start_date, end_date = get_date_range_for_timeline(timeline)

	# columns to return
	columns = [
		{"label": "Date of Activity", "fieldname": "date_of_activity", "fieldtype": "Date", "width": 110},
		{"label": "Farming Season", "fieldname": "farming_season", "fieldtype": "Link", "options": "Farming Season","width": 140},
		{"label": "Specific Crop Batch", "fieldname": "crop_batch", "fieldtype": "Link","options": "Crop Intake","width": 240},
		{"label": "Staff Names", "fieldname": "staff_names", "fieldtype": "Link","options": "Employee","width": 200},
		# use HTML fieldtype so bold tags render
		{"label": "Total Hours Spent", "fieldname": "total_hours", "fieldtype": "HTML", "width": 120},
		{"label": "Payment Voucher", "fieldname": "payment_voucher", "fieldtype": "Link", "options": "Petty Cash Voucher","width": 160},
		{"label": "Total Amount Paid", "fieldname": "total_amount_paid", "fieldtype": "Currency", "width": 140},
	]

	data = []
	totals_by_staff = defaultdict(float)

	# fetch Farm Operation Log docs within date range
	logs = frappe.get_all(
		"Farm Operation Log",
		filters={"specify_the_date_of_activity": ["between", [start_date, end_date]]},
		fields=[
			"name",
			"specify_the_date_of_activity",
			"farming_season_when_activity_was_conducted",
			"farming_activity_tied_to_which_crop_batch"
		],
		order_by="specify_the_date_of_activity asc"
	)

	for l in logs:
		# get full doc so we can access the child table labourer_records
		try:
			doc = frappe.get_doc("Farm Operation Log", l.name)
		except Exception:
			# skip if doc retrieval fails for any reason
			continue

		labourer_rows = doc.get("labourer_records") or []
		for rec in labourer_rows:
			emp = rec.get("employee_involved")
			# if user filtered by a staff member, only include that employee
			if staff_filter and emp and emp != staff_filter:
				continue

			# prefer the child row's `full_names` if provided; otherwise fetch from Employee
			full_names = (rec.get("full_names") or "").strip()
			if not full_names and emp:
				full_names = frappe.db.get_value("Employee", emp, "employee_name") or emp or ""

			total_hours = flt(rec.get("total_man_hours_spent") or 0.0)
			voucher_amount = flt(rec.get("voucher_amount") or 0.0)
			generated_voucher = rec.get("generated_voucher") or ""

			# embed bold HTML for the two requested fields
			total_hours_html = f"<strong>{total_hours}</strong>"
			generated_voucher_html = f"<strong>{voucher_amount}</strong>"

			# append row in the column order defined above
			data.append([
				l.get("specify_the_date_of_activity"),
				l.get("farming_season_when_activity_was_conducted"),
				l.get("farming_activity_tied_to_which_crop_batch"),
				full_names,
				total_hours_html,
				generated_voucher,
				voucher_amount
			])

			# accumulate for chart / summary
			totals_by_staff[full_names or "Unknown"] += voucher_amount

	# Build chart: x-axis = Staff Names, y-axis = Total Amount Paid
	chart = None
	if totals_by_staff:
		labels = list(totals_by_staff.keys())
		values = [totals_by_staff[k] for k in labels]

		chart = {
			"title": _("Labor Cost by Staff"),
			"data": {
				"labels": labels,
				"datasets": [
					{"name": _("Total Amount Paid"), "values": values, "chartType": "bar"}
				]
			},
			"type": "bar",
			"height": 300
		}

	# Build report summary lines (these appear above the chart) — one per staff
	report_summary = []
	for staff_name, total in totals_by_staff.items():
		report_summary.append({
			"value": total,
			"label": staff_name,
			"datatype": "Currency"
		})

	# return signature: columns, data, message (None), chart, report_summary
	return columns, data, None, chart, report_summary
