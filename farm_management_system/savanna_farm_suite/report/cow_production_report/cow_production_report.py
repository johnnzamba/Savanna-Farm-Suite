# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe
from __future__ import annotations
import frappe
from frappe.utils import getdate, today
from datetime import date, timedelta

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

def safe_get_current_stock(product_name):
    """
    Best-effort wrapper around your app's get_current_stock.
    Returns dict with keys: qty_after_transaction, stock_value, valuation_rate (or None on failure).
    """
    try:
        fn = frappe.get_attr("farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_current_stock")
        res = fn(product_name)
        if isinstance(res, dict):
            return {
                "qty_after_transaction": res.get("qty_after_transaction"),
                "stock_value": res.get("stock_value"),
                "valuation_rate": res.get("valuation_rate")
            }
    except Exception:
        pass
    return {"qty_after_transaction": None, "stock_value": None, "valuation_rate": None}

def execute(filters=None):
    if filters is None:
        filters = {}

    columns = [
        "Cow:Link/Cattle:180",
        "Cow Nickname:Data:140",
        "Date of Collection:Date:120",
        "Product Collected:Link/Animal Products:220",
        "Quantity Collected:Float:120",
        "UOM:Data:80",
        "Stock Value:Currency:120",
        "Selling Rate:Currency:120"
    ]

    timeline = (filters.get("timeline") or "").strip() or "This Month"
    start_date, end_date = get_date_range_for_timeline(timeline)

    cow_filter = filters.get("cow")
    product_filter = filters.get("product")

    # aggregation: key = (cow_name, iso_date, product_collected, uom) -> total_qty
    agg = {}

    # Preload list of cattle (narrow by cow_filter if provided)
    if cow_filter:
        cattle_list = frappe.get_all("Cattle", filters={"name": cow_filter}, fields=["name"])
    else:
        cattle_list = frappe.get_all("Cattle", fields=["name"])

    # We'll cache nicknames per cattle to avoid repeated fetches later
    nickname_map = {}

    for c in cattle_list:
        try:
            cattle_doc = frappe.get_doc("Cattle", c.name)
        except Exception:
            continue

        # cache nickname
        nickname_map[c.name] = (cattle_doc.get("add_nickname_optional") or "") if hasattr(cattle_doc, "get") else (getattr(cattle_doc, "add_nickname_optional", "") or "")

        rows = getattr(cattle_doc, "production_log", []) or []
        for row in rows:
            # support both dict-like and object child rows
            if isinstance(row, dict):
                row_date = row.get("date_of_collection")
                prod = row.get("product_collected")
                qty = row.get("quantity_collected", 0)
                uom = (row.get("products_default_uom") or "")
            else:
                row_date = getattr(row, "date_of_collection", None)
                prod = getattr(row, "product_collected", None)
                qty = getattr(row, "quantity_collected", 0)
                uom = (getattr(row, "products_default_uom", "") or "")

            if not row_date:
                continue

            try:
                d = getdate(row_date)
            except Exception:
                continue

            # date range filter (inclusive)
            if d < start_date or d > end_date:
                continue

            # product filter
            if product_filter and prod != product_filter:
                continue

            try:
                qty_f = float(qty or 0)
            except Exception:
                # skip rows with non-numeric qty
                continue

            key = (c.name, d.isoformat(), prod or "", uom or "")
            agg[key] = agg.get(key, 0.0) + qty_f

    # Build final result rows
    data = []
    sorted_keys = sorted(agg.keys(), key=lambda k: (k[0] or "", k[1] or ""))

    for key in sorted_keys:
        cow_name, iso_date, product_collected, uom = key
        total_qty = agg[key]

        # fetch stock value & valuation_rate (best effort)
        stock_info = safe_get_current_stock(product_collected)
        stock_value = stock_info.get("stock_value")
        valuation_rate = stock_info.get("valuation_rate")

        # Prepare numeric values (float) for report columns
        try:
            qty_value = float(total_qty)
        except Exception:
            qty_value = 0.0

        # Stock and valuation: ensure floats or None (Frappe will render blank for None)
        try:
            sv_value = float(stock_value) if stock_value is not None else None
        except Exception:
            sv_value = None

        try:
            vr_value = float(valuation_rate) if valuation_rate is not None else None
        except Exception:
            vr_value = None

        # Cow nickname from cache (may be empty string)
        nickname = nickname_map.get(cow_name, "")

        # Append row in the same order as columns
        data.append([
            cow_name,          # Cow (Link)
            nickname,          # Cow Nickname (Data)
            iso_date,          # Date of Collection (Date string iso)
            product_collected, # Product Collected (Link)
            qty_value,         # Quantity Collected (Float numeric)
            uom or "",         # UOM (Data)
            sv_value,          # Stock Value (Currency numeric or None)
            vr_value           # Valuation Rate (Currency numeric or None)
        ])

    return columns, data
