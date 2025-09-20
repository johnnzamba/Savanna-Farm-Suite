# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
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
			item = frappe.get_doc("Item", {"item_code": self.name}, for_update=True)
			if item:
				item.valuation_rate = self.unit_purchase_price
				item.save()
				frappe.db.commit()



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
        order_by="creation ASC",
        limit=1
    )
    return entries[0] if entries else {}