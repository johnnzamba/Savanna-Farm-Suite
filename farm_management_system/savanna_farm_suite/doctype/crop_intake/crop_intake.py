# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

class CropIntake(Document):
	def after_insert(self):
		"""
		After a Crop Intake is inserted, append a planting row to the Farming Season.table_xtod
		and a history row to Farm Plots.plot_history.

		Mapping (Farming Season.table_xtod):
			planting_date == self.date_of_planting
			farming_season == self.farming_season
			plot_of_land_being_farmed == self.plot_on_which_planting_is_done
			crop_seedsseedlings_planted == self.crop_being_planted
			quantity_of_seedsseedlings_planted == self.quantity_of_seedlings_used
			linked_to_batch == self.name

		Mapping (Farm Plots.plot_history) - kept similar to the Farming Season mapping:
			planting_date == self.date_of_planting
			farming_season == self.farming_season
			plot == self.plot_on_which_planting_is_done
			crop_planted == self.crop_being_planted
			quantity_planted == self.quantity_of_seedlings_used
			linked_to_batch == self.name
		"""
		try:
			fs_name = (self.farming_season or "").strip()
			# Farming Season update (only if farming_season provided)
			if fs_name:
				if not frappe.db.exists("Farming Season", fs_name):
					frappe.log_error(
						f"Farming Season {fs_name} not found when processing Crop Intake {self.name}",
						"CropIntake.after_insert"
					)
				else:
					fs_doc = frappe.get_doc("Farming Season", fs_name)

					planting_date = self.date_of_planting or None
					plot = self.plot_on_which_planting_is_done or None
					crop = self.crop_being_planted or None
					qty = flt(self.quantity_of_seedlings_used or 0.0)
					linked_batch = self.name

					# Avoid duplicate: skip if a row with same linked_to_batch already exists
					exists = False
					for row in fs_doc.get("table_xtod") or []:
						if (row.get("linked_to_batch") or "") == linked_batch:
							exists = True
							break

					if not exists:
						child_row = {
							"planting_date": planting_date,
							"farming_season": fs_name,
							"plot_of_land_being_farmed": plot,
							"crop_seedsseedlings_planted": crop,
							"quantity_of_seedsseedlings_planted": qty,
							"linked_to_batch": linked_batch
						}

						fs_doc.append("table_xtod", child_row)
						fs_doc.save(ignore_permissions=True)
						frappe.db.commit()
						frappe.logger("CropIntake").info(
							f"Appended planting row to Farming Season {fs_name} from Crop Intake {self.name}"
						)
					else:
						frappe.logger("CropIntake").info(
							f"Farming Season {fs_name} already has linked_to_batch {linked_batch}; skipping append"
						)
			else:
				frappe.logger("CropIntake").info(f"No farming_season on Crop Intake {self.name}; skipping Farming Season update")

			# Farm Plots update (use plot_on_which_planting_is_done)
			plot_name = (self.plot_on_which_planting_is_done or "").strip()
			if plot_name:
				if not frappe.db.exists("Farm Plots", plot_name):
					frappe.log_error(
						f"Farm Plot {plot_name} not found when processing Crop Intake {self.name}",
						"CropIntake.after_insert"
					)
				else:
					plot_doc = frappe.get_doc("Farm Plots", plot_name)

					planting_date = self.date_of_planting or None
					fs_for_plot = fs_name or None
					crop = self.crop_being_planted or None
					qty = flt(self.quantity_of_seedlings_used or 0.0)
					linked_batch = self.name

					# Avoid duplicate: skip if a row with same linked_to_batch already exists
					exists_plot = False
					for row in plot_doc.get("plot_history") or []:
						if (row.get("linked_to_batch") or "") == linked_batch:
							exists_plot = True
							break

					if not exists_plot:
						# keep field names similar to the Farming Season mapping but tailored for plot_history
						child_plot_row = {
							"planting_date": planting_date,
							"farming_season": fs_name,
							"plot_of_land_being_farmed": plot,
							"crop_seedsseedlings_planted": crop,
							"quantity_of_seedsseedlings_planted": qty,
							"linked_to_batch": linked_batch
						}

						plot_doc.append("plot_history", child_plot_row)
						plot_doc.save(ignore_permissions=True)
						frappe.db.commit()
						frappe.logger("CropIntake").info(
							f"Appended history row to Farm Plot {plot_name} from Crop Intake {self.name}"
						)
					else:
						frappe.logger("CropIntake").info(
							f"Farm Plot {plot_name} already has linked_to_batch {linked_batch}; skipping append"
						)
			else:
				frappe.logger("CropIntake").info(f"No plot specified on Crop Intake {self.name}; skipping Farm Plots update")

		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				_("Failed to append planting/plot history row for Crop Intake {0}").format(self.name)
			)

