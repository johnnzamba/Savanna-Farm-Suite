# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class FarmActivitySchedule(Document):
    def after_insert(self):
        self.update_crop_intake_schedule()
    
    def on_update(self):
        self.update_crop_intake_schedule()
    
    def update_crop_intake_schedule(self):
        """Update the related Crop Intake document with scheduled activities"""
        if not self.activity_tied_to_which_crop_batch:
            return
        
        # Fetch the related Crop Intake document
        try:
            crop_intake_doc = frappe.get_doc("Crop Intake", self.activity_tied_to_which_crop_batch)
        except frappe.DoesNotExistError:
            frappe.throw(f"Crop Intake document {self.activity_tied_to_which_crop_batch} not found")
            return
        
        # For updates, remove existing entries for this schedule document
        if hasattr(self, '_doc_before_save'):  
            crop_intake_doc.table_biyv = [
                row for row in crop_intake_doc.table_biyv 
                if row.referenced_schedule_document != self.name
            ]
        
        # Add new entries from scheduled_activity_table
        for activity_row in self.scheduled_activity_table:
            new_row = crop_intake_doc.append("table_biyv", {})
            new_row.scheduled_date = activity_row.date_of_planned_activity
            new_row.activity_being_undertaken = activity_row.nature_of_activity
            new_row.workers_involved_in_exercise = activity_row.assignees
            new_row.status = "Scheduled Assignment"
            new_row.referenced_schedule_document = self.name
        
        # Save the crop intake document
        crop_intake_doc.flags.ignore_permissions = True
        crop_intake_doc.save()
        frappe.db.commit()
        
        # frappe.msgprint(f"Successfully updated schedule for Crop Intake: {self.activity_tied_to_which_crop_batch}")
    
    def on_cancel(self):
        """Remove scheduled activities when the schedule is cancelled"""
        if not self.activity_tied_to_which_crop_batch:
            return
            
        try:
            crop_intake_doc = frappe.get_doc("Crop Intake", self.activity_tied_to_which_crop_batch)
            
            # Remove entries for this schedule document
            crop_intake_doc.table_biyv = [
                row for row in crop_intake_doc.table_biyv 
                if row.referenced_schedule_document != self.name
            ]
            
            crop_intake_doc.flags.ignore_permissions = True
            crop_intake_doc.save()
            frappe.db.commit()
            
            frappe.msgprint(f"Removed scheduled activities from Crop Intake: {self.activity_tied_to_which_crop_batch}")
        except frappe.DoesNotExistError:
            pass



import json
import hashlib
import frappe
from frappe import _
from frappe.utils import getdate
from frappe.utils.data import now_datetime

@frappe.whitelist()
def get_events(doctype, start, end, field_map, filters=None, fields=None):
    """
    Return calendar events built from the child table rows (scheduled_activity_table).
    Each child row becomes one event with:
      - start/end = date_of_planned_activity
      - title = nature_of_activity
      - assignee = assignee_full_name
      - docname = parent Farm Activity Schedule name
      - color = deterministic hex from parent+idx
    """
    # normalize dates
    try:
        start_date = getdate(start)
        end_date = getdate(end)
    except Exception:
        # fallback to raw strings
        start_date = start
        end_date = end

    # NOTE: replace `tabScheduled Activity Table` with your exact child-doctype DB name
    # and replace child fieldnames below if they differ.
    rows = frappe.db.sql("""
        SELECT
            `child`.`parent` as parent,
            `child`.`idx` as idx,
            `child`.`date_of_planned_activity` as date,
            `child`.`nature_of_activity` as nature_of_activity,
            `child`.`assignee_full_name` as assignee_full_name
        FROM `tabScheduled Activity Table` child
        JOIN `tabFarm Activity Schedule` parent ON parent.name = child.parent
        WHERE child.date_of_planned_activity BETWEEN %s AND %s
        ORDER BY child.date_of_planned_activity
    """, (start_date, end_date), as_dict=True)

    events = []
    for r in rows:
        # deterministic "random" color per parent+row
        seed = (r.parent or "") + str(r.idx or "")
        color = "#" + hashlib.md5(seed.encode("utf-8")).hexdigest()[:6]

        evt = {
            "start": r.date,
            "end": r.date,           # same day event
            "id": f"{r.parent}:{r.idx}",
            "title": r.nature_of_activity or "",
            "allDay": 1,
            "assignee": r.assignee_full_name or "",
            "docname": r.parent,
            "color": color,
			"className": ["farm-activity-event"], 
            "description": f"Schedule Document: {r.parent}\nFarming Activity: {r.nature_of_activity}\nAssigned To: {r.assignee_full_name}"
        }
        events.append(evt)

    return events


import frappe
import hashlib

@frappe.whitelist()
def get_events_for_gantt(start, end, filters=None):
    """
    Gantt-focused get_events:
      - returns name, schedule_start_date, scheduled_end_date
      - returns activity_tied_to_which_crop_batch as 'crop'
      - picks a deterministic color from a curated palette
      - returns a computed text_color (black/white) for readability
    """
    doctype = "Farm Activity Schedule"

    rows = frappe.get_all(
        doctype,
        fields=[
            "name",
            "schedule_start_date",
            "scheduled_end_date",
            "activity_tied_to_which_crop_batch"
        ],
        filters=[
            ["scheduled_end_date", ">=", start],
            ["schedule_start_date", "<=", end]
        ],
        order_by="schedule_start_date asc"
    )

    # curated palette (good contrast choices)
    palette = [
        "#1f77b4",  # blue
        "#ff7f0e",  # orange
        "#2ca02c",  # green
        "#d62728",  # red
        "#9467bd",  # purple
        "#8c564b",  # brown
        "#e377c2",  # pink
        "#7f7f7f",  # gray
        "#bcbd22",  # yellow-green
        "#17becf"   # teal
    ]

    def readable_text_color(hex_color):
        """Return '#ffffff' or '#000000' depending on luminance for readability."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            return "#000000"
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        # Perceived luminance (rec. 601)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        return "#ffffff" if lum < 128 else "#000000"

    events = []
    for r in rows:
        name = r.get("name")
        s = r.get("schedule_start_date")
        e = r.get("scheduled_end_date")
        crop = r.get("activity_tied_to_which_crop_batch") or ""

        # require both dates
        if not (s and e):
            continue

        # deterministic pick from palette using md5 -> index
        digest = hashlib.md5((name or "").encode("utf-8")).hexdigest()
        idx = int(digest, 16) % len(palette)
        color = palette[idx]
        text_color = readable_text_color(color)

        events.append({
            "id": name,
            "title": name,   # Gantt label = doc name
            "start": s,
            "end": e,
            "color": color,
            "text_color": text_color,
            "crop": crop
        })

    return events
