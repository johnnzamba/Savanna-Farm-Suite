# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Crop(Document):
	def after_insert(self):
		"""Auto-create a Crop Product when a Crop is inserted."""
		try:
			crop_product = frappe.get_doc({
				"doctype": "Crop Products",
				"product_name": self.name,
				"crop": self.name,
				"default_uom": "Kg",
				"additional_notes": "AUTOCREATED."
			})
			crop_product.insert(ignore_permissions=True)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Crop.after_insert: create Crop Product failed")