def run_after_insert(docname):
    frappe.set_user("Administrator")
    doc = frappe.get_doc("Crop Intake", docname)
    doc.run_method("after_insert")
    frappe.db.commit()
    return f"after_insert ran on {docname}"

@frappe.whitelist()
def create_farming_schedule(schedule_data):
	"""
	Create a new Farm Activity Schedule with multiple activities.
	If a schedule for the given crop batch already exists, ONLY append new rows to
	the existing scheduled_activity_table (do not overwrite existing rows).
	"""
	try:
		# Parse schedule_data if it's a string
		if isinstance(schedule_data, str):
			schedule_data = json.loads(schedule_data)

		# Validate required fields
		required_fields = [
			'activity_tied_to_which_crop_batch',
			'scheduled_activities'
		]

		for field in required_fields:
			if field not in schedule_data or not schedule_data[field]:
				frappe.throw(_("Missing required field: {0}").format(field))

		batch = schedule_data['activity_tied_to_which_crop_batch']

		# Check if a schedule already exists for this crop batch
		existing_schedule = frappe.db.exists('Farm Activity Schedule', {
			'activity_tied_to_which_crop_batch': batch
		})

		if existing_schedule:
			# Update existing schedule (do NOT clear existing child table)
			doc = frappe.get_doc('Farm Activity Schedule', existing_schedule)
			is_new_doc = False
		else:
			# Create new Farm Activity Schedule document
			doc = frappe.new_doc('Farm Activity Schedule')
			is_new_doc = True

		# Set/overwrite main fields if provided
		doc.farming_season = schedule_data.get('farming_season') or doc.get('farming_season')
		doc.farm_plot = schedule_data.get('farm_plot') or doc.get('farm_plot')
		doc.schedule_applicable_for_crop = schedule_data.get('schedule_applicable_for_crop') or doc.get('schedule_applicable_for_crop')
		doc.activity_tied_to_which_crop_batch = batch
		doc.schedule_start_date = schedule_data.get('schedule_start_date') or doc.get('schedule_start_date')
		doc.scheduled_end_date = schedule_data.get('scheduled_end_date') or doc.get('scheduled_end_date')
		doc.important_notes = schedule_data.get('important_notes') or doc.get('important_notes')

		# Build a set of existing activity signatures to avoid duplicates.
		# Signature uses date + nature + assignees (stringified) as a simple heuristic.
		existing_signatures = set()
		for row in getattr(doc, 'scheduled_activity_table', []) or []:
			sig = (
				str(getattr(row, 'date_of_planned_activity', '') or '').strip(),
				str(getattr(row, 'nature_of_activity', '') or '').strip(),
				str(getattr(row, 'assignees', '') or '').strip()
			)
			existing_signatures.add(sig)

		appended_count = 0
		for activity in schedule_data.get('scheduled_activities', []):
			date_val = activity.get('date_of_planned_activity') or ''
			nature = (activity.get('nature_of_activity') or '').strip()
			assignees = (activity.get('assignees') or '') if activity.get('assignees') is not None else ''
			sig = (str(date_val).strip(), nature, str(assignees).strip())

			# If this signature already exists, skip appending to avoid duplicates
			if sig in existing_signatures:
				continue

			# Append new row
			row = doc.append('scheduled_activity_table', {})
			row.date_of_planned_activity = date_val
			row.nature_of_activity = nature
			row.estimated_hours_to_complete = activity.get('estimated_hours_to_complete')
			row.additional_notes = activity.get('additional_notes')
			row.assignees = assignees

			existing_signatures.add(sig)
			appended_count += 1

		# Persist changes
		if is_new_doc:
			doc.insert(ignore_permissions=True)
			# Submit newly created schedule if it's in draft
			try:
				if doc.docstatus == 0:
					doc.submit()
			except Exception:
				# If submit fails for any reason, still keep the inserted doc
				frappe.log_error(frappe.get_traceback(), "Farm Activity Schedule Submit Error")
		else:
			# For existing document: if it's still draft (docstatus==0) we can save & submit,
			# otherwise just save appended rows (do not re-submit a submitted doc).
			doc.save(ignore_permissions=True)
			try:
				if doc.docstatus == 0:
					doc.submit()
			except Exception:
				# If submission not allowed, skip but keep the saved changes
				frappe.log_error(frappe.get_traceback(), "Farm Activity Schedule Submit Error (existing doc)")

		frappe.db.commit()

		# Kick off task assignment for the schedule (pass doc so create_task_assignments can handle doc objects)
		try:
			create_task_assignments(doc)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Create Task Assignments Error")

		return {
			'success': True,
			'name': doc.name,
			'activities_appended': appended_count,
			'message': _('Farm Activity Schedule processed successfully')
		}

	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Farm Activity Schedule Creation Error")
		return {
			'success': False,
			'error': str(e)
		}

