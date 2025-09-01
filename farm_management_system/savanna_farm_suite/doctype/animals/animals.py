# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Animals(Document):
	def after_insert(self):
		"""Create an Item with this batch's name after insert, if it doesn't already exist."""
		batch_name = self.name
		if frappe.db.exists("Item", batch_name) or frappe.db.exists("Item", {"item_code": batch_name}):
			return

		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": batch_name,
			"item_name": batch_name,
			"item_group": "All Item Groups",
			"stock_uom": "Nos",
			"is_stock_item": 1,
		})
		item.insert(ignore_permissions=True)
		frappe.publish_realtime(
			event="show_alert",
			message={
				"message": f"Item <strong>{item.name}</strong> has been created successfully!",
				"indicator": "green"
			},
			user=frappe.session.user
		)
		
		# Play sound on client-side
		frappe.publish_realtime(
			event="play_sound",
			message="submit",
			user=frappe.session.user
		)
