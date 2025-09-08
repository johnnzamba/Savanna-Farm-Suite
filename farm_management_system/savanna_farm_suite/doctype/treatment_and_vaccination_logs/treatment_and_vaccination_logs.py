# Copyright (c) 2025, Techsavanna Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
import json
from frappe.model.document import Document
from datetime import datetime, timedelta
from frappe.utils import today, getdate, add_days, add_months, nowdate, nowtime
from frappe.utils.data import flt


class TreatmentandVaccinationLogs(Document):
	def after_insert(self):
		# Set workflow state directly without complex logic
		self.set_simple_workflow_state()
		self.send_doctor_notification()
	
	def set_simple_workflow_state(self):
		"""Set workflow state using simple logic to avoid saving conflicts"""
		try:
			if not self.treatment_date:
				self.status = "Upcoming"
				return
			
			treatment_date = getdate(self.treatment_date)
			current_date = getdate(today())
			
			# Simple workflow state logic
			if treatment_date < current_date:
				self.status = "Appointment Passed"
			elif treatment_date == current_date:
				self.status = "Appointment Scheduled for Today"
			elif self.is_date_this_week(treatment_date):
				self.status = "Appointment Set for This Week"
			elif self.is_date_this_month(treatment_date):
				self.status = "Appointment Set for This Month"
			else:
				self.status = "Upcoming"
			
			# Save the workflow state directly
			frappe.db.set_value(self.doctype, self.name, "status", self.status)
			frappe.db.commit()
			
		except Exception as e:
			frappe.log_error(f"Error setting simple workflow state: {str(e)}")
	
	def on_update(self):
		"""Handle updates, especially workflow state changes"""
		if self.has_value_changed("status"):
			self.update_doctor_appointment_status()
		# Create stock ledger entry for vaccine if vaccine_used is set
		if self.vaccine_used:
			self.create_stock_ledger_entry_for_vaccine()
		if self.vaccine_used and self.qty_vaccine:
			self.update_cattle_logs()
	
	def on_update_after_submit(self):
		"""Handle updates after document submission"""
		# Update workflow state based on current date after submission
		self.update_workflow_state_after_submit()
		# Create stock ledger entry for vaccine if vaccine_used is set
		if self.vaccine_used:
			self.create_stock_ledger_entry_for_vaccine()
	
	def set_workflow_state_based_on_date(self):
		"""Set workflow state based on treatment date"""
		if not self.treatment_date:
			self.status = "Upcoming"
			return
		
		treatment_date = getdate(self.treatment_date)
		current_date = getdate(today())
		
		# Determine the target workflow state
		target_state = None
		
		# Check if treatment date has already passed
		if treatment_date < current_date:
			target_state = "Appointment Passed"
		# For future dates, check if they fall within this week/month
		elif treatment_date == current_date:
			target_state = "Appointment Scheduled for Today"
		elif self.is_date_this_week(treatment_date):
			target_state = "Appointment Set for This Week"
		elif self.is_date_this_month(treatment_date):
			target_state = "Appointment Set for This Month"
		else:
			target_state = "Upcoming"
		
		# Set the workflow state only - don't submit automatically
		self.status = target_state
		
		# Update the workflow state in the database without triggering validation
		try:
			frappe.db.set_value(
				self.doctype, 
				self.name, 
				"status", 
				target_state
			)
			frappe.db.commit()
		except Exception as e:
			frappe.log_error(f"Error setting workflow state: {str(e)}")
	
	def is_date_this_week(self, check_date):
		"""Check if date falls within current week (Monday to Sunday)"""
		current_date = getdate(today())
		start_of_week = current_date - timedelta(days=current_date.weekday())
		end_of_week = start_of_week + timedelta(days=6)
		return start_of_week <= check_date <= end_of_week
	
	def is_date_this_month(self, check_date):
		"""Check if date falls within current month"""
		current_date = getdate(today())
		return check_date.year == current_date.year and check_date.month == current_date.month

	def send_doctor_notification(self):
		"""Send email notification to the doctor using the Doctor's Notification template"""
		try:
			if not self.doctor:
				return			
			doctor_email = frappe.get_value("Doctors", self.doctor, "doctors_email_address")
			if not doctor_email:
				frappe.log_error(f"No email address found for doctor: {self.doctor}")
				return			
			email_template = frappe.get_doc("Email Template", "Doctor's Notification")
			if not email_template:
				frappe.log_error("Email Template 'Doctor's Notification' not found")
				return			
			context = self.as_dict()
			rendered_subject = frappe.render_template(email_template.subject, context)
			rendered_message = frappe.render_template(email_template.response, context)
			
			# Send the email
			frappe.sendmail(
				recipients=[doctor_email],
				subject=rendered_subject,
				message=rendered_message,
				reference_doctype=self.doctype,
				reference_name=self.name,
				now=True
			)			
			frappe.publish_realtime(
				event="play_sound",
				message="success",
				user=frappe.session.user
			)
			frappe.msgprint(f"Notification sent to doctor: {self.doctor}", alert=True, indicator="green")
		except Exception as e:
			frappe.log_error(f"Error sending doctor notification: {str(e)}")

	def update_doctor_appointment_table(self):
		"""Add new row to doctor's appointment table"""
		try:
			if not self.doctor:
				return			
			doctor_doc = frappe.get_doc("Doctors", self.doctor)
			if not doctor_doc:
				return			
			if not hasattr(doctor_doc, 'table_ihua'):
				frappe.log_error(f"table_ihua child table not found in Doctors doctype for doctor: {self.doctor}")
				return
			
			# Add new row to the child table
			doctor_doc.append("table_ihua", {
				"appointment_log": self.name,
				"date_of_appointment": self.treatment_date,
				"appointment_status": self.status,
				"purchase_order_generated": self.doctors_purchase_order_based_on_appointment_fee
			})			
			doctor_doc.save(ignore_permissions=True)
			frappe.db.commit()
		except Exception as e:
			frappe.log_error(f"Error updating doctor appointment table: {str(e)}")
	
	def update_doctor_appointment_status(self):
		"""Update existing appointment status in doctor's table when workflow state changes"""
		try:
			if not self.doctor:
				return
			
			# Get the doctor document
			doctor_doc = frappe.get_doc("Doctors", self.doctor)
			if not doctor_doc:
				return
			
			# Check if table_ihua exists
			if not hasattr(doctor_doc, 'table_ihua'):
				return
			
			# Find existing row with matching appointment_log
			existing_row = None
			for row in doctor_doc.table_ihua:
				if row.appointment_log == self.name:
					existing_row = row
					break
			
			# Update the appointment_status if row exists
			if existing_row:
				existing_row.appointment_status = self.status
				doctor_doc.save(ignore_permissions=True)
				frappe.db.commit()
				
		except Exception as e:
			frappe.log_error(f"Error updating doctor appointment status: {str(e)}")

	def create_stock_ledger_entry_for_vaccine(self):
		"""Create stock ledger entry for vaccine usage"""
		try:
			if not self.vaccine_used:
				return
			
			# Check if Item exists with item_code == vaccine_used
			items = frappe.get_all("Item", filters={"item_name": self.vaccine_used}, fields=["name"])
			if not items:
				frappe.log_error(f"No Item found with item_code '{self.vaccine_used}' for vaccine")
				return
			
			item_name = items[0].name
			
			# Get Item document and defaults
			item_doc = frappe.get_doc("Item", item_name)
			item_defaults = item_doc.get("item_defaults") or []
			warehouse = (item_defaults[0].get("default_warehouse") if item_defaults else None)
			
			if not warehouse:
				frappe.log_error(f"Item {item_name} is missing Item Default → Default Warehouse for vaccine")
				return
			
			# Get latest SLE for this item and warehouse
			sle_rows = frappe.get_all(
				"Stock Ledger Entry",
				filters={"item_code": item_name, "warehouse": warehouse},
				fields=[
					"name", "qty_after_transaction", "incoming_rate", "outgoing_rate",
					"valuation_rate", "fiscal_year", "company", "posting_datetime", "creation"
				],
				order_by="posting_datetime desc, creation desc",
				limit_page_length=1
			)
			
			if not sle_rows:
				frappe.log_error(f"No Stock Ledger Entry found for Item {item_name} at Warehouse {warehouse} for vaccine")
				return
			
			latest = sle_rows[0]
			latest_qty_after = flt(latest.get("qty_after_transaction") or 0.0)
			incoming_rate = flt(latest.get("incoming_rate") or 0.0)
			outgoing_rate = flt(latest.get("outgoing_rate") or 0.0)
			valuation_rate = flt(latest.get("valuation_rate") or 0.0)
			fiscal_year = latest.get("fiscal_year")
			company = latest.get("company")
			
			# Build new SLE values
			qty_vaccine = flt(self.get("qty_vaccine") or 0.0)
			actual_qty = -qty_vaccine  # Negative for consumption
			new_qty_after = flt(latest_qty_after + actual_qty)
			
			stock_value = flt(valuation_rate * new_qty_after)
			stock_value_difference = flt(valuation_rate * actual_qty)			
			stock_queue_str = json.dumps([[new_qty_after, valuation_rate]])			
			voucher_detail_no = self.get("poultry_batch_under_treatment")			
			sle_doc = frappe.get_doc({
				"doctype": "Stock Ledger Entry",
				"item_code": item_name,
				"warehouse": warehouse,
				"posting_date": nowdate(),
				"posting_time": nowtime(),
				"voucher_type": "Treatment and Vaccination Logs",
				"voucher_no": self.name,
				"voucher_detail_no": voucher_detail_no,
				"actual_qty": actual_qty,
				"qty_after_transaction": new_qty_after,
				"incoming_rate": incoming_rate,
				"outgoing_rate": outgoing_rate,
				"valuation_rate": valuation_rate,
				"fiscal_year": fiscal_year,
				"company": company,
				"stock_value": stock_value,
				"stock_value_difference": stock_value_difference,
				"stock_queue": stock_queue_str
			})
			
			sle_doc.insert(ignore_permissions=True)
			
			# Try to submit the SLE
			try:
				sle_doc.submit()
				frappe.msgprint(f"Stock Ledger Entry created for vaccine: {self.vaccine_used}")
			except Exception as e:
				frappe.log_error(f"Error submitting SLE for vaccine: {str(e)}")
				frappe.msgprint(f"SLE created but submission failed for vaccine: {self.vaccine_used}", alert=True, indicator="orange")
				
		except Exception as e:
			frappe.log_error(f"Error creating stock ledger entry for vaccine: {str(e)}")
			frappe.msgprint(f"Error creating SLE for vaccine: {str(e)}", alert=True, indicator="red")


	def update_workflow_state_after_submit(self):
		"""Update workflow state after document submission to ensure it's current"""
		try:
			if not self.treatment_date:
				return
			
			treatment_date = getdate(self.treatment_date)
			current_date = getdate(today())
			
			# Determine the current workflow state based on today's date
			target_state = None
			
			if treatment_date < current_date:
				target_state = "Appointment Passed"
			elif treatment_date == current_date:
				target_state = "Appointment Scheduled for Today"
			elif self.is_date_this_week(treatment_date):
				target_state = "Appointment Set for This Week"
			elif self.is_date_this_month(treatment_date):
				target_state = "Appointment Set for This Month"
			else:
				target_state = "Upcoming"
			
			# Only update if the state has actually changed
			if self.status != target_state:
				frappe.db.set_value(
					self.doctype,
					self.name,
					"status",
					target_state
				)
				frappe.db.commit()
				
		except Exception as e:
			frappe.log_error(f"Error updating workflow state after submit: {str(e)}")

	def update_cattle_logs(self):
		"""
		Update treatment logs in Cattle Shed and/or individual Cattle documents
		with vaccine information from the current document
		"""
		try:
			# Update Cattle Shed treatment logs if specified
			if hasattr(self, 'cattle_shed_under_treatment') and self.cattle_shed_under_treatment:
				self.update_cattle_shed_treatment_logs()
			
			# Update individual Cattle treatment table if specified
			if hasattr(self, 'specific_cattle_under_treatment') and self.specific_cattle_under_treatment:
				self.update_individual_cattle_treatment()
				
		except Exception as e:
			frappe.log_error(
				_("Error updating cattle treatment logs for {0}: {1}").format(self.name, str(e)),
				"Cattle Treatment Update"
			)
			frappe.msgprint(
				_("Failed to update treatment logs. Please check error logs."),
				title=_("Update Failed"),
				indicator="red"
			)

	def update_cattle_shed_treatment_logs(self):
		"""Update treatment logs in the Cattle Shed document"""
		cattle_shed = frappe.get_doc("Cattle Shed", self.cattle_shed_under_treatment)
		
		# Append to treatment_logs table
		cattle_shed.append("treatment_logs", {
			"treatment_date": self.treatment_date,
			"animal_vaccine_issued": self.vaccine_used,
			"treatment_conducted_by": self.doctor,
			"quantity_of_vaccine_issued": self.qty_vaccine,
			"approximate_intake_per_animal": self.qty_vaccine
		})
		
		cattle_shed.save(ignore_permissions=True)
		frappe.msgprint(
			_("Treatment log updated for cattle shed {0}").format(self.cattle_shed_under_treatment),
			indicator="green"
		)

	def update_individual_cattle_treatment(self):
		"""Update treatment table in the individual Cattle document"""
		cattle = frappe.get_doc("Cattle", self.specific_cattle_under_treatment)
		
		# Append to treatment_table
		cattle.append("treatment_table", {
			"treatment_date": self.treatment_date,
			"animal_vaccine_issued": self.vaccine_used,
			"treatment_conducted_by": self.doctor,
			"quantity_of_vaccine_issued": self.qty_vaccine,
			"approximate_intake_per_animal": self.qty_vaccine
		})
		
		cattle.save(ignore_permissions=True)
		frappe.msgprint(
			_("Treatment log updated for cattle {0}").format(self.specific_cattle_under_treatment),
			indicator="green"
		)