def create_task_assignments(schedule_doc):
    """
    Create task assignments for a single Employee assignee per activity
    
    Args:
        schedule_doc: Farm Activity Schedule document or document name
    """
    try:
        # Accept either a document object or the document name (string)
        if isinstance(schedule_doc, str):
            # Try to fetch the document by name; if the string is JSON, try to extract the name
            try:
                schedule_doc = frappe.get_doc('Farm Activity Schedule', schedule_doc)
            except Exception:
                try:
                    parsed = json.loads(schedule_doc)
                    if isinstance(parsed, dict) and parsed.get('name'):
                        schedule_doc = frappe.get_doc('Farm Activity Schedule', parsed.get('name'))
                    else:
                        # Nothing to process
                        return
                except Exception:
                    return

        # Safely get the child table (may be missing or empty)
        activities = getattr(schedule_doc, 'scheduled_activity_table', []) or []

        for activity in activities:
            assignee = activity.assignees
            if not assignee:
                continue

            # assignees is a single Employee name (string). Normalize it.
            if isinstance(assignee, str):
                assignee_name = assignee.strip()
            else:
                assignee_name = str(assignee).strip()

            if not assignee_name:
                continue

            # Check if Employee exists and get linked user (if any)
            if frappe.db.exists('Employee', assignee_name):
                allocated_user = frappe.db.get_value('Employee', assignee_name, 'user_id') or assignee_name

                # Create task for the employee (pass allocated_user so create_worker_task sets allocated_to)
                create_worker_task(
                    worker=allocated_user,
                    activity_date=activity.date_of_planned_activity,
                    activity_type=activity.nature_of_activity,
                    estimated_hours=activity.estimated_hours_to_complete,
                    notes=activity.additional_notes,
                    crop_batch=schedule_doc.activity_tied_to_which_crop_batch,
                    schedule_name=schedule_doc.name
                )

    except Exception as e:
        # Log the exception message and traceback (use e so the variable is referenced)
        frappe.log_error(f"{str(e)}\n{frappe.get_traceback()}", "Task Assignment Creation Error")
def create_worker_task(worker, activity_date, activity_type, estimated_hours, notes, crop_batch=None, schedule_name=None):
    """
    Create a task document for a farm worker
    
    Args:
        worker: Farm Worker name or user id
        activity_date: Date of the activity
        activity_type: Type of activity
        estimated_hours: Estimated hours for completion
        notes: Additional notes
        crop_batch: Related crop batch (optional)
        schedule_name: Name of the Farm Activity Schedule document (preferred)
    """
    try:
        # Create a ToDo or Task document (adjust based on your system)
        task = frappe.new_doc('ToDo')
        task.description = f"Farm Activity: {activity_type}"
        task.date = activity_date
        task.allocated_to = worker

        # Prefer the schedule document name as the reference (this ensures the reference points to the saved/submitted schedule)
        reference_name = schedule_name or crop_batch
        if reference_name:
            task.reference_type = 'Farm Activity Schedule'
            task.reference_name = reference_name

        task.priority = 'Medium'
        task.description = (
            f"Activity: {activity_type}\n <br>"
            f"Crop Batch: {crop_batch or 'N/A'}<br>\n"
            f"Schedule: {reference_name or 'N/A'}<br>\n"
            f"Estimated Hours: {estimated_hours}<br>\n"
            f"Notes: {notes or 'N/A'}<br>"
        )
        task.insert(ignore_permissions=True)
        
    except Exception as e:
        # Log error but don't stop the main process
        frappe.log_error(f"Failed to create task for worker {worker}: {str(e)}", "Worker Task Creation")
        frappe.log_error(f"Failed to create task for worker {worker}: {str(e)}", "Worker Task Creation")

