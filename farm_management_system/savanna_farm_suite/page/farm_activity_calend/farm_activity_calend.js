// farm_management_system/public/js/farm_activity_calendar_page.js
frappe.pages['farm-activity-calend'].on_page_load = function(wrapper) {
    // Build the page
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Farm Activity Calendar',
        single_column: false
    });

    // layout
    const $container = $(`
        <div class="farm-activity-calendar-page" style="display:flex; gap:16px; align-items:flex-start;">
            <!-- Increased calendar width: larger min-width and max-width so calendar gets priority -->
            <div id="fac_calendar" style="flex: 1 1 0; min-width: 900px; max-width: calc(100% - 420px); background:#fff; border-radius:6px; padding:12px; box-shadow:var(--box-shadow);"></div>
            <div id="fac_sidebar" style="width:360px; max-height:80vh; overflow:auto; background:#fff; border-radius:6px; padding:12px; box-shadow:var(--box-shadow);">
                <h6 style="margin-top:0">Date Slots</h6>
                <div id="fac_selected_date" style="font-weight:600; margin-bottom:8px;"></div>
                <div id="fac_slots_list"></div>
            </div>
        </div>
    `);

    $(page.body).append($container);

    // ---- Inject small styles for calendar (today highlight in grey) ----
    // FullCalendar uses .fc-day-today for the today cell; we apply a subtle grey background
    // and slightly stronger day number.
    const injectedStyles = `
        <style id="fac_custom_styles">
            /* Make today's day cell grey */
            .fc .fc-daygrid-day.fc-day-today {
                background-color: #efefef !important;
                border-radius: 6px;
            }
            /* Make today's date number a bit more prominent */
            .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                font-weight: 700;
                color: #333;
            }
            /* Slightly increase event font size for readability */
            .fc .fc-event-title {
                font-size: 0.95rem;
            }
            /* Ensure the calendar area uses the available space well */
            #fac_calendar { box-sizing: border-box; }
        </style>
    `;
    // Remove previous injection if present, then append
    $('#fac_custom_styles').remove();
    $('head').append(injectedStyles);

    const calendarEl = $container.find('#fac_calendar')[0];
    const sidebarDateLabel = $container.find('#fac_selected_date');
    const sidebarList = $container.find('#fac_slots_list');

    // Small loading indicator while we fetch events
    frappe.require([], function() {
        // inline spinner
        const loader = `
        <div style="display:flex;align-items:center;justify-content:center;height:300px;">
            <div style="
            width:40px;height:40px;border:4px solid rgba(0,0,0,0.08);
            border-top-color:#2b8cff;border-radius:50%;
            animation:__fac_spin 1s linear infinite;
            "></div>
        </div>
        <style>
            @keyframes __fac_spin { to { transform: rotate(360deg); } }
        </style>
        `;
        $(calendarEl).html(loader);

        // fetch events (server returns combined structured events)
        frappe.call({
            method: 'farm_management_system.savanna_farm_suite.page.farm_activity_calend.farm_calendar.get_calendar_events',
            args: {},
            callback: function(r) {
                if (!r || !r.message) {
                    $(calendarEl).html('<div class="text-muted">Failed to load events.</div>');
                    return;
                }

                const payload = r.message;
                const events = [];

                // helper: convert consistent pastel-ish random color
                function randomColor() {
                    const h = Math.floor(Math.random() * 360);
                    const s = 65;
                    const l = 55;
                    function hslToRgb(h, s, l){
                        s /= 100; l /= 100;
                        const k = n => (n + h / 30) % 12;
                        const a = s * Math.min(l, 1 - l);
                        const f = n => l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1);
                        return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
                    }
                    const [r,g,b] = hslToRgb(h, s, l);
                    return "#" + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
                }

                // build events (same as your existing logic)
                (payload.farm_activities || []).forEach(function(sa) {
                    (sa.scheduled_activity_table || []).forEach(function(row) {
                        if (!row.date_of_planned_activity) return;
                        const color = randomColor();
                        events.push({
                            title: row.nature_of_activity || 'Activity',
                            start: row.date_of_planned_activity,
                            allDay: true,
                            backgroundColor: color,
                            borderColor: color,
                            textColor: '#fff',
                            extendedProps: {
                                source_type: 'farm_activity',
                                schedule_name: sa.name,
                                farm_plot: sa.farm_plot,
                                activity_tied_to_which_crop_batch: sa.activity_tied_to_which_crop_batch,
                                schedule_applicable_for_crop: sa.schedule_applicable_for_crop,
                                nature_of_activity: row.nature_of_activity,
                                assignee_full_name: row.assignee_full_name
                            }
                        });
                    });
                });

                (payload.treatments || []).forEach(function(t) {
                    if (!t.treatment_date) return;
                    const color = randomColor();
                    events.push({
                        title: t.specify_type_of_treatment || 'Treatment',
                        start: t.treatment_date,
                        allDay: true,
                        backgroundColor: color,
                        borderColor: color,
                        textColor: '#fff',
                        extendedProps: {
                            source_type: 'treatment',
                            name: t.name,
                            specify_type_of_treatment: t.specify_type_of_treatment,
                            doctor: t.doctor,
                            poultry_batch_under_treatment: t.poultry_batch_under_treatment,
                            animal_under_medication: t.animal_under_medication,
                            cattle_shed_under_treatment: t.cattle_shed_under_treatment,
                            specific_cattle_under_treatment: t.specific_cattle_under_treatment
                        }
                    });
                });

                (payload.crop_intakes || []).forEach(function(ci) {
                    if (ci.date_of_planting) {
                        const color = randomColor();
                        events.push({
                            title: 'Planting: ' + (ci.crop_being_planted || ''),
                            start: ci.date_of_planting,
                            allDay: true,
                            backgroundColor: color,
                            borderColor: color,
                            textColor: '#fff',
                            extendedProps: {
                                source_type: 'crop_intake_planting',
                                name: ci.name,
                                date_of_planting: ci.date_of_planting,
                                expected_harvest_date: ci.expected_harvest_date,
                                plot_on_which_planting_is_done: ci.plot_on_which_planting_is_done,
                                crop_being_planted: ci.crop_being_planted,
                                farming_season: ci.farming_season
                            }
                        });
                    }
                    if (ci.expected_harvest_date) {
                        const color = randomColor();
                        events.push({
                            title: 'Expected Harvest: ' + (ci.crop_being_planted || ''),
                            start: ci.expected_harvest_date,
                            allDay: true,
                            backgroundColor: color,
                            borderColor: color,
                            textColor: '#fff',
                            extendedProps: {
                                source_type: 'crop_intake_harvest',
                                name: ci.name,
                                date_of_planting: ci.date_of_planting,
                                expected_harvest_date: ci.expected_harvest_date,
                                plot_on_which_planting_is_done: ci.plot_on_which_planting_is_done,
                                crop_being_planted: ci.crop_being_planted,
                                farming_season: ci.farming_season
                            }
                        });
                    }
                });

                // ---------- FullCalendar loader ----------
                function loadFullCalendarOnce() {
                    if (window.FullCalendar) return Promise.resolve(window.FullCalendar);

                    const cssUrl = "https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css";
                    const jsUrl  = "https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js";

                    function loadCss(url) {
                        return new Promise(function(resolve, reject) {
                            if (document.querySelector('link[data-fc-css][href="'+url+'"]')) return resolve();
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = url;
                            link.setAttribute('data-fc-css', '1');
                            link.onload = () => resolve();
                            link.onerror = () => reject(new Error('Failed to load FullCalendar CSS'));
                            document.head.appendChild(link);
                        });
                    }
                    function loadScript(url) {
                        return new Promise(function(resolve, reject) {
                            if (document.querySelector('script[data-fc-js][src="'+url+'"]')) {
                                const existing = document.querySelector('script[data-fc-js][src="'+url+'"]');
                                existing.addEventListener('load', () => resolve(window.FullCalendar));
                                existing.addEventListener('error', () => reject(new Error('Failed to load FullCalendar JS')));
                                return;
                            }
                            const s = document.createElement('script');
                            s.src = url;
                            s.async = true;
                            s.setAttribute('data-fc-js', '1');
                            s.onload = function() { resolve(window.FullCalendar); };
                            s.onerror = function() { reject(new Error('Failed to load FullCalendar JS')); };
                            document.head.appendChild(s);
                        });
                    }

                    return loadCss(cssUrl).then(() => loadScript(jsUrl));
                }

                // Now load FullCalendar then render
                loadFullCalendarOnce().then(function() {
                    try {
                        const Calendar = FullCalendar.Calendar;
                        const calendar = new Calendar(calendarEl, {
                            initialView: 'dayGridMonth',
                            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
                            height: 'auto',
                            events: events,
                            eventDidMount: function(info) {
                                const ep = info.event.extendedProps || {};
                                if (ep.source_type === 'farm_activity') {
                                    info.el.setAttribute('title', (ep.nature_of_activity || '') + ' — ' + (ep.assignee_full_name || ''));
                                } else if (ep.source_type === 'treatment') {
                                    info.el.setAttribute('title', (ep.doctor || '') + ' — ' + (ep.specify_type_of_treatment || ''));
                                } else {
                                    info.el.setAttribute('title', info.event.title || '');
                                }
                            },
                            dateClick: function(arg) {
                                const clickedDate = arg.dateStr;
                                sidebarDateLabel.text(clickedDate);
                                renderSlotsForDate(clickedDate);
                            },
                            eventClick: function(info) {
                                const ep = info.event.extendedProps || {};
                                const type = ep.source_type;
                                let body = $('<div></div>');
                                if (type === 'farm_activity') {
                                    body.append(`<div><strong>Farm Plot:</strong> ${ep.farm_plot || ''}</div>`);
                                    body.append(`<div><strong>Activity Batch:</strong> ${ep.activity_tied_to_which_crop_batch || ''}</div>`);
                                    body.append(`<div><strong>Schedule Applicable For:</strong> ${ep.schedule_applicable_for_crop || ''}</div>`);
                                    body.append(`<div><strong>Nature of Activity:</strong> ${ep.nature_of_activity || ''}</div>`);
                                    body.append(`<div><strong>Assignee:</strong> ${ep.assignee_full_name || ''}</div>`);
                                    const schedule_name = ep.schedule_name;
                                    const dlg = new frappe.ui.Dialog({
                                        title: __('Farm Activity'),
                                        fields: [],
                                        primary_action_label: __('Click to Review'),
                                        primary_action: function() {
                                            window.location.href = '/app/farm-activity-schedule/' + encodeURIComponent(schedule_name);
                                        }
                                    });
                                    dlg.$wrapper.find('.modal-body').html(body);
                                    dlg.show();
                                } else if (type === 'treatment') {
                                    body.append(`<div><strong>Doctor:</strong> ${ep.doctor || ''}</div>`);
                                    body.append(`<div><strong>Treatment Type:</strong> ${ep.specify_type_of_treatment || ''}</div>`);
                                    body.append(`<div><strong>Poultry Batch:</strong> ${ep.poultry_batch_under_treatment || ''}</div>`);
                                    body.append(`<div><strong>Animal Under Medication:</strong> ${ep.animal_under_medication || ''}</div>`);
                                    body.append(`<div><strong>Cattle Shed:</strong> ${ep.cattle_shed_under_treatment || ''}</div>`);
                                    body.append(`<div><strong>Specific Cattle:</strong> ${ep.specific_cattle_under_treatment || ''}</div>`);
                                    const name = ep.name;
                                    const dlg = new frappe.ui.Dialog({
                                        title: __('Treatment / Vaccination'),
                                        fields: [],
                                        primary_action_label: __('Click to Review'),
                                        primary_action: function() {
                                            window.location.href = '/app/treatment-and-vaccination-logs/' + encodeURIComponent(name);
                                        }
                                    });
                                    dlg.$wrapper.find('.modal-body').html(body);
                                    dlg.show();
                                } else if (type && type.startsWith('crop_intake')) {
                                    body.append(`<div><strong>Plot:</strong> ${info.event.extendedProps.plot_on_which_planting_is_done || ''}</div>`);
                                    body.append(`<div><strong>Crop:</strong> ${info.event.extendedProps.crop_being_planted || ''}</div>`);
                                    body.append(`<div><strong>Season:</strong> ${info.event.extendedProps.farming_season || ''}</div>`);
                                    body.append(`<div><strong>Planting:</strong> ${info.event.extendedProps.date_of_planting || ''}</div>`);
                                    body.append(`<div><strong>Expected Harvest:</strong> ${info.event.extendedProps.expected_harvest_date || ''}</div>`);
                                    const name = info.event.extendedProps.name;
                                    const dlg = new frappe.ui.Dialog({
                                        title: __('Crop Intake'),
                                        fields: [],
                                        primary_action_label: __('Click to Review'),
                                        primary_action: function() {
                                            window.location.href = '/app/crop-intake/' + encodeURIComponent(name);
                                        }
                                    });
                                    dlg.$wrapper.find('.modal-body').html(body);
                                    dlg.show();
                                } else {
                                    const dlg = new frappe.ui.Dialog({ title: __('Details'), fields: [] });
                                    dlg.$wrapper.find('.modal-body').html($('<pre/>').text(JSON.stringify(info.event.extendedProps, null, 2)));
                                    dlg.show();
                                }
                            }
                        });

                        calendar.render();

                        // render slots for the current date initially
                        const todayStr = frappe.datetime.get_today();
                        sidebarDateLabel.text(todayStr);

                        function renderSlotsForDate(dateStr) {
                            const eventsOnDate = calendar.getEvents().filter(ev => ev.startStr === dateStr || ev.startStr.indexOf(dateStr) === 0);
                            sidebarList.empty();
                            if (!eventsOnDate.length) {
                                sidebarList.append('<div class="text-muted">No events for this date.</div>');
                                return;
                            }
                            eventsOnDate.forEach(function(ev) {
                                const ep = ev.extendedProps || {};
                                const card = $(`
                                    <div class="card" style="margin-bottom:8px; padding:8px; border-left:6px solid ${ev.backgroundColor};">
                                        <div style="font-weight:600">${ev.title}</div>
                                        <div style="font-size:0.9rem; color:#666">${ep.assignee_full_name || ep.doctor || (ep.crop_being_planted || '')}</div>
                                        <div style="margin-top:6px;">
                                            <button class="btn btn-xs btn-default btn-review" data-type="${ep.source_type || ''}" data-name="${(ep.schedule_name || ep.name || '')}">Click to Review</button>
                                        </div>
                                    </div>
                                `);
                                card.find('.btn-review').on('click', function() {
                                    const t = $(this).attr('data-type');
                                    const n = $(this).attr('data-name');
                                    if (!t || !n) return;
                                    if (t === 'farm_activity') {
                                        window.location.href = '/app/farm-activity-schedule/' + encodeURIComponent(n);
                                    } else if (t === 'treatment') {
                                        window.location.href = '/app/treatment-and-vaccination-logs/' + encodeURIComponent(n);
                                    } else if (t && t.startsWith('crop_intake')) {
                                        window.location.href = '/app/crop-intake/' + encodeURIComponent(n);
                                    }
                                });
                                sidebarList.append(card);
                            });
                        }

                        // first render today slots
                        renderSlotsForDate(todayStr);

                    } catch (err) {
                        console.error('FullCalendar render failed after load', err);
                        $(calendarEl).html('<pre style="white-space:pre-wrap">' + JSON.stringify(events, null, 2) + '</pre>');
                    }
                }).catch(function(err) {
                    console.error('Failed to load FullCalendar library', err);
                    $(calendarEl).html('<div class="text-danger">Failed to load calendar library: ' + (err && err.message) + '</div><pre style="white-space:pre-wrap">' + JSON.stringify(events, null, 2) + '</pre>');
                });

            },
            error: function() {
                $(calendarEl).html('<div class="text-danger">Network error while fetching calendar events.</div>');
            }
        });
    });
};
