// public/js/farm_activity_schedule_gantt.js
frappe.views.calendar["Farm Activity Schedule"] = {
    field_map: {
        start: "schedule_start_date",
        end: "scheduled_end_date",
        id: "name",
        title: "name"
    },

    gantt: true,

    get_events_method: "farm_management_system.savanna_farm_suite.doctype.farm_activity_schedule.farm_activity_schedule.get_events_for_gantt",

    eventRender: function(event, element) {
        // sanitize and build inner content
        var safeTitle = $('<div>').text(event.title || '').html();
        var safeCrop = $('<div>').text(event.crop || '').html();

        var inner = '<div class="fa-gantt-title" style="font-weight:600;line-height:1.1;">' + safeTitle + '</div>';
        if (safeCrop) {
            inner += '<div class="fa-gantt-subtitle" style="font-size:0.78em; opacity:0.95; margin-top:2px;">' + safeCrop + '</div>';
        }

        // Insert into likely containers, fallback to element
        if (element.find('.fc-title').length) {
            element.find('.fc-title').html(inner);
        } else if (element.find('.fc-content').length) {
            element.find('.fc-content').html(inner);
        } else {
            element.html(inner);
        }

        // allow wrapping so long names/crops don't overflow
        element.css({ 'white-space': 'normal' });

        // apply colors from server (background + border + text)
        if (event.color) {
            var textColor = event.text_color || '#ffffff';
            element.css({
                'background-color': event.color,
                'border-color': event.color,
                'color': textColor
            });
            // ensure inner nodes inherit text color across different Frappe versions
            element.find('*').css('color', textColor);
        }

        // tooltip: include crop below name
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
    },

    eventClick: function(event) {
        if (event.id) {
            frappe.set_route("Form", "Farm Activity Schedule", event.id);
        }
    }
};
