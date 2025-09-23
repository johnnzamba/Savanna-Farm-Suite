# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
from frappe import _
from frappe.utils import getdate
from multiavatar.multiavatar import multiavatar
import base64

class Cattle(Document):
    def after_insert(self):
        # Create Asset if marked as fixed asset
        if self.is_this_a_fixed_asset == 1:
            self.create_asset()
        
        # Generate avatar if no image exists
        if not self.image_of_animal:
            self.generate_avatar()
        if self.cow_shed:
            shed = frappe.get_doc("Cattle Shed", self.cow_shed)
            current_count_str = shed.current_animal_count or "0 Cows"
            try:
                number = int(current_count_str.split()[0])
            except (ValueError, IndexError):
                number = 0

            new_count = number + 1
            shed.current_animal_count = f"{new_count} Cows"
            shed.save(ignore_permissions=True)

    def create_asset(self):
        """Create Item and Asset records for the cattle"""
        try:
            # Create Item first
            item = frappe.get_doc({
                "doctype": "Item",
                "item_code": self.name,
                "item_name": self.name,
                "item_group": "All Item Groups",
                "stock_uom": "Nos",
                "is_stock_item": 0,
                "is_fixed_asset": 1,
                "asset_category": "Default Livestock Category"
            })
            item.insert(ignore_permissions=True)
            
            # Get company from Global Defaults
            company = frappe.db.get_single_value('Global Defaults', 'default_company')
            
            # Create Asset
            asset = frappe.get_doc({
                "doctype": "Asset",
                "company": company,
                "item_code": item.name,
                "item_name": item.item_name,
                "asset_owner": "Company",
                "asset_owner_company": company,
                "is_existing_asset": 1,
                "asset_name": item.item_name,
                "location": "Default",
                "purchase_date": getdate(self.specify_the_date_of_purchase),
                "available_for_use_date": getdate(self.specify_the_date_of_purchase),
                "gross_purchase_amount": self.specify_net_purchase_amount,
                "asset_quantity": 1
            })
            asset.insert(ignore_permissions=True)
            asset.submit()
            
            # Play success sound
            frappe.publish_realtime('play_sound', {'sound': 'success'})
            
            return asset.name
            
        except Exception as e:
            frappe.log_error(_("Error creating asset for cattle {0}: {1}").format(self.name, str(e)))
            frappe.throw(_("Failed to create asset record. Please check error logs."))
    
    def generate_avatar(self):
        """Generate a unique avatar for the cattle and attach it."""
        try:
            # Generate SVG code using multiavatar
            svg_code = multiavatar("A cow", None, None)

            # Create a File document for the SVG
            file_doc = frappe.get_doc({
                "doctype": "File",
                "file_name": f"avatar-{self.name}.svg",
                "attached_to_doctype": "Cattle",
                "attached_to_name": self.name,
                "content": svg_code,
                "is_private": 0
            })
            file_doc.insert(ignore_permissions=True)

            # Update the image_of_animal field with the new file's URL
            self.db_set("image_of_animal", file_doc.file_url)

            frappe.msgprint(_("Avatar generated for {0}").format(self.name))

        except Exception as e:
            frappe.log_error(
                _("Error generating avatar for {0}: {1}").format(self.name, str(e)),
                "Avatar Generation"
            )


import json
import frappe
from frappe.utils import getdate

# file: farm_management_system/api.py  (or cattle.py if you prefer)
import json
import frappe
from frappe.utils import getdate

def _resolve_feed_docname(feed):
    """Try multiple strategies to resolve a feed identifier to an Animal Feeds docname."""
    if not feed:
        return None

    # 1) If the feed is already a docname, try fast path
    try:
        frappe.get_doc("Animal Feeds", feed)
        return feed
    except Exception:
        pass

    # 2) Try exact matches on common fields
    for field in ("feed_name", "feed_code", "item_code", "name"):
        val = frappe.db.get_value("Animal Feeds", {field: feed}, "name")
        if val:
            return val

    # 3) Fuzzy search on feed_name (best effort)
    rows = frappe.get_all("Animal Feeds", filters=[["feed_name", "like", f"%{feed}%"]], fields=["name"], limit_page_length=1)
    if rows:
        return rows[0].name

    # 4) give up
    frappe.log_error(message=f"Could not resolve Animal Feeds for: {feed}", title="get_animal_feed_uoms: unresolved feed")
    return None


