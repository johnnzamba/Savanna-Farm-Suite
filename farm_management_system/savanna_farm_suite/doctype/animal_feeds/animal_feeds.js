// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Animal Feeds", {
    refresh(frm) {
        update_cost_description(frm);
        update_stock_history(frm);
        update_purchases(frm);
        if (frm.is_new()){
            frm.set_query('select_animal_category', 'table_bytk', function(doc, cdt, cdn) {
            const row = locals[cdt][cdn];
                if (!row.select_type_of_animal) {
                    // frappe.msgprint({
                    //     title: __('Warning'),
                    //     indicator: 'orange',
                    //     message: __('Please select an animal type first.')
                    // });
                    return {};
                }
                console.log(`Fetching categories for animal: ${row.select_type_of_animal}`);
                return {
                    query: 'farm_management_system.savanna_farm_suite.doctype.animal_feeds.animal_feeds.get_animal_categories',
                    filters: { animal: row.select_type_of_animal }
                };
            });

            // Set query for animal_life_cycle in table_bytk
            frm.set_query('animal_life_cycle', 'table_bytk', function(doc, cdt, cdn) {
                const row = locals[cdt][cdn];
                if (!row.select_type_of_animal) {
                    return {};
                }
                return {
                    filters: { applicable_for: row.select_type_of_animal }
                };
            });

            // Set query for measure_in to limit to UOMs selected in parent doc
            frm.set_query('measure_in', 'table_bytk', function(doc, cdt, cdn) {
                let selected_uoms = [];
                if (frm.doc.uom) {
                    if (Array.isArray(frm.doc.uom)) {
                        selected_uoms = frm.doc.uom.map(r => r.uom || r.uom_name).filter(Boolean);
                    } else if (typeof frm.doc.uom === 'string' && frm.doc.uom.trim()) {
                        selected_uoms = frm.doc.uom.split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
                return selected_uoms.length ? { filters: [['name', 'in', selected_uoms]] } : {};
            });
        }

    },
    uom(frm) {
        update_cost_description(frm);
        // update_measure_in_options(frm);
    }
});

function update_cost_description(frm) {
    if (frm.doc.uom && frm.doc.uom.length > 0) {
        const uom_values = frm.doc.uom.map(item => item.uom).join(" | ");
        frm.set_df_property("cost_of_the_feed", "description", `Cost will be Computed per <strong>${uom_values}</strong>`);
    } else {
        frm.set_df_property("cost_of_the_feed", "description", "");
    }
}

frappe.ui.form.on('Animal and Feed Formulation', {
    // refresh(frm) {
    //     if (frm.doc.is_new()) {
    //         // Set query for select_animal_category in table_bytk
    //         frm.set_query('select_animal_category', 'table_bytk', function(doc, cdt, cdn) {
    //             const row = locals[cdt][cdn];
    //             if (!row.select_type_of_animal) {
    //                 // frappe.msgprint({
    //                 //     title: __('Warning'),
    //                 //     indicator: 'orange',
    //                 //     message: __('Please select an animal type first.')
    //                 // });
    //                 return {};
    //             }
    //             return {
    //                 query: 'farm_management_system.savanna_farm_suite.doctype.animal_feeds.animal_feeds.get_animal_categories',
    //                 filters: { animal: row.select_type_of_animal }
    //             };
    //         });

    //         // Set query for animal_life_cycle in table_bytk
    //         frm.set_query('animal_life_cycle', 'table_bytk', function(doc, cdt, cdn) {
    //             const row = locals[cdt][cdn];
    //             if (!row.select_type_of_animal) {
    //                 return {};
    //             }
    //             return {
    //                 filters: { applicable_for: row.select_type_of_animal }
    //             };
    //         });

    //         // Set query for measure_in to limit to UOMs selected in parent doc
    //         frm.set_query('measure_in', 'table_bytk', function(doc, cdt, cdn) {
    //             let selected_uoms = [];
    //             if (frm.doc.uom) {
    //                 if (Array.isArray(frm.doc.uom)) {
    //                     selected_uoms = frm.doc.uom.map(r => r.uom || r.uom_name).filter(Boolean);
    //                 } else if (typeof frm.doc.uom === 'string' && frm.doc.uom.trim()) {
    //                     selected_uoms = frm.doc.uom.split(',').map(s => s.trim()).filter(Boolean);
    //                 }
    //             }
    //             return selected_uoms.length ? { filters: [['name', 'in', selected_uoms]] } : {};
    //         });
    //     }
    // },

    select_type_of_animal(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        // Clear dependent fields when select_type_of_animal changes
        frappe.model.set_value(cdt, cdn, 'select_animal_category', null);
        frappe.model.set_value(cdt, cdn, 'animal_life_cycle', null);
        frm.refresh_field('table_bytk');
        
        // Debug: Log the selected animal type
        console.log(`Selected animal type: ${row.select_type_of_animal}`);
    }
});

