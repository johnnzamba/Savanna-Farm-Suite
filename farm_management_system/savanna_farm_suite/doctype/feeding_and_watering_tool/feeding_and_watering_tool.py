# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class FeedingandWateringTool(Document):
	pass

import frappe
import json
from frappe import _
from frappe.utils import flt

@frappe.whitelist()
def get_animal_feeds_by_animal(specify_animal):
    """
    Returns list of Animal Feeds matching the specify_animal via the child table
    'Animal and Feed Formulation' (field: select_type_of_animal LIKE %specify_animal%).
    Returns items like: [{ "name": "AF-001", "uom": "Kg", "feed_name": "ITEM_CODE", "stock_balance": 100.0 }, ...]
    If uom is a Table MultiSelect field, we return only the first UOM value.
    Stock balance is fetched from the latest Stock Ledger Entry (by creation) for the Item matching feed_name.
    """
    if not specify_animal:
        return []

    child_doctype = "Animal and Feed Formulation"
    child_rows = frappe.get_all(
        child_doctype,
        filters=[["select_type_of_animal", "like", f"%{specify_animal}%"]],
        fields=["parent"]
    )

    parent_names = list({r.parent for r in child_rows if r.parent})
    if not parent_names:
        return []

    result = []
    for parent_name in parent_names:
        try:
            animal_feed_doc = frappe.get_doc("Animal Feeds", parent_name)
            feed_name = (animal_feed_doc.feed_name or "").strip()
            uom_value = ""

            # Extract UOM from Table MultiSelect field
            if animal_feed_doc.uom and len(animal_feed_doc.uom) > 0:
                first_uom_row = animal_feed_doc.uom[0]
                if hasattr(first_uom_row, 'uom') and first_uom_row.uom:
                    uom_value = first_uom_row.uom

            # Fetch Item matching feed_name
            stock_balance = 0.0
            if feed_name:
                items = frappe.get_all("Item", filters={"item_code": feed_name}, fields=["name"])
                if items:
                    item_name = items[0].get("name")
                    # Fetch default warehouse from Item Defaults
                    item_doc = frappe.get_doc("Item", item_name)
                    item_defaults = item_doc.get("item_defaults") or []
                    warehouse = item_defaults[0].get("default_warehouse") if item_defaults else None

                    if warehouse:
                        sle_rows = frappe.get_all(
                            "Stock Ledger Entry",
                            filters={"item_code": item_name, "warehouse": warehouse},
                            fields=["qty_after_transaction"],
                            order_by="creation desc",
                            limit_page_length=1
                        )
                        if sle_rows:
                            stock_balance = flt(sle_rows[0].get("qty_after_transaction") or 0.0)

            result.append({
                "name": parent_name,
                "uom": uom_value,
                "feed_name": feed_name,
                "stock": stock_balance
            })
        except Exception as e:
            frappe.log_error(f"Error processing Animal Feed {parent_name}: {str(e)}", "get_animal_feeds_by_animal")
            continue

    return result

@frappe.whitelist()
def create_nourishment_logs(nourishment_date, user, table_rows, poultry_batch=None, poultry_house=None, incl_hydration=False, water_amount=None):
    """
    Create & submit one Nourishment Log per row provided in table_rows (JSON string).
    Args:
        nourishment_date (str)
        user (str)
        table_rows (json-stringified list): [{ "animal_feed": "...", "feed_default_uom": "...", "qty": 10 }, ...]
        poultry_batch (optional)
        poultry_house (optional)
        incl_hydration (bool / "true"/"false")
    Returns:
        list of created docnames
    """
    if not table_rows:
        return []

    try:
        rows = json.loads(table_rows)
    except Exception:
        rows = []

    if not isinstance(rows, list) or not rows:
        return []

    # determine denominator for avg_consumption
    denom = None
    if poultry_batch:
        try:
            pb = frappe.get_doc("Poultry Batches", poultry_batch)
            denom = getattr(pb, "total_animals", None)
        except Exception:
            denom = None
    elif poultry_house:
        try:
            ps = frappe.get_doc("Poultry Shed", poultry_house)
            denom = getattr(ps, "current_poultry_count", None)
        except Exception:
            denom = None

    created = []
    # iterate rows and create Nourishment Log docs
    for row in rows:
        animal_feed = row.get("animal_feed")
        default_uom = row.get("feed_default_uom")
        qty = flt(row.get("qty") or 0.0)

        if denom and float(denom) != 0.0:
            avg_consumption = qty / float(denom)
        else:
            avg_consumption = 0.0

        # choose correct target: poultry_batch OR log_for_poultry_shed
        if poultry_batch:
            pb_field = poultry_batch
            shed_field = None
        elif poultry_house:
            pb_field = None
            shed_field = poultry_house
        else:
            pb_field = None
            shed_field = None

        new_doc = frappe.get_doc({
            "doctype": "Nourishment Log",
            "date_of_nourishment": nourishment_date,
            "poultry_batch": pb_field,
            "log_for_poultry_shed": shed_field,
            "feed_issued": animal_feed,
            "default_uom": default_uom,
            "qty_issued": qty,
            "avg_consumption": avg_consumption,
            "user": user,
            "hydration_was_confirmed": True if str(incl_hydration).lower() in ("1", "true", "yes") else False,
            "water_consumed": water_amount or 0.0
        })
        new_doc.insert(ignore_permissions=True)
        try:
            new_doc.submit()
        except Exception:
            pass

        created.append(new_doc.name)
    return created

