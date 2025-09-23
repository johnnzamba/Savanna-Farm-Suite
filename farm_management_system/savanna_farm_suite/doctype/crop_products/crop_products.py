# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CropProducts(Document):
	def after_insert(self):
		batch_name = self.product_name
		if frappe.db.exists("Item", batch_name) or frappe.db.exists("Item", {"item_code": batch_name}):
			return
		stock_uom = self.default_uom if getattr(self, "default_uom", None) else "Kg"
		# Fetch default company and its abbreviation
		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": batch_name,
			"item_name": batch_name,
			"item_group": "All Item Groups",
			"stock_uom": stock_uom,
			"is_stock_item": 1
		})
		item.insert(ignore_permissions=True)
		frappe.msgprint(_(f"Product '{item.name}' has been created successfully."), alert=True, indicator="green")
    
	def on_update(self):
		# Create Item Price when add_selling_price is set/changed
		if getattr(self, "add_selling_price", None) is None:
			return

		try:
			# Find the corresponding Item
			item_name = frappe.db.get_value("Item", {"item_code": self.name}, "name")
			if not item_name:
				frappe.log_error(f"Item not found for crop product: {self.name}", "CropProducts.on_update")
				return

			# Validate and convert selling price
			try:
				new_price = float(self.add_selling_price)
			except (TypeError, ValueError):
				frappe.log_error(f"Invalid selling price: {self.add_selling_price}", "CropProducts.on_update")
				return

			# Check if Item Price already exists for this combination
			existing_price = frappe.db.exists("Item Price", {
				"item_code": self.name,
				"uom": self.default_uom,
				"price_list": "Standard Selling",
				"selling": 1,
				"currency": "KES"
			})

			if existing_price:
				# Update existing Item Price
				item_price = frappe.get_doc("Item Price", existing_price)
				if item_price.price_list_rate != new_price:
					item_price.price_list_rate = new_price
					item_price.save(ignore_permissions=True)
					frappe.db.commit()
					frappe.msgprint(
						_(f"Item Price for '{self.name}' updated to {new_price} Shillings."), 
						alert=True, 
						indicator="green"
					)
			else:
				# Create new Item Price document
				item_price = frappe.get_doc({
					"doctype": "Item Price",
					"item_code": self.name,
					"uom": self.default_uom or frappe.db.get_value("Item", self.name, "stock_uom"),
					"price_list": "Standard Selling",
					"selling": 1,
					"currency": "KES",
					"price_list_rate": new_price,
					"reference": self.name
				})
				
				item_price.insert(ignore_permissions=True)
				frappe.db.commit()
				frappe.msgprint(
					_(f"New Item Price created for '{self.name}' at {new_price} {item_price.uom}."), 
					alert=True, 
					indicator="green"
				)

		except Exception as e:
			frappe.log_error(frappe.get_traceback(), "CropProducts.on_update")
			frappe.msgprint(
				_(f"Failed to create/update Item Price: {str(e)}"), 
				alert=True, 
				indicator="red"
			)