@frappe.whitelist()
def get_animal_feed_uoms(feeds, fed_on=None):
    """
    feeds: JSON string or list of feed identifiers (docname or human label)
    fed_on: optional date string (used to pick the correct uom row)
    Returns: dict { original_feed_input: uom_string }
    """
    if isinstance(feeds, str):
        try:
            feeds = json.loads(feeds)
        except Exception:
            feeds = [feeds]

    if not isinstance(feeds, list):
        feeds = list(feeds)

    fed_date = None
    if fed_on:
        try:
            fed_date = getdate(fed_on)
        except Exception:
            fed_date = None

    result = {}
    for feed in feeds:
        uom = "units"  # fallback
        try:
            docname = _resolve_feed_docname(feed)
            if not docname:
                # unresolved: return default units for this feed key
                result[feed] = uom
                continue

            doc = frappe.get_doc("Animal Feeds", docname)

            # 1) try common single-field UOMs on the doc
            for attr in ("default_uom", "uom", "unit_of_measure", "unit"):
                if getattr(doc, attr, None):
                    uom = getattr(doc, attr)
                    break

            # 2) if still not found, scan child tables and prefer one with date <= fed_on (if provided)
            if uom == "units":
                chosen_uom = None
                best_date = None

                for df in doc.meta.get("fields", []):
                    if df.fieldtype == "Table":
                        child_rows = doc.get(df.fieldname) or []
                        if not child_rows:
                            continue

                        for row in child_rows:
                            # try to locate a uom-like field on the child
                            candidate_uom = None
                            for candidate_field in ("uom", "uom_name", "unit", "unit_of_measure", "selected_uom"):
                                if row.get(candidate_field):
                                    candidate_uom = row.get(candidate_field)
                                    break
                            if not candidate_uom:
                                continue

                            # try to find a date on the child row
                            row_date = None
                            for date_field in ("valid_from", "from_date", "applicable_from", "start_date", "date"):
                                if row.get(date_field):
                                    try:
                                        row_date = getdate(row.get(date_field))
                                    except Exception:
                                        row_date = None
                                    break

                            if fed_date and row_date:
                                if row_date <= fed_date:
                                    if best_date is None or row_date > best_date:
                                        chosen_uom = candidate_uom
                                        best_date = row_date
                            elif not fed_date:
                                chosen_uom = candidate_uom
                                break

                if chosen_uom:
                    uom = chosen_uom

        except Exception as e:
            # defensive: log the exception and continue; return 'units' for this feed
            frappe.log_error(message=f"Error resolving UOM for feed {feed}: {str(e)}", title="get_animal_feed_uoms: error")

        result[feed] = uom or "units"

    return result

import frappe
import json
from frappe import _
from frappe.utils import flt, nowdate
from erpnext.accounts.utils import get_fiscal_year

