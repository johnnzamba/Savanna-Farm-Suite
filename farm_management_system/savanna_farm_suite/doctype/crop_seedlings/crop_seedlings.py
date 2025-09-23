# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CropSeedlings(Document):
	def on_update(self):
		if self.has_value_changed("specify_unit_of_measurement"):
			item = frappe.get_doc("Item", {"item_code": self.name}, for_update=True)
			if item:
				item.stock_uom = self.specify_unit_of_measurement
				item.save()
				frappe.db.commit()

		if self.has_value_changed("unit_purchase_price"):
			try:
				# Find the corresponding Item
				item_name = frappe.db.get_value("Item", {"item_code": self.name}, "name")
				if not item_name:
					frappe.log_error(f"Item not found for crop product: {self.name}", "CropProducts.on_update")
					return

				# Validate and convert selling price
				try:
					new_price = float(self.unit_purchase_price)
				except (TypeError, ValueError):
					frappe.log_error(f"Invalid selling price: {self.unit_purchase_price}", "CropProducts.on_update")
					return

				# Check if Item Price already exists for this combination
				existing_price = frappe.db.exists("Item Price", {
					"item_code": self.name,
					"uom": self.specify_unit_of_measurement,
					"price_list": "Standard Buying",
					"buying": 1,
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
						"uom": self.specify_unit_of_measurement or frappe.db.get_value("Item", self.name, "stock_uom"),
						"price_list": "Standard Buying",
						"buying": 1,
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


@frappe.whitelist()
def get_purchase_history(seedling_name):
    return frappe.db.sql("""
        SELECT 
            pr.posting_date,
            pr.supplier_name,
            pr.name,
            pri.received_qty,
            pri.uom,
            pri.base_amount
        FROM `tabPurchase Receipt Item` pri
        INNER JOIN `tabPurchase Receipt` pr ON pri.parent = pr.name
        WHERE pri.item_code = %s AND pr.docstatus = 1
        ORDER BY pr.posting_date DESC
    """, seedling_name, as_dict=True)


@frappe.whitelist()
def get_current_stock(item_code):
    entries = frappe.get_all("Stock Ledger Entry",
        filters={"item_code": item_code},
        fields=["qty_after_transaction", "stock_value", "valuation_rate"],
        order_by="creation DESC",
        limit=1
    )
    return entries[0] if entries else {}