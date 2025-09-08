// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctor Appointment Tool", {
    refresh(frm) {
        frm.fields_dict.html_riid.$wrapper.empty();
        
        // Add items to the Actions menu (use supported API)
        frm.disable_save();
        if (frm.doc.table_mfeb && frm.doc.table_mfeb.length > 0) {
            frm.page.add_action_item(__('Update Appointments'), function() {
                updateAppointments(frm);
            });
        }
        
        frm.page.add_action_item(__('Add Appointment'), function() {
            openAddAppointmentDialog(frm);
        });

        // Live filter on date fields
        if (!frm.__date_filter_bound) {
            frm.__date_filter_bound = true;
            frm.script_manager.events.filter_appointments_from_date = function(frm) {
                refilterTreatmentLogs(frm);
            };
            frm.script_manager.events.to_date = function(frm) {
                refilterTreatmentLogs(frm);
            };
        }
    },

    specify_doctor(frm) {
        if (frm.doc.specify_doctor) {
            // Fetch Treatment and Vaccination Logs filtered by doctor
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Treatment and Vaccination Logs',
                    filters: { doctor: frm.doc.specify_doctor },
                    fields: ['specify_type_of_treatment', 'treatment_date', 'animal_under_medication','status', 'name'],
                    order_by: 'treatment_date desc'
                },
                callback: function(r) {
                    if (r.message) {
                        // Cache and render with current date filters
                        frm.__treatment_logs_cache = r.message;
                        const filtered = filterLogsByDate(frm, frm.__treatment_logs_cache);
                        renderTreatmentLogs(frm, filtered);
                    } else {
                        frm.fields_dict.html_riid.$wrapper.empty();
                        frm.__treatment_logs_cache = [];
                    }
                }
            });
        } else {
            frm.fields_dict.html_riid.$wrapper.empty();
            frm.__treatment_logs_cache = [];
        }
    }
});