@frappe.whitelist()
def create_collection_entry(cattle=None, date_of_collection=None, rows=None):
    """
    Accepts:
      - cattle (optional): single cattle name (string) — used when user selected one cow at top-level
      - date_of_collection: date string
      - rows: list of dicts OR JSON string. Each row may contain:
          { "cattle": "COW-0001", "animal_product": "Milk", "default_uom": "Ltr", "quantity_collected": 2.5 }
        OR (if top-level cattle used) rows may omit 'cattle' and you should treat them all as for the top-level cattle.
    """
    if isinstance(rows, str):
        try:
            rows = json.loads(rows)
        except Exception:
            rows = frappe.parse_json(rows)

    rows = rows or []

    # basic validations
    if not rows:
        frappe.throw(_("No product rows provided"), frappe.ValidationError)

    # Helper: append rows to a single cattle doc
    def _append_rows_to_cattle(cattle_name, rows_for_cattle):
        if not cattle_name:
            frappe.throw(_("Cattle name required for these rows"), frappe.ValidationError)

        pb = frappe.get_doc("Cattle", cattle_name)
        if not pb:
            frappe.throw(_("Cattle {0} not found").format(cattle_name))

        for r in rows_for_cattle:
            product_collected = r.get("animal_product") or r.get("animal_products") or r.get("product")
            default_uom = r.get("default_uom") or r.get("products_default_uom") or ''
            qty = flt(r.get("quantity_collected") or r.get("qty") or 0.0)
            if not product_collected:
                frappe.throw(_("Each row must include an animal_product"), frappe.ValidationError)

            pb.append("production_log", {
                "date_of_collection": date_of_collection or nowdate(),
                "product_collected": product_collected,
                "products_default_uom": default_uom,
                "quantity_collected": qty
            })

        pb.save(ignore_permissions=True)
        return pb

    # If a top-level cattle value was passed and rows do NOT contain per-row 'cattle',
    # assume rows belong to that single cattle.
    sle_results = []

    # Determine whether rows are grouped by 'cattle' key
    rows_have_cattle_key = any((isinstance(r, dict) and r.get("cattle")) for r in rows)

    if cattle and not rows_have_cattle_key:
        # All rows belong to this single cattle
        pb = _append_rows_to_cattle(cattle, rows)

        # Create SLEs for each row referencing this cattle
        for r in rows:
            try:
                product_collected = r.get("animal_product") or r.get("animal_products") or r.get("product")
                qty = flt(r.get("quantity_collected") or 0.0)
                sle = create_stock_ledger_entry_collections(product_collected, qty, reference_doctype="Cattle", reference_name=cattle)
                sle_results.append(sle)
            except Exception as e:
                frappe.log_error(f"create_stock_ledger_entry_collections failed for {product_collected}: {e}", "create_collection_entry")
    else:
        # Group rows by cattle field: rows must include 'cattle'
        grouped = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            cattle_name = r.get("cattle") or r.get("cow")  # tolerant keys
            if not cattle_name:
                frappe.throw(_("Row missing 'cattle' value. When collecting per-cow, each row must include the cow (Cattle) name."), frappe.ValidationError)
            grouped.setdefault(cattle_name, []).append(r)

        # For each cattle, append its rows and create SLEs referencing that cattle
        for cattle_name, group_rows in grouped.items():
            try:
                pb = _append_rows_to_cattle(cattle_name, group_rows)
            except Exception as e:
                # log and propagate so caller knows which cattle failed
                frappe.log_error(f"Error appending rows to Cattle {cattle_name}: {e}", "create_collection_entry")
                # continue to next cattle (don't stop entire process)
                continue

            for r in group_rows:
                try:
                    product_collected = r.get("animal_product") or r.get("animal_products") or r.get("product")
                    qty = flt(r.get("quantity_collected") or 0.0)
                    sle = create_stock_ledger_entry_collections(product_collected, qty, reference_doctype="Cattle", reference_name=cattle_name)
                    sle_results.append(sle)
                except Exception as e:
                    frappe.log_error(f"create_stock_ledger_entry_collections failed for {product_collected}: {e}", "create_collection_entry")

    # commit once at the end (we already saved individual docs, but a final commit ensures consistency)
    frappe.db.commit()
    return {"updated": True, "sle_results": sle_results}


