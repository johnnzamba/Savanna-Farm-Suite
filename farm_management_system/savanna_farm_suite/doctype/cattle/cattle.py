# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
from frappe import _
from frappe.utils import getdate
from multiavatar.multiavatar import multiavatar
import base64

class Cattle(Document):
    def after_insert(self):
        # Create Asset if marked as fixed asset
        if self.is_this_a_fixed_asset == 1:
            self.create_asset()
        
        # Generate avatar if no image exists
        if not self.image_of_animal:
            self.generate_avatar()
        if self.cow_shed:
            shed = frappe.get_doc("Cow Shed", self.cow_shed)
            current_count_str = shed.current_animal_count or "0 Cows"
            try:
                number = int(current_count_str.split()[0])
            except (ValueError, IndexError):
                number = 0

            new_count = number + 1
            shed.current_animal_count = f"{new_count} Cows"
            shed.save(ignore_permissions=True)

    def create_asset(self):
        """Create Item and Asset records for the cattle"""
        try:
            # Create Item first
            item = frappe.get_doc({
                "doctype": "Item",
                "item_code": self.name,
                "item_name": self.name,
                "item_group": "All Item Groups",
                "stock_uom": "Nos",
                "is_stock_item": 0,
                "is_fixed_asset": 1,
                "asset_category": "Default Livestock Category"
            })
            item.insert(ignore_permissions=True)
            
            # Get company from Global Defaults
            company = frappe.db.get_single_value('Global Defaults', 'default_company')
            
            # Create Asset
            asset = frappe.get_doc({
                "doctype": "Asset",
                "company": company,
                "item_code": item.name,
                "item_name": item.item_name,
                "asset_owner": "Company",
                "asset_owner_company": company,
                "is_existing_asset": 1,
                "asset_name": item.item_name,
                "location": "Default",
                "purchase_date": getdate(self.specify_the_date_of_purchase),
                "available_for_use_date": getdate(self.specify_the_date_of_purchase),
                "gross_purchase_amount": self.specify_net_purchase_amount,
                "asset_quantity": 1
            })
            asset.insert(ignore_permissions=True)
            asset.submit()
            
            # Play success sound
            frappe.publish_realtime('play_sound', {'sound': 'success'})
            
            return asset.name
            
        except Exception as e:
            frappe.log_error(_("Error creating asset for cattle {0}: {1}").format(self.name, str(e)))
            frappe.throw(_("Failed to create asset record. Please check error logs."))
    
    def generate_avatar(self):
        """Generate a unique avatar for the cattle and attach it."""
        try:
            # Generate SVG code using multiavatar
            svg_code = multiavatar("A cow", None, None)

            # Create a File document for the SVG
            file_doc = frappe.get_doc({
                "doctype": "File",
                "file_name": f"avatar-{self.name}.svg",
                "attached_to_doctype": "Cattle",
                "attached_to_name": self.name,
                "content": svg_code,
                "is_private": 0
            })
            file_doc.insert(ignore_permissions=True)

            # Update the image_of_animal field with the new file's URL
            self.db_set("image_of_animal", file_doc.file_url)

            frappe.msgprint(_("Avatar generated for {0}").format(self.name))

        except Exception as e:
            frappe.log_error(
                _("Error generating avatar for {0}: {1}").format(self.name, str(e)),
                "Avatar Generation"
            )


import json
import frappe
from frappe.utils import getdate

# file: farm_management_system/api.py  (or cattle.py if you prefer)
import json
import frappe
from frappe.utils import getdate

def _resolve_feed_docname(feed):
    """Try multiple strategies to resolve a feed identifier to an Animal Feeds docname."""
    if not feed:
        return None

    # 1) If the feed is already a docname, try fast path
    try:
        frappe.get_doc("Animal Feeds", feed)
        return feed
    except Exception:
        pass

    # 2) Try exact matches on common fields
    for field in ("feed_name", "feed_code", "item_code", "name"):
        val = frappe.db.get_value("Animal Feeds", {field: feed}, "name")
        if val:
            return val

    # 3) Fuzzy search on feed_name (best effort)
    rows = frappe.get_all("Animal Feeds", filters=[["feed_name", "like", f"%{feed}%"]], fields=["name"], limit_page_length=1)
    if rows:
        return rows[0].name

    # 4) give up
    frappe.log_error(message=f"Could not resolve Animal Feeds for: {feed}", title="get_animal_feed_uoms: unresolved feed")
    return None


@frappe.whitelist()
def get_animal_feed_uoms(feeds, fed_on=None):
    """
    feeds: JSON string or list of feed identifiers (docname or human label)
    fed_on: optional date string (used to pick the correct uom row)
    Returns: dict { original_feed_input: uom_string }
    """
    if isinstance(feeds, str):
        try:
            feeds = json.loads(feeds)
        except Exception:
            feeds = [feeds]

    if not isinstance(feeds, list):
        feeds = list(feeds)

    fed_date = None
    if fed_on:
        try:
            fed_date = getdate(fed_on)
        except Exception:
            fed_date = None

    result = {}
    for feed in feeds:
        uom = "units"  # fallback
        try:
            docname = _resolve_feed_docname(feed)
            if not docname:
                # unresolved: return default units for this feed key
                result[feed] = uom
                continue

            doc = frappe.get_doc("Animal Feeds", docname)

            # 1) try common single-field UOMs on the doc
            for attr in ("default_uom", "uom", "unit_of_measure", "unit"):
                if getattr(doc, attr, None):
                    uom = getattr(doc, attr)
                    break

            # 2) if still not found, scan child tables and prefer one with date <= fed_on (if provided)
            if uom == "units":
                chosen_uom = None
                best_date = None

                for df in doc.meta.get("fields", []):
                    if df.fieldtype == "Table":
                        child_rows = doc.get(df.fieldname) or []
                        if not child_rows:
                            continue

                        for row in child_rows:
                            # try to locate a uom-like field on the child
                            candidate_uom = None
                            for candidate_field in ("uom", "uom_name", "unit", "unit_of_measure", "selected_uom"):
                                if row.get(candidate_field):
                                    candidate_uom = row.get(candidate_field)
                                    break
                            if not candidate_uom:
                                continue

                            # try to find a date on the child row
                            row_date = None
                            for date_field in ("valid_from", "from_date", "applicable_from", "start_date", "date"):
                                if row.get(date_field):
                                    try:
                                        row_date = getdate(row.get(date_field))
                                    except Exception:
                                        row_date = None
                                    break

                            if fed_date and row_date:
                                if row_date <= fed_date:
                                    if best_date is None or row_date > best_date:
                                        chosen_uom = candidate_uom
                                        best_date = row_date
                            elif not fed_date:
                                chosen_uom = candidate_uom
                                break

                if chosen_uom:
                    uom = chosen_uom

        except Exception as e:
            # defensive: log the exception and continue; return 'units' for this feed
            frappe.log_error(message=f"Error resolving UOM for feed {feed}: {str(e)}", title="get_animal_feed_uoms: error")

        result[feed] = uom or "units"

    return result
