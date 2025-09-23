frappe.pages['farm-activity-calend'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Farm Activity Calendar',
        single_column: true
    });

    // Add CSS for styling - use page.body instead of page.$wrapper
    $(page.body).append(`
        <style>
            .calendar-container {
                margin: 20px 0;
                padding: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .legend-container {
                margin: 20px 0;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
                border-left: 4px solid #007bff;
            }
            .event-details-modal .modal-dialog {
                max-width: 600px;
            }
            .event-item {
                padding: 10px;
                margin: 5px 0;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.3s;
            }
            .event-item:hover {
                transform: translateX(5px);
            }
            .date-filter {
                margin-bottom: 20px;
                padding: 15px;
                background: white;
                border-radius: 8px;
            }
            .fc-event {
                cursor: pointer;
            }
            .fc-toolbar h2 {
                font-size: 1.5em;
            }
        </style>
    `);

    // Initialize the page
    init_page(page);
};

function init_page(page) {
    // Create main container - use page.body instead of page.main
    let container = $(`<div class="calendar-container"></div>`).appendTo(page.body);
    
    // Add date filter section
    add_date_filter(container);
    
    // Add calendar container
    let calendar_container = $(`<div id="calendar"></div>`).appendTo(container);
    
    // Add legend container
    let legend_container = $(`<div class="legend-container" style="display:none;"></div>`).appendTo(page.body);
    
    // Initialize calendar
    initialize_calendar(calendar_container, legend_container, page);
}

function add_date_filter(container) {
    let filter_html = `
        <div class="date-filter row">
            <div class="col-md-3">
                <label>Start Date</label>
                <input type="date" class="form-control" id="start-date">
            </div>
            <div class="col-md-3">
                <label>End Date</label>
                <input type="date" class="form-control" id="end-date">
            </div>
            <div class="col-md-3">
                <label>Activity Type</label>
                <select class="form-control" id="doctype-filter">
                    <option value="all">All Activities</option>
                    <option value="Farm Activity Schedule">Farm Activities</option>
                    <option value="Treatment and Vaccination Logs">Treatment Logs</option>
                    <option value="Crop Intake">Crop Intake</option>
                </select>
            </div>
            <div class="col-md-3">
                <label>&nbsp;</label><br>
                <button class="btn btn-primary btn-block" id="refresh-btn">Refresh Calendar</button>
            </div>
        </div>
    `;
    
    $(filter_html).appendTo(container);
}

function initialize_calendar(container, legend_container, page) {
    // Check if FullCalendar is available
    if (typeof $.fn.fullCalendar === 'undefined') {
        frappe.msgprint(__('FullCalendar is not loaded. Please check your hooks configuration.'));
        return;
    }

    // Initialize FullCalendar
    container.fullCalendar({
        header: {
            left: 'prev,next today',
            center: 'title',
            right: 'month,agendaWeek,agendaDay'
        },
        defaultDate: new Date(),
        editable: false,
        eventLimit: true,
        events: function(start, end, timezone, callback) {
            load_calendar_events(start, end, callback);
        },
        eventRender: function(event, element) {
            // Add tooltip
            element.attr('title', event.tooltip);
            element.tooltip({ 
                trigger: 'hover',
                placement: 'top',
                container: 'body'
            });
        },
        eventClick: function(event) {
            show_event_details(event, legend_container, page);
        },
        loading: function(bool) {
            if (bool) {
                frappe.show_alert({message: __('Loading events...'), indicator: 'blue'});
            }
        }
    });

    // Refresh button handler
    $('#refresh-btn').on('click', function() {
        container.fullCalendar('refetchEvents');
    });

    // Date filter handlers
    $('#start-date, #end-date, #doctype-filter').on('change', function() {
        container.fullCalendar('refetchEvents');
    });
}

