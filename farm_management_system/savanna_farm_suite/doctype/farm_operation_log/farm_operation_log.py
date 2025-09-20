# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, nowdate, nowtime
from frappe.model.document import Document
from erpnext.accounts.utils import get_fiscal_year

class FarmOperationLog(Document):
    def after_insert(self):
        # 1) create stock ledger entries (existing behavior)
        self._create_stock_entries()

        # 2) append rows to Crop Intake.table_voqq
        self._mirror_materials_to_crop_intake()

    def _create_stock_entries(self):
        # keep existing behavior but isolated for readability
        if not create_stock_ledger_entry_collections:
            frappe.log_error(
                "create_stock_ledger_entry_collections not imported; skipping stock updates",
                "FarmOperationLog._create_stock_entries"
            )
            return

        for row in self.get("material_records") or []:
            if not row.get("farm_input_used") or not row.get("quantity_of_agent_used"):
                continue
            try:
                create_stock_ledger_entry_collections(
                    item_identifier=row.get("farm_input_used"),
                    qty_issued=row.get("quantity_of_agent_used"),
                    uom=row.get("inputs_default_uom"),
                    reference_doctype=self.doctype,
                    reference_name=self.name
                )
            except Exception:
                frappe.log_error(
                    frappe.get_traceback(),
                    f"Failed to create stock entry for {row.get('farm_input_used')} in {self.name}"
                )

    def _mirror_materials_to_crop_intake(self):
        crop_batch = self.get("farming_activity_tied_to_which_crop_batch")
        if not crop_batch:
            # nothing to mirror
            return

        try:
            crop_doc = frappe.get_doc("Crop Intake", crop_batch)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"Failed to fetch Crop Intake {crop_batch} from {self.name}"
            )
            return

        # Collect unique employees (preserve order)
        seen = set()
        employees = []
        for s in (self.get("staff_members_involved") or []):
            emp = s.get("employee")
            if emp and emp not in seen:
                seen.add(emp)
                employees.append(emp)

        # Build nested child rows for workers (list of dicts)
        workers_rows = [{"employee": emp} for emp in employees] if employees else []

        activity_date = self.get("specify_the_date_of_activity") or nowdate()

        appended_any = False
        for row in self.get("material_records") or []:
            if not row.get("farm_input_used"):
                continue

            new_child = {
                "farming_agent_used": row.get("farm_input_used"),
                "agents_uom": row.get("inputs_default_uom"),
                "date_of_use": activity_date,
                "quantity_of_farming_agent_used": row.get("quantity_of_agent_used"),
            }

            # workers_involved_in_exercise is a child table with field `employee`
            if workers_rows:
                # we assign a list of dicts, which Frappe expects for nested child tables
                new_child["workers_involved_in_exercise"] = workers_rows

            try:
                crop_doc.append("table_voqq", new_child)
                appended_any = True
            except Exception:
                frappe.log_error(
                    frappe.get_traceback(),
                    f"Failed to append material {row.get('farm_input_used')} to Crop Intake {crop_batch}"
                )

        if appended_any:
            try:
                # ignore_permissions to ensure hook can write; remove if you need strict permission checks
                crop_doc.save(ignore_permissions=True)
            except Exception:
                frappe.log_error(
                    frappe.get_traceback(),
                    f"Failed to save Crop Intake {crop_batch} after appending rows from {self.name}"
                )



def run_after_insert(docname):
    frappe.set_user("Administrator")
    doc = frappe.get_doc("Farm Operation Log", docname)
    doc.run_method("after_insert")
    frappe.db.commit()
    return f"after_insert ran on {docname}"

# ---- Main SLE creation function (uses the above helpers) ----
import frappe
from frappe import _
from frappe.utils import flt, nowdate, nowtime
from erpnext.accounts.utils import get_fiscal_year

