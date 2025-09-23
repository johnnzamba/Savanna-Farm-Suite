__version__ = "0.0.1"

import frappe
from frappe.core.doctype.navbar_settings.navbar_settings import NavbarSettings as FrappeNavbar
from farm_management_system.config.test_override import randomize_splash_image
FrappeNavbar.get_app_logo = randomize_splash_image
