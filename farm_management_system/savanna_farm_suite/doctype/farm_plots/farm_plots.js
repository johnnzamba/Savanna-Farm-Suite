// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Farm Plots", {
    refresh(frm) {
        if (!frm.is_new()) {
            render_status_indicator(frm);
        }
    },
    // current_status(frm) {
    //     render_status_indicator(frm);
    // },

    // Trigger when user selects/changes the farm for this plot
    plot_belongs_to_which_farm: function(frm) {
        // Only run for new docs
        if (!frm.is_new()) return;

        const farm_name = frm.doc.plot_belongs_to_which_farm;
        if (!farm_name) {
            // clear dependent fields if farm cleared
            frm.set_value("plot_number", "");
            frm.set_value("available_farmland_for_allocation", 0);
            return;
        }

        // 1) fetch Farm basic info (try to get a short_code and land_acres)
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Farm",
                fieldname: ["short_code", "land_acres"],
                filters: { name: farm_name }
            },
            callback: function(farm_res) {
                const farm_data = farm_res.message || {};
                const farm_short_code = (farm_data.short_code || "").toString().trim();
                const farm_land_acres = parseFloat(farm_data.land_acres) || 0.0;

                // helper to create a prefix if no short_code present
                function derivePrefix(name) {
                    if (!name) return "SFM";
                    // take up to 3 initials (words) from the name
                    const words = name.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/);
                    let initials = words.slice(0, 3).map(w => w.charAt(0).toUpperCase()).join("");
                    // If initials is only 1 or 2 chars, pad with letters from first word
                    if (initials.length < 3 && words[0]) {
                        let add = words[0].substring(1, 3 - initials.length).toUpperCase();
                        initials = (initials + add).substring(0, 3);
                    }
                    return initials || "PLT";
                }

                const prefix = farm_short_code || derivePrefix(farm_name);

                // 2) fetch existing Farm Plots for this farm (we need count and sum of designated_plot_size)
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Farm Plots",
                        fields: ["name", "designated_plot_size"],
                        filters: { plot_belongs_to_which_farm: farm_name },
                        limit_page_length: 0
                    },
                    callback: function(list_res) {
                        const plots = list_res.message || [];
                        const existing_count = plots.length;
                        // sum the designated_plot_size values (robust to nulls/strings)
                        const sum_designated = plots.reduce((acc, p) => {
                            const v = parseFloat(p.designated_plot_size);
                            return acc + (isNaN(v) ? 0 : v);
                        }, 0.0);

                        // build incremental number (count + 1) and format as 3 digits
                        const newIndex = existing_count + 1;
                        const padded = String(newIndex).padStart(3, "0"); // 004 if 3 existing
                        const plotNumberValue = `${prefix} - ${padded}`;

                        // set the plot_number on the form
                        frm.set_value("plot_number", plotNumberValue);

                        // compute available farmland for allocation:
                        // available = farm.land_acres - sum_designated
                        // ensure numeric
                        const available = parseFloat((farm_land_acres - sum_designated).toFixed(2));
                        frm.set_value("available_farmland_for_allocation", available >= 0 ? available : 0);

                        // refresh relevant fields
                        frm.refresh_field("plot_number");
                        frm.refresh_field("available_farmland_for_allocation");
                    }
                });
            }
        });
    },

    // When user edits designated_plot_size, ensure it doesn't exceed available_farmland_for_allocation
    designated_plot_size: function(frm) {
        // Only check when doc is new (you can remove that stipulation if you want it always checked)
        const available = parseFloat(frm.doc.available_farmland_for_allocation) || 0;
        let size = parseFloat(frm.doc.designated_plot_size);

        if (isNaN(size)) {
            // not a number - do nothing for now
            return;
        }

        // If available is 0 and size > 0, warn and set to 0
        if (available <= 0 && size > 0) {
            frm.set_value("designated_plot_size", 0);
            frappe.msgprint({
                title: __("Plot size too large"),
                message: __("No available farmland remains for allocation in this farm."),
                indicator: "orange"
            });
            return;
        }

        // If user entered a size that exceeds available, cap it and warn
        if (size > available) {
            const capped = parseFloat(available.toFixed(2));
            frm.set_value("designated_plot_size", capped);
            frappe.msgprint({
                title: __("Plot size capped"),
                message: __("Designated Plot Size exceeded available Farmland Value - Capped to {0} acres.", [capped]),
                indicator: "orange"
            });
            frm.refresh_field("designated_plot_size");
        }
    },

    // Server-side validation guard (client side) before saving
    validate: function(frm) {
        const available = parseFloat(frm.doc.available_farmland_for_allocation) || 0;
        const size = parseFloat(frm.doc.designated_plot_size) || 0;
        if (size > available) {
            // prevent save - should rarely hit because we cap on change, but keep this guard
            frappe.throw(__("Designated Plot Size  ({0}) cannot exceed  Farmland Value ({1}).", [size, available]));
        }
    }
});

function render_status_indicator(frm) {
    const colorMap = {
        "Active": "#16a34a", // green
        "Merged": "#f59e0b", // yellow/amber
        "Purged": "#ef4444"  // red
    };

    const status = (frm.doc.current_status || "").toString().trim();

    // Use class name WITHOUT a leading dot
    const headerClass = 'current-status-header-indicator';

    // Remove any existing header indicator (correct selector composition)
    $('.' + headerClass).remove();

    if (!status) return;

    const bg = colorMap[status] || "#6b7280";
    const textColor = (status === "Merged") ? "#000000" : "#ffffff";

    // Create pill element and add the class (no dot here)
    const $pill = $('<div>').addClass(headerClass).text(status).css({
        "display": "inline-block",
        "margin-left": "8px",
        "padding": "4px 10px",
        "border-radius": "14px",
        "color": textColor,
        "font-size": "0.85rem",
        "line-height": "1",
        "vertical-align": "middle",
        "background-color": bg,
        "font-weight": "600"
    });

    // Try several header target candidates (most specific first)
    const tries = [
        () => frm.page && frm.page.wrapper && $(frm.page.wrapper).find('.page-head').first(),
        () => frm.page && frm.page.wrapper && $(frm.page.wrapper).find('.page-head .title-area, .page-head .level-1').first(),
        () => $(document).find('.page-head, .app-page .page-head, .desk-page .page-head').first(),
        () => $(frm.wrapper || document).first()
    ];

    let $target = null;
    for (let fn of tries) {
        try {
            const $t = fn();
            if ($t && $t.length) {
                $target = $t;
                break;
            }
        } catch (e) { /* ignore */ }
    }

    if ($target && $target.length) {
        // prefer placing after the small "Not Saved" / indicator badge if present
        const $notSaved = $target.find('.unsaved, .indicator-pill, .doc-status, .label, .document-status').first();
        if ($notSaved && $notSaved.length) {
            $pill.insertAfter($notSaved);
        } else {
            // append to title area or wrapper as fallback
            const $title = $target.find('.title-text, .title, .doctype-title, .page-title').first();
            if ($title && $title.length) {
                $pill.insertAfter($title);
            } else {
                $target.append($pill);
            }
        }
    } else {
        // absolute fallback
        $('body').append($pill);
    }
}

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