@frappe.whitelist()
def get_farm_workers():
    """
    Get list of farm workers for the MultiSelect field
    
    Returns:
        list: List of farm workers with their details
    """
    try:
        workers = frappe.get_all(
            'Farm Workers',
            fields=['name'],
            order_by='name'
        )
        
        return [{
            'value': worker.name,
            'label': worker.name,
            'description': worker.name or ''
        } for worker in workers]
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Farm Workers Error")
        return []

@frappe.whitelist()
def get_existing_schedules(crop_batch):
    """
    Get existing scheduled activities for a crop batch
    
    Args:
        crop_batch: Name of the crop batch
    
    Returns:
        dict: Existing schedule with activities
    """
    try:
        schedule = frappe.get_all(
            'Farm Activity Schedule',
            filters={'activity_tied_to_which_crop_batch': crop_batch},
            fields=['name']
        )
        
        if schedule:
            doc = frappe.get_doc('Farm Activity Schedule', schedule[0].name)
            
            activities = []
            for activity in doc.scheduled_activity_table:
                activity_dict = {
                    'date_of_planned_activity': activity.date_of_planned_activity,
                    'nature_of_activity': activity.nature_of_activity,
                    'estimated_hours_to_complete': activity.estimated_hours_to_complete,
                    'additional_notes': activity.additional_notes
                }
                
                # Parse assignees
                if activity.assignees:
                    try:
                        activity_dict['assignees'] = json.loads(activity.assignees)
                    except:
                        activity_dict['assignees'] = activity.assignees.split(',') if activity.assignees else []
                else:
                    activity_dict['assignees'] = []
                
                activities.append(activity_dict)
            
            return {
                'exists': True,
                'schedule_name': doc.name,
                'activities': activities
            }
        
        return {
            'exists': False,
            'activities': []
        }
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Existing Schedules Error")
        return {
            'exists': False,
            'error': str(e)
        }
    

# Processing Records

import frappe
from frappe import _
from frappe.utils import flt, nowdate
import json

import frappe
from frappe import _
from frappe.utils import flt, nowdate
import json

