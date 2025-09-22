// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

// Global variable to store cached activities
let cachedActivities = {};
let calendarDialogRef = null;

frappe.ui.form.on("Crop Intake", {
    refresh(frm) {
        frm.__was_new = Boolean(frm.doc.__islocal);
        // Set date_of_planting to today if not set (both for new and existing forms)
        if (!frm.doc.date_of_planting) {
            frm.set_value('date_of_planting', frappe.datetime.get_today());
        }
    },
    
    crop_being_planted(frm) {
        if (frm.doc.crop_being_planted) {
            // Get current stock levels for the selected crop
            get_current_stock_levels(frm);
            
            // Calculate expected harvest date
            calculate_expected_harvest_date(frm);
        } else {
            // Clear fields if no crop selected
            frm.set_value('current_seedling_count', '');
            frm.set_value('expected_harvest_date', '');
        }
    },
    
    date_of_planting(frm) {
        // Recalculate harvest date if planting date changes
        if (frm.doc.crop_being_planted) {
            calculate_expected_harvest_date(frm);
        }
    },
    
    quantity_of_seedlings_used(frm) {
        // Validate that quantity doesn't exceed available stock
        validate_quantity_used(frm);
    },
    refresh(frm) {
		// Add a grouped Action button to create a schedule for the batch
		if (!frm.is_new()) {
		    frm.add_custom_button(__('Create Schedule for Batch'), function() {
		    // Ensure the document is saved before creating a schedule
		    if (frm.is_new()) {
		        frappe.msgprint(__('Please save the document before creating a schedule.'));
		        return;
		    }

		    // Reuse the after_save confirmation logic
		        frappe.confirm(
		            __('Do you wish to set a Farming Schedule for this Batch of Crops?<br><br>'
		            + '<small style="color: #6c7680;">Creating a schedule is recommended to ensure timely reminders '
		            + 'for important farming activities like watering, fertilizing, and harvesting. '
		            + 'This helps maximize crop yield and maintain optimal growing conditions.</small>'),
		            function() {
		                // Reset cached activities when opening new schedule dialog
		                cachedActivities = {};
		                // Proceed with schedule creation
		                createFarmingScheduleDialog(frm);
		            },
		            function() {
		                // Cancel action
		                frappe.show_alert({
		                    message: __('Schedule creation cancelled'),
		                    indicator: 'orange'
		                });
		            }
		        );
		    }, __('Action')).addClass('btn-primary');
		}

	}
});

// Global variable to store the available quantity
let availableQuantity = 0;

// Function to get current stock levels for the selected crop
function get_current_stock_levels(frm) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Stock Ledger Entry",
            filters: {
                item_code: frm.doc.crop_being_planted
            },
            fields: ["qty_after_transaction", "stock_uom"],
            order_by: "creation asc",
            limit: 1
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                const stock_level = r.message[0].qty_after_transaction || 0;
                const uom = r.message[0].stock_uom || '';
                
                // Store the available quantity for validation
                availableQuantity = parseFloat(stock_level) || 0;
                
                frm.set_value('current_seedling_count', `${stock_level} ${uom}`);
            } else {
                availableQuantity = 0;
                frm.set_value('current_seedling_count', '0');
            }
        }
    });
}

// Function to validate quantity used doesn't exceed available stock
function validate_quantity_used(frm) {
    const quantityUsed = parseFloat(frm.doc.quantity_of_seedlings_used) || 0;
    
    if (quantityUsed > availableQuantity) {
        // Show error message
        frappe.show_alert({
            message: __('Quantity used ({0}) cannot exceed available stock ({1}). Please reduce the quantity.', [quantityUsed, availableQuantity]),
            indicator: 'red'
        });
        
        // Clear the field value
        frm.set_value('quantity_of_seedlings_used', '');
        
        // Focus back on the field
        frm.fields_dict.quantity_of_seedlings_used.$input.focus();
    }
}