function renderTreatmentLogs(frm, data) {
    // Build HTML table
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover">
                <thead class="thead-light">
                    <tr>
                        <th>${__('Date')}</th>
                        <th>${__('Treatment Type')}</th>
                        <th>${__('Animal under Treatment')}</th>
                        <th>${__('Status')}</th>
                        <th>${__('Actions')}</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (data.length === 0) {
        html += `
            <tr>
                <td colspan="5" class="text-center text-muted">
                    ${__('No treatment logs found for this doctor')}
                </td>
            </tr>
        `;
    } else {
        data.forEach(row => {
            html += `
                <tr>
                    <td>${frappe.datetime.str_to_user(row.treatment_date) || ''}</td>
                    <td>${row.specify_type_of_treatment || ''}</td>
                    <td>${row.animal_under_medication || ''}</td>
                    <td><span class="badge badge-secondary">${row.status || ''}</span></td>
                    <td>
                        <button class="btn btn-sm btn-light btn-view" data-name="${row.name}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-fill" viewBox="0 0 16 16">
                                <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                                <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div>`;
    
    // Update HTML field
    frm.fields_dict.html_riid.$wrapper.html(html);
    
    // Attach click handlers to view buttons
    frm.fields_dict.html_riid.$wrapper.find('.btn-view').click(function() {
        const docname = $(this).data('name');
        openTreatmentDialog(frm, docname);
    });
}

function openTreatmentDialog(frm, docname) {
    const dialog = new frappe.ui.Dialog({
        title: __('Treatment Details - Vaccines Used'),
        fields: [
            { fieldname: 'treatment_date', fieldtype: 'Date', label: __('Treatment Date'), read_only: 1 },
            { fieldname: 'specify_type_of_treatment', fieldtype: 'Data', label: __('Treatment Type'), read_only: 1 },
            {fieldname: 'animal_under_medication', fieldtype: 'Link', options: 'Animals' ,label: __('Animal under Treatment'), read_only: 1 },
            { fieldname: 'poultry_batch_under_treatment', fieldtype: 'Link', label: __('Poultry Batch'), options: 'Poultry Batches', read_only: 1, depends_on: 'eval:doc.cattle_shed_under_treatment == null || doc.cattle_shed_under_treatment == ""' },
            { fieldname: 'cattle_shed_under_treatment', fieldtype: 'Link', label: __('Cattle Shed'), options: 'Cattle Shed', read_only: 1, depends_on: 'eval:doc.poultry_batch_under_treatment == null || doc.poultry_batch_under_treatment == ""' },
            { fieldname: 'specific_cattle_under_treatment', fieldtype: 'Link', label: __('Cattle under Treatment (if applicable)'), options: 'Cattle', read_only: 1, depends_on: 'eval:doc.cattle_shed_under_treatment' },
            // Hidden summary area (will be shown when a recorded vaccine exists)
            { fieldname: 'vaccine_summary_html', fieldtype: 'HTML', label: __('Vaccine Summary'), hidden: 1 },

            // The editable table shown only when no recorded vaccine exists
            {
                fieldname: 'vaccines_table',
                fieldtype: 'Table',
                label: __('Vaccines'),
                fields: [
                    { fieldtype: 'Link', fieldname: 'animal_vaccine', label: __('Animal Vaccine'), options: 'Animal Vaccines', reqd: 1, in_list_view: 1 },
                    { fieldtype: 'Data', fieldname: 'uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                    { fieldtype: 'Float', fieldname: 'quantity_issued', label: __('Quantity Issued'), reqd: 1, in_list_view: 1 }
                ]
            },
            { fieldname: 'notes', fieldtype: 'Text', label: __('Notes'), read_only: 1, hidden: 1 }
        ],
        primary_action_label: __('Save Vaccines'),
        primary_action(values) {
            // defensive: only save the first row (we enforce single-row in UI too)
            const toSave = (values.vaccines_table && values.vaccines_table.length) ? [values.vaccines_table[0]] : [];
            saveVaccinesData(frm, docname, toSave);
            dialog.hide();
        }
    });

    // helper escape
    const esc = s => (s == null ? '' : String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'));

    // helper to set table description reliably
    function set_table_description() {
        try {
            dialog.set_df_property('vaccines_table', 'description', __('ONLY 1 vaccine administered can be selected.'));
            // refresh field so description renders
            const f = dialog.fields_dict.vaccines_table;
            if (f && f.refresh) f.refresh();
        } catch (e) {
            // fallback: inject description DOM before table wrapper
            const f = dialog.fields_dict.vaccines_table;
            if (f && f.wrapper && f.wrapper.find('[data-only-one-desc]').length === 0) {
                $(f.wrapper).before(`<div data-only-one-desc class="text-muted small mb-2">${esc(__('ONLY 1 vaccine administered can be selected.'))}</div>`);
            }
        }
    }

    // Show dialog then populate
    dialog.show();

    // load treatment doc
    frappe.call({
        method: 'frappe.client.get',
        args: { doctype: 'Treatment and Vaccination Logs', name: docname },
        callback: function(r) {
            if (!r.message) return;
            const doc = r.message;

            dialog.set_values({
                treatment_date: doc.treatment_date,
                specify_type_of_treatment: doc.specify_type_of_treatment,
                poultry_batch_under_treatment: doc.poultry_batch_under_treatment,
                cattle_shed_under_treatment: doc.cattle_shed_under_treatment,
                specific_cattle_under_treatment: doc.specific_cattle_under_treatment,
                animal_under_medication: doc.animal_under_medication,
                status: doc.status,
                notes: doc.notes
            });

            // resolve quantity (support multiple possible field names)
            const qty = doc.qty_vaccine || doc.quantity_of_vaccine_used || doc.quantity || doc.qty || doc.quantity_issued;

            // If recorded vaccine & qty exist -> show summary (resolve name from Animal Vaccines)
            if (doc.vaccine_used && qty) {
                // hide the editable table
                dialog.set_df_property('vaccines_table', 'hidden', 1);
                // fetch vaccine_name from Animal Vaccines using the stored key (doc.vaccine_used)
                // we attempt to treat doc.vaccine_used as the docname (common pattern)
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: {
                        doctype: 'Animal Vaccines',
                        filters: { name: doc.vaccine_used },
                        fieldname: 'vaccine_name'
                    },
                    callback: function(res) {
                        let vaccineName = (res && res.message && (res.message.vaccine_name || res.message.name)) || doc.vaccine_used;
                        // if no vaccine_name, as a fallback try matching by some code field (attempt second call)
                        if ((!vaccineName || vaccineName === '') && doc.vaccine_used) {
                            // fallback: try fetching record where some code field equals value (best-effort)
                            // (optional — comment out if not needed)
                            // not implemented: keep using raw value
                            vaccineName = doc.vaccine_used;
                        }

                        // render summary HTML: SVG + bold vaccineName qty + muted text to the right
                        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="36" height="36" style="flex:0 0 36px; margin-right:12px; color:currentColor;"><path d="M128 96C128 78.3 142.3 64 160 64L480 64C497.7 64 512 78.3 512 96L512 128C512 145.7 497.7 160 480 160L160 160C142.3 160 128 145.7 128 128L128 96zM160 208L480 208L480 512C480 547.3 451.3 576 416 576L224 576C188.7 576 160 547.3 160 512L160 208zM288 312L288 352L248 352C239.2 352 232 359.2 232 368L232 400C232 408.8 239.2 416 248 416L288 416L288 456C288 464.8 295.2 472 304 472L336 472C344.8 472 352 464.8 352 456L352 416L392 416C400.8 416 408 408.8 408 400L408 368C408 359.2 400.8 352 392 352L352 352L352 312C352 303.2 344.8 296 336 296L304 296C295.2 296 288 303.2 288 312z"/></svg>`;

                        const html = `
                            <div class="d-flex align-items-center" style="padding:12px;">
                                ${svg}
                                <div style="display:flex; flex-direction:column;">
                                    <div><strong>${esc(vaccineName)} | Qty: ${esc(qty)}</strong></div>
                                    <div class="text-muted small" style="margin-top:4px;">${esc(__('Already recorded on the log'))}</div>
                                </div>
                            </div>
                        `;

                        const sumField = dialog.fields_dict.vaccine_summary_html;
                        if (sumField && sumField.$wrapper) {
                            sumField.$wrapper.html(html);
                            dialog.set_df_property('vaccine_summary_html', 'hidden', 0);
                        } else {
                            // fallback: insert after the dialog body
                            $(dialog.body).prepend(html);
                        }
                        // hide primary action so user can't save
                        try { dialog.get_primary_btn().hide(); } catch (e) {}
                    }
                });

                // done (we don't render the table)
                return;
            }

            // OTHERWISE: show the table and enforce single-row rules
            dialog.set_df_property('vaccines_table', 'hidden', 0);
            set_table_description();

            // load existing child rows (if any)
            const vt = dialog.fields_dict.vaccines_table;
            const vGrid = vt && vt.grid;
            if (vt) {
                vt.df.data = (doc.vaccines_table && doc.vaccines_table.length) ? doc.vaccines_table : [];
                if (vGrid && vGrid.refresh) vGrid.refresh();
            }

            // Enforce single row: add one row automatically if none exist
            if (vGrid) {
                const currentData = vt.df.data || [];
                if (currentData.length === 0) {
                    // try to add a single row programmatically
                    if (typeof vGrid.add_new_row === 'function') {
                        vGrid.add_new_row();
                    } else if (typeof vGrid.add_row === 'function') {
                        vGrid.add_row();
                    } else {
                        // fallback: click add button if present
                        vGrid.wrapper.find('.grid-add-row, .grid-add-rows, .add-row').first().click();
                    }
                }

                // hide add-row UI and prevent additional rows
                vGrid.wrapper.find('.grid-add-row, .grid-add-rows, .add-row, .grid-add').hide();

                // defensive: intercept any attempts to add a row
                vGrid.wrapper.off('.only_one').on('click.only_one', '.grid-add-row, .grid-add-rows, .add-row, .grid-add', function (e) {
                    e.preventDefault();
                    frappe.show_alert({ message: __('Only one vaccine can be selected'), indicator: 'orange' });
                    return false;
                });

                // patch add_new_row to refuse further rows
                if (!vGrid._patched_one_row) {
                    const orig = vGrid.add_new_row && vGrid.add_new_row.bind(vGrid);
                    if (orig) {
                        vGrid.add_new_row = function() {
                            const len = (vt.df.data || []).length;
                            if (len >= 1) {
                                frappe.show_alert({ message: __('Only one vaccine can be selected'), indicator: 'orange' });
                                return;
                            }
                            return orig.apply(this, arguments);
                        };
                        vGrid._patched_one_row = true;
                    }
                }

                // when a row is deleted, re-run the enforcement (unhide UI if zero rows)
                vGrid.wrapper.on('click.only_one_remove', '.grid-remove-rows, .grid-delete-row', function() {
                    setTimeout(() => {
                        const len = (vt.df.data || []).length;
                        if (len === 0) {
                            // allow adding a new row (show add button)
                            vGrid.wrapper.find('.grid-add-row, .grid-add-rows, .add-row, .grid-add').show();
                        }
                    }, 50);
                });
            }

            // attach UOM auto-fill handlers (same as before)
            if (vGrid && vGrid.wrapper) {
                vGrid.wrapper.off('awesomplete-selectcomplete.uom change.uom blur.uom');
                const handler = function() {
                    const value = $(this).val();
                    if (!value) return;
                    const $row = $(this).closest('.grid-row');
                    const rowName = $row.attr('data-name');
                    const gridRow = vGrid.get_row && vGrid.get_row(rowName);
                    const rowDoc = gridRow ? gridRow.doc : null;
                    if (!rowDoc) return;

                    frappe.call({
                        method: 'farm_management_system.savanna_farm_suite.doctype.doctor_appointment_tool.doctor_appointment_tool.get_animal_vaccine_first_uom',
                        args: { vaccine_name: value },
                        callback: function(r) {
                            const extracted = (r && r.message) || '';
                            rowDoc.uom = extracted;
                            if (gridRow && gridRow.refresh_field) {
                                gridRow.refresh_field('uom');
                            } else if (vGrid.refresh_row && rowName) {
                                vGrid.refresh_row(rowName);
                            } else if (vGrid.refresh) {
                                vGrid.refresh();
                            }
                        }
                    });
                };
                vGrid.wrapper.on('awesomplete-selectcomplete.uom', 'input[data-fieldname="animal_vaccine"]', handler);
                vGrid.wrapper.on('change.uom', 'input[data-fieldname="animal_vaccine"]', handler);
                vGrid.wrapper.on('blur.uom', 'input[data-fieldname="animal_vaccine"]', handler);
            }
        }
    });
}


// server-sync-saving (unchanged except defensive mapping)
function saveVaccinesData(frm, treatmentLogName, vaccinesData) {
    // Clear existing rows for this treatment log
    frm.doc.table_mfeb = (frm.doc.table_mfeb || []).filter(row => row.treatment_log_no !== treatmentLogName);

    const first = (vaccinesData && vaccinesData.length) ? vaccinesData[0] : null;
    if (first) {
        const newRow = frm.add_child('table_mfeb');
        newRow.treatment_log_no = treatmentLogName;
        newRow.vaccine_used = first.animal_vaccine || first.vaccine_used || '';
        newRow.quantity_of_vaccine_used = first.quantity_issued || first.qty_vaccine || first.quantity || 0;
        frm.refresh_field('table_mfeb');

        // Expose Update Appointments button (idempotent)
        if (!frm.page.has_menu_button || !frm.page.has_menu_button(__('Update Appointments'))) {
            frm.add_custom_button(__('Update Appointments'), function() { updateAppointments(frm); });
        }
    } else {
        frm.refresh_field('table_mfeb');
    }

    frappe.show_alert({ message: __('Vaccines data added successfully'), indicator: 'green' });
}


function updateAppointments(frm) {
    // Freeze the screen
    frappe.dom.freeze(__('Updating appointments...'));
    
    // Check if there are any records to update
    if (!frm.doc.table_mfeb || frm.doc.table_mfeb.length === 0) {
        frappe.dom.unfreeze();
        frappe.msgprint(__('No vaccine data to update'));
        return;
    }
    
    // Track completed updates
    let completed = 0;
    const total = frm.doc.table_mfeb.length;
    let errors = [];
    
    // Process each row in table_mfeb
    frm.doc.table_mfeb.forEach(row => {
        if (row.treatment_log_no && row.vaccine_used) {
            // Prepare data to update
            const updateData = {
                vaccine_used: row.vaccine_used,
                qty_vaccine: row.quantity_of_vaccine_used || 0
            };
            
            // Update the Treatment and Vaccination Logs
            frappe.call({
                method: 'frappe.client.set_value',
                args: {
                    doctype: 'Treatment and Vaccination Logs',
                    name: row.treatment_log_no,
                    fieldname: updateData
                },
                callback: function(r) {
                    completed++;
                    
                    if (r.exc) {
                        errors.push({
                            log: row.treatment_log_no,
                            error: r.exc
                        });
                    }
                    
                    // Check if all updates are completed
                    if (completed >= total) {
                        frappe.dom.unfreeze();
                        
                        if (errors.length > 0) {
                            // Show error message
                            frappe.msgprint({
                                title: __('Update Completed with Errors'),
                                indicator: 'red',
                                message: __('Some appointments could not be updated.') + 
                                         '<br><br>' +
                                         errors.map(e => `Log: ${e.log} - Error: ${e.error}`).join('<br>')
                            });
                        } else {
                            // Show success message
                            frappe.show_alert({
                                message: __('All appointments updated successfully'),
                                indicator: 'green'
                            });
                            frappe.utils.play_sound('success');
                            // Clear filters and data, then reload
                            frm.set_value('specify_doctor', null);
                            frm.set_value('filter_appointments_from_date', null);
                            frm.set_value('to_date', null);
                            frm.fields_dict.html_riid.$wrapper.empty();
                            frm.clear_table('table_mfeb');
                            frm.refresh_fields(['specify_doctor','filter_appointments_from_date','to_date','table_mfeb']);
                            frm.reload_doc();
                        }
                    }
                }
            });
        } else {
            completed++;
            // Check if all updates are completed
            if (completed >= total) {
                frappe.dom.unfreeze();
                
                if (errors.length > 0) {
                    // Show error message
                    frappe.msgprint({
                        title: __('Update Completed with Errors'),
                        indicator: 'red',
                        message: __('Some appointments could not be updated.') + 
                                 '<br><br>' +
                                 errors.map(e => `Log: ${e.log} - Error: ${e.error}`).join('<br>')
                    });
                } else {
                    // Show success message
                    frappe.show_alert({
                        message: __('All appointments updated successfully'),
                        indicator: 'green'
                    });
                    frappe.utils.play_sound('success');
                    // Clear filters and data, then reload
                    frm.set_value('specify_doctor', null);
                    frm.set_value('filter_appointments_from_date', null);
                    frm.set_value('to_date', null);
                    frm.fields_dict.html_riid.$wrapper.empty();
                    frm.clear_table('table_mfeb');
                    frm.refresh_fields(['specify_doctor','filter_appointments_from_date','to_date','table_mfeb']);
                    frm.reload_doc();
                }
            }
        }
    });
}

// Utilities: client-side date filtering for cached treatment logs
function filterLogsByDate(frm, logs) {
    if (!Array.isArray(logs)) return [];
    const fromStr = frm.doc.filter_appointments_from_date;
    const toStr = frm.doc.to_date;
    const fromDate = fromStr ? frappe.datetime.str_to_obj(fromStr) : null;
    const toDate = toStr ? frappe.datetime.str_to_obj(toStr) : null;
    return logs.filter(row => {
        const rowDate = row.treatment_date ? frappe.datetime.str_to_obj(row.treatment_date) : null;
        if (!rowDate) return false;
        if (fromDate && rowDate < fromDate) return false;
        if (toDate && rowDate > toDate) return false;
        return true;
    });
}

function refilterTreatmentLogs(frm) {
    const cache = frm.__treatment_logs_cache || [];
    const filtered = filterLogsByDate(frm, cache);
    renderTreatmentLogs(frm, filtered);
}

function openAddAppointmentDialog(frm) {
    // Create dialog for adding new appointment
    const dialog = new frappe.ui.Dialog({
        title: __('Add New Appointment'),
        fields: [
            {
                fieldname: 'doctor',
                fieldtype: 'Link',
                label: __('Doctor'),
                options: 'Doctors',
                reqd: 1,
                onchange: function() {
                    checkDateAvailability(dialog);
                }
            },
            {
                fieldname: 'treatment_type',
                fieldtype: 'Select',
                label: __('Treatment Type'),
                options: ['Booster supplement', 'Vaccination', 'Standard Medication'].join('\n'),
                reqd: 1
            },
            {
                fieldname: 'appointment_date',
                fieldtype: 'Date',
                label: __('Appointment Date'),
                reqd: 1,
                onchange: function() {
                    checkDateAvailability(dialog);
                }
            },
            {
                fieldname: 'animal',
                fieldtype: 'Link',
                label: __('Specify Animal'),
                options: 'Animals',
                reqd: 1
            },
            {
                fieldname: 'poultry_batch',
                fieldtype: 'Link',
                label: __('Poultry Batch'),
                depends_on: "eval:doc.animal == 'Chicken'",
                mandatory_depends_on: "eval:doc.animal == 'Chicken'",
                options: 'Poultry Batches'
            },
            {
                fieldname: 'cattle_shed',
                fieldtype: 'Link',
                depends_on: "eval:doc.animal == 'Cattle'",
                mandatory_depends_on: "eval:doc.animal == 'Cattle'",
                label: __('Specify Cattle Shed'),
                options: 'Cattle Shed'
            },
            {
                fieldname: 'cattle',
                fieldtype: 'Link',
                depends_on: "eval:doc.cattle_shed",
                label: __('Specify Cow under Treatment (OPTIONAL)'),
                options: 'Cattle',
            },
            {
                fieldname: 'date_status',
                fieldtype: 'HTML',
                label: __('Date Status')
            }
        ],
        primary_action_label: __('Slot Appointment'),
        primary_action(values) {
            confirmAppointmentCreation(frm, values, dialog);
        },
        secondary_action_label: __('Cancel'),
        secondary_action() {
            dialog.hide();
        }
    });
    
    dialog.show();
}

function checkDateAvailability(dialog) {
    const doctor = dialog.get_value('doctor');
    const appointment_date = dialog.get_value('appointment_date');
    
    if (doctor && appointment_date) {
        // Check if doctor already has an appointment on this date
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Treatment and Vaccination Logs',
                filters: {
                    doctor: doctor,
                    treatment_date: appointment_date
                },
                fields: ['name', 'doctor']
            },
            callback: function(r) {
                let statusHTML = '';
                if (r.message && r.message.length > 0) {
                    statusHTML = `
                        <div class="alert alert-warning">
                            ${__('Selected Date has already been slotted for doctor.')}
                            <br>${__('Ref:')} ${r.message[0].name}
                        </div>
                    `;
                } else {
                    statusHTML = `
                        <div class="alert alert-success">
                            ${__('Selected Date has NOT been slotted')}
                        </div>
                    `;
                }
                
                dialog.fields_dict.date_status.$wrapper.html(statusHTML);
            }
        });
    }
}

function confirmAppointmentCreation(frm, values, dialog) {
    // Show confirmation dialog
    frappe.confirm(
        __('This action is irreversible. Are you sure you want to create this appointment?'),
        function() {
            // Proceed with appointment creation
            createAppointment(frm, values, dialog);
        },
        function() {
            // Cancel action
            frappe.show_alert({
                message: __('Appointment creation cancelled'),
                indicator: 'orange'
            });
        }
    );
}

function createAppointment(frm, values, dialog) {
    // Freeze UI during creation
    frappe.dom.freeze(__('Creating appointment...'));
    
    // Call server-side method to create appointment
    frappe.call({
        method: 'farm_management_system.savanna_farm_suite.doctype.doctor_appointment_tool.doctor_appointment_tool.create_appointments',
        args: {
            doctor: values.doctor,
            treatment_type: values.treatment_type,
            appointment_date: values.appointment_date,
            poultry_batch: values.poultry_batch,
            cattle_shed: values.cattle_shed,
            cattle: values.cattle,
            animal: values.animal
        },
        callback: function(r) {
            frappe.dom.unfreeze();
            
            if (r.exc) {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('Failed to create appointment: ') + r.exc
                });
            } else {
                frappe.show_alert({
                    message: __('Appointment created successfully'),
                    indicator: 'green'
                });
                frappe.utils.play_sound('success');
                
                // Refresh the form to show the new appointment
                frm.reload_doc();
                
                // Close the dialog
                dialog.hide();
            }
        }
    });
}