# ---- Resolve Item from animal_product (returns item_code_value and item_name) ----
def _resolve_item_from_animal_product(animal_product_name):
    """
    Return (item_code_value, item_name, item_doc)
    item_code_value -> what Stock Ledger Entry.item_code should contain
    item_name -> the Item doctype name (frappe.get_doc key)
    item_doc -> the Item doc
    """
    if not animal_product_name:
        frappe.throw(_("animal_product is required"), frappe.ValidationError)

    # First try matching item_code (common pattern)
    items = frappe.get_all("Item", filters={"item_code": animal_product_name},
                           fields=["name", "item_code"], limit_page_length=1)
    if not items:
        # fallback: maybe the Item name equals the animal_product_name
        items = frappe.get_all("Item", filters={"name": animal_product_name},
                               fields=["name", "item_code"], limit_page_length=1)

    if not items:
        frappe.throw(_("No Item found with item_code or name '{0}'.").format(animal_product_name))

    item_name = items[0]["name"]
    item_code_value = items[0].get("item_code") or item_name
    item_doc = frappe.get_doc("Item", item_name)
    return item_code_value, item_name, item_doc


# ---- Determine target company ----
def _determine_target_company(item_doc=None):
    """
    Priority:
      1) Global default company (Site Defaults)
      2) System default company (db default)
      3) Item.company (if provided on Item)
    """
    company = frappe.defaults.get_global_default("company") or frappe.db.get_default("company")
    if not company and item_doc:
        company = item_doc.get("company")
    return company


def _get_default_warehouse_for_item(item_name, item_doc=None):
    """
    Resolve the warehouse to use for an Item.
    Priority:
      1) Item Default rows where company matches target_company
      2) Warehouse named "Stores - {abbr}" using Company.abbr (if exists and belongs to target_company)
      3) Global default warehouse (site / system)
      4) First Warehouse that belongs to target_company
      5) Raise informative error
    """
    if not item_name:
        return None

    # ensure we have the item_doc
    if item_doc is None:
        try:
            item_doc = frappe.get_doc("Item", item_name)
        except Exception:
            item_doc = None

    target_company = _determine_target_company(item_doc)

    # 1) Look at Item Default rows (prefer a default that matches the target_company)
    item_defaults = frappe.get_all(
        "Item Default",
        filters={"parent": item_name},
        fields=["company", "default_warehouse"],
        order_by="idx asc"
    )
    # Try to find a row where company == target_company and default_warehouse present
    if item_defaults:
        if target_company:
            for row in item_defaults:
                row_company = row.get("company")
                row_wh = row.get("default_warehouse")
                if row_wh and (not row_company or row_company == target_company):
                    # ensure warehouse exists and belongs to same company (or empty)
                    if frappe.db.exists("Warehouse", row_wh):
                        w_company = frappe.get_value("Warehouse", row_wh, "company")
                        if not w_company or w_company == target_company:
                            return row_wh
        # fallback to any item_default with a warehouse (first one that exists)
        for row in item_defaults:
            row_wh = row.get("default_warehouse")
            if row_wh and frappe.db.exists("Warehouse", row_wh):
                w_company = frappe.get_value("Warehouse", row_wh, "company")
                # accept if either no company set on Warehouse or it equals target_company
                if not w_company or (target_company and w_company == target_company):
                    return row_wh

    # 2) Company-based warehouse "Stores - {abbr}"
    if target_company:
        abbr = frappe.get_value("Company", target_company, "abbr") or frappe.get_value("Company", target_company, "abbreviation")
        if abbr:
            warehouse_name = f"Stores - {abbr}"
            if frappe.db.exists("Warehouse", warehouse_name):
                w_company = frappe.get_value("Warehouse", warehouse_name, "company")
                # accept if Warehouse has no company set OR matches target_company
                if not w_company or w_company == target_company:
                    return warehouse_name
                else:
                    # If the warehouse exists but belongs to a different company, do not use it.
                    frappe.logger("warehouse_resolution").info(
                        "Warehouse %s exists but belongs to company %s (expected %s); skipping",
                        warehouse_name, w_company, target_company
                    )

    # 3) Global default warehouse (site / system)
    global_wh = frappe.defaults.get_global_default("warehouse") or frappe.db.get_default("warehouse")
    if global_wh and frappe.db.exists("Warehouse", global_wh):
        w_company = frappe.get_value("Warehouse", global_wh, "company")
        if not w_company or (target_company and w_company == target_company):
            return global_wh

    # 4) First warehouse that belongs to the company (best-effort)
    if target_company:
        whs = frappe.get_all("Warehouse", filters={"company": target_company}, fields=["name"], limit_page_length=1)
        if whs:
            return whs[0].name

    # 5) Unable to resolve; raise clear actionable error
    msg = _("Could not determine a warehouse for Item {0}. Please ensure one of the following:").format(item_name)
    msg += "<ul>"
    msg += "<li>" + _("Create an Item Default row (Item → Item Default) with a default warehouse for the correct company.") + "</li>"
    msg += "<li>" + _("Create a Warehouse named {0} where {1} is the Company abbreviation (Company.abbr).").format(f"<strong>Stores - {{abbr}}</strong>", "abbr") + "</li>"
    msg += "<li>" + _("Set a global Default Warehouse in Setup → Settings (Site Defaults).") + "</li>"
    msg += "</ul>"
    frappe.throw(msg, frappe.ValidationError)


