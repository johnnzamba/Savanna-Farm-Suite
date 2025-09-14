__version__ = "0.0.1"


import frappe
from frappe.email.receive import Email as FrappeEmail
from farm_management_system.config.email import custom_set_subject
FrappeEmail.set_subject = custom_set_subject
