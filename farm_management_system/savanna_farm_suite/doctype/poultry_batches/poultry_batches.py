# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PoultryBatches(Document):
	def after_insert(self):
		"""Enqueue background job to generate AI image for the animal batch."""
		# Enqueue the image generation job
		frappe.enqueue(
			"farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.generate_ai_image_for_batch",
			doc_name=self.name,
			animal_batch=self.animal_batch,
			queue="long"
		)
		self.db_set("batch_status", "Active", update_modified=True)

@frappe.whitelist()
def generate_ai_image_for_batch(doc_name, animal_batch):
    """Generate AI image using Stable Diffusion API and update the document."""
    try:
        import requests
        import base64
        import binascii
        import re
        import frappe

        prompt = f"Generate an appealing avatar for {animal_batch}"
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
                    "Poultry Batches AI Image Generation"
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
                "attached_to_doctype": "Poultry Batches",
                "attached_to_name": doc_name,
                "content": b64_content,
                "decode": True,
                "is_private": 0
            })
            file_doc.insert(ignore_permissions=True)

            # Update the document with the generated image URL
            doc = frappe.get_doc("Poultry Batches", doc_name)
            doc.image_of_animal_batch = file_doc.file_url
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
                "Poultry Batches AI Image Generation"
            )

    except Exception as e:
        frappe.log_error(
            f"Error generating AI image for {animal_batch}: {str(e)}",
            "Poultry Batches AI Image Generation"
        )


import frappe
from frappe import _
from datetime import datetime

@frappe.whitelist()
def get_treatment_chart_data(poultry_batch_name: str):
    """
    Return grouped treatment/vaccination data for charting.

    Returns:
    {
      "dates": ["2025-09-17", "2025-09-15", ...],            # latest -> oldest
      "vaccines": ["Newcastle Vaccine", "VACC-001", ...],
      "series": { "Newcastle Vaccine": [10, 0, ...], ... }   # aligned with dates
    }
    """
    if not poultry_batch_name:
        return {"dates": [], "vaccines": [], "series": {}}

    # fetch relevant fields explicitly so we don't guess on client side
    logs = frappe.get_all(
        "Treatment and Vaccination Logs",
        filters={"poultry_batch_under_treatment": poultry_batch_name},
        fields=[
            "name",
            "treatment_date",
            "vaccine_used",
            "qty_vaccine",
            "creation"
        ],
        order_by="creation desc",
        limit_page_length=2000
    )

    # helper to normalize date to YYYY-MM-DD
    def norm_date(val):
        if not val:
            return None
        if isinstance(val, str):
            s = val.strip()
            # prefer first 10 chars if ISO-like
            cand = s[:10]
            try:
                if len(cand) == 10:
                    datetime.strptime(cand, "%Y-%m-%d")
                    return cand
            except Exception:
                pass
            try:
                d = datetime.fromisoformat(s)
                return d.strftime("%Y-%m-%d")
            except Exception:
                pass
            try:
                d = frappe.utils.data.get_datetime(s)
                return d.strftime("%Y-%m-%d")
            except Exception:
                return None
        else:
            # likely a datetime object
            try:
                return val.strftime("%Y-%m-%d")
            except Exception:
                return None

    # Build grouped map date -> vaccine -> qty
    grouped = {}
    vaccine_set = set()

    for r in logs:
        # prefer human label if link field stores name in <field>_name
        vac = (r.get("vaccine_used") or "") 
        vac = vac.strip() if isinstance(vac, str) else str(vac)
        if not vac:
            vac = "(unknown)"

        # normalize date preferring treatment_date, fallback creation
        dt = norm_date(r.get("treatment_date")) or norm_date(r.get("creation")) or None
        if not dt:
            # ignore entries with no date at all (or you can choose to set to today)
            continue

        qty = r.get("qty_vaccine") or 0
        try:
            qty = float(qty)
        except Exception:
            try:
                qty = float(str(qty).strip() or 0)
            except Exception:
                qty = 0.0

        grouped.setdefault(dt, {})
        grouped[dt][vac] = grouped[dt].get(vac, 0.0) + qty
        vaccine_set.add(vac)

    if not grouped:
        return {"dates": [], "vaccines": [], "series": {}}

    # Dates sorted latest -> oldest
    dates = sorted(list(grouped.keys()), reverse=True)

    vaccines = sorted(list(vaccine_set))  # deterministically order vaccines (alphabetical)

    # Build series: vaccine -> array of qty aligned with dates
    series = {}
    for vac in vaccines:
        arr = []
        for d in dates:
            arr.append(round(grouped.get(d, {}).get(vac, 0.0), 6))
        series[vac] = arr

    return {"dates": dates, "vaccines": vaccines, "series": series}