# ---- Main SLE creation function (uses the above helpers) ----
import frappe
from frappe.utils import flt, nowdate, nowtime
from erpnext.accounts.utils import get_fiscal_year

# Helper to get selling rate from Item Price
def _get_selling_rate(item_code):
    """
    Fetch the price_list_rate from Item Price where selling=1, ordered by valid_from desc.
    """
    item_prices = frappe.get_all(
        "Item Price",
        filters={"item_code": item_code, "selling": 1},
        fields=["price_list_rate"],
        order_by="valid_from desc, modified desc",
        limit=1
    )
    if item_prices:
        return flt(item_prices[0].price_list_rate)
    return 0.0

# ---- Main SLE creation function (uses the above helpers) ----
@frappe.whitelist()
def create_stock_ledger_entry_collections(animal_product, qty_issued, reference_doctype=None, reference_name=None):
    """
    Create Stock Ledger Entry for the provided animal_product (string name) and qty_issued (float).
    """
    if not animal_product:
        frappe.throw(_("animal_product is required"), frappe.ValidationError)

    qty_issued = flt(qty_issued or 0.0)
    if qty_issued == 0:
        frappe.throw(_("quantity is required and must be non-zero"), frappe.ValidationError)

    # Resolve Item: get item_code_value (for SLE), item_name (Item docname) and item_doc
    item_code_value, item_name, item_doc = _resolve_item_from_animal_product(animal_product)

    # Determine warehouse using the robust helper
    warehouse = _get_default_warehouse_for_item(item_name, item_doc)
    # _get_default_warehouse_for_item will throw a helpful error if it cannot find one

    # Try to find the latest SLE for this item_code_value + warehouse
    sle_rows = frappe.get_all(
        "Stock Ledger Entry",
        filters={"item_code": item_code_value, "warehouse": warehouse},
        fields=[
            "name", "qty_after_transaction", "incoming_rate", "outgoing_rate",
            "valuation_rate", "fiscal_year", "company", "posting_datetime", "creation"
        ],
        order_by="posting_datetime desc, creation desc",
        limit_page_length=1
    )

    if sle_rows:
        latest = sle_rows[0]
        latest_qty_after = flt(latest.get("qty_after_transaction") or 0.0)
        incoming_rate = flt(latest.get("incoming_rate") or 0.0)
        fiscal_year = latest.get("fiscal_year")
        company = latest.get("company")
    else:
        # No previous SLE: use sensible defaults (do NOT raise)
        frappe.logger("create_stock_ledger_entry_collections").warning(
            "No prior SLE found for Item %s (item_code %s) at Warehouse %s: creating initial SLE with defaults",
            item_name, item_code_value, warehouse
        )

        latest_qty_after = 0.0
        # Prefer item valuation_rate, then standard_rate, then 0.0
        incoming_rate = flt(item_doc.get("valuation_rate") or item_doc.get("standard_rate") or 0.0)

        # Determine fiscal year
        try:
            fy = get_fiscal_year(nowdate())
            fiscal_year = fy[0] if fy else None
        except Exception:
            fiscal_year = None

        # company fallback: prefer target company (determined from item_doc or defaults)
        company = _determine_target_company(item_doc)

    # Get selling rate from Item Price
    selling_rate = _get_selling_rate(item_code_value)

    # Use selling_rate for outgoing_rate and valuation_rate
    outgoing_rate = selling_rate
    valuation_rate = selling_rate

    # If selling_rate is 0, fallback to original logic for valuation_rate
    if valuation_rate == 0:
        if sle_rows:
            valuation_rate = flt(latest.get("valuation_rate") or 0.0)
        else:
            valuation_rate = incoming_rate
        outgoing_rate = 0.0

    # Compute quantities and values
    actual_qty = flt(qty_issued)  # positive addition
    new_qty_after = flt(latest_qty_after + actual_qty)
    stock_value = flt(valuation_rate * new_qty_after)
    stock_value_difference = flt(valuation_rate * actual_qty)
    stock_queue_str = frappe.as_json([[new_qty_after, valuation_rate]])

    # Build and insert SLE (use item_code_value in item_code)
    sle_doc = frappe.get_doc({
        "doctype": "Stock Ledger Entry",
        "item_code": item_code_value,
        "warehouse": warehouse,
        "posting_date": nowdate(),
        "posting_time": nowtime(),
        "voucher_type": reference_doctype or "Cattle",
        "voucher_no": reference_name or animal_product,
        "actual_qty": actual_qty,
        "qty_after_transaction": new_qty_after,
        "incoming_rate": incoming_rate,
        "outgoing_rate": outgoing_rate,
        "valuation_rate": valuation_rate,
        "fiscal_year": fiscal_year,
        "company": company,
        "stock_value": stock_value,
        "stock_value_difference": stock_value_difference,
        "stock_queue": stock_queue_str
    })

    sle_doc.insert(ignore_permissions=True)
    try:
        sle_doc.submit()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "create_stock_ledger_entry_collections: submit failed")
        return {"inserted": sle_doc.name, "submitted": False}

    return {"sle_name": sle_doc.name, "submitted": True}


