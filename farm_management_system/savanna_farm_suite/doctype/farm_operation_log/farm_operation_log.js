// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Farm Operation Log", {
    refresh(frm) {
        // render immediately
        render_labour_cost_pie(frm);
        render_usage_analysis_bar(frm);

        // setup poll-based live-update (cleared and re-created on each refresh)
        if (frm.__chart_poll_interval) {
            clearInterval(frm.__chart_poll_interval);
            frm.__chart_poll_interval = null;
        }

        // baseline counts
        frm.__labour_count = (frm.doc.labourer_records || []).length;
        frm.__material_count = (frm.doc.material_records || []).length;

        // Poll every 2s for changes to child tables (simple & robust)
        frm.__chart_poll_interval = setInterval(() => {
            const newLabCount = (frm.doc.labourer_records || []).length;
            const newMatCount = (frm.doc.material_records || []).length;
            if (newLabCount !== frm.__labour_count) {
                frm.__labour_count = newLabCount;
                render_labour_cost_pie(frm);
            }
            if (newMatCount !== frm.__material_count) {
                frm.__material_count = newMatCount;
                render_usage_analysis_bar(frm);
            }
        }, 2000);
    },

    // cleanup when leaving the form (optional, prevents orphan timers)
    on_page_hide(frm) {
        if (frm.__chart_poll_interval) {
            clearInterval(frm.__chart_poll_interval);
            frm.__chart_poll_interval = null;
        }
    }
});

// ---------- Helpers ----------
function _safeFloat(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function _genColors(n) {
    const cols = [];
    for (let i = 0; i < n; i++) {
        const hue = Math.round((i * 137.5) % 360);
        cols.push(`hsl(${hue}, 65%, 60%)`);
    }
    return cols;
}

function _ensure_frappe_chart_available(field, on_ok, on_error) {
    if (window.frappe && window.frappe.Chart) {
        on_ok();
    } else {
        // show friendly message
        field.$wrapper.html("<div class='text-danger'>frappe.Chart not available on this page — cannot render charts.</div>");
        if (typeof on_error === "function") on_error();
    }
}

// ---------- Labour cost pie ----------
function render_labour_cost_pie(frm) {
    const field = frm.fields_dict.labour_cost_visualization;
    if (!field) return;

    // clear previous
    try { field.$wrapper.empty(); } catch (e) {}

    const rows = frm.doc.labourer_records || [];
    if (!rows.length) {
        field.$wrapper.html("<div class='text-muted'>No labourer records to visualize.</div>");
        // destroy existing chart handle if present
        if (frm.__labour_cost_chart) {
            try { frm.__labour_cost_chart.destroy(); } catch (e) {}
            frm.__labour_cost_chart = null;
        }
        return;
    }

    // build labels & values
    const labels = rows.map(r => (r.full_names || r.employee_name || "(Unknown)"));
    const values = rows.map(r => _safeFloat(r.voucher_amount));

    // create container div
    const container_id = `labour_pie_${(frm.doc.name || 'new').replace(/[^a-zA-Z0-9_-]/g,'_')}`;
    field.$wrapper.html(`<div id="${container_id}" style="width:100%;max-width:760px;height:360px;"></div>`);

    _ensure_frappe_chart_available(field, () => {
        // destroy previous chart (frappe.Chart doesn't always provide destroy; we attempt to remove node)
        if (frm.__labour_cost_chart) {
            try { frm.__labour_cost_chart.destroy(); } catch (e) {}
            frm.__labour_cost_chart = null;
        }

        const colors = _genColors(labels.length);

        // prepare data in frappe.Chart format
        const data = {
            labels: labels,
            datasets: [
                {
                    name: "Voucher Amount",
                    values: values
                }
            ]
        };

        // instantiate frappe.Chart
        frm.__labour_cost_chart = new frappe.Chart(`#${container_id}`, {
            title: "Labour Cost Distribution",
            data: data,
            type: 'pie',
            height: 360,
            colors: colors,
            is_series: true,
            donut: false,
            format_tooltip_x: d => d, // show label as-is
            format_tooltip_y: d => d // show numeric value as-is
        });
    }, () => {
        // already set friendly error in _ensure_frappe_chart_available
    });
}

// ---------- Usage analysis bar ----------
function render_usage_analysis_bar(frm) {
    const field = frm.fields_dict.usage_analysis;
    if (!field) return;

    try { field.$wrapper.empty(); } catch (e) {}

    const rows = frm.doc.material_records || [];
    if (!rows.length) {
        field.$wrapper.html("<div class='text-muted'>No material usage records to visualize.</div>");
        if (frm.__usage_analysis_chart) {
            try { frm.__usage_analysis_chart.destroy(); } catch (e) {}
            frm.__usage_analysis_chart = null;
        }
        return;
    }

    // We'll include UOM in label so hover shows it clearly: "Fertilizer (kg)"
    const labels = rows.map(r => {
        const name = r.farm_input_used || "(Unknown)";
        const uom = r.inputs_default_uom ? String(r.inputs_default_uom).trim() : "";
        return uom ? `${name} (${uom})` : name;
    });
    const values = rows.map(r => _safeFloat(r.quantity_of_agent_used));
    const colors = _genColors(labels.length);

    const container_id = `usage_bar_${(frm.doc.name || 'new').replace(/[^a-zA-Z0-9_-]/g,'_')}`;
    field.$wrapper.html(`<div id="${container_id}" style="width:100%;max-width:900px;height:420px;"></div>`);

    _ensure_frappe_chart_available(field, () => {
        if (frm.__usage_analysis_chart) {
            try { frm.__usage_analysis_chart.destroy(); } catch (e) {}
            frm.__usage_analysis_chart = null;
        }

        const data = {
            labels: labels,
            datasets: [
                {
                    name: "Quantity Used",
                    values: values
                }
            ]
        };

        frm.__usage_analysis_chart = new frappe.Chart(`#${container_id}`, {
            title: "Material Usage Analysis",
            data: data,
            type: 'bar',
            height: 420,
            colors: colors,
            is_series: true,
            axisOptions: {
                xIsSeries: true
            },
            tooltipOptions: {
                formatTooltipX: d => d,
                formatTooltipY: d => d
            },
            values_over_chart: true
        });
    }, () => {
        // no-op (friendly error shown earlier)
    });
}