@frappe.whitelist()
def create_farm_operation_log(data):
    # Accept JSON string or dict
    if isinstance(data, str):
        data = json.loads(data)

    # Basic validations
    if not data.get('crop_intake'):
        frappe.throw(_("Crop Intake is required"))
    if not data.get('selected_date'):
        frappe.throw(_("Activity date is required"))
    if not data.get('labourers', []):
        frappe.throw(_("At least one labourer must be specified"))
    if not data.get('farming_activities', []):
        frappe.throw(_("At least one farming activity must be specified"))

    # Fetch Crop Intake
    crop_intake = frappe.get_doc("Crop Intake", data.get('crop_intake'))

    try:
        farm_log = frappe.new_doc("Farm Operation Log")

        # Basic fields
        farm_log.specify_the_date_of_activity = data.get('selected_date')
        farm_log.farming_season_when_activity_was_conducted = crop_intake.farming_season
        farm_log.farming_activity_conducted_in_which_plot = crop_intake.plot_on_which_planting_is_done
        farm_log.farming_activity_tied_to_which_crop = crop_intake.crop_being_planted
        farm_log.farming_activity_tied_to_which_crop_batch = crop_intake.name
        farm_log.total_hrs = flt(data.get('total_man_hours', 0))
        farm_log.description = data.get('additional_notes', '')
        farm_log.proof_of_work = data.get('proof_of_work', '')

        # Helper to coerce simple values
        def to_text(item):
            if item is None:
                return ''
            if isinstance(item, dict):
                # take common keys
                for k in ('value', 'name', 'employee', 'activity', 'labourer'):
                    if item.get(k):
                        return str(item.get(k))
                # fallback to first value
                vals = list(item.values())
                return str(vals[0]) if vals else ''
            return str(item)

        # 1) Append farming activities as rows to child table specify_the_nature_of_activities
        activities = data.get('farming_activities') or []
        for act in activities:
            act_text = to_text(act).strip()
            if act_text:
                farm_log.append('specify_the_nature_of_activities', {
                    'name_of_activity': act_text
                })

        # 2) Append labourers to child table staff_members_involved
        labourers = data.get('labourers') or []
        for lab in labourers:
            lab_text = to_text(lab).strip()
            if lab_text:
                farm_log.append('staff_members_involved', {
                    'employee': lab_text
                })

        # 3) Handle farm inputs: append to both specify_the_farm_inputs_used (simple selection table)
        #    and material_records (detailed qty/uom)
        farm_inputs = data.get('farm_inputs') or []
        seen_inputs = set()
        for row in farm_inputs:
            # tolerate different key names client might send
            if isinstance(row, dict):
                farm_input_name = (row.get('farm_input') or row.get('select_the_farm_input')
                                   or row.get('name') or row.get('input') or row.get('farm_input_used'))
                uom = row.get('uom') or row.get('inputs_default_uom') or ''
                qty = flt(row.get('quantity') or row.get('qty') or row.get('quantity_of_agent_used') or 0)
            else:
                # row may be a simple string
                farm_input_name = str(row)
                uom = ''
                qty = 0

            farm_input_name = (farm_input_name or '').strip()
            if not farm_input_name:
                # skip malformed/empty
                continue

            # Append to simple selection child table (one row per selected input)
            if farm_input_name not in seen_inputs:
                farm_log.append('specify_the_farm_inputs_used', {
                    'select_the_farm_input': farm_input_name
                })
                seen_inputs.add(farm_input_name)

            # Append detailed record to material_records child table
            farm_log.append('material_records', {
                'farm_input_used': farm_input_name,
                'inputs_default_uom': uom,
                'quantity_of_agent_used': qty
            })

        # Insert first
        farm_log.insert(ignore_permissions=True)

        vouchers = []

        if data.get('auto_create_vouchers'):
            # Post-creation logic for casual workers
            default_company = frappe.db.get_single_value('Global Defaults', 'default_company')
            if not default_company:
                raise Exception("Default Company not set in Global Defaults")

            abbr = frappe.db.get_value('Company', default_company, 'abbr')
            if not abbr:
                raise Exception("Abbr not found for the default company")

            for staff in farm_log.staff_members_involved:
                employee_name = staff.employee
                if not employee_name:
                    continue

                employee = frappe.get_doc('Employee', employee_name)
                if employee.custom_is_casual_worker != 1 or not employee.custom_rate_per_hour:
                    continue

                rate_per_hour = flt(employee.custom_rate_per_hour)
                total_amount = rate_per_hour * flt(farm_log.total_hrs)

                # Create Petty Cash Voucher
                voucher = frappe.new_doc('Petty Cash Voucher')
                voucher.voucher_date = nowdate()
                voucher.voucher_prepared_by = frappe.session.user
                voucher.specify_intended_recipient = employee_name
                voucher.recipients_full_name = employee.employee_name  # Assuming employee_name field exists
                voucher.specify_expense_account = f"Casual Loading Expense - {abbr}"
                voucher.total_amount_paid = total_amount
                voucher.description = f"Autogenerated from Farm Operation: {farm_log.name}\n <br> Tied to Crop Batch: {farm_log.farming_activity_tied_to_which_crop_batch}\n <br>For Farming Season: {farm_log.farming_season_when_activity_was_conducted}<br>"
                voucher.company = default_company

                # Append activities to related_to_which_farm_activities
                for act in farm_log.specify_the_nature_of_activities:
                    voucher.append('related_to_which_farm_activities', {
                        'name_of_activity': act.name_of_activity
                    })

                voucher.insert(ignore_permissions=True)

                # Create Journal Entry
                journal_entry = frappe.get_doc({
                    'doctype': 'Journal Entry',
                    'voucher_type': 'Journal Entry',
                    'posting_date': nowdate(),
                    'cheque_no': voucher.name,
                    'cheque_date': voucher.voucher_date or nowdate(),
                    'company': default_company,
                    'mode_of_payment': "Cash",
                    'pay_to_recd_from': voucher.recipients_full_name,
                    'accounts': [
                        {
                            'account': f"Casual Loading Expense - {abbr}",
                            'party_type': 'Employee',
                            'party': voucher.specify_intended_recipient,
                            'debit_in_account_currency': voucher.total_amount_paid
                        },
                        {
                            'account': f"Cash - {abbr}",
                            'credit_in_account_currency': voucher.total_amount_paid
                        }
                    ],
                    'remark': f"AUTOGENERATED from Payment Voucher - {voucher.name} <br>Tied to Crop Batch - {farm_log.farming_activity_tied_to_which_crop_batch} \n<br> <br>For Farming Season: {farm_log.farming_season_when_activity_was_conducted}<br>"
                })

                journal_entry.insert(ignore_permissions=True)
                journal_entry.submit()

                # Update Petty Cash Voucher with journal_entry_created
                frappe.db.set_value('Petty Cash Voucher', voucher.name, 'journal_entry_created', journal_entry.name)

                # Reload and submit the voucher
                voucher = frappe.get_doc('Petty Cash Voucher', voucher.name)
                voucher.submit()

                # Append to labourer_records in farm_log
                farm_log.append('labourer_records', {
                    'employee_involved': voucher.specify_intended_recipient,
                    'total_man_hours_spent': farm_log.total_hrs,
                    'generated_voucher': voucher.name
                })

                vouchers.append(voucher.name)

        # Submit farm_log after all updates
        farm_log.submit()

        frappe.db.commit()

        return {'farm_log': farm_log.name, 'vouchers': vouchers}

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Farm Operation Log Creation Failed"))
        frappe.throw(_("Error creating Farm Operation Log: {0}").format(str(e)))
        