import frappe
from collections import defaultdict
from frappe.utils import getdate

@frappe.whitelist()
def get_collection_data(cattle):
    """
    Fetches product collection data for a given batch from its child table,
    formatted for a stacked bar chart.
    """
    if not cattle:
        return None

    try:
        # CORRECT APPROACH: Load the parent document first.
        # The 'batch_name' is the unique ID of the 'Poultry Batches' document.
        doc = frappe.get_doc("Cattle", cattle)

        # Access the child table data directly from the document object.
        # The fieldname for your child table is 'product_inventory_log'.
        data = doc.get("production_log")

    except frappe.DoesNotExistError:
        frappe.log_error(f"Attempted to get collection data for non-existent batch: {cattle}")
        return {"labels": [], "datasets": []} # Return empty data if doc not found

    if not data:
        return {"labels": [], "datasets": []}

    # --- The rest of your processing logic is correct and remains the same ---
    # Structure: { date: { product: { qty: value, uom: value } } }
    processed_data = defaultdict(lambda: defaultdict(lambda: {'qty': 0, 'uom': ''}))
    all_products = set()

    # The 'data' variable is now the list of child table rows
    for row in data:
        if not row.date_of_collection or not row.product_collected:
            continue # Skip rows with missing essential data

        date_str = getdate(row.date_of_collection).strftime("%Y-%m-%d")
        product = row.product_collected
        
        # Sum quantities if multiple collections of the same product occur on the same day
        processed_data[date_str][product]['qty'] += row.quantity_collected
        # Assume the UOM is consistent for a product
        processed_data[date_str][product]['uom'] = row.products_default_uom
        all_products.add(product)

    # --- Format data for Frappe Charts ---
    sorted_products = sorted(list(all_products))
    sorted_dates = sorted(processed_data.keys())
    
    tooltip_data = defaultdict(dict)
    
    datasets = []
    for product in sorted_products:
        values = []
        for date_str in sorted_dates:
            item = processed_data.get(date_str, {}).get(product)
            if item:
                quantity = item.get('qty', 0)
                uom = item.get('uom', '')
                values.append(quantity)
                tooltip_data[product][date_str] = f"{quantity} {uom}"
            else:
                values.append(0)
        
        datasets.append({
            "name": product,
            "values": values
        })

    return {
        "labels": sorted_dates,
        "datasets": datasets,
        "tooltip_data": tooltip_data
    }