@frappe.whitelist()
def update_workflow_states_for_all_logs():
	"""
	Scheduler function to update workflow states for all Treatment and Vaccination Logs
	This function should be called via scheduler to keep workflow states current
	"""
	try:
		# Get all Treatment and Vaccination Logs
		logs = frappe.get_all(
			"Treatment and Vaccination Logs",
			fields=["name", "treatment_date", "docstatus"],
			filters={"docstatus": ["!=", 2]}  # Exclude cancelled documents
		)
		
		updated_count = 0
		for log in logs:
			try:
				doc = frappe.get_doc("Treatment and Vaccination Logs", log.name)
				old_state = getattr(doc, 'status', None)
				
				# Update workflow state using the same logic as after_insert
				doc.set_workflow_state_based_on_date()
				
				new_state = getattr(doc, 'status', None)
				if old_state != new_state:
					updated_count += 1
					frappe.db.commit()
					
			except Exception as e:
				frappe.log_error(f"Error updating workflow state for log {log.name}: {str(e)}")
				continue
		
		frappe.msgprint(f"Successfully updated workflow states for {updated_count} documents.")
		return {"status": "success", "updated_count": updated_count}
		
	except Exception as e:
		frappe.log_error(f"Error in update_workflow_states_for_all_logs: {str(e)}")
		frappe.msgprint(f"Error updating workflow states: {str(e)}", alert=True, indicator="red")
		return {"status": "error", "message": str(e)}

