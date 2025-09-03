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
                    fields: ['specify_type_of_treatment', 'treatment_date', 'poultry_batch_under_treatment', 'status', 'name'],
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
                        <th>${__('Poultry Batch')}</th>
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
                    <td>${row.poultry_batch_under_treatment || ''}</td>
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
    // Create dialog with form for vaccine details
    const dialog = new frappe.ui.Dialog({
        title: __('Treatment Details - Vaccines Used'),
        fields: [
            {
                fieldname: 'treatment_details_section',
                fieldtype: 'Section Break',
                label: __('Treatment Information')
            },
            {
                fieldname: 'treatment_date',
                fieldtype: 'Date',
                label: __('Treatment Date'),
                read_only: 1
            },
            {
                fieldname: 'specify_type_of_treatment',
                fieldtype: 'Data',
                label: __('Treatment Type'),
                read_only: 1
            },
            {
                fieldname: 'col_break1',
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'poultry_batch_under_treatment',
                fieldtype: 'Link',
                label: __('Poultry Batch'),
                options: "Poultry Batches",
                read_only: 1
            },
            {
                fieldname: 'status',
                fieldtype: 'Data',
                label: __('Status'),
                read_only: 1
            },
            {
                fieldname: 'section_break',
                fieldtype: 'Section Break',
                label: __('Vaccines Used')
            },
            {
                fieldname: 'vaccines_table',
                fieldtype: 'Table',
                label: __('Vaccines'),
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'animal_vaccine',
                        label: __('Animal Vaccine'),
                        options: 'Animal Vaccines',
                        reqd: 1,
                        in_list_view: 1
                    },
                    {
                        fieldtype: 'Data',
                        fieldname: 'uom',
                        label: __('Default UOM'),
                        read_only: 1,
                        in_list_view: 1
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'quantity_issued',
                        label: __('Quantity Issued'),
                        reqd: 1,
                        in_list_view: 1
                    }
                ]
            },
            {
                fieldname: 'notes',
                fieldtype: 'Text',
                label: __('Notes'),
                read_only: 1,
                hidden: 1
            }
        ],
        primary_action_label: __('Save Vaccines'),
        primary_action(values) {
            saveVaccinesData(frm, docname, values.vaccines_table);
            dialog.hide();
        }
    });

    // Fetch and show document details
    frappe.call({
        method: 'frappe.client.get',
        args: {
            doctype: 'Treatment and Vaccination Logs',
            name: docname
        },
        callback: function(r) {
            if (r.message) {
                const doc = r.message;
                dialog.set_values({
                    treatment_date: doc.treatment_date,
                    specify_type_of_treatment: doc.specify_type_of_treatment,
                    poultry_batch_under_treatment: doc.poultry_batch_under_treatment,
                    status: doc.status,
                    notes: doc.notes
                });
                
                // Load existing vaccines if any
                if (doc.vaccines_table && doc.vaccines_table.length > 0) {
                    dialog.fields_dict.vaccines_table.df.data = doc.vaccines_table;
                    dialog.fields_dict.vaccines_table.grid.refresh();
                }
            }
        }
    });

    dialog.show();

    // Populate Default UOM when an Animal Vaccine is selected (delegate to grid wrapper)
    const vGrid = dialog.fields_dict.vaccines_table && dialog.fields_dict.vaccines_table.grid;
    if (vGrid && vGrid.wrapper) {
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
        // Link control emits awesomplete-selectcomplete on selection; also listen to change and blur
        vGrid.wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_vaccine"]', handler);
        vGrid.wrapper.on('change', 'input[data-fieldname="animal_vaccine"]', handler);
        vGrid.wrapper.on('blur', 'input[data-fieldname="animal_vaccine"]', handler);
    }
}

function saveVaccinesData(frm, treatmentLogName, vaccinesData) {
    // Clear existing rows for this treatment log
    frm.doc.table_mfeb = frm.doc.table_mfeb.filter(row => row.treatment_log_no !== treatmentLogName);
    
    // Add new rows for each vaccine
    if (vaccinesData && vaccinesData.length > 0) {
        vaccinesData.forEach(vaccine => {
            const newRow = frm.add_child('table_mfeb');
            newRow.treatment_log_no = treatmentLogName;
            newRow.vaccine_used = vaccine.animal_vaccine;
            newRow.quantity_of_vaccine_used = vaccine.quantity_issued;
        });
        
        frm.refresh_field('table_mfeb');
        // Ensure user can proceed: expose Update Appointments button
        frm.add_custom_button(__('Update Appointments'), function() {
            updateAppointments(frm);
        });
    }
    
    frappe.show_alert({
        message: __('Vaccines data added successfully'),
        indicator: 'green'
    });
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
                vaccine_used: row.vaccine_issued,
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
                fieldname: 'poultry_batch',
                fieldtype: 'Link',
                label: __('Poultry Batch'),
                options: 'Poultry Batches',
                reqd: 1
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
            poultry_batch: values.poultry_batch
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