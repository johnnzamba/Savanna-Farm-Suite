# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.data import flt
from frappe import _

def execute(filters=None):
    filters = filters or {}
    columns = [
        "Feed Item:Data:200",
        "Total Issued:Float:120",
        "Feed Qty After:Float:120",
        "Feed UoM:Data:80",
        "Feed Warehouse:Data:160",
        "Feed Stock Value:Float:140",
        "Feed Fiscal Year:Data:120",
        "Product Item:Data:200",
        "Product Qty After:Float:140",
        "Product UoM:Data:80",
        "Product Warehouse:Data:160",
        "Product Stock Value:Float:140",
        "Product Fiscal Year:Data:120",
        "FCR:Float:100"
    ]

    data = []

    if not filters.get("date_of_nourishment"):
        frappe.throw(_("date_of_nourishment is required"), frappe.ValidationError)

    date = filters.get("date_of_nourishment")

    # 1) Distinct item_codes in Stock Ledger Entry for the selected date
    sle_item_recs = frappe.db.sql("""
        SELECT DISTINCT item_code
        FROM `tabStock Ledger Entry`
        WHERE posting_date = %s
    """, (date,), as_dict=1)

    sle_item_codes = {r.get("item_code") for r in sle_item_recs if r.get("item_code")}

    # 2) Classify which of these are Animal Products
    product_item_codes = set()
    if sle_item_codes:
        prod_rows = frappe.db.sql("""
            SELECT name
            FROM `tabAnimal Products`
            WHERE name IN %(codes)s
        """, {"codes": tuple(sle_item_codes)}, as_dict=1) if len(sle_item_codes) > 0 else []
        product_item_codes = {r.get("name") for r in prod_rows if r.get("name")}

    # Feeds (based on SLE) = those SLE item_codes that are NOT in Animal Products
    feed_codes_from_sle = set([c for c in sle_item_codes if c not in product_item_codes])

    # 3) Include any feed_issued from Nourishment Log for the date
    nl_feed_rows = frappe.db.sql("""
        SELECT DISTINCT feed_issued AS item_code,
               MAX(IFNULL(animal_feed_name, '')) AS animal_feed_name,
               SUM(IFNULL(qty_issued,0)) AS total_qty_issued
        FROM `tabNourishment Log`
        WHERE date_of_nourishment = %s
        GROUP BY feed_issued
    """, (date,), as_dict=1)

    nl_feed_map = {}
    for r in nl_feed_rows:
        code = r.get("item_code")
        if not code:
            continue
        nl_feed_map[code] = {
            "animal_feed_name": r.get("animal_feed_name") or code,
            "total_qty_issued": flt(r.get("total_qty_issued", 0))
        }

    # union of feed codes found in SLE and those in Nourishment Log
    feed_codes = set(feed_codes_from_sle) | set(nl_feed_map.keys())

    # 4) For each feed code, fetch SLE on date (latest). If none, fallback to latest SLE <= date.
    feed_rows = []
    for feed_code in sorted(feed_codes):
        display_name = nl_feed_map.get(feed_code, {}).get("animal_feed_name") or feed_code
        total_issued = nl_feed_map.get(feed_code, {}).get("total_qty_issued", 0.0)

        # prefer SLE on the selected posting_date
        sle = frappe.db.sql("""
            SELECT item_code, warehouse, actual_qty, qty_after_transaction, stock_value, stock_uom, fiscal_year
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND posting_date = %s
            ORDER BY creation DESC
            LIMIT 1
        """, (feed_code, date), as_dict=1)

        if not sle:
            # fallback: latest SLE with posting_date <= date (most recent available before or on date)
            sle = frappe.db.sql("""
                SELECT item_code, warehouse, actual_qty, qty_after_transaction, stock_value, stock_uom, fiscal_year
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s AND posting_date <= %s
                ORDER BY posting_date DESC, creation DESC
                LIMIT 1
            """, (feed_code, date), as_dict=1)

        sle = sle[0] if sle else {}

        # Prefer actual_qty, fallback to qty_after_transaction if actual_qty missing
        feed_actual_qty = flt(sle.get("actual_qty") if sle.get("actual_qty") is not None else sle.get("qty_after_transaction", 0))
        feed_stock_uom = sle.get("stock_uom") or ""
        feed_warehouse = sle.get("warehouse") or ""
        feed_stock_value = flt(sle.get("stock_value", 0))
        feed_fiscal = sle.get("fiscal_year") or ""

        feed_rows.append({
            "display_name": display_name,
            "feed_item_code": feed_code,
            "total_qty_issued": total_issued,
            "feed_qty_after_transaction": feed_actual_qty,   # still placed in same column position
            "feed_stock_uom": feed_stock_uom,
            "feed_warehouse": feed_warehouse,
            "feed_stock_value": feed_stock_value,
            "feed_fiscal_year": feed_fiscal
        })

    # 5) For products: include only products that have SLEs on the selected posting_date
    product_rows = []
    total_product_actual_qty = 0.0

    if product_item_codes:
        for prod_code in sorted(product_item_codes):
            slep = frappe.db.sql("""
                SELECT item_code, warehouse, actual_qty, qty_after_transaction, stock_value, stock_uom, fiscal_year
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s AND posting_date = %s
                ORDER BY creation DESC
                LIMIT 1
            """, (prod_code, date), as_dict=1)

            if not slep:
                # no SLE exactly on date -> skip product for this date
                continue

            slep = slep[0]
            prod_actual_qty = flt(slep.get("actual_qty") if slep.get("actual_qty") is not None else slep.get("qty_after_transaction", 0))
            total_product_actual_qty += prod_actual_qty

            product_rows.append({
                "product_item_code": prod_code,
                "product_qty_after_transaction": prod_actual_qty,
                "product_stock_uom": slep.get("stock_uom") or "",
                "product_warehouse": slep.get("warehouse") or "",
                "product_stock_value": flt(slep.get("stock_value", 0)),
                "product_fiscal_year": slep.get("fiscal_year") or ""
            })

    # 6) Compute FCR per feed using product actual_qty as denominator
    denom = total_product_actual_qty
    for fr in feed_rows:
        if denom > 0:
            fr["fcr"] = flt(fr.get("total_qty_issued", 0)) / denom
        else:
            fr["fcr"] = None

    # 7) Build rows in array-of-arrays order (preserve original column layout)
    for fr in feed_rows:
        data.append([
            fr.get("display_name"),
            fr.get("total_qty_issued"),
            fr.get("feed_qty_after_transaction"),
            fr.get("feed_stock_uom"),
            fr.get("feed_warehouse"),
            fr.get("feed_stock_value"),
            fr.get("feed_fiscal_year"),
            None,
            None,
            None,
            None,
            None,
            None,
            fr.get("fcr")
        ])

    for pr in product_rows:
        data.append([
            None, 0, None, None, None, None, None,
            pr.get("product_item_code"),
            pr.get("product_qty_after_transaction"),
            pr.get("product_stock_uom"),
            pr.get("product_warehouse"),
            pr.get("product_stock_value"),
            pr.get("product_fiscal_year"),
            None
        ])

    return columns, data