@frappe.whitelist()
def get_scheduled_dates_for_batch(crop_intake_name):
    """
    Get scheduled dates from table_biyv for a specific crop batch
    
    Args:
        crop_intake_name: Name of the Crop Intake document
    
    Returns:
        List of scheduled dates with their details
    """
    
    if not crop_intake_name:
        return []
    
    # Get Farm Activity Schedule for this batch
    schedule = frappe.get_all(
        "Farm Activity Schedule",
        filters={"activity_tied_to_which_crop_batch": crop_intake_name},
        fields=["name"],
        limit=1
    )
    
    if not schedule:
        return []
    
    # Get the schedule document
    schedule_doc = frappe.get_doc("Farm Activity Schedule", schedule[0].name)
    
    scheduled_dates = []
    
    # Process table_biyv entries
    if hasattr(schedule_doc, 'table_biyv') and schedule_doc.table_biyv:
        for idx, row in enumerate(schedule_doc.table_biyv):
            if row.scheduled_date:
                scheduled_dates.append({
                    'date': str(row.scheduled_date),
                    'activity_name': row.get('activity_name', 'Scheduled Activity'),
                    'description': row.get('description', ''),
                    'color_index': (idx % 6) + 1,  # Cycle through 6 color schemes
                    'assignees': row.get('assignees', ''),
                    'status': row.get('status', 'Scheduled')
                })
    
    return scheduled_dates


@frappe.whitelist()
def get_farm_inputs_list(txt='', start=0, page_length=20):
    """
    Get list of farm inputs for autocomplete
    
    Args:
        txt: Search text
        start: Start index for pagination
        page_length: Number of results to return
    
    Returns:
        List of farm inputs with their details
    """
    
    filters = []
    if txt:
        filters.append(['name', 'like', '%{}%'.format(txt)])
    
    return frappe.get_all(
        "Farm Inputs",
        filters=filters,
        fields=['name', 'uom', 'item_group', 'stock_uom'],
        start=start,
        limit=page_length,
        order_by='name'
    )


