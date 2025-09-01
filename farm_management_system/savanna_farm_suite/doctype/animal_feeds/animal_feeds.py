# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

import frappe
from frappe import _


class AnimalFeeds(Document):
	def after_insert(self):
		batch_name = self.feed_name
		if frappe.db.exists("Item", batch_name) or frappe.db.exists("Item", {"item_code": batch_name}):
			return
		stock_uom = "Nos" 
		if self.uom and len(self.uom) > 0:
			stock_uom = self.uom[0].uom if self.uom[0].uom else "Nos"

		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": batch_name,
			"item_name": batch_name,
			"item_group": "All Item Groups",
			"stock_uom": stock_uom,
			"is_stock_item": 1,
		})
		item.insert(ignore_permissions=True)
		frappe.publish_realtime(
			event="show_alert",
			message={
				"message": f"Feed <strong>{item.name}</strong> has been created successfully!",
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
          
@frappe.whitelist()
def get_animal_categories(doctype, txt, searchfield, start, page_len, filters):
    # Extract the animal filter from the filters dictionary
    animal = filters.get("animal") if filters else None
    if not animal:
        return []
    
    # Fetch the Animals document where name matches the provided animal
    animal_doc = frappe.get_doc("Animals", animal)
    
    # Get the animal_categories TableMultiSelect field
    categories = []
    if animal_doc.animal_categories:
        for category in animal_doc.animal_categories:
            # Fetch the Animals Categories record to ensure correct name
            category_name = frappe.get_value("Animals Categories", category.animal_category, "name")
            if category_name:
                # Return as [name, name] for Link field compatibility
                categories.append([category_name, category_name])
    
    # Apply text search if txt is provided
    if txt:
        categories = [c for c in categories if txt.lower() in c[0].lower()]
    
    return categories


@frappe.whitelist()
def get_purchase_history(feed_name):
    if not feed_name:
        return []
    
    # Step 1: Find Items where item_code matches feed_name (%LIKE%)
    items = frappe.get_all(
        "Item",
        filters=[["item_code", "like", f"%{feed_name}%"]],
        fields=["name"]
    )
    if not items:
        return []
    
    item_codes = [item.name for item in items]
    
    # Step 2: Find Purchase Receipt Items where item_code matches
    pr_items = frappe.get_all(
        "Purchase Receipt Item",
        filters={"item_code": ["in", item_codes]},
        fields=["parent", "item_code", "received_qty", "uom", "base_net_amount"]
    )
    
    # Step 3: Fetch parent Purchase Receipt details and build result
    result = []
    for item in pr_items:
        pr = frappe.get_doc("Purchase Receipt", item.parent)
        result.append({
            "receipt_no": pr.name,
            "receipt_date": pr.posting_date,
            "supplier_name": pr.supplier_name,
            "quantity": f"{item.received_qty} {item.uom}",
            "total_amount": item.base_net_amount
        })
    
    return result


@frappe.whitelist()
def get_item_stock_history(feed_name):
    if not feed_name:
        return {}

    # Find Items where item_code like feed_name
    items = frappe.get_all(
        "Item",
        filters=[["item_code", "like", f"%{feed_name}%"]],
        fields=["name"]
    )
    if not items:
        return {}

    # Use the first matched item (can be expanded later if you want multiple item series)
    item_code = items[0].name

    # Fetch Stock Ledger Entry for that item, ordered ascending by posting_datetime (oldest -> newest)
    sle_list = frappe.get_all(
        "Stock Ledger Entry",
        filters={"item_code": item_code},
        fields=["posting_datetime", "posting_date", "qty_after_transaction", "stock_value", "valuation_rate"],
        order_by="posting_datetime asc",
        limit_page_length=0
    )

    if not sle_list:
        return {"item_code": item_code, "entries": [], "current": {}}

    # Convert datetimes/dates to string for safe JSON serialization (frappe will usually do this,
    # but be explicit)
    for d in sle_list:
        # Ensure posting_datetime and posting_date are strings
        if isinstance(d.get("posting_datetime"), (str,)):
            pass
        else:
            try:
                d["posting_datetime"] = str(d.get("posting_datetime") or "")
            except Exception:
                d["posting_datetime"] = ""

        if isinstance(d.get("posting_date"), (str,)):
            pass
        else:
            try:
                d["posting_date"] = str(d.get("posting_date") or "")
            except Exception:
                d["posting_date"] = ""

    # latest = last element because ordered asc
    latest = sle_list[-1] if sle_list else None

    current = {}
    if latest:
        current = {
            "qty_after_transaction": latest.get("qty_after_transaction"),
            "stock_value": latest.get("stock_value"),
            "valuation_rate": latest.get("valuation_rate")
        }

    return {"item_code": item_code, "entries": sle_list, "current": current}