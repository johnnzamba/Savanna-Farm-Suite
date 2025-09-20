// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Farming Season", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on('Farm Plot History Table', {
    // This runs when the 'click_to_review_batch' button in a child row is clicked
    click_to_review_batch: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row) {
            frappe.msgprint(__('Row not found'));
            return;
        }

        const linked = row.linked_to_batch;
        if (!linked) {
            frappe.msgprint(__('No linked batch specified for this row'));
            return;
        }

        // Preferred: route to the Crop Intake form in the desk
        // This will navigate to: /app/form/Crop%20Intake/<docname>
        frappe.set_route('Form', 'Crop Intake', linked);

        // Alternative: open the standard page route (uncomment if you want this behavior)
        // window.location.href = `/app/crop-intake/${encodeURIComponent(linked)}`;
    }
});