// Function to calculate expected harvest date
function calculate_expected_harvest_date(frm) {
    if (!frm.doc.crop_being_planted || !frm.doc.date_of_planting) {
        return;
    }
    
    // First get the crop linked to the seedling
    frappe.call({
        method: "frappe.client.get_value",
        args: {
            doctype: "Crop Seedlings",
            filters: {
                name: frm.doc.crop_being_planted
            },
            fieldname: ["seedling_tied_to_which_crop"]
        },
        callback: function(r) {
            if (r.message && r.message.seedling_tied_to_which_crop) {
                const crop = r.message.seedling_tied_to_which_crop;
                
                // Now get the maturity days for the crop
                frappe.call({
                    method: "frappe.client.get_value",
                    args: {
                        doctype: "Crop",
                        filters: {
                            name: crop
                        },
                        fieldname: ["number_of_days_till_maturity"]
                    },
                    callback: function(r2) {
                        if (r2.message && r2.message.number_of_days_till_maturity) {
                            const maturityDays = r2.message.number_of_days_till_maturity;
                            const plantingDate = frm.doc.date_of_planting;
                            
                            // Calculate harvest date
                            const harvestDate = frappe.datetime.add_days(plantingDate, maturityDays);
                            frm.set_value('expected_harvest_date', harvestDate);
                        } else {
                            frm.set_value('expected_harvest_date', '');
                            frappe.msgprint(__("Could not find maturity days for the selected crop"));
                        }
                    }
                });
            } else {
                frm.set_value('expected_harvest_date', '');
                frappe.msgprint(__("Could not find crop linked to the selected seedling"));
            }
        }
    });
}


// Initialize global variables
window.cachedActivities = {};
window.calendarDialogRef = null;

