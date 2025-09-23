# farm_management_system/api.py
import frappe
import json
from frappe.utils import getdate, nowdate
from frappe import _

@frappe.whitelist()
def get_calendar_events():
    """
    Returns a dict with keys:
      - farm_activities: list of schedules with their scheduled_activity_table rows
      - treatments: list of treatment logs (flattened top-level fields)
      - crop_intakes: list of crop intake rows
    Each date is returned as ISO YYYY-MM-DD string.
    """
    out = {
        "farm_activities": [],
        "treatments": [],
        "crop_intakes": []
    }

    # --- Farm Activity Schedule ---
    try:
        schedules = frappe.get_all("Farm Activity Schedule", fields=["name", "farm_plot", "activity_tied_to_which_crop_batch", "schedule_applicable_for_crop"], limit_page_length=2000)
        for s in schedules:
            try:
                doc = frappe.get_doc("Farm Activity Schedule", s.name)
                rows = []
                for r in (doc.scheduled_activity_table or []):
                    # defensive: skip empty dates
                    date_val = r.get("date_of_planned_activity")
                    if not date_val:
                        continue
                    # normalize date to yyyy-mm-dd
                    try:
                        date_iso = str(getdate(date_val))
                    except Exception:
                        date_iso = date_val
                    rows.append({
                        "date_of_planned_activity": date_iso,
                        "nature_of_activity": r.get("nature_of_activity"),
                        "assignee_full_name": r.get("assignee_full_name")
                    })
                out["farm_activities"].append({
                    "name": s.name,
                    "farm_plot": s.get("farm_plot"),
                    "activity_tied_to_which_crop_batch": s.get("activity_tied_to_which_crop_batch"),
                    "schedule_applicable_for_crop": s.get("schedule_applicable_for_crop"),
                    "scheduled_activity_table": rows
                })
            except Exception:
                frappe.log_error(f"Error reading Farm Activity Schedule {s.name}", "get_calendar_events")
    except Exception:
        frappe.log_error("Failed to fetch Farm Activity Schedule list", "get_calendar_events")

    # --- Treatment and Vaccination Logs ---
    try:
        treats = frappe.get_all("Treatment and Vaccination Logs", fields=["name", "specify_type_of_treatment", "doctor", "treatment_date", "poultry_batch_under_treatment", "animal_under_medication", "cattle_shed_under_treatment", "specific_cattle_under_treatment"], limit_page_length=2000)
        for t in treats:
            try:
                date_iso = str(getdate(t.get("treatment_date"))) if t.get("treatment_date") else None
            except Exception:
                date_iso = t.get("treatment_date")
            out["treatments"].append({
                "name": t.get("name"),
                "specify_type_of_treatment": t.get("specify_type_of_treatment"),
                "doctor": t.get("doctor"),
                "treatment_date": date_iso,
                "poultry_batch_under_treatment": t.get("poultry_batch_under_treatment"),
                "animal_under_medication": t.get("animal_under_medication"),
                "cattle_shed_under_treatment": t.get("cattle_shed_under_treatment"),
                "specific_cattle_under_treatment": t.get("specific_cattle_under_treatment")
            })
    except Exception:
        frappe.log_error("Failed to fetch Treatment and Vaccination Logs", "get_calendar_events")

    # --- Crop Intake ---
    try:
        crops = frappe.get_all("Crop Intake", fields=["name", "date_of_planting", "expected_harvest_date", "plot_on_which_planting_is_done", "crop_being_planted", "farming_season"], limit_page_length=2000)
        for c in crops:
            try:
                planting = str(getdate(c.get("date_of_planting"))) if c.get("date_of_planting") else None
                harvest = str(getdate(c.get("expected_harvest_date"))) if c.get("expected_harvest_date") else None
            except Exception:
                planting = c.get("date_of_planting")
                harvest = c.get("expected_harvest_date")
            out["crop_intakes"].append({
                "name": c.get("name"),
                "date_of_planting": planting,
                "expected_harvest_date": harvest,
                "plot_on_which_planting_is_done": c.get("plot_on_which_planting_is_done"),
                "crop_being_planted": c.get("crop_being_planted"),
                "farming_season": c.get("farming_season")
            })
    except Exception:
        frappe.log_error("Failed to fetch Crop Intake", "get_calendar_events")

    return out


import frappe
import os
import random

def get_farm_splash_image():
    """
    Placeholder function for a specific splash image.
    Can be extended later to pull an image from settings.
    Returns None if no specific image is set.
    """
    # TODO: Add logic here if you want to fetch a specific image
    # from a settings doctype in the future.
    return None

def get_random_farm_splash_icon():
    """
    Scans the public directory of the app for SVG files and returns the web path
    to a randomly selected one.
    """
    try:
        # NOTE: Replace 'farm_management_system' with your actual app name if it's different.
        app_name = 'farm_management_system'

        # This gets the absolute file system path to your app's 'public' folder,
        # where assets are stored.
        icons_dir_path = frappe.get_app_path(app_name, 'public')

        if not os.path.exists(icons_dir_path):
            # Fallback if the directory doesn't exist for some reason
            return f"/assets/{app_name}/poultry.svg"

        # List all files in the directory and filter to keep only those ending with .svg
        svg_files = [f for f in os.listdir(icons_dir_path) if f.lower().endswith('.svg')]

        if svg_files:
            # A random SVG file was found, so pick one.
            random_svg = random.choice(svg_files)
            # Return the correct web-accessible path for the asset.
            return f"/assets/{app_name}/{random_svg}"
        else:
            # If no SVGs are in the folder, return the original default to avoid a broken image.
            return f"/assets/{app_name}/poultry.svg"

    except Exception as e:
        # Log any unexpected errors and return the default icon.
        frappe.log_error(f"Could not get random splash icon: {e}", "Splash Screen Logic")
        return f"/assets/farm_management_system/poultry.svg"
