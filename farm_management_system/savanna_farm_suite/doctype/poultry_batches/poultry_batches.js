// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Poultry Batches", {
	refresh(frm) {
		// Set animals_received_on to today if new and empty
		if (frm.is_new() && !frm.doc.animals_received_on) {
			frm.set_value("animals_received_on", frappe.datetime.get_today());
		}

		// Set dynamic query for LPO based on received_from
		frm.set_query("lpo", function() {
			const supplier = frm.doc.received_from;
			const filters = supplier ? { supplier: supplier } : {};
			return {
				filters,
				// only return names
				page_length: 50,
				query: undefined
			};
		});
	},

	received_from(frm) {
		// Re-apply query when supplier changes and clear LPO if mismatched
		frm.set_query("lpo", function() {
			const supplier = frm.doc.received_from;
			const filters = supplier ? { supplier: supplier } : {};
			return { filters };
		});
		if (frm.doc.lpo) {
			// verify current lpo belongs to selected supplier; if not, clear it
			frappe.db.get_value("Purchase Order", frm.doc.lpo, "supplier").then(r => {
				if (r && r.message && r.message.supplier && r.message.supplier !== frm.doc.received_from) {
					frm.set_value("lpo", null);
				}
			});
		}
	},

	animal_batch(frm) {
		// When animal_batch (Animals) changes, filter animal_category (Table MultiSelect)
		// Fetch linked categories from Animals -> Animals Sub Categories (child table)
		if (!frm.doc.animal_batch) {
			return;
		}

		frappe.db.get_doc("Animals", frm.doc.animal_batch).then(animal_doc => {
			const allowed_categories = (animal_doc.animal_categories || [])
				.map(row => row.animal_category)
				.filter(Boolean);

			// Apply query to the Link field inside the Table MultiSelect rows
			frm.set_query("animal_category", function() {
				if (allowed_categories.length === 0) {
					// restrict to none if no categories defined
					return { filters: { name: ["in", []] } };
				}
				return { filters: { name: ["in", allowed_categories] } };
			});
		}).catch(() => {
			// If fetch fails, do not restrict
			frm.set_query("animal_category", function() {
				return {};
			});
		});

		// Filter animal_stage by Animal Stages where applicable_for == doc.animal_batch
		frm.set_query("animal_stage", function() {
			return {
				filters: {
					applicable_for: frm.doc.animal_batch
				}
			};
		});
	}
});