import frappe
from frappe import _
from datetime import datetime

@frappe.whitelist()
def get_treatment_chart_data(cattle: str):
    """
    Return grouped treatment/vaccination data for charting.

    Returns:
    {
      "dates": ["2025-09-17", "2025-09-15", ...],            # latest -> oldest
      "vaccines": ["Newcastle Vaccine", "VACC-001", ...],
      "series": { "Newcastle Vaccine": [10, 0, ...], ... }   # aligned with dates
    }
    """
    if not cattle:
        return {"dates": [], "vaccines": [], "series": {}}

    # fetch relevant fields explicitly so we don't guess on client side
    logs = frappe.get_all(
        "Treatment and Vaccination Logs",
        filters={"specific_cattle_under_treatment": cattle},
        fields=[
            "name",
            "treatment_date",
            "vaccine_used",
            "qty_vaccine",
            "creation"
        ],
        order_by="creation desc",
        limit_page_length=2000
    )

    # helper to normalize date to YYYY-MM-DD
    def norm_date(val):
        if not val:
            return None
        if isinstance(val, str):
            s = val.strip()
            # prefer first 10 chars if ISO-like
            cand = s[:10]
            try:
                if len(cand) == 10:
                    datetime.strptime(cand, "%Y-%m-%d")
                    return cand
            except Exception:
                pass
            try:
                d = datetime.fromisoformat(s)
                return d.strftime("%Y-%m-%d")
            except Exception:
                pass
            try:
                d = frappe.utils.data.get_datetime(s)
                return d.strftime("%Y-%m-%d")
            except Exception:
                return None
        else:
            # likely a datetime object
            try:
                return val.strftime("%Y-%m-%d")
            except Exception:
                return None

    # Build grouped map date -> vaccine -> qty
    grouped = {}
    vaccine_set = set()

    for r in logs:
        # prefer human label if link field stores name in <field>_name
        vac = (r.get("vaccine_used") or "") 
        vac = vac.strip() if isinstance(vac, str) else str(vac)
        if not vac:
            vac = "(unknown)"

        # normalize date preferring treatment_date, fallback creation
        dt = norm_date(r.get("treatment_date")) or norm_date(r.get("creation")) or None
        if not dt:
            # ignore entries with no date at all (or you can choose to set to today)
            continue

        qty = r.get("qty_vaccine") or 0
        try:
            qty = float(qty)
        except Exception:
            try:
                qty = float(str(qty).strip() or 0)
            except Exception:
                qty = 0.0

        grouped.setdefault(dt, {})
        grouped[dt][vac] = grouped[dt].get(vac, 0.0) + qty
        vaccine_set.add(vac)

    if not grouped:
        return {"dates": [], "vaccines": [], "series": {}}

    # Dates sorted latest -> oldest
    dates = sorted(list(grouped.keys()), reverse=True)

    vaccines = sorted(list(vaccine_set))  # deterministically order vaccines (alphabetical)

    # Build series: vaccine -> array of qty aligned with dates
    series = {}
    for vac in vaccines:
        arr = []
        for d in dates:
            arr.append(round(grouped.get(d, {}).get(vac, 0.0), 6))
        series[vac] = arr

    return {"dates": dates, "vaccines": vaccines, "series": series}
