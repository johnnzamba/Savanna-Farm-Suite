// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Animal Vaccines", {
	refresh(frm) {

	},
    uom(frm) {
        update_cost_description(frm);
        // update_measure_in_options(frm);
    }
});

function update_cost_description(frm) {
    if (frm.doc.uom && frm.doc.uom.length > 0) {
        const uom_values = frm.doc.uom.map(item => item.uom).join(" | ");
        frm.set_df_property("cost_of_the_vaccine", "description", `Cost will be Computed per <strong>${uom_values}</strong>`);
    } else {
        frm.set_df_property("cost_of_the_vaccine", "description", "");
    }
}