@frappe.whitelist()
def create_stock_ledger_entry_collections(item_identifier, qty_issued, uom=None, reference_doctype=None, reference_name=None):
    """
    Create a Stock Ledger Entry for the provided item_identifier and qty_issued.

    Important: This version DOES NOT attempt UOM conversion. If the provided `uom`
    differs from the item's stock_uom we log and proceed assuming qty_issued is already
    in the stock_uom.

    Relies on helper functions defined in the same module:
      - _resolve_item_from_animal_product(item_identifier)
      - _determine_target_company(item_doc=None)
      - _get_default_warehouse_for_item(item_name, item_doc=None)
    """

    # Basic validation
    if not item_identifier:
        frappe.throw(_("item_identifier is required"), frappe.ValidationError)

    qty_issued = flt(qty_issued or 0.0)
    if qty_issued == 0:
        frappe.throw(_("quantity is required and must be non-zero"), frappe.ValidationError)

    # Resolve item (returns item_code_value, item_name, item_doc)
    item_code_value, item_name, item_doc = _resolve_item_from_identifier(item_identifier)

    # Note: intentionally do NOT do UOM conversions here.
    stock_uom = item_doc.get("stock_uom")
    if uom and uom != stock_uom:
        frappe.logger("create_stock_ledger_entry_collections").info(
            "UOM mismatch for Item %s: provided uom=%s, stock_uom=%s. Proceeding without conversion (treating qty as stock_uom).",
            item_code_value, uom, stock_uom
        )

    # Determine warehouse for this item
    warehouse = _get_default_warehouse_for_item(item_name, item_doc)

    # Find latest SLE for valuation data and latest qty_after_transaction
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
        # No prior SLE: use sensible defaults
        frappe.logger("create_stock_ledger_entry_collections").warning(
            "No prior SLE found for Item %s at Warehouse %s: creating initial SLE with defaults",
            item_name, warehouse
        )

        latest_qty_after = 0.0
        incoming_rate = flt(item_doc.get("valuation_rate") or item_doc.get("standard_rate") or 0.0)
        outgoing_rate = 0.0
        valuation_rate = incoming_rate

        # Determine fiscal year (best-effort)
        try:
            fy = get_fiscal_year(nowdate())
            fiscal_year = fy[0] if fy else None
        except Exception:
            fiscal_year = None

        # company fallback
        company = _determine_target_company(item_doc)

    # Compute amounts (we are issuing qty -> actual_qty negative)
    actual_qty = flt(-qty_issued)
    new_qty_after = flt(latest_qty_after + actual_qty)
    stock_value = flt(valuation_rate * new_qty_after)
    stock_value_difference = flt(valuation_rate * actual_qty)
    stock_queue_str = frappe.as_json([[new_qty_after, valuation_rate]])

    # Build Stock Ledger Entry doc
    sle_doc = frappe.get_doc({
        "doctype": "Stock Ledger Entry",
        "item_code": item_code_value,
        "warehouse": warehouse,
        "posting_date": nowdate(),
        "posting_time": nowtime(),
        # voucher_type/voucher_no: prefer passed references but keep readable defaults
        "voucher_type": reference_doctype or "Farm Operation Log",
        "voucher_no": reference_name or item_identifier,
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

    # Insert and try submit
    sle_doc.insert(ignore_permissions=True)
    try:
        sle_doc.submit()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "create_stock_ledger_entry_collections: submit failed")
        return {"sle_name": sle_doc.name, "submitted": False}

    return {"sle_name": sle_doc.name, "submitted": True}


# ---- Resolve Item from item_identifier (returns item_code_value and item_name) ----
def _resolve_item_from_identifier(item_identifier):
	"""
	Return (item_code_value, item_name, item_doc)
	item_code_value -> what Stock Ledger Entry.item_code should contain
	item_name -> the Item doctype name (frappe.get_doc key)
	item_doc -> the Item doc
	"""
	if not item_identifier:
		frappe.throw(_("item_identifier is required"), frappe.ValidationError)

	# First try matching item_code (common pattern)
	items = frappe.get_all("Item", filters={"item_code": item_identifier},
						   fields=["name", "item_code"], limit_page_length=1)
	if not items:
		# fallback: maybe the Item name equals the item_identifier
		items = frappe.get_all("Item", filters={"name": item_identifier},
							   fields=["name", "item_code"], limit_page_length=1)

	if not items:
		frappe.throw(_("No Item found with item_code or name '{0}'.").format(item_identifier))

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