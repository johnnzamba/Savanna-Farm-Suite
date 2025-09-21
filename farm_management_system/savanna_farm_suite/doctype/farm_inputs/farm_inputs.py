# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class FarmInputs(Document):
	def after_insert(self):
		batch_name = self.vaccine_name
		if frappe.db.exists("Item", batch_name) or frappe.db.exists("Item", {"item_code": batch_name}):
			return
		stock_uom = self.uom if getattr(self, "uom", None) else "Nos"

		# Fetch default company and its abbreviation
		default_company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_default("company")
		company_abbr = frappe.get_value("Company", default_company, "abbr") if default_company else None

		# Build reorder levels table only if auto_reorder is enabled
		reorder_levels = []
		if getattr(self, "auto_reorder", 0) and company_abbr and self.reorder_level and self.reorder_qty:
			reorder_levels.append({
				"warehouse_group": f"All Warehouses - {company_abbr}",
				"warehouse": f"Stores - {company_abbr}",
				"warehouse_reorder_level": self.reorder_level,
				"warehouse_reorder_qty": self.reorder_qty,
				"material_request_type": "Purchase",
			})

		# Build supplier items from Table MultiSelect field
		supplier_items = []
		if getattr(self, "feed_supplier", None):
			for row in self.feed_supplier:
				if getattr(row, "feed_supplier", None):
					supplier_items.append({
						"supplier": row.feed_supplier
					})

		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": batch_name,
			"item_name": batch_name,
			"item_group": "All Item Groups",
			"stock_uom": stock_uom,
			"is_stock_item": 1,
			"reorder_levels": reorder_levels,
			"supplier_items": supplier_items,
		})
		item.insert(ignore_permissions=True)
		frappe.msgprint(_(f"Farm Input '{item.name}' has been created successfully."), alert=True, indicator="green")
                  