// Add CSS styles
function addCalendarStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .calendar {
            display: inline-block;
            width: 100%;
            border: 1px solid #d1d8dd;
            border-radius: 4px;
            margin-top: 10px;
        }

        .calendar-weekdays {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            background-color: #f5f7fa;
            font-weight: bold;
            text-align: center;
        }

        .calendar-weekdays div {
            padding: 8px;
            border-right: 1px solid #d1d8dd;
        }

        .calendar-weekdays div:last-child {
            border-right: none;
        }

        .calendar-days {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
        }

        .calendar-day {
            padding: 8px;
            min-height: 40px;
            border-right: 1px solid #d1d8dd;
            border-bottom: 1px solid #d1d8dd;
            cursor: pointer;
            text-align: center;
            position: relative;
        }

        .calendar-day:nth-child(7n) {
            border-right: none;
        }

        .calendar-day.empty {
            background-color: #fafbfc;
            cursor: default;
        }

        .calendar-day:hover:not(.empty):not(.cached) {
            background-color: #e3f2fd;
        }

        .calendar-day.cached {
            background-color: #c8e6c9;
            box-shadow: inset 0 0 0 2px #4caf50;
        }

        .calendar-day.existing {
            background-color: #bbdefb;
            box-shadow: inset 0 0 0 2px #2196f3;
        }

        .calendar-header {
            text-align: center;
            margin-bottom: 10px;
            font-size: 16px;
            font-weight: bold;
            color: #36414C;
        }

        .calendar-navigation {
            margin-top: 15px;
            text-align: center;
        }

        .calendar-navigation button {
            margin: 0 5px;
        }

        .scheduled-activity {
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 6px;
            height: 6px;
            background-color: #5e64ff;
            border-radius: 50%;
            content: '';
        }

        .create-schedule-btn-container {
            margin-top: 20px;
            text-align: center;
        }

        .cached-activities-counter {
            margin-top: 10px;
            text-align: center;
            font-size: 14px;
            color: #6c7680;
        }
    `;
    document.head.appendChild(style);
}

// Function to create the farming schedule dialog with calendar
function createFarmingScheduleDialog(frm) {
    // Add CSS styles if not already added
    if (!document.querySelector('style[data-calendar-styles]')) {
        addCalendarStyles();
        document.querySelector('style').setAttribute('data-calendar-styles', 'true');
    }
    
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    
    // Create dialog
    let dialog = new frappe.ui.Dialog({
        title: __('Create Farming Schedule - ' + frm.doc.name),
        size: 'extra-large',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'calendar_container'
            }
        ],
        // Override close behavior
        onhide: function() {
            if (Object.keys(window.cachedActivities).length > 0) {
                frappe.confirm(
                    __('You have unsaved scheduled activities. Are you sure you want to close the calendar? All unsaved changes will be lost.'),
                    function() {
                        // Clear cached activities and close
                        window.cachedActivities = {};
                        window.calendarDialogRef = null;
                        return true;
                    },
                    function() {
                        // Prevent closing
                        dialog.show();
                        return false;
                    }
                );
                return false;
            }
            window.calendarDialogRef = null;
            return true;
        }
    });
    
    window.calendarDialogRef = dialog;
    
    // Generate and display calendar
    generateCalendar(dialog, currentMonth, currentYear, frm);
    
    // Add navigation buttons
    addCalendarNavigation(dialog, currentMonth, currentYear, frm);
    
    // Add Create Schedule button
    addCreateScheduleButton(dialog, frm);
    
    dialog.show();
}

// Function to generate calendar for a specific month and year
function generateCalendar(dialog, month, year, frm) {
    // Get first day of month and number of days
    let firstDay = new Date(year, month, 1);
    let lastDay = new Date(year, month + 1, 0);
    let daysInMonth = lastDay.getDate();
    let startingDay = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Month names for display
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    
    // Create calendar HTML
    let calendarHTML = `
        <div class="calendar-header">
            <h3>${monthNames[month]} ${year}</h3>
        </div>
        <div class="calendar">
            <div class="calendar-weekdays">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
            </div>
            <div class="calendar-days">
    `;
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDay; i++) {
        calendarHTML += `<div class="calendar-day empty"></div>`;
    }
    
    // Add cells for each day of the month
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isCached = window.cachedActivities.hasOwnProperty(dateStr);
        calendarHTML += `
            <div class="calendar-day${isCached ? ' cached' : ''}" data-date="${dateStr}">
                ${i}
                <div class="scheduled-activity" style="display: none;"></div>
            </div>
        `;
    }
    
    calendarHTML += `</div></div>`;
    
    // Set calendar HTML
    dialog.fields_dict.calendar_container.$wrapper.html(calendarHTML);
    
    // Add click event to each day
    dialog.$wrapper.find('.calendar-day:not(.empty)').on('click', function() {
        const date = $(this).data('date');
        createActivityDialog(date, frm, dialog);
    });
    
    // Load existing schedules for this crop batch
    loadExistingSchedules(frm, dialog);
    
    // Update cached activities counter
    updateCachedActivitiesCounter(dialog);
}

// Function to load existing schedules and mark them on calendar
function loadExistingSchedules(frm, dialog) {
    // Use get_list instead of get for filtering
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Farm Activity Schedule',
            filters: {
                activity_tied_to_which_crop_batch: frm.doc.name
            },
            fields: ['name']
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                // Get the first schedule if it exists
                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Farm Activity Schedule',
                        name: r.message[0].name
                    },
                    callback: function(res) {
                        if (res.message && res.message.scheduled_activity_table) {
                            res.message.scheduled_activity_table.forEach(activity => {
                                if (activity.date_of_planned_activity) {
                                    markExistingActivity(activity.date_of_planned_activity, dialog, activity.nature_of_activity, activity.assignees);
                                }
                            });
                        }
                    }
                });
            }
        }
    });
}

// Function to mark existing activities on calendar
function markExistingActivity(date, dialog, activityName) {
    const dateElement = dialog.$wrapper.find(`.calendar-day[data-date="${date}"]`);
    if (!dateElement.hasClass('cached')) {
        dateElement.addClass('existing');
        dateElement.attr('title', `Existing: ${activityName || 'Activity'}`);
    }
}

// Function to add navigation to the calendar
function addCalendarNavigation(dialog, month, year, frm) {
    const navHTML = `
        <div class="calendar-navigation" style="margin-top: 15px; text-align: center;">
            <button class="btn btn-default prev-month" style="margin-right: 10px;">
                < Previous Month
            </button>
            <button class="btn btn-default next-month">
                Next Month >
            </button>
        </div>
    `;
    
    dialog.$wrapper.find('.calendar-header').after(navHTML);
    
    // Add event handlers for navigation
    dialog.$wrapper.find('.prev-month').on('click', function() {
        let newMonth = month - 1;
        let newYear = year;
        if (newMonth < 0) {
            newMonth = 11;
            newYear = year - 1;
        }
        generateCalendar(dialog, newMonth, newYear, frm);
        addCalendarNavigation(dialog, newMonth, newYear, frm);
        addCreateScheduleButton(dialog, frm);
    });
    
    dialog.$wrapper.find('.next-month').on('click', function() {
        let newMonth = month + 1;
        let newYear = year;
        if (newMonth > 11) {
            newMonth = 0;
            newYear = year + 1;
        }
        generateCalendar(dialog, newMonth, newYear, frm);
        addCalendarNavigation(dialog, newMonth, newYear, frm);
        addCreateScheduleButton(dialog, frm);
    });
}

// Function to add Create Schedule button below calendar
function addCreateScheduleButton(dialog, frm) {
    const buttonHTML = `
        <div class="create-schedule-btn-container">
            <div class="cached-activities-counter"></div>
            <button class="btn btn-primary create-schedule-btn" ${Object.keys(window.cachedActivities).length === 0 ? 'disabled' : ''}>
                Create Schedule
            </button>
        </div>
    `;
    
    dialog.$wrapper.find('.calendar-navigation').after(buttonHTML);
    
    // Update counter
    updateCachedActivitiesCounter(dialog);
    
    // Add click handler
    dialog.$wrapper.find('.create-schedule-btn').on('click', function() {
        if (Object.keys(window.cachedActivities).length > 0) {
            saveAllCachedActivities(frm, dialog);
        } else {
            frappe.msgprint(__('No activities scheduled. Please select dates and add activities first.'));
        }
    });
}

// Function to update cached activities counter
function updateCachedActivitiesCounter(dialog) {
    const count = Object.keys(window.cachedActivities).length;
    const counterText = count > 0 
        ? __(`${count} activities pending to be scheduled`)
        : __('No activities scheduled yet');
    
    dialog.$wrapper.find('.cached-activities-counter').text(counterText);
    
    // Enable/disable Create Schedule button
    const createBtn = dialog.$wrapper.find('.create-schedule-btn');
    if (count > 0) {
        createBtn.prop('disabled', false);
    } else {
        createBtn.prop('disabled', true);
    }
}

// Function to create activity dialog for a specific date
function createActivityDialog(date, frm, calendarDialog) {
    // Check if activity already exists for this date
    const existingActivity = window.cachedActivities[date];
    
    let activityDialog = new frappe.ui.Dialog({
        title: __((existingActivity ? 'Edit' : 'Schedule') + ' Activity for ' + frappe.datetime.str_to_user(date)),
        fields: [
            {
                fieldtype: 'Link',
                fieldname: 'nature_of_activity',
                label: __('Nature of Activity'),
                options: 'Crop Activity',
                reqd: 1,
                default: existingActivity?.nature_of_activity
            },
            {
                fieldtype: 'Float',
                fieldname: 'estimated_hours_to_complete',
                label: __('Estimated Hours to Complete'),
                reqd: 1,
                default: existingActivity?.estimated_hours_to_complete || 1.0
            },
            {
                fieldtype: 'Link',
                fieldname: 'assignees',
                label: __('Assign to Staff'),
                options: 'Employee'
            },
            {
                fieldtype: 'Small Text',
                fieldname: 'additional_notes',
                label: __('Additional Notes'),
                default: existingActivity?.additional_notes
            }
        ],
        primary_action_label: __(existingActivity ? 'Update Activity' : 'Cache Activity'),
        primary_action: function(values) {
            cacheActivity(values, date, frm, activityDialog, calendarDialog);
        },
        secondary_action_label: existingActivity ? __('Remove') : null,
        secondary_action: existingActivity ? function() {
            delete window.cachedActivities[date];
            activityDialog.hide();
            
            // Update calendar display
            const dateElement = calendarDialog.$wrapper.find(`.calendar-day[data-date="${date}"]`);
            dateElement.removeClass('cached');
            
            updateCachedActivitiesCounter(calendarDialog);
            
            frappe.show_alert({
                message: __('Activity removed from cache'),
                indicator: 'orange'
            });
        } : null
    });    
    activityDialog.show();
}

// Function to cache activity
function cacheActivity(values, date, frm, activityDialog, calendarDialog) {
    // Cache the activity
    window.cachedActivities[date] = {
        date_of_planned_activity: date,
        nature_of_activity: values.nature_of_activity,
        estimated_hours_to_complete: values.estimated_hours_to_complete,
        additional_notes: values.additional_notes,
        assignees: values.assignees
    };
    
    // Close activity dialog
    activityDialog.hide();
    
    // Shade the selected date
    const dateElement = calendarDialog.$wrapper.find(`.calendar-day[data-date="${date}"]`);
    dateElement.addClass('cached');
    dateElement.attr('title', `Cached: ${values.nature_of_activity}`);
    
    // Update counter
    updateCachedActivitiesCounter(calendarDialog);
    
    // Show success message
    frappe.show_alert({
        message: __('Activity cached for ' + frappe.datetime.str_to_user(date)),
        indicator: 'green'
    });
}

// Function to save all cached activities
function saveAllCachedActivities(frm, dialog) {
    // Prepare data for server call
    const scheduleData = {
        farming_season: frm.doc.farming_season,
        farm_plot: frm.doc.plot_on_which_planting_is_done,
        schedule_applicable_for_crop: frm.doc.crop_being_planted,
        activity_tied_to_which_crop_batch: frm.doc.name,
        schedule_start_date: frm.doc.date_of_planting,
        scheduled_end_date: frm.doc.expected_harvest_date,
        important_notes: frm.doc.other_important_notes,
        scheduled_activities: Object.values(window.cachedActivities)
    };
    
    // Show loading
    frappe.show_alert({
        message: __('Creating schedule...'),
        indicator: 'blue'
    });
    
    // Make server call
    frappe.call({
        method: 'farm_management_system.savanna_farm_suite.doctype.crop_intake.crop_intake.create_farming_schedule',
        args: {
            schedule_data: scheduleData
        },
        callback: function(r) {
            if (r.message && r.message.success) {
                // Clear cached activities
                window.cachedActivities = {};
                
                // Close dialog
                dialog.hide();
                
                // Show success message
                frappe.show_alert({
                    message: __('Farming schedule created successfully!'),
                    indicator: 'green'
                });
                
                // Refresh the form
                frm.reload_doc();
            } else {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('Failed to create schedule: ' + (r.message?.error || 'Unknown error'))
                });
            }
        },
        error: function(err) {
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to create schedule: ' + (err.message || err))
            });
        }
    });
}

//Calendar 

function showCalendarDialog(frm) {
    let dialog = new frappe.ui.Dialog({
        title: __('Select Date for Farming Activity'),
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'calendar_html'
            }
        ],
        size: 'large'
    });

    // Fetch scheduled dates and render calendar
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Farming Schedule',
            filters: { 'crop_batch': frm.doc.name },
            fields: ['name']
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: {
                        doctype: 'Farming Schedule',
                        fieldname: 'table_biyv',
                        filters: { 'name': r.message[0].name }
                    },
                    callback: function(schedule_r) {
                        renderCalendar(dialog, schedule_r.message.table_biyv || []);
                    }
                });
            } else {
                renderCalendar(dialog, []);
            }
        }
    });

    dialog.show();
}

function renderCalendar(dialog, scheduled_dates) {
    let calendar_html = `<div id="farming-calendar"></div>`;
    dialog.get_field('calendar_html').$wrapper.html(calendar_html);
    
    // Initialize calendar with FullCalendar
    $('#farming-calendar').fullCalendar({
        header: {
            left: 'prev,next today',
            center: 'title',
            right: 'month,agendaWeek,agendaDay'
        },
        events: scheduled_dates.map((item, idx) => ({
            title: item.activity_name,
            start: item.scheduled_date,
            color: getColorFromIndex(idx)
        })),
        dateClick: function(info) {
            dialog.hide();
            showActivityDialog(frm, info.dateStr);
        }
    });
}

function showActivityDialog(frm, selected_date) {
    let activity_dialog = new frappe.ui.Dialog({
        title: __('Record Farming Activity for ') + selected_date,
        fields: [
            {
                fieldtype: 'Date',
                fieldname: 'activity_date',
                label: __('Date of Activity'),
                default: selected_date,
                read_only: 1
            },
            {
                fieldtype: 'MultiSelect',
                fieldname: 'labourers',
                label: __('Specify the Labourers'),
                options: 'Farm Workers',
                reqd: 1
            },
            {
                fieldtype: 'MultiSelect',
                fieldname: 'farming_activities',
                label: __('Farming Activities Undertaken'),
                options: 'Farm Activity Multiselect',
                reqd: 1
            },
            {
                fieldtype: 'Float',
                fieldname: 'total_man_hours',
                label: __('Total Man Hours'),
                reqd: 1
            },
            {
                fieldtype: 'Check',
                fieldname: 'auto_create_payment_vouchers',
                label: __('Auto-Create Payment Vouchers for ALL Labourers?')
            },
            {
                fieldtype: 'Small Text',
                fieldname: 'additional_notes',
                label: __('Additional Notes')
            },
            {
                fieldtype: 'Attach',
                fieldname: 'proof_of_work',
                label: __('Proof of Work')
            },
            {
                fieldtype: 'Table',
                fieldname: 'farm_inputs_table',
                label: __('Farm Inputs Used'),
                fields: [
                    {
                        fieldtype: 'Link',
                        fieldname: 'farm_input',
                        label: __('Farm Input Used'),
                        options: 'Farm Inputs',
                        reqd: 1
                    },
                    {
                        fieldtype: 'Data',
                        fieldname: 'uom',
                        label: __('Default UOM'),
                        read_only: 1
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'quantity',
                        label: __('Quantity Used'),
                        reqd: 1
                    }
                ]
            }
        ],
        primary_action: function() {
            frappe.confirm(
                __('Are you sure you want to record this farming activity?'),
                function() {
                    saveActivityLog(frm, activity_dialog);
                }
            );
        },
        primary_action_label: __('Record Log')
    });

    // Add UOM auto-fetch
    activity_dialog.get_field('farm_inputs_table').grid.wrapper.on('change', '[data-fieldname="farm_input"]', function(e) {
        let row = $(this).closest('.grid-row');
        let selected_input = $(this).val();
        if (selected_input) {
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Farm Inputs',
                    fieldname: 'uom',
                    filters: { name: selected_input }
                },
                callback: function(r) {
                    if (r.message) {
                        activity_dialog.fields_dict.farm_inputs_table.grid.grid_rows[row.index()].get_field('uom').set_value(r.message.uom);
                    }
                }
            });
        }
    });

    activity_dialog.show();
}

function saveActivityLog(frm, dialog) {
    let values = dialog.get_values();
    
    frappe.call({
        method: 'your_custom_app.methods.create_farm_operation_log',
        args: {
            crop_intake: frm.doc.name,
            activity_data: values
        },
        callback: function(r) {
            if (r.message) {
                frappe.show_alert({
                    message: __('Activity recorded successfully'),
                    indicator: 'green'
                });
                dialog.hide();
                frm.reload_doc();
            }
        }
    });
}

// Helper function to generate unique colors
function getColorFromIndex(idx) {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FF33A1', '#33FFF6'];
    return colors[idx % colors.length];
}