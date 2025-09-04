# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class AnimalProducts(Document):
    def after_insert(self):
        """Enqueue background job to generate AI image for the animal batch
        and create a corresponding Item doc (idempotent)."""
        # 1) create Item (idempotent)
        try:
            create_item_for_animal_product(self)
        except Exception as e:
            frappe.log_error(f"Error creating Item for Animal Product {self.name}: {e}", "AnimalProducts.after_insert")

        # 2) enqueue the image generation job
        try:
            frappe.enqueue(
                "farm_management_system.savanna_farm_suite.doctype.animal_products.animal_products.generate_ai_image_for_batch",
                doc_name=self.name,
                animal_batch=self.animal_product_name,
                queue="long",
            )
        except Exception as e:
            frappe.log_error(f"Error enqueueing AI image job for {self.name}: {e}", "AnimalProducts.after_insert")


def create_item_for_animal_product(animal_product_doc):
    """
    Create an Item record mapped from AnimalProducts doc.
    Idempotent: if Item with item_code == animal_product_doc.name exists, do nothing.
    """
    if not animal_product_doc or not animal_product_doc.name:
        return

    item_code = animal_product_doc.name
    if frappe.db.exists("Item", item_code):
        return
    
    item_name = animal_product_doc.animal_product_name or animal_product_doc.name
    item_group = "All Item Groups"
    stock_uom = animal_product_doc.default_unit_of_measure or "Unit"
    standard_rate = animal_product_doc.product_selling_price or 0.0

    try:
        item_doc = frappe.get_doc(
            {
                "doctype": "Item",
                "item_code": item_code,
                "item_name": item_name,
                "item_group": item_group,
                "stock_uom": stock_uom,
                "standard_rate": standard_rate,
                "is_stock_item": 1,
            }
        )
        item_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        try:
            frappe.publish_realtime(
                event="show_alert",
                message={
                    "message": _("Item {0} created").format(item_doc.name),
                    "indicator": "green",
                },
                user=frappe.session.user,
            )
        except Exception:
            pass
        try:
            frappe.publish_realtime(
                event="play_sound",
                message={
                    "title": _("Item created"),
                    "message": _("Item {0} created").format(item_doc.name),
                    "sound": "success",  
                },
                user=frappe.session.user,
            )
        except Exception:
            pass

    except Exception as e:
        # Log the error for debugging
        frappe.log_error(f"Failed to create Item for Animal Product {item_code}: {e}", "create_item_for_animal_product")
        raise

@frappe.whitelist()
def generate_ai_image_for_batch(doc_name, animal_batch):
    """Generate AI image using Stable Diffusion API and update the document."""
    try:
        import requests
        import base64
        import binascii
        import re
        import frappe

        prompt = f"Generate a very attractive avatar for {animal_batch}"
        url = "https://fast-open-source-ai.p.rapidapi.com/stabilityai/stable-diffusion-xl-base-1.0"
        headers = {
            "x-rapidapi-key": "89752ff3d5msh0010508de6eca5cp1d1ae6jsn2d45ec083d0b",
            "x-rapidapi-host": "fast-open-source-ai.p.rapidapi.com",
            "Content-Type": "application/json"
        }
        payload = {"inputs": prompt}

        response = requests.post(url, headers=headers, json=payload, timeout=60)

        def _fix_base64_padding(s):
            if isinstance(s, str) and s.startswith("data:"):
                s = s.split(",", 1)[-1]
            s = (s or "").strip()
            mod4 = len(s) % 4
            if mod4:
                s += "=" * (4 - mod4)
            return s

        def _safe_filename(name, max_len=100):
            if not name:
                return "generated"
            s = re.sub(r'[^0-9A-Za-z_-]+', '_', name)
            s = re.sub(r'_{2,}', '_', s).strip('_')
            s = s[:max_len].lower()
            return s or "generated"

        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "").lower()
            file_bytes = None

            if content_type.startswith("image/"):
                file_bytes = response.content
            else:
                try:
                    j = response.json()
                except ValueError:
                    j = None

                candidates = []
                if isinstance(j, dict):
                    artifacts = j.get("artifacts") or j.get("images") or j.get("data") or j.get("output")
                    if isinstance(artifacts, list) and artifacts:
                        for a in artifacts:
                            if isinstance(a, dict):
                                for key in ("base64", "b64_json", "b64", "image", "image_base64"):
                                    if key in a and a[key]:
                                        candidates.append(a[key])
                            elif isinstance(a, str):
                                candidates.append(a)
                    for key in ("image", "image_base64", "base64", "b64_json", "output", "result"):
                        if key in j and j.get(key):
                            candidates.append(j.get(key))

                if not candidates and isinstance(j, list):
                    for item in j:
                        if isinstance(item, str):
                            candidates.append(item)

                for cand in candidates:
                    try:
                        clean = _fix_base64_padding(cand)
                        file_bytes = base64.b64decode(clean)
                        break
                    except (binascii.Error, TypeError):
                        file_bytes = None

                if file_bytes is None:
                    text = (response.text or "").strip()
                    if text:
                        try:
                            clean = _fix_base64_padding(text)
                            file_bytes = base64.b64decode(clean)
                        except (binascii.Error, TypeError):
                            file_bytes = None

            if not file_bytes:
                frappe.log_error(
                    f"Stable Diffusion API returned 200 but no valid image data found. Headers: {response.headers}\nBody: {response.text[:2000]}",
                    "Animal Products AI Image Generation"
                )
                raise Exception("No valid image bytes found in API response.")

            # Base64-encode bytes so File doc can decode it on insert
            b64_content = base64.b64encode(file_bytes).decode("ascii")
            safe_name = _safe_filename(animal_batch)
            filename = f"{safe_name}_ai_generated.png"

            # Create File doc manually (works across Frappe versions)
            file_doc = frappe.get_doc({
                "doctype": "File",
                "file_name": filename,
                "attached_to_doctype": "Animal Products",
                "attached_to_name": doc_name,
                "content": b64_content,
                "decode": True,
                "is_private": 0
            })
            file_doc.insert(ignore_permissions=True)

            # Update the document with the generated image URL
            doc = frappe.get_doc("Animal Products", doc_name)
            doc.products_image_if_any = file_doc.file_url
            doc.save(ignore_permissions=True)

            # Show success notification
            frappe.publish_realtime(
                event="show_alert",
                message={
                    "message": f"AI image generated successfully for {animal_batch}!",
                    "indicator": "green"
                },
                user=frappe.session.user
            )
        else:
            frappe.log_error(
                f"Stable Diffusion API Error: {response.status_code} - {response.text}",
                "Animal Products AI Image Generation"
            )

    except Exception as e:
        frappe.log_error(
            f"Error generating AI image for {animal_batch}: {str(e)}",
            "Animal Products AI Image Generation"
        )


