// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Crop Seedlings", {
	refresh(frm) {
		if (!frm.is_new()) {
			update_purchases(frm);
			update_stock_trends(frm);
		}
	},
});

// Render purchase history table (with Click to Review button)
function update_purchases(frm) {
    const fieldName = "history_of_purchases_made";
    const field = frm.fields_dict && frm.fields_dict[fieldName];

    const renderIntoFieldWrapper = (html) => {
        if (field && field.$wrapper) {
            field.$wrapper.html(html);
        } else {
            // fallback - set value (won't render as HTML widget)
            frm.set_value(fieldName, html);
            frm.refresh_field(fieldName);
        }
    };

    if (!frm.doc.name) {
        renderIntoFieldWrapper("<p>No seedling name specified.</p>");
        return;
    }

    // Call purchase history API
    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_purchase_history",
        args: { seedling_name: frm.doc.name },
        freeze: true,
        freeze_message: __("Loading purchase history...")
    }).then((r) => {
        const rows = (r && r.message) || [];
        if (!Array.isArray(rows) || rows.length === 0) {
            renderIntoFieldWrapper("<p>No purchase history found.</p>");
            return;
        }

        const escape = frappe.utils.escape_html;
        const formatDate = (d) => d ? frappe.datetime.str_to_user(d) : "";
        const userCurrency = (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "USD";
        const formatCurrency = (amt) => {
            const num = Number(amt) || 0;
            try {
                return new Intl.NumberFormat(undefined, { style: "currency", currency: userCurrency }).format(num);
            } catch (e) {
                return num.toFixed(2);
            }
        };

        let html = `
            <div style="overflow-x:auto; margin-top:8px;">
            <table style="width:100%; border-collapse:collapse; font-size:14px; min-width:700px;">
                <thead>
                    <tr>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Receipt Date</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Supplier</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Receipt No</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Quantity Received</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:right; background:#f7f7f7;">Total Amount</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:center; background:#f7f7f7;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(row => {
            const posting_date = formatDate(row.posting_date || "");
            const supplier_name = escape(row.supplier_name || "");
            const name = escape(row.name || "");
            const quantity = escape(row.received_qty || "") + " " + escape(row.uom || "");
            const total_amount = formatCurrency(row.base_amount);

            // Build button which redirects to the Purchase Receipt form
            const btn = `<button type="button" class="btn btn-sm btn-default" onclick="frappe.set_route('Form','Purchase Receipt','${name.replace(/'/g, "\\'")}')"><strong>Click to Review</strong></button>`;

            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${posting_date}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${supplier_name}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${name}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${quantity}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:right;">${total_amount}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:center;">${btn}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            </div>
        `;

        renderIntoFieldWrapper(html);
    }).catch((err) => {
        console.error("Error fetching purchase history:", err);
        const msg = (err && err.message) ? frappe.utils.escape_html(err.message) : "Unknown error";
        renderIntoFieldWrapper(`<p style="color:red">Error loading purchase history: ${msg}</p>`);
    });
}

// Render stock trends chart + current summary into stock_trends using frappe.Chart if available
function update_stock_trends(frm) {
    const htmlField = "stock_trends";
    const field = frm.fields_dict && frm.fields_dict[htmlField];

    const fallback_render = (html) => {
        if (field && field.$wrapper) {
            field.$wrapper.html(html);
        } else {
            frm.set_value(htmlField, html);
            frm.refresh_field(htmlField);
        }
    };

    if (!frm.doc.name) {
        fallback_render("<p>No seedling name specified for stock trends.</p>");
        return;
    }

    // First, fetch purchase history for the chart
    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_purchase_history",
        args: { seedling_name: frm.doc.name },
        freeze: true,
        freeze_message: __("Loading stock trends...")
    }).then((r) => {
        const rows = (r && r.message) || [];

        const formatDate = (d) => d ? frappe.datetime.str_to_user(d) : "";
        const labels = rows.map(row => formatDate(row.posting_date || ""));
        const values = rows.map(row => Number(row.received_qty) || 0);

        // Now, fetch current stock summary
        frappe.call({
            method: "farm_management_system.savanna_farm_suite.doctype.crop_seedlings.crop_seedlings.get_current_stock",
            args: { item_code: frm.doc.name },
        }).then((s) => {
            const current = (s && s.message) || {};

            const qty = (current.qty_after_transaction !== undefined && current.qty_after_transaction !== null) ? current.qty_after_transaction : 0;
            const stock_value = (current.stock_value !== undefined && current.stock_value !== null) ? current.stock_value : 0;
            const valuation_rate = (current.valuation_rate !== undefined && current.valuation_rate !== null) ? current.valuation_rate : 0;

            // Format with Shs.
            const stockValueFormatted = `Shs. ${Number(stock_value).toFixed(2)}`;
            const valuationRateFormatted = `Shs. ${Number(valuation_rate).toFixed(2)}`;

            // Build container HTML inside the field wrapper
            if (field && field.$wrapper) {
                const $w = field.$wrapper;
                // clear existing content (and any previous chart)
                $w.empty();

                // create chart + summary containers
                const chartId = `stock_trends_chart_${htmlField}`;
                $w.append(`
                    <div id="${chartId}" style="width:100%; height:320px; box-sizing:border-box;"></div>
                    <div class="stock-summary" style="margin-top:12px;"></div>
                `);

                const $chartDiv = $w.find(`#${chartId}`)[0];
                const $summaryDiv = $w.find('.stock-summary');

                // If frappe.Chart exists, use it. Otherwise fallback to a simple div chart.
                if (typeof frappe.Chart !== 'undefined') {
                    try {
                        // Remove any previous chart instance DOM inside container
                        $chartDiv.innerHTML = "";

                        // Build data object expected by frappe-charts
                        const chartData = {
                            labels: labels,
                            datasets: [
                                {
                                    name: __("Received Quantity"),
                                    values: values
                                }
                            ]
                        };
                        new frappe.Chart($chartDiv, {
                            title: __("Stock Trends"),
                            data: chartData,
                            type: 'bar',
                            height: 300,
                            colors: ['#2fc509dc']
                        });
                    } catch (err) {
                        console.error("frappe.Chart failed, falling back to simple bars:", err);
                        // fallback simple chart if frappe.Chart errors
                        $chartDiv.innerHTML = build_div_bar_chart_html(labels, values);
                    }
                } else {
                    // fallback: simple CSS bar chart
                    $chartDiv.innerHTML = build_div_bar_chart_html(labels, values);
                }

                // Render current stock summary (bold red)
                const summaryHtml = `
                    <div style="padding:8px; border-top:1px dashed #eee;">
                        <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Level: ${frappe.utils.escape_html(String(qty))}</div>
                        <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Value: ${frappe.utils.escape_html(stockValueFormatted)}</div>
                        <div style="color:red; font-weight:bold;">Current Valuation Rate: ${frappe.utils.escape_html(valuationRateFormatted)}</div>
                    </div>
                `;
                $summaryDiv.html(summaryHtml);

            } else {
                // no wrapper available: fallback to set_value (non-rendering possibly)
                const html = `
                    <div>
                        ${build_div_bar_chart_html(labels, values)}
                        <div style="margin-top:12px;">
                            <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Level: ${frappe.utils.escape_html(String(qty))}</div>
                            <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Value: ${frappe.utils.escape_html(stockValueFormatted)}</div>
                            <div style="color:red; font-weight:bold;">Current Valuation Rate: ${frappe.utils.escape_html(valuationRateFormatted)}</div>
                        </div>
                    </div>
                `;
                frm.set_value(htmlField, html);
                frm.refresh_field(htmlField);
            }
        }).catch((err) => {
            console.error("Error fetching current stock:", err);
            fallback_render(`<p style="color:red">Error loading current stock: ${frappe.utils.escape_html(err.message || "Unknown error")}</p>`);
        });
    }).catch((err) => {
        console.error("Error fetching purchase history for trends:", err);
        const msg = (err && err.message) ? frappe.utils.escape_html(err.message) : "Unknown error";
        fallback_render(`<p style="color:red">Error loading stock trends: ${msg}</p>`);
    });

    // helper to build the simple bar chart HTML (used as fallback)
    function build_div_bar_chart_html(labels, values) {
        const maxVal = Math.max.apply(null, values) || 1;
        let chartHtml = `
            <div style="margin-top:6px;">
                <div style="height:220px; display:flex; align-items:flex-end; gap:8px; padding:12px; border:1px solid #eee; background:#fff; overflow-x:auto;">
        `;
        values.forEach((v, idx) => {
            const pct = (v / maxVal) * 100;
            chartHtml += `
                <div style="flex:0 0 48px; text-align:center;">
                    <div title="${v}" style="height:${Math.max(pct, 1)}%; min-height:6px; background:#3b82f6; border-radius:4px; margin-bottom:6px; display:flex; align-items:flex-end; justify-content:center;"></div>
                    <div style="font-size:11px; margin-top:4px; white-space:nowrap; transform: rotate(-45deg); transform-origin: left; width:80px; display:inline-block;">
                        ${frappe.utils.escape_html(labels[idx])}
                    </div>
                </div>
            `;
        });
        chartHtml += `
                </div>
                <div style="margin-top:8px; font-size:12px;">
                    <small>Bar chart from oldest → newest (x: receipt date, y: received quantity)</small>
                </div>
            </div>
        `;
        return chartHtml;
    }
}