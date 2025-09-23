// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt
frappe.ui.form.on("Crop", {
    refresh(frm) {
        // record whether this form was new (so we can act only on first save)
        frm.__was_new = Boolean(frm.doc.__islocal);

        // If name already present but short_code empty on refresh, generate once
        if (frm.doc.name_of_the_crop && !frm.doc.short_code) {
            generate_and_set_shortcode(frm);
        }
    },
    onload: function(frm) {
        let intro = '', color = '';
        const state = (frm.doc.workflow_state || '').toLowerCase();
    
        if (!frm.is_new()) {
          intro = `
            <strong>
              🎯 Please confirm accurate valuation rates for Products and Seedlings.<br>
              ✨ <i>Tip: Correct rates ensure precise accounting and reliable reports.</i>
            </strong>`;
          color = 'red';
    
        } 
        frm.set_intro(intro, color);
    },
    before_save(frm) {
        // ensure the "was new" flag is set even if refresh wasn't triggered
        if (typeof frm.__was_new === "undefined") {
            frm.__was_new = Boolean(frm.doc.__islocal);
        }
    },

    name_of_the_crop(frm) {
        // Run when name changes; only auto-generate if short_code is empty
        if (!frm.doc.name_of_the_crop) return;
        generate_and_set_shortcode(frm);
    },

    after_save(frm) {
        // Only run the dialog/action if this was the first save of a new document
        if (!frm.__was_new) return;

        // prevent re-running on subsequent saves
        frm.__was_new = false;

        // Determine whether to use Seedlings or Seeds based on specify_crop_category
        let itemType = frm.doc.specify_crop_category !== "Grain" ? "Seedlings" : "Seeds";

        // Show confirmation dialog
        frappe.confirm(
            __(`Do you wish to create ${itemType}?`),
            function() {
                // Create Crop Seedlings document
                createItem(frm, itemType);
            },
            function() {
                // Cancel action
                frappe.show_alert({
                    message: __("Operation cancelled"),
                    indicator: "orange"
                });
            }
        );
    }
});

// Function to create Item document
function createItem(frm, itemType) {
    let item_code = itemType === "Seedlings" ? `${frm.doc.name} - Seedlings` : `${frm.doc.name} - Seeds`;
    let itemDoc = frappe.model.get_new_doc("Item");
    itemDoc.item_code = item_code;
    itemDoc.item_name = item_code;
    itemDoc.item_group = "All Item Groups";
    itemDoc.stock_uom = "Nos";
    // Save the Item document
    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: itemDoc
        },
        callback: function(response) {
            if (response.message) {
                // Show success message
                frappe.show_alert({
                    message: __("Item created successfully"),
                    indicator: "green"
                });
                // Create Crop Seedlings document
                createCropSeedlings(frm, itemType, response.message);
            }
        }
    });
}
// Function to create Crop Seedlings document
function createCropSeedlings(frm, itemType, itemDoc) {
    let seedlingsDoc = frappe.model.get_new_doc("Crop Seedlings");
    seedlingsDoc.seedling_tied_to_which_crop = frm.doc.name;
    // Safely handle case when itemDoc is not provided
    seedlingsDoc.specify_unit_of_measurement = (itemDoc && itemDoc.stock_uom) ? itemDoc.stock_uom : "Nos";
    seedlingsDoc.name_of_variant_optional = (itemDoc && itemDoc.item_code) ? itemDoc.item_code : "";
    // Save the Crop Seedlings document
    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: seedlingsDoc
        },
        callback: function(response) {
            if (response.message) {
                // Play success sound
                frappe.utils.play_sound("success");
                // Show success message
                frappe.show_alert({
                    message: `${itemType} created successfully`,
                    indicator: "green"
                });
            }
        }
    });
}

// Function to generate and set short code (unchanged)
function generate_and_set_shortcode(frm) {
    if (!frm.doc.short_code) {
        let short_code = frm.doc.name_of_the_crop
            .split(" ")
            .map(word => word.charAt(0).toUpperCase())
            .join("")
            .slice(0, 5);
        frm.set_value("short_code", short_code);
    }
}

frappe.ui.form.on('Crop Activity Schedule Table', {
    specify_farming_activity: function(frm, cdt, cdn) {
        update_activity_summary(cdt, cdn);
    },
    undertaken_after_how_many_days: function(frm, cdt, cdn) {
        update_activity_summary(cdt, cdn);
    }
});

function update_activity_summary(cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    if (row.specify_farming_activity && row.undertaken_after_how_many_days) {
        let summary = `${row.specify_farming_activity} at ${row.undertaken_after_how_many_days} Days`;
        frappe.model.set_value(cdt, cdn, "activity_summary", summary);
    }
}

/**
 * Generate a candidate short code from the crop name
 * Rules:
 *  - If 3-4 words: take initials (up to 4 chars)
 *  - If 1 word: first 3 letters
 *  - If 2 words: initials + next char(s) from first word to pad to 3
 */
function build_candidate_code(name) {
    if (!name) return "";
    // normalize
    const cleaned = String(name).replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);

    if (words.length >= 3 && words.length <= 4) {
        // initials of up to 4 words
        return words.slice(0, 4).map(w => w.charAt(0).toUpperCase()).join("");
    } else if (words.length === 2) {
        const a = words[0].charAt(0).toUpperCase();
        const b = words[1].charAt(0).toUpperCase();
        // try to make a 3-letter code: first letters + next letter from first word (if exists)
        const extra = (words[0].length > 1) ? words[0].charAt(1).toUpperCase() : "X";
        return (a + b + extra).substring(0, 3);
    } else {
        // single long word or fallback: first 3 letters
        return (words[0].substr(0, 3) || "CRP").toUpperCase();
    }
}

/**
 * Ensure uniqueness by fetching existing short_codes starting with candidate,
 * then append -NN suffix when necessary.
 */
function ensure_unique_shortcode(candidate, callback) {
    if (!candidate) {
        return callback(candidate);
    }

    // fetch existing short_codes that start with candidate (covers candidate and candidate-xx)
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Crop",
            fields: ["short_code"],
            filters: [
                ["Crop", "short_code", "like", candidate + "%"]
            ],
            limit_page_length: 1000
        },
        callback: function(r) {
            const existing = (r.message || []).map(x => (x.short_code || "").toString().toUpperCase());
            // if exact candidate not present, we can use it
            if (!existing.includes(candidate.toUpperCase())) {
                return callback(candidate.toUpperCase());
            }

            // Otherwise, find highest numeric suffix of form CANDIDATE-NN or CANDIDATE-NNN etc.
            let max = 0;
            const suffixRegex = new RegExp("^" + candidate.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "-(\\d+)$", "i");
            existing.forEach(code => {
                const m = code.match(suffixRegex);
                if (m && m[1]) {
                    const n = parseInt(m[1], 10);
                    if (!isNaN(n) && n > max) max = n;
                }
            });
            const next = (max + 1);
            // pad to two digits (01,02) — change padStart if you want 3 digits
            const padded = String(next).padStart(2, "0");
            callback((candidate + "-" + padded).toUpperCase());
        }
    });
}

/**
 * Main routine: build candidate and set unique short_code on the form.
 */
function generate_and_set_shortcode(frm) {
    const name = frm.doc.name_of_the_crop;
    if (!name) return;

    const candidate = build_candidate_code(name);
    ensure_unique_shortcode(candidate, function(unique_code) {
        // set only if not already set or if different
        if (!frm.doc.short_code || frm.doc.short_code.toString().toUpperCase() !== unique_code) {
            frm.set_value("short_code", unique_code);
            frm.refresh_field("short_code");
        }
    });
}
