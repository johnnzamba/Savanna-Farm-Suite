app_name = "farm_management_system"
app_title = "Savanna Farm Suite"
app_publisher = "Techsavanna Technology"
app_description = "A powerful, automated farm management system built on the Frappe Framework. It integrates core financial operations from ERPNext to deliver real-time insights, streamline workflows, and enhance data-driven decision-making for modern agricultural businesses."
app_email = "john@techsavanna.technology"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page

add_to_apps_screen = [
	{
		"name": "farm_management_system",
		"logo": "/assets/farm_management_system/plants.svg",
		"title": "Savanna Farm Suite",
		"route": "/app/farm-management-system"
	}
]
# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = [
    "/assets/farm_management_system/css/banners.css",
    "/assets/farm_management_system/css//farm_activity_schedule.css",
    # "/assets/farm_management_system/js/farm_activity_calend.css"
]
app_include_js = [ 
    "/assets/farm_management_system/js/banners.js", 
    # "/assets/farm_management_system/js/poultry_batches_listview.js",
    "/assets/farm_management_system/js/cattle_listview.js",
    "/assets/farm_management_system/js/farm_activity_schedule_calendar.js",
    # "/assets/farm_management_system/js/farm_activity_calend.js"
    # "/assets/farm_management_system/js/farm_activity_gantt.js"
]

# include js, css files in header of web template
# web_include_css = "/assets/farm_management_system/css/banners.css"
# web_include_js = "/assets/farm_management_system/js/banners.js"
sounds = [
    {
        "name": "success",
        "src": "/assets/farm_management_system/sounds/sfx.mp3",
        "volume": 0.5
    }
]

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "farm_management_system/public/scss/website"

treeviews = [
	"Cattle"
]

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

fixtures = [
    {
        "dt": "Workflow State"
    },
    {
       "dt": "Workflow Action Master"
    },
    {
        "dt": "Workflow",
        "filters": [["name", "in", ["Treatment Process"]]]

    },
    {
        "dt": "Client Script",
        "filters": [["name", "in", ["Poultry Batch", "Calendar HTML", "Render Chart", "Process Farming Activity", "Cull Poultry", "Collections for Poultry Batch", "Record Harvest", "Collection - Poultry Form", "Collection - Cattle List"]]]

    },
    {
        "dt": "Email Template",
        "filters": [["name", "in", ["Doctor's Notification"]]]
    },
    {
        "dt": "Page",
        "filters": [["name", "in", ["farm-activity-calend"]]]
    },
    {
        "dt": "Animals"
    },
    {
        "dt": "Animals Categories"
    },
    {
        "dt": "Location",
        "filters": [["name", "in", ["Default"]]]
    },
    {
        "dt": "Workspace",
        "filters": [["name", "in", ["Farm Management System"]]]
    }
]

calendars = ["Farm Activity Schedule"]

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}

# doctype,
# _list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "farm_management_system/public/icons.html"
# app_include_icons = [
#     "farm_management_system/public/pig.svg",
#     "farm_management_system/public/livestock.svg",
#     "farm_management_system/public/plants.svg",
#     "farm_management_system/public/poultry.svg",
#     "farm_management_system/public/cattle.svg",
#     "farm_management_system/public/sheep.svg",
#     "farm_management_system/public/sunflower.svg",
#     "farm_management_system/public/vegetable.svg",
# ]


# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "farm-management-system"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------
jinja = {
    "methods": [
        "farm_management_system.savanna_farm_suite.page.farm_activity_calend.farm_calendar.get_random_farm_splash_icon",
        "farm_management_system.savanna_farm_suite.page.farm_activity_calend.farm_calendar.get_farm_splash_image"
    ]
}
# add methods and filters to jinja environment
# jinja = {
# 	"methods": "farm_management_system.utils.jinja_methods",
# 	"filters": "farm_management_system.utils.jinja_filters"
# }

# Installation
# ------------
after_migrate = [
    "farm_management_system.config.install.create_default_asset_category",
    "farm_management_system.config.install.create_default_expense_accounts",
]

# before_install = "farm_management_system.install.before_install"
# after_install = "farm_management_system.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "farm_management_system.uninstall.before_uninstall"
# after_uninstall = "farm_management_system.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "farm_management_system.utils.before_app_install"
# after_app_install = "farm_management_system.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "farm_management_system.utils.before_app_uninstall"
# after_app_uninstall = "farm_management_system.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "farm_management_system.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }
    # "frappe.email.receive.Email.set_subject": "my_app.email_utils.set_subject"
# override_whitelisted_methods = {
# 	"frappe.email.receive.Email.set_subject": "farm_management_system.config.email.custom_set_subject"
# }

# boot_session = "farm_management_system.config.email.apply_email_overrides"


# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"farm_management_system.tasks.all"
# 	],
# 	"daily": [
# 		"farm_management_system.tasks.daily"
# 	],
# 	"hourly": [
# 		"farm_management_system.tasks.hourly"
# 	],
# 	"weekly": [
# 		"farm_management_system.tasks.weekly"
# 	],
# 	"monthly": [
# 		"farm_management_system.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "farm_management_system.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "farm_management_system.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "farm_management_system.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["farm_management_system.utils.before_request"]
# after_request = ["farm_management_system.utils.after_request"]

# Job Events
# ----------
# before_job = ["farm_management_system.utils.before_job"]
# after_job = ["farm_management_system.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"farm_management_system.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