// Render purchase history table (with Check Receipt button)
function update_purchases(frm) {
    const fieldName = "history_of_feed_purchases";
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

    if (!frm.doc.feed_name) {
        renderIntoFieldWrapper("<p>No feed name specified.</p>");
        return;
    }

    // Call existing purchase history API
    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.animal_feeds.animal_feeds.get_purchase_history",
        args: { feed_name: frm.doc.feed_name },
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
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Receipt No</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Receipt Date</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Supplied By</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:left; background:#f7f7f7;">Quantity</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:right; background:#f7f7f7;">Total Amount</th>
                        <th style="border:1px solid #ddd; padding:8px; text-align:center; background:#f7f7f7;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(row => {
            const receipt_no = escape(row.receipt_no || "");
            const receipt_date = formatDate(row.receipt_date || "");
            const supplier_name = escape(row.supplier_name || "");
            const quantity = escape(row.quantity || "");
            const total_amount = formatCurrency(row.total_amount);

            // Build button which redirects to the Purchase Receipt form
            // Use onclick with frappe.set_route to open the doc
            const btn = `<button type="button" class="btn btn-sm btn-default" onclick="frappe.set_route('Form','Purchase Receipt','${receipt_no.replace(/'/g, "\\'")}')"><strong>Check Receipt</strong></button>`;

            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${receipt_no}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${receipt_date}</td>
                    <td style="border:1px solid #ddd; padding:8px; text-align:left;">${supplier_name}</td>
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

// Render stock history chart + current summary into doc.html_dgyh using frappe.Chart if available
function update_stock_history(frm) {
    const htmlField = "html_dgyh";
    const field = frm.fields_dict && frm.fields_dict[htmlField];

    const fallback_render = (html) => {
        if (field && field.$wrapper) {
            field.$wrapper.html(html);
        } else {
            frm.set_value(htmlField, html);
            frm.refresh_field(htmlField);
        }
    };

    if (!frm.doc.feed_name) {
        fallback_render("<p>No feed name specified for stock history.</p>");
        return;
    }

    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.animal_feeds.animal_feeds.get_item_stock_history",
        args: { feed_name: frm.doc.feed_name },
        freeze: true,
        freeze_message: __("Loading stock history...")
    }).then((r) => {
        const data = (r && r.message) || { entries: [], current: {} };
        const entries = data.entries || [];
        const current = data.current || {};

        if (!entries.length) {
            fallback_render("<p>No stock ledger entries found for this feed.</p>");
            return;
        }

        // Prepare labels (oldest -> newest) and values
        const labels = entries.map(e => frappe.datetime.str_to_user(e.posting_date || e.posting_datetime || ""));
        const values = entries.map(e => Number(e.qty_after_transaction) || 0);

        // Prepare summary values (latest = newest entry)
        const qty = (current.qty_after_transaction !== undefined && current.qty_after_transaction !== null) ? current.qty_after_transaction : "";
        const stock_value = (current.stock_value !== undefined && current.stock_value !== null) ? current.stock_value : "";
        const valuation_rate = (current.valuation_rate !== undefined && current.valuation_rate !== null) ? current.valuation_rate : "";

        // Format stock_value with system currency if present
        const userCurrency = (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "USD";
        let stockValueFormatted = "";
        try {
            stockValueFormatted = (stock_value !== "") ? new Intl.NumberFormat(undefined, { style: "currency", currency: userCurrency }).format(Number(stock_value)) : "";
        } catch (e) {
            stockValueFormatted = stock_value;
        }

        // Build container HTML inside the field wrapper
        if (field && field.$wrapper) {
            const $w = field.$wrapper;
            // clear existing content (and any previous chart)
            $w.empty();

            // create chart + summary containers
            const chartId = `stock_history_chart_${htmlField}`;
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
                                name: __("Qty After Transaction"),
                                values: values
                            }
                        ]
                    };
                    new frappe.Chart($chartDiv, {
                        title: __("Stock over time"),
                        data: chartData,
                        type: 'line',
                        height: 300,
                        colors: ['#03c4ff']
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
                    <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Quantity: ${frappe.utils.escape_html(String(qty))}</div>
                    <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Value: ${frappe.utils.escape_html(String(stockValueFormatted))}</div>
                    <div style="color:red; font-weight:bold;">Current Valuation Rate: ${frappe.utils.escape_html(String(valuation_rate))}</div>
                </div>
            `;
            $summaryDiv.html(summaryHtml);

        } else {
            // no wrapper available: fallback to set_value (non-rendering possibly)
            const html = `
                <div>
                    ${build_div_bar_chart_html(labels, values)}
                    <div style="margin-top:12px;">
                        <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Quantity: ${frappe.utils.escape_html(String(qty))}</div>
                        <div style="color:red; font-weight:bold; margin-bottom:6px;">Current Stock Value: ${frappe.utils.escape_html(String(stockValueFormatted))}</div>
                        <div style="color:red; font-weight:bold;">Current Valuation Rate: ${frappe.utils.escape_html(String(valuation_rate))}</div>
                    </div>
                </div>
            `;
            frm.set_value(htmlField, html);
            frm.refresh_field(htmlField);
        }
    }).catch((err) => {
        console.error("Error fetching stock history:", err);
        const msg = (err && err.message) ? frappe.utils.escape_html(err.message) : "Unknown error";
        fallback_render(`<p style="color:red">Error loading stock history: ${msg}</p>`);
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
                    <small>Bar chart from oldest → newest (x: posting date, y: qty after transaction)</small>
                </div>
            </div>
        `;
        return chartHtml;
    }
}
