// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Treatment and Vaccination Logs", {
	refresh(frm) {
		update_vaccine_cost_description(frm);
		set_status_indicator(frm);
	},
	
	status(frm) {
		set_status_indicator(frm);
	},

	vaccine_used(frm) {
		// Update description when vaccine selection changes
		update_vaccine_cost_description(frm);
	}
});

function update_vaccine_cost_description(frm) {
	if (frm.doc.vaccine_used) {
		// Fetch the Animal Vaccine document to get UOM values
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Animal Vaccines',
				name: frm.doc.vaccine_used
			},
			callback: function(r) {
				if (r.message && r.message.uom && r.message.uom.length > 0) {
					// Extract UOM values from the Table MultiSelect field
					const uom_values = r.message.uom.map(item => item.uom).join(" | ");
					frm.set_df_property("qty_vaccine", "description", `Cost will be Computed per <strong>${uom_values}</strong>`);
				} else {
					frm.set_df_property("qty_vaccine", "description", "");
				}
			}
		});
	} else {
		// Clear description if no vaccine is selected
		frm.set_df_property("qty_vaccine", "description", "");
	}
}

function set_status_indicator(frm) {
	const status = frm.doc.status || '';
	const color_map = {
		"Upcoming": 'yellow',
		"Appointment Set for This Month": 'purple',
		"Appointment Set for This Week": 'pink',
		"Appointment Scheduled for Today": 'green',
		"Appointment Passed": 'red'
	};
	const color = color_map[status] || 'blue';
	if (frm.page && frm.page.set_indicator) {
		frm.page.set_indicator(status, color);
	}
}
