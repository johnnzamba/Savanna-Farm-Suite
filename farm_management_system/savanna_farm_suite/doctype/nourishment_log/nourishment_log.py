# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt
from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.model.document import Document
import json
from frappe.utils import flt, nowdate, nowtime, get_datetime, now_datetime

class NourishmentLog(Document):
    def before_insert(self):
        self.validate_stock_before_insert()
        
    def validate_stock_before_insert(self):
        feed = (self.feed_issued or "").strip()
        qty_needed = flt(self.qty_issued or 0.0)
        feed_name = (self.animal_feed_name or "").strip()
        uom = getattr(self, "default_uom", "") or getattr(self, "feed_default_uom", "")

        if not feed:
            frappe.throw(_("Cannot validate stock: field 'feed_issued' is empty."), frappe.ValidationError)

        # Find corresponding Item by item_code
        items = frappe.get_all("Item", filters={"item_code": feed_name}, fields=["name"])
        if not items:
            frappe.throw(
                _("No Item found with item_code '{0}'. Cannot validate stock availability.").format(feed),
                frappe.ValidationError
            )

        # Use first matching Item
        item_name = items[0].get("name")

        # Fetch the latest Stock Ledger Entry for this item (ordered by creation desc)
        sle_rows = frappe.get_all(
            "Stock Ledger Entry",
            filters={"item_code": item_name},
            fields=["name", "qty_after_transaction", "creation"],
            order_by="creation desc",
            limit_page_length=1
        )

        if not sle_rows:
            frappe.throw(
                _("No Stock Ledger Entry found for Item '{0}'. Cannot validate stock availability.").format(item_name),
                frappe.ValidationError
            )

        latest_sle = sle_rows[0]
        available_qty = flt(latest_sle.get("qty_after_transaction") or 0.0)

        # Compare available vs needed
        if available_qty < qty_needed:
            # Build helpful error message with values and unit if available
            unit_text = f" {uom}" if uom else ""
            msg = _(
                "Insufficient stock for <strong>{feed_name}</strong> to create Nourishment Log.\n\n"
                "Requested: {requested}{unit}\n"
                "Available (latest Stock Ledger Entry): {available}\n\n"
                "Action: replenish stock or reduce requested quantity."
            ).format(requested=qty_needed, unit=unit_text, available=available_qty, feed_name=feed_name )

            frappe.throw(msg, frappe.ValidationError)
        return
    
    def after_insert(self):
        """
        Called after a Nourishment Log is inserted.
        Appends a row into the related Poultry Batches.nourishment_table (if poultry_batch present).
        """
        try:
            update_feed_log(self.name)
        except Exception as e:
            # log full traceback for debugging then throw a user friendly message
            frappe.log_error(frappe.get_traceback(), "Nourishment Log: update_feed_log failed")
            frappe.throw(_("Failed to update Poultry Batch's feed log: {0}").format(str(e)))
        
    def on_submit(self):
        """
        After a Nourishment Log is submitted, create the corresponding Stock Ledger Entry.
        We call the helper above to perform the insertion/submission.
        """
        try:
            create_stock_ledger_entry_for_nourishment(self.name)
        except Exception as e:
            frappe.throw(_("Failed to create Stock Ledger Entry for Nourishment Log {0}: {1}").format(self.name, str(e)))
        
        if self.log_intended_for_cattle_shed:
            try:
                # Update Cattle Shed document
                cattle_shed = frappe.get_doc("Cattle Shed", self.log_intended_for_cattle_shed)
                cattle_shed.append("feeding_logs", {
                    "date_fed": self.date_of_nourishment,
                    "fed_on": self.feed_issued,
                    "total_qty_issued": self.qty_issued,
                    "fed_by_user": self.user
                })
                cattle_shed.save(ignore_permissions=True)
                
                # Update individual Cattle documents in this shed
                cattle_list = frappe.get_all("Cattle", 
                                            filters={"cow_shed": self.log_intended_for_cattle_shed},
                                            fields=["name"])
                
                updated_count = 0
                for cattle in cattle_list:
                    cattle_doc = frappe.get_doc("Cattle", cattle.name)
                    cattle_doc.append("feeding_log", {
                        "date_fed": self.date_of_nourishment,
                        "fed_on": self.feed_issued,
                        "total_qty_issued": self.avg_consumption,  
                        "fed_by_user": self.user
                    })
                    cattle_doc.save(ignore_permissions=True)
                    updated_count += 1
                
                # Show success notification
                frappe.msgprint(
                    _("Successfully updated feeding logs for {0} cattle in {1} cattle shed").format(
                        updated_count, self.log_intended_for_cattle_shed
                    ),
                    title=_("Feeding Logs Updated"),
                    indicator="green"
                )
                
            except Exception as e:
                frappe.log_error(
                    _("Error updating feeding logs for cattle shed {0}: {1}").format(
                        self.log_intended_for_cattle_shed, str(e)
                    ),
                    "Nourishment Log on_submit"
                )
                frappe.msgprint(
                    _("Failed to update feeding logs for cattle shed. Please check error logs."),
                    title=_("Update Failed"),
                    indicator="red"
                )


