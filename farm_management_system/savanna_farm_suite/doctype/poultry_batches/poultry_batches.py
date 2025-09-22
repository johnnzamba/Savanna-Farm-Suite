# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PoultryBatches(Document):
	# @frappe.whitelist(allow_guest=True)
	# def get_profitability_data(batch_name):
	# 	"""Get profitability data for charts"""
	# 	feed_data = get_feed_cost_data(batch_name)
	# 	stock_data = get_stock_value_data(batch_name)
		
	# 	return {
	# 		'feed_data': feed_data,
	# 		'stock_data': stock_data
	# 	}

	def after_insert(self):
		"""Enqueue background job to generate AI image for the animal batch."""
		# Enqueue the image generation job
		frappe.enqueue(
			"farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.generate_ai_image_for_batch",
			doc_name=self.name,
			animal_batch=self.animal_batch,
			queue="long"
		)
		self.db_set("batch_status", "Active", update_modified=True)

@frappe.whitelist()
def generate_ai_image_for_batch(doc_name, animal_batch):
    """Generate AI image using Stable Diffusion API and update the document."""
    try:
        import requests
        import base64
        import binascii
        import re
        import frappe

        prompt = f"Generate an appealing avatar for {animal_batch}"
        url = "https://fast-open-source-ai.p.rapidapi.com/stabilityai/stable-diffusion-xl-base-1.0"
        headers = {
            "x-rapidapi-key": "89752ff3d5msh0010508de6eca5cp1d1ae6jsn2d45ec083d0b",
            "x-rapidapi-host": "fast-open-source-ai.p.rapidapi.com",
            "Content-Type": "application/json"
        }
        payload = {"inputs": prompt}

        response = requests.post(url, headers=headers, json=payload, timeout=60)

        def _fix_base64_padding(s):
            if isinstance(s, str) and s.startswith("data:"):
                s = s.split(",", 1)[-1]
            s = (s or "").strip()
            mod4 = len(s) % 4
            if mod4:
                s += "=" * (4 - mod4)
            return s

        def _safe_filename(name, max_len=100):
            if not name:
                return "generated"
            s = re.sub(r'[^0-9A-Za-z_-]+', '_', name)
            s = re.sub(r'_{2,}', '_', s).strip('_')
            s = s[:max_len].lower()
            return s or "generated"

        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "").lower()
            file_bytes = None

            if content_type.startswith("image/"):
                file_bytes = response.content
            else:
                try:
                    j = response.json()
                except ValueError:
                    j = None

                candidates = []
                if isinstance(j, dict):
                    artifacts = j.get("artifacts") or j.get("images") or j.get("data") or j.get("output")
                    if isinstance(artifacts, list) and artifacts:
                        for a in artifacts:
                            if isinstance(a, dict):
                                for key in ("base64", "b64_json", "b64", "image", "image_base64"):
                                    if key in a and a[key]:
                                        candidates.append(a[key])
                            elif isinstance(a, str):
                                candidates.append(a)
                    for key in ("image", "image_base64", "base64", "b64_json", "output", "result"):
                        if key in j and j.get(key):
                            candidates.append(j.get(key))

                if not candidates and isinstance(j, list):
                    for item in j:
                        if isinstance(item, str):
                            candidates.append(item)

                for cand in candidates:
                    try:
                        clean = _fix_base64_padding(cand)
                        file_bytes = base64.b64decode(clean)
                        break
                    except (binascii.Error, TypeError):
                        file_bytes = None

                if file_bytes is None:
                    text = (response.text or "").strip()
                    if text:
                        try:
                            clean = _fix_base64_padding(text)
                            file_bytes = base64.b64decode(clean)
                        except (binascii.Error, TypeError):
                            file_bytes = None

            if not file_bytes:
                frappe.log_error(
                    f"Stable Diffusion API returned 200 but no valid image data found. Headers: {response.headers}\nBody: {response.text[:2000]}",
                    "Poultry Batches AI Image Generation"
                )
                raise Exception("No valid image bytes found in API response.")

            # Base64-encode bytes so File doc can decode it on insert
            b64_content = base64.b64encode(file_bytes).decode("ascii")
            safe_name = _safe_filename(animal_batch)
            filename = f"{safe_name}_ai_generated.png"

            # Create File doc manually (works across Frappe versions)
            file_doc = frappe.get_doc({
                "doctype": "File",
                "file_name": filename,
                "attached_to_doctype": "Poultry Batches",
                "attached_to_name": doc_name,
                "content": b64_content,
                "decode": True,
                "is_private": 0
            })
            file_doc.insert(ignore_permissions=True)

            # Update the document with the generated image URL
            doc = frappe.get_doc("Poultry Batches", doc_name)
            doc.image_of_animal_batch = file_doc.file_url
            doc.save(ignore_permissions=True)

            # Show success notification
            frappe.publish_realtime(
                event="show_alert",
                message={
                    "message": f"AI image generated successfully for {animal_batch}!",
                    "indicator": "green"
                },
                user=frappe.session.user
            )
        else:
            frappe.log_error(
                f"Stable Diffusion API Error: {response.status_code} - {response.text}",
                "Poultry Batches AI Image Generation"
            )

    except Exception as e:
        frappe.log_error(
            f"Error generating AI image for {animal_batch}: {str(e)}",
            "Poultry Batches AI Image Generation"
        )