function load_calendar_events(start, end, callback) {
    let start_date = $('#start-date').val() || frappe.datetime.obj_to_str(start);
    let end_date = $('#end-date').val() || frappe.datetime.obj_to_str(end);
    let doctype_filter = $('#doctype-filter').val();

    frappe.call({
        method: 'farm_management_system.savanna_farm_suite.page.farm_activity_calend.farm_calendar.get_calendar_events',
        args: {
            start_date: start_date,
            end_date: end_date,
            doctype_filter: doctype_filter
        },
        callback: function(r) {
            if (r.message) {
                let events = [];
                
                // Process Farm Activity Schedule events
                if (r.message.farm_activities) {
                    r.message.farm_activities.forEach(activity => {
                        if (activity.scheduled_activity_table) {
                            activity.scheduled_activity_table.forEach(schedule => {
                                if (schedule.date_of_planned_activity) {
                                    let event_color = generate_random_color(activity.name);
                                    events.push({
                                        title: `Farm: ${schedule.nature_of_activity}`,
                                        start: schedule.date_of_planned_activity,
                                        color: event_color,
                                        tooltip: `Activity: ${schedule.nature_of_activity}<br>Assignee: ${schedule.assignee_full_name || 'Not assigned'}`,
                                        type: 'Farm Activity Schedule',
                                        data: {
                                            doctype: 'Farm Activity Schedule',
                                            name: activity.name,
                                            farm_plot: activity.farm_plot,
                                            crop_batch: activity.activity_tied_to_which_crop_batch,
                                            applicable_crop: activity.schedule_applicable_for_crop,
                                            nature_of_activity: schedule.nature_of_activity,
                                            assignee: schedule.assignee_full_name,
                                            date: schedule.date_of_planned_activity
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                // Process Treatment and Vaccination Logs events
                if (r.message.treatment_logs) {
                    r.message.treatment_logs.forEach(treatment => {
                        if (treatment.treatment_date) {
                            let event_color = generate_random_color(treatment.name);
                            let treatment_target = treatment.poultry_batch_under_treatment || 
                                                 treatment.animal_under_medication || 
                                                 treatment.cattle_shed_under_treatment || 
                                                 treatment.specific_cattle_under_treatment ||
                                                 'Not Specified';
                            
                            events.push({
                                title: `Treatment: ${treatment.specify_type_of_treatment}`,
                                start: treatment.treatment_date,
                                color: event_color,
                                tooltip: `Treatment: ${treatment.specify_type_of_treatment}<br>Doctor: ${treatment.doctor || 'Not specified'}`,
                                type: 'Treatment and Vaccination Logs',
                                data: {
                                    doctype: 'Treatment and Vaccination Logs',
                                    name: treatment.name,
                                    treatment_type: treatment.specify_type_of_treatment,
                                    doctor: treatment.doctor,
                                    treatment_date: treatment.treatment_date,
                                    treatment_target: treatment_target
                                }
                            });
                        }
                    });
                }

                // Process Crop Intake events
                if (r.message.crop_intakes) {
                    r.message.crop_intakes.forEach(crop => {
                        let planting_color = generate_random_color(crop.name + '_planting');
                        let harvest_color = generate_random_color(crop.name + '_harvest');
                        
                        // Planting date event
                        if (crop.date_of_planting) {
                            events.push({
                                title: `Planting: ${crop.crop_being_planted}`,
                                start: crop.date_of_planting,
                                color: planting_color,
                                tooltip: `Crop: ${crop.crop_being_planted}<br>Plot: ${crop.plot_on_which_planting_is_done}`,
                                type: 'Crop Intake',
                                data: {
                                    doctype: 'Crop Intake',
                                    name: crop.name,
                                    event_type: 'Planting',
                                    crop: crop.crop_being_planted,
                                    plot: crop.plot_on_which_planting_is_done,
                                    season: crop.farming_season,
                                    date: crop.date_of_planting
                                }
                            });
                        }
                        
                        // Harvest date event
                        if (crop.expected_harvest_date) {
                            events.push({
                                title: `Harvest: ${crop.crop_being_planted}`,
                                start: crop.expected_harvest_date,
                                color: harvest_color,
                                tooltip: `Crop: ${crop.crop_being_planted}<br>Plot: ${crop.plot_on_which_planting_is_done}`,
                                type: 'Crop Intake',
                                data: {
                                    doctype: 'Crop Intake',
                                    name: crop.name,
                                    event_type: 'Harvest',
                                    crop: crop.crop_being_planted,
                                    plot: crop.plot_on_which_planting_is_done,
                                    season: crop.farming_season,
                                    date: crop.expected_harvest_date
                                }
                            });
                        }
                    });
                }

                callback(events);
            } else {
                callback([]);
            }
        },
        error: function() {
            callback([]);
        }
    });
}

function generate_random_color(seed) {
    // Generate consistent random color based on seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        // Ensure color is not too light (for readability)
        value = value % 200; // Keep values between 0-200 for darker colors
        color += ('00' + value.toString(16)).substr(-2);
    }
    
    return color;
}

function show_event_details(event, legend_container, page) {
    let details_html = `
        <h4>${event.type} Details</h4>
        <div class="event-details">
    `;

    if (event.data.doctype === 'Farm Activity Schedule') {
        details_html += `
            <p><strong>Farm Plot:</strong> ${event.data.farm_plot || 'N/A'}</p>
            <p><strong>Crop Batch:</strong> ${event.data.crop_batch || 'N/A'}</p>
            <p><strong>Applicable Crop:</strong> ${event.data.applicable_crop || 'N/A'}</p>
            <p><strong>Nature of Activity:</strong> ${event.data.nature_of_activity}</p>
            <p><strong>Assignee:</strong> ${event.data.assignee || 'N/A'}</p>
            <p><strong>Date:</strong> ${frappe.datetime.str_to_user(event.data.date)}</p>
        `;
    } else if (event.data.doctype === 'Treatment and Vaccination Logs') {
        details_html += `
            <p><strong>Treatment Type:</strong> ${event.data.treatment_type}</p>
            <p><strong>Doctor:</strong> ${event.data.doctor || 'N/A'}</p>
            <p><strong>Treatment Target:</strong> ${event.data.treatment_target}</p>
            <p><strong>Date:</strong> ${frappe.datetime.str_to_user(event.data.treatment_date)}</p>
        `;
    } else if (event.data.doctype === 'Crop Intake') {
        details_html += `
            <p><strong>Event Type:</strong> ${event.data.event_type}</p>
            <p><strong>Crop:</strong> ${event.data.crop}</p>
            <p><strong>Plot:</strong> ${event.data.plot}</p>
            <p><strong>Season:</strong> ${event.data.season || 'N/A'}</p>
            <p><strong>Date:</strong> ${frappe.datetime.str_to_user(event.data.date)}</p>
        `;
    }

    details_html += `
        </div>
        <br>
        <button class="btn btn-primary btn-review" data-doctype="${event.data.doctype}" data-name="${event.data.name}">
            Click to Review
        </button>
    `;

    legend_container.html(details_html).show();

    // Add click handler for review button
    legend_container.find('.btn-review').on('click', function() {
        let doctype = $(this).data('doctype');
        let name = $(this).data('name');
        // Format doctype for URL (replace spaces with hyphens and lowercase)
        let formatted_doctype = doctype.toLowerCase().replace(/ /g, '-');
        let route = `/app/${formatted_doctype}/${name}`;
        frappe.set_route(route);
    });
}