@frappe.whitelist()
def create_stock_ledger_entry_for_nourishment(nourishment_log_name):
    if not nourishment_log_name:
        frappe.throw(_("nourishment_log_name is required"), frappe.ValidationError)

    nl = frappe.get_doc("Nourishment Log", nourishment_log_name)

    # First priority: animal_feed_name
    item_code_value = (nl.get("animal_feed_name") or "").strip()
    if not item_code_value and nl.get("feed_issued"):
        animal_feed = frappe.db.get_value("Animal Feeds", nl.feed_issued, "feed_name")
        if animal_feed:
            item_code_value = animal_feed.strip()

    # Final validation: ensure we have something
    if not item_code_value:
        frappe.throw(_("Nourishment Log {0} has no valid item (animal_feed_name or feed_issued -> feed_name).").format(nourishment_log_name))

    # Now filter Item where item_code == item_code_value
    items = frappe.get_all("Item", filters={"item_code": item_code_value}, fields=["name"])
    if not items:
        frappe.throw(_("No Item found with item_code '{0}'.").format(item_code_value))
    item_name = items[0].name

    # Warehouse from first Item Default
    item_doc = frappe.get_doc("Item", item_name)
    item_defaults = item_doc.get("item_defaults") or []
    warehouse = (item_defaults[0].get("default_warehouse") if item_defaults else None)
    if not warehouse:
        frappe.throw(_("Item {0} is missing Item Default → Default Warehouse.").format(item_name))

    # Get latest SLE for this item **and this warehouse**
    sle_rows = frappe.get_all(
        "Stock Ledger Entry",
        filters={"item_code": item_name, "warehouse": warehouse},
        fields=[
            "name", "qty_after_transaction", "incoming_rate", "outgoing_rate",
            "valuation_rate", "fiscal_year", "company", "posting_datetime", "creation"
        ],
        order_by="posting_datetime desc, creation desc", 
        limit_page_length=1
    )
    if not sle_rows:
        frappe.throw(_("No Stock Ledger Entry found for Item {0} at Warehouse {1}.").format(item_name, warehouse))

    latest = sle_rows[0]
    latest_qty_after = flt(latest.get("qty_after_transaction") or 0.0)
    incoming_rate = flt(latest.get("incoming_rate") or 0.0)
    outgoing_rate = flt(latest.get("outgoing_rate") or 0.0)
    valuation_rate = flt(latest.get("valuation_rate") or 0.0)
    fiscal_year = latest.get("fiscal_year")
    company = latest.get("company")

    # Build new SLE numbers
    qty_issued = flt(nl.get("qty_issued") or 0.0)
    actual_qty = -qty_issued                          # mandatory minus
    new_qty_after = flt(latest_qty_after + actual_qty)  # same as latest - qty_issued

    stock_value = flt(valuation_rate * new_qty_after)           # Balance Stock Value
    stock_value_difference = flt(valuation_rate * actual_qty)   # NEGATIVE by design

    # One-line JSON for Long Text field
    stock_queue_str = json.dumps([[new_qty_after, valuation_rate]])

    voucher_detail_no = nl.get("poultry_batch") or nl.get("log_for_poultry_shed") or None

    sle_doc = frappe.get_doc({
        "doctype": "Stock Ledger Entry",
        "item_code": item_name,
        "warehouse": warehouse,
        "posting_date": nowdate(),
        "posting_time": nowtime(),
        "voucher_type": "Nourishment Log",
        "voucher_no": nl.name,
        "voucher_detail_no": voucher_detail_no,
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
        frappe.log_error(frappe.get_traceback(), "create_sle_for_nourishment: submit failed")
        return {"inserted": sle_doc.name, "submitted": False}

    return {"sle_name": sle_doc.name, "submitted": True}


@frappe.whitelist()
def update_feed_log(nourishment_name):
    """
    Append row to Poultry Batches.nourishment_table (already implemented elsewhere),
    then recompute and update total_feed and total_water for the batch.
    """
    if not nourishment_name:
        return {"status": "error", "reason": "no nourishment_name provided"}

    nourishment = frappe.get_doc("Nourishment Log", nourishment_name)
    batch_name = nourishment.get("poultry_batch")
    if not batch_name:
        return {"status": "skipped", "reason": "no poultry_batch on nourishment log"}
    try:
        batch = frappe.get_doc("Poultry Batches", batch_name)
        qty = nourishment.get("qty_issued")
        uom = (nourishment.get("default_uom") or "").strip()
        total_qty_str = f"{qty} {uom}".strip() if qty not in (None, "") else ""

        batch.append("nourishment_table", {
            "date_fed": nourishment.get("date_of_nourishment"),
            "fed_on": nourishment.get("animal_feed_name"),
            "total_qty_issued": total_qty_str,
            "fed_by_user": nourishment.get("owner") or frappe.session.user
        })

        batch.flags.ignore_validate_update_after_submit = True
        batch.save(ignore_permissions=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "update_feed_log: append failed or skipped")
    result = compute_batch_totals_and_update(batch_name, save=True)
    return result

def compute_batch_totals(batch_name):
    """
    Compute:
      - total_feed: distinct feed lines for the LATEST date_of_nourishment:
            feed_name - <sum qty> <uom>
      - total_water: cumulative water consumed (to date) across ALL feeds:
            <sum water_consumed> Litres
    """
    if not batch_name:
        return {"total_feed": "", "total_water": "", "latest_date": None, "status": "error", "reason": "no batch_name"}

    logs = frappe.get_all(
        "Nourishment Log",
        filters={"poultry_batch": batch_name},
        fields=["date_of_nourishment", "animal_feed_name", "qty_issued", "default_uom", "water_consumed"],
        order_by="date_of_nourishment asc",
        limit_page_length=10000
    )

    if not logs:
        return {"total_feed": "", "total_water": "", "latest_date": None, "status": "ok", "rows": 0}

    dates = [l.get("date_of_nourishment") for l in logs if l.get("date_of_nourishment")]
    latest_date = max(dates) if dates else None

    # --- Compute feed quantities for latest date ---
    feed_qty_on_latest = {}
    latest_logs = [l for l in logs if l.get("date_of_nourishment") == latest_date] if latest_date else []

    for r in latest_logs:
        feed = (r.get("animal_feed_name") or "Unknown").strip()
        uom = (r.get("default_uom") or "").strip()
        qty_val = float(r.get("qty_issued") or 0)
        if feed not in feed_qty_on_latest:
            feed_qty_on_latest[feed] = {"qty_sum": 0.0, "uom": uom}
        feed_qty_on_latest[feed]["qty_sum"] += qty_val
        if not feed_qty_on_latest[feed]["uom"] and uom:
            feed_qty_on_latest[feed]["uom"] = uom

    # --- Compute cumulative water consumed (ALL TIME) ---
    total_water_sum = 0.0
    for r in logs:
        try:
            total_water_sum += float(r.get("water_consumed") or 0)
        except Exception:
            pass

    # Format water total
    if float(total_water_sum).is_integer():
        total_water = f"{int(total_water_sum)} Litres"
    else:
        total_water = f"{round(total_water_sum, 3)} Litres"

    # Build total_feed string
    total_feed_lines = []
    for feed_name, vals in feed_qty_on_latest.items():
        qty_sum = vals.get("qty_sum", 0.0)
        uom = vals.get("uom") or ""
        qty_str = str(int(qty_sum)) if qty_sum.is_integer() else str(round(qty_sum, 3)).rstrip('0').rstrip('.')
        total_feed_lines.append(f"{feed_name} - {qty_str} {uom}".strip())

    total_feed = "\n".join(total_feed_lines) if total_feed_lines else ""

    return {
        "total_feed": total_feed,
        "total_water": total_water,
        "latest_date": latest_date,
        "status": "ok",
        "rows_total": len(logs),
        "rows_on_latest_date": len(latest_logs) if latest_date else 0,
        "distinct_feeds_on_latest": list(feed_qty_on_latest.keys()),
        "distinct_feeds_all_time": list({r.get('animal_feed_name') for r in logs})
    }


def compute_batch_totals_and_update(batch_name, save=False):
    """
    Compute totals and optionally persist to Poultry Batches.total_feed and total_water.
    If save=True, saves the batch doc (ignoring permission and submit validation flags).
    Returns the compute result dict.
    """
    result = compute_batch_totals(batch_name)
    if save and result.get("status") == "ok":
        try:
            batch = frappe.get_doc("Poultry Batches", batch_name)
            batch.total_feed = result.get("total_feed") or ""
            batch.total_water = result.get("total_water") or ""
            batch.flags.ignore_validate_update_after_submit = True
            batch.save(ignore_permissions=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "compute_batch_totals_and_update: save failed")
            result["save_error"] = True
    return result

@frappe.whitelist()
def get_batch_totals(batch_name):
    """
    Whitelisted helper for client to retrieve computed strings without saving.
    """
    return compute_batch_totals(batch_name)