@frappe.whitelist()
def validate_farm_operation_log(data):
    """
    Validate farm operation log data before creation
    
    Args:
        data: Dictionary containing activity details
    
    Returns:
        Dictionary with validation results
    """
    
    if isinstance(data, str):
        data = json.loads(data)
    
    errors = []
    warnings = []
    
    # Check if date is in the future
    if data.get('selected_date'):
        if getdate(data.get('selected_date')) > getdate(nowdate()):
            warnings.append(_("Activity date is in the future"))
    
    # Check if labourers are available
    if data.get('labourers'):
        labourers = data.get('labourers')
        if isinstance(labourers, str):
            labourers = [l.strip() for l in labourers.split(',')]
        
        for labourer in labourers:
            if not frappe.db.exists("Farm Workers", labourer):
                errors.append(_("Labourer {0} does not exist").format(labourer))
    
    # Check farm inputs availability
    if data.get('farm_inputs'):
        for input_row in data.get('farm_inputs'):
            if input_row.get('farm_input'):
                if not frappe.db.exists("Farm Inputs", input_row.get('farm_input')):
                    errors.append(_("Farm Input {0} does not exist").format(
                        input_row.get('farm_input')
                    ))
    
    # Check if activity already logged for this date
    existing_logs = frappe.get_all(
        "Farm Operation Log",
        filters={
            "specify_the_date_of_activity": data.get('selected_date'),
            "farming_activity_tied_to_which_crop_batch": data.get('crop_intake')
        },
        fields=['name']
    )
    
    if existing_logs:
        warnings.append(_("Activity already logged for this date. Creating duplicate entry."))
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }


@frappe.whitelist()
def get_activity_summary(crop_intake_name, start_date=None, end_date=None):
    """
    Get summary of farming activities for a crop batch
    
    Args:
        crop_intake_name: Name of the Crop Intake document
        start_date: Optional start date for filtering
        end_date: Optional end date for filtering
    
    Returns:
        Dictionary with activity summary
    """
    
    filters = {
        "farming_activity_tied_to_which_crop_batch": crop_intake_name
    }
    
    if start_date:
        filters["specify_the_date_of_activity"] = [">=", start_date]
    
    if end_date:
        if "specify_the_date_of_activity" in filters:
            filters["specify_the_date_of_activity"] = ["between", [start_date, end_date]]
        else:
            filters["specify_the_date_of_activity"] = ["<=", end_date]
    
    logs = frappe.get_all(
        "Farm Operation Log",
        filters=filters,
        fields=[
            "name",
            "specify_the_date_of_activity",
            "total_hrs",
            "specify_the_nature_of_activities",
            "specify_the_labourers_who_undertook_this_exercise"
        ]
    )
    
    # Calculate summary statistics
    total_activities = len(logs)
    total_man_hours = sum([flt(log.get('total_hrs', 0)) for log in logs])
    
    # Get unique activities
    activities_set = set()
    for log in logs:
        if log.get('specify_the_nature_of_activities'):
            activities = log.get('specify_the_nature_of_activities')
            if isinstance(activities, str):
                activities = [a.strip() for a in activities.split(',')]
            for activity in activities:
                activities_set.add(activity)
    
    # Get unique labourers
    labourers_set = set()
    for log in logs:
        if log.get('specify_the_labourers_who_undertook_this_exercise'):
            labourers = log.get('specify_the_labourers_who_undertook_this_exercise')
            if isinstance(labourers, str):
                labourers = [l.strip() for l in labourers.split(',')]
            for labourer in labourers:
                labourers_set.add(labourer)
    
    return {
        'total_activities_logged': total_activities,
        'total_man_hours': total_man_hours,
        'unique_activities': list(activities_set),
        'unique_labourers': list(labourers_set),
        'activity_logs': logs
    }

import frappe

@frappe.whitelist()
def get_scheduled_activities(schedule_names):
    """
    Get all scheduled activities from multiple Farm Activity Schedule documents
    """
    if isinstance(schedule_names, str):
        schedule_names = frappe.parse_json(schedule_names)
    
    activities = []
    
    for schedule_name in schedule_names:
        schedule = frappe.get_doc("Farm Activity Schedule", schedule_name)
        if hasattr(schedule, 'scheduled_activity_table') and schedule.scheduled_activity_table:
            for row in schedule.scheduled_activity_table:
                activities.append({
                    'scheduled_date': row.date_of_planned_activity,
                    'activity_being_undertaken': row.nature_of_activity,
                    'staff_name': row.assignee_full_name,
                    'status': row.estimated_hours_to_complete
                })
    
    return activities