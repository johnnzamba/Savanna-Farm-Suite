// public/js/farm_activity_schedule_calendar.js
frappe.views.calendar["Farm Activity Schedule"] = {
    // Base settings for Calendar view
    field_map: {
        start: "start",
        end: "end",
        id: "id",
        title: "title"
    },
    get_events_method: "farm_management_system.savanna_farm_suite.doctype.farm_activity_schedule.farm_activity_schedule.get_events",

    // Calendar-specific event rendering
    eventRender: function(event, element) {
        // Sanitize text
        var safeTitle = $('<div>').text(event.title || '').html();
        var safeAssignee = $('<div>').text(event.assignee || '').html();

        // Build inner HTML
        var inner = '<div class="fa-event-title">' + safeTitle + '</div>' +
                    (safeAssignee ? '<div class="fa-event-assignee">' + safeAssignee + '</div>' : '');

        // Insert into FullCalendar containers
        var $title = element.find('.fc-title');
        if ($title.length) {
            $title.html(inner);
        } else if (element.find('.fc-content').length) {
            element.find('.fc-content').html(inner);
        } else {
            element.html(inner);
        }

        // Allow wrapping
        element.css({ 'white-space': 'normal' });

        // Tooltip
        var tooltip = [
            "Schedule Document: " + (event.docname || ""),
            "Farming Activity: " + (event.title || ""),
            "Assigned To: " + (event.assignee || "")
        ].join("\n");
        element.attr("title", tooltip);
        if (typeof element.tooltip === "function") {
            element.tooltip({ container: "body", placement: "top", title: tooltip });
        }
    },

    // Enable Gantt view
    gantt: true,

    // Gantt-specific overrides
    gantt: {
        field_map: {
            start: "schedule_start_date",
            end: "scheduled_end_date",
            id: "name",
            title: "name"
        },
        get_events_method: "farm_management_system.savanna_farm_suite.doctype.farm_activity_schedule.farm_activity_schedule.get_events_for_gantt",

        // Gantt-specific event rendering
        eventRender: function(event, element) {
            // Sanitize text
            var safeTitle = $('<div>').text(event.title || '').html();
            var safeCrop = $('<div>').text(event.crop || '').html();

            // Build inner HTML
            var inner = '<div class="fa-gantt-title" style="font-weight:600;line-height:1.1;">' + safeTitle + '</div>';
            if (safeCrop) {
                inner += '<div class="fa-gantt-subtitle" style="font-size:0.78em; opacity:0.95; margin-top:2px;">' + safeCrop + '</div>';
            }

            // Insert into containers (assuming compatible DOM structure)
            if (element.find('.fc-title').length) {
                element.find('.fc-title').html(inner);
            } else if (element.find('.fc-content').length) {
                element.find('.fc-content').html(inner);
            } else {
                element.html(inner);
            }

            // Allow wrapping
            element.css({ 'white-space': 'normal' });

            // Apply colors
            if (event.color) {
                var textColor = event.text_color || '#ff1515ff';
                element.css({
                    'background-color': event.color,
                    'border-color': event.color,
                    'color': textColor
                });
                element.find('*').css('color', textColor);
            }

            // Tooltip
            var tooltipParts = [
                "Doc: " + (event.title || ""),
                (event.crop ? ("Crop/Batch: " + event.crop) : ""),
                "Start: " + (event.start || ""),
                "End: " + (event.end || "")
            ];
            var tooltip = tooltipParts.filter(Boolean).join("\n");
            element.attr("title", tooltip);
            if (typeof element.tooltip === "function") {
                element.tooltip({ container: "body", placement: "top", title: tooltip });
            }
        }
    },

    // Shared event click handler (for both views, assuming supported in Gantt)
    eventClick: function(event) {
        if (event.id) {
            frappe.set_route("Form", "Farm Activity Schedule", event.id);
        }
    }
};