import frappe
import re
from frappe.utils import flt, getdate

def _normalize_date_str(date_str):
    """
    Try to parse a date string and return a YYYY-MM-DD string.
    Accepts:
      - YYYY-MM-DD (preferred)
      - DD-MM-YYYY or DD/MM/YYYY
    Returns string 'YYYY-MM-DD' or raises ValueError.
    """
    if not date_str:
        raise ValueError("Empty date")

    # first try frappe.getdate which handles common formats (YYYY-MM-DD)
    try:
        d = getdate(date_str)
        return str(d)  # "YYYY-MM-DD"
    except Exception:
        pass

    # fallback: try detect DD-MM-YYYY or DD/MM/YYYY
    parts = re.split('[-/]', date_str)
    if len(parts) == 3:
        # dd-mm-yyyy -> convert to yyyy-mm-dd
        if len(parts[0]) == 2 and len(parts[2]) == 4:
            dd, mm, yyyy = parts[0].zfill(2), parts[1].zfill(2), parts[2]
            candidate = f"{yyyy}-{mm}-{dd}"
            try:
                d = getdate(candidate)
                return str(d)
            except Exception:
                pass

    raise ValueError(f"Could not parse date string: {date_str}")


@frappe.whitelist()
def get_nourishment_logs_by_date_range(start_date, end_date):
    """
    Returns Nourishment Log rows between start_date and end_date (inclusive).
    Accepts start/end in YYYY-MM-DD or DD-MM-YYYY formats. Will swap if start > end.
    Returned rows have date_of_nourishment normalized to 'YYYY-MM-DD' (no time).
    """
    if not start_date or not end_date:
        return []

    try:
        start_norm = _normalize_date_str(start_date)
        end_norm = _normalize_date_str(end_date)
    except Exception as e:
        frappe.log_error(f"get_nourishment_logs_by_date_range: date parse error: {e}", "Nourishment Log date parse")
        return []

    # ensure start <= end
    if getdate(start_norm) > getdate(end_norm):
        start_norm, end_norm = end_norm, start_norm

    try:
        rows = frappe.get_all(
            "Nourishment Log",
            filters=[["date_of_nourishment", "between", [start_norm, end_norm]]],
            fields=[
                "name",
                "date_of_nourishment",
                "feed_issued",
                "animal_feed_name",
                "qty_issued",
                "default_uom",
                "avg_consumption"
            ],
            order_by="date_of_nourishment desc, name asc"
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_nourishment_logs_by_date_range SQL error")
        return []

    # normalize numeric fields and date string (strip time -> YYYY-MM-DD)
    for r in rows:
        try:
            r["qty_issued"] = flt(r.get("qty_issued") or 0.0)
        except Exception:
            r["qty_issued"] = 0.0
        try:
            r["avg_consumption"] = flt(r.get("avg_consumption") or 0.0)
        except Exception:
            r["avg_consumption"] = 0.0

        # Normalize date_of_nourishment -> YYYY-MM-DD (strip time portion if present)
        try:
            if r.get("date_of_nourishment"):
                # getdate handles both 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS'
                d = getdate(r.get("date_of_nourishment"))
                r["date_of_nourishment"] = str(d)
        except Exception:
            # keep original if conversion fails
            pass

    return rows