import frappe
from frappe import _
from datetime import datetime

@frappe.whitelist()
def get_treatment_chart_data(poultry_batch_name: str):
    """
    Return grouped treatment/vaccination data for charting.

    Returns:
    {
      "dates": ["2025-09-17", "2025-09-15", ...],            # latest -> oldest
      "vaccines": ["Newcastle Vaccine", "VACC-001", ...],
      "series": { "Newcastle Vaccine": [10, 0, ...], ... }   # aligned with dates
    }
    """
    if not poultry_batch_name:
        return {"dates": [], "vaccines": [], "series": {}}

    # fetch relevant fields explicitly so we don't guess on client side
    logs = frappe.get_all(
        "Treatment and Vaccination Logs",
        filters={"poultry_batch_under_treatment": poultry_batch_name},
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


import frappe
import json
from frappe import _
from frappe.utils import flt, nowdate, nowtime
from frappe.utils.data import now_datetime
from erpnext.accounts.utils import get_fiscal_year

@frappe.whitelist()
def create_collection_entry(poultry_batch, date_of_collection, rows):
    """
    rows is expected to be a list of dicts:
    [{ "animal_product": "...", "default_uom": "...", "quantity_collected": 1.5 }, ...]
    The client may send rows as a JSON string, so we parse defensively.
    """
    if not poultry_batch:
        frappe.throw(_("Poultry batch is required"), frappe.ValidationError)

    # Parse rows if needed
    if isinstance(rows, str):
        try:
            rows = json.loads(rows)
        except Exception:
            # fallback to frappe.parse_json
            rows = frappe.parse_json(rows)

    if not rows or len(rows) == 0:
        frappe.throw(_("No product rows provided"), frappe.ValidationError)

    # Load the Poultry Batches doc
    pb = frappe.get_doc("Poultry Batches", poultry_batch)
    if not pb:
        frappe.throw(_("Poultry Batches {0} not found").format(poultry_batch))

    # Append rows to product_inventory_log child table
    for r in rows:
        product_collected = r.get("animal_product") or r.get("animal_products") or r.get("product")
        default_uom = r.get("default_uom") or r.get("products_default_uom") or ''
        qty = flt(r.get("quantity_collected") or r.get("qty") or 0.0)
        if not product_collected:
            frappe.throw(_("Each row must include an animal_product"), frappe.ValidationError)

        pb.append("product_inventory_log", {
            "date_of_collection": date_of_collection or nowdate(),
            "product_collected": product_collected,
            "products_default_uom": default_uom,
            "quantity_collected": qty
        })

    # Save the Poultry Batches doc (this writes the child rows)
    pb.save(ignore_permissions=True)
    frappe.db.commit()

    # For each row, create Stock Ledger Entry
    sle_results = []
    for r in rows:
        product_collected = r.get("animal_product") or r.get("animal_products") or r.get("product")
        qty = flt(r.get("quantity_collected") or 0.0)
        try:
            sle = create_stock_ledger_entry_collections(product_collected, qty, reference_doctype="Poultry Batches", reference_name=poultry_batch)
            sle_results.append(sle)
        except Exception as e:
            # Log error but continue processing next rows
            frappe.log_error(f"create_stock_ledger_entry_collections failed for {product_collected}: {e}", "create_collection_entry")

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
        outgoing_rate = flt(latest.get("outgoing_rate") or 0.0)
        valuation_rate = flt(latest.get("valuation_rate") or 0.0)
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
        outgoing_rate = 0.0
        valuation_rate = incoming_rate

        # Determine fiscal year
        try:
            fy = get_fiscal_year(nowdate())
            fiscal_year = fy[0] if fy else None
        except Exception:
            fiscal_year = None

        # company fallback: prefer target company (determined from item_doc or defaults)
        company = _determine_target_company(item_doc)

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
        "voucher_type": reference_doctype or "Poultry Batches",
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
def get_collection_data(batch_name):
    """
    Fetches product collection data for a given batch from its child table,
    formatted for a stacked bar chart.
    """
    if not batch_name:
        return None

    try:
        # CORRECT APPROACH: Load the parent document first.
        # The 'batch_name' is the unique ID of the 'Poultry Batches' document.
        doc = frappe.get_doc("Poultry Batches", batch_name)

        # Access the child table data directly from the document object.
        # The fieldname for your child table is 'product_inventory_log'.
        data = doc.get("product_inventory_log")

    except frappe.DoesNotExistError:
        frappe.log_error(f"Attempted to get collection data for non-existent batch: {batch_name}")
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
from frappe.utils import getdate, add_days, formatdate
from collections import defaultdict
import random

def get_random_color():
    """Generates a random hex color."""
    return "#{:06x}".format(random.randint(0, 0xFFFFFF))

def get_week_start(date):
    """Get the start of the week (Monday) for a given date"""
    date = getdate(date)
    # weekday() returns 0 for Monday, 6 for Sunday
    return add_days(date, -date.weekday())

@frappe.whitelist()
def get_profitability_chart_data(batch_name):
    """
    Fetches and processes data for two charts:
    1. Weekly feed expenses for the given poultry batch.
    2. Weekly stock value of animal products tied to the batch.
    """
    return {
        "expense_data": get_weekly_expense_data(batch_name),
        "stock_data": get_weekly_stock_value_data(batch_name)
    }

def get_weekly_expense_data(batch_name):
    """
    Processes nourishment logs to calculate weekly expenses per feed type.
    """
    nourishment_logs = frappe.db.get_all(
        "Nourishment Log",
        filters={"poultry_batch": batch_name},
        fields=["date_of_nourishment", "feed_issued", "qty_issued"],
        order_by='date_of_nourishment',
        ignore_permissions=True
    )

    if not nourishment_logs:
        return {'labels': [], 'datasets': []}

    # Get feed costs
    feed_costs = {}
    feeds = set(log.get('feed_issued') for log in nourishment_logs if log.get('feed_issued'))
    for feed in feeds:
        cost = frappe.db.get_value('Animal Feeds', feed, 'cost_of_the_feed')
        feed_costs[feed] = cost or 0

    # Group by week and calculate costs
    weekly_data = defaultdict(lambda: defaultdict(float))
    for log in nourishment_logs:
        if not log.get('date_of_nourishment') or not log.get('feed_issued'):
            continue
        try:
            week_start = get_week_start(log['date_of_nourishment'])
            weekly_data[week_start][log['feed_issued']] += log['qty_issued'] * feed_costs[log['feed_issued']]
        except Exception as e:
            frappe.log_error(f"Error processing nourishment log: {log}. Error: {e}", "Profitability Chart Error")


    if not weekly_data:
        return {'labels': [], 'datasets': []}

    # Prepare chart data
    weeks = sorted(weekly_data.keys())
    datasets = defaultdict(list)
    labels = []

    all_feeds = set(feed for weekly_costs in weekly_data.values() for feed in weekly_costs)

    for week_start in weeks:
        week_end = add_days(week_start, 6)
        labels.append(f"Week {weeks.index(week_start) + 1}\n({formatdate(week_start, 'dd/MM')}-{formatdate(week_end, 'dd/MM')})")
        for feed in all_feeds:
            cost = weekly_data[week_start].get(feed, 0)
            datasets[feed].append(cost)

    return {
        'labels': labels,
        'datasets': [{'name': feed, 'values': values} for feed, values in datasets.items()]
    }


def get_weekly_stock_value_data(batch_name):
    """
    Processes stock ledger entries to get the latest stock value per week for each product.
    """
    # 1. Get animal products tied to the batch
    animal_products = frappe.get_all('Animal Products',
        filters={'product_tied_to_which_animal': batch_name},
        fields=['name'],
        ignore_permissions=True
    )

    product_names = [product['name'] for product in animal_products]

    if not product_names:
        return {'labels': [], 'datasets': []}

    # 2. Get latest stock value for each product
    product_data = {}
    for product in product_names:
        # Get the latest stock ledger entry for this product
        sle = frappe.get_all('Stock Ledger Entry',
            filters={'item_code': product},
            fields=['posting_date', 'stock_value'],
            order_by='posting_date DESC',
            limit=1,
            ignore_permissions=True
        )

        if sle:
            product_data[product] = {
                'posting_date': sle[0]['posting_date'],
                'stock_value': sle[0]['stock_value']
            }

    if not product_data:
        return {'labels': [], 'datasets': []}

    # 3. Group by week
    weekly_data = defaultdict(lambda: defaultdict(float))
    for product, data in product_data.items():
        if data.get('posting_date'):
            try:
                week_start = get_week_start(data['posting_date'])
                weekly_data[week_start][product] = data['stock_value'] or 0
            except Exception as e:
                frappe.log_error(f"Error processing stock data for {product}: {data}. Error: {e}", "Profitability Chart Error")


    if not weekly_data:
        return {'labels': [], 'datasets': []}

    # 4. Prepare chart data
    weeks = sorted(weekly_data.keys())
    datasets = defaultdict(list)
    labels = []
    all_products = set(product for weekly_values in weekly_data.values() for product in weekly_values)


    for week_start in weeks:
        week_end = add_days(week_start, 6)
        labels.append(f"Week {weeks.index(week_start) + 1}\n({formatdate(week_start, 'dd/MM')}-{formatdate(week_end, 'dd/MM')})")
        for product in all_products:
            value = weekly_data[week_start].get(product, 0)
            datasets[product].append(value)


    return {
        'labels': labels,
        'datasets': [{'name': product, 'values': values} for product, values in datasets.items()]
    }


import frappe
from frappe.utils import flt

@frappe.whitelist()
def cull_poultry_batch(batch_name, cull_count):
    """
    Safely add cull_count (int) to Poultry Batch.mortality_count,
    recalc mortality_rate = (mortality_count / total_animals) * 100,
    then commit.
    Returns dict with success flag or error.
    """
    try:
        # ensure int
        cull_count = int(float(cull_count))
    except Exception:
        return {"success": False, "error": "Invalid cull_count; must be a whole number."}

    if cull_count <= 0:
        return {"success": False, "error": "Cull count must be a positive integer."}

    # fetch doc
    try:
        doc = frappe.get_doc('Poultry Batches', batch_name)
    except frappe.DoesNotExistError:
        return {"success": False, "error": f"Poultry Batches '{batch_name}' not found."}

    # permission check
    try:
        doc.check_permission('write')
    except Exception:
        return {"success": False, "error": "You do not have permission to modify this batch."}

    total = flt(doc.get('total_animals') or 0)
    if total <= 0:
        return {"success": False, "error": "Batch has no total_animals set or total_animals is zero."}

    current_mortality = int(flt(doc.get('mortality_count') or 0))
    new_mortality = current_mortality + cull_count

    if new_mortality > total:
        return {"success": False, "error": "Cull count would exceed total animals in the batch."}

    # atomic update using db_set then commit
    try:
        # store integer mortality_count
        frappe.db.set_value('Poultry Batches', batch_name, 'mortality_count', new_mortality, update_modified=True)
        mortality_rate = (new_mortality / total) * 100
        frappe.db.set_value('Poultry Batches', batch_name, 'mortality_rate', flt(mortality_rate, 6), update_modified=True)

        frappe.db.commit()
    except Exception as e:
        frappe.db.rollback()
        return {"success": False, "error": f"Failed to update batch: {str(e)}"}

    return {
        "success": True,
        "mortality_count": new_mortality,
        "mortality_rate": mortality_rate
    }
