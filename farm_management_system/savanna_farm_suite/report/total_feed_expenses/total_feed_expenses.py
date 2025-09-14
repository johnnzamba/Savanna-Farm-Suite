# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe.utils import getdate, nowdate
from datetime import timedelta, date

def execute(filters=None):
    """
    Standard report execute called by Frappe query report engine.
    Returns: (columns, data)
    """
    filters = filters or {}
    period = filters.get("period") or "This Month"
    from_date, to_date = _compute_date_range(period, filters.get("from_date"), filters.get("to_date"))

    # Aggregate Nourishment Log by date_of_nourishment + feed_issued
    rows = frappe.db.sql(
        """
        SELECT date_of_nourishment AS date, feed_issued AS feed, SUM(IFNULL(qty_issued, 0)) AS qty
        FROM `tabNourishment Log`
        WHERE date_of_nourishment BETWEEN %s AND %s
        GROUP BY date_of_nourishment, feed_issued
        ORDER BY date_of_nourishment
        """,
        (from_date, to_date),
        as_dict=True
    )

    # Gather distinct feeds and dates
    dates = sorted({(r["date"].strftime("%Y-%m-%d") if isinstance(r["date"], date) else str(r["date"])) for r in rows})
    feeds = sorted({r["feed"] for r in rows if r["feed"]})

    # Fetch cost and friendly name for each feed from "Animal Feeds"
    feed_meta = {}
    for f in feeds:
        # we try to fetch both cost_of_the_feed and animal_feed_name (fall back to feed id/name)
        val = frappe.db.get_value("Animal Feeds", f,
                                  ["cost_of_the_feed", "feed_name"],
                                  as_dict=True) or {}
        feed_meta[f] = {
            "cost": float(val.get("cost_of_the_feed") or 0.0),
            "name": val.get("feed_name") or f
        }

    data = []
    totals_per_feed = {f: 0.0 for f in feeds}

    for r in rows:
        date_str = r["date"].strftime("%Y-%m-%d") if isinstance(r["date"], date) else str(r["date"])
        feed_id = r["feed"]
        qty = float(r["qty"] or 0.0)
        cost_per_unit = feed_meta.get(feed_id, {}).get("cost", 0.0)
        total_cost = qty * cost_per_unit
        totals_per_feed[feed_id] = totals_per_feed.get(feed_id, 0.0) + total_cost

        data.append({
            "date": date_str,
            "feed_issued": feed_id,
            "animal_feed_name": feed_meta.get(feed_id, {}).get("name", feed_id),
            "qty_issued": qty,
            "cost_per_unit": cost_per_unit,
            "total_cost": total_cost
        })

    columns = [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 120},
        {"label": "Feed Issued", "fieldname": "feed_issued", "fieldtype": "Data", "width": 160},
        {"label": "Animal Feed Name", "fieldname": "animal_feed_name", "fieldtype": "Data", "width": 220},
        {"label": "Qty Issued", "fieldname": "qty_issued", "fieldtype": "Float", "width": 120},
        {"label": "Cost Per Unit", "fieldname": "cost_per_unit", "fieldtype": "Currency", "width": 140},
        {"label": "Total Cost", "fieldname": "total_cost", "fieldtype": "Currency", "width": 140},
    ]

    return columns, data


def _compute_date_range(period, from_date=None, to_date=None):
    """
    Returns (from_date, to_date) as date objects according to period string
    """
    today = getdate(nowdate())

    if period == "Today":
        return today, today

    if period == "This Week":
        # week starts Monday
        start = today - timedelta(days=today.weekday())
        return start, today

    if period == "This Fortnight":
        start = today - timedelta(days=13)  # 14-day window (today included)
        return start, today

    if period == "This Month":
        start = today.replace(day=1)
        return start, today

    if period == "Custom Range" and from_date and to_date:
        return getdate(from_date), getdate(to_date)

    # fallback default: this month
    return today.replace(day=1), today

@frappe.whitelist()
def get_chart_data(filters=None):
    """
    Returns JSON for charting:
    { labels: [dates], datasets: [{ name: animal_feed_name, values: [total_cost_on_label] }, ...] }
    """
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)

    _, data = execute(filters or {})

    # Collect unique dates and parse them to real dates to sort chronologically
    from datetime import datetime
    date_set = {d["date"] for d in data}
    # Expecting date strings like 'YYYY-MM-DD'
    parsed_dates = []
    for ds in date_set:
        try:
            parsed_dates.append(datetime.strptime(ds, "%Y-%m-%d").date())
        except Exception:
            # fallback: try to getdate
            from frappe.utils import getdate
            parsed_dates.append(getdate(ds))
    parsed_dates = sorted(parsed_dates)
    labels = [d.strftime("%Y-%m-%d") for d in parsed_dates]

    feeds = sorted({d["feed_issued"] for d in data if d.get("feed_issued")})

    # Build a lookup for quick summation: totals[(feed, date)] = total_cost
    totals = {}
    for d in data:
        key = (d.get("feed_issued"), d.get("date"))
        totals[key] = totals.get(key, 0.0) + float(d.get("total_cost") or 0.0)

    datasets = []
    for f in feeds:
        animal_name = next((d["animal_feed_name"] for d in data if d["feed_issued"] == f and d.get("animal_feed_name")), f)
        values = []
        for lbl in labels:
            v = totals.get((f, lbl), 0.0)
            # ensure numeric and round to 2 decimals
            values.append(round(float(v or 0.0), 2))
        datasets.append({
            "name": animal_name,
            "values": values
        })

    return {"labels": labels, "datasets": datasets}
