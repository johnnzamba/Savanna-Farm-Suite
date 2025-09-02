// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Feeding and Watering Tool", {
	refresh: function(frm) {
		if (frm.doc.nourishment_date) {
			render_record_field(frm);
		}
		try {
			frm.disable_save();
			frm.page.set_primary_action(__("Process Record"), function() {
				process_record_action(frm);
			});

			// Style the primary button to be black (primary text stays white)
			if (frm.page && frm.page.btn_primary) {
				frm.page.btn_primary.css({
					"background": "#000",
					"border-color": "#000",
					"color": "#fff"
				});
			}
		} catch (e) {
			console.error("Failed to set primary button:", e);
		}

		// Set nourishment_date to today() and user to session user if not already set
		if (!frm.doc.nourishment_date) {
			frm.set_value("nourishment_date", frappe.datetime.get_today());
		}
		if (!frm.doc.user) {
			frm.set_value("user", (frappe.session && frappe.session.user) || frappe.utils.get_logged_in_user && frappe.utils.get_logged_in_user());
		}

		// If specify_animal already set on refresh, attempt to prefill table_ycas
		if (frm.doc.specify_animal) {
			fetch_and_prefill_feeds(frm, frm.doc.specify_animal);
		}
	},

	// When specify_animal changes, fetch and prefill the matching Animal Feeds
	specify_animal: function(frm) {
		if (frm.doc.specify_animal) {
			fetch_and_prefill_feeds(frm, frm.doc.specify_animal);
		} else {
			// clear existing table if user cleared the field
			frm.clear_table("table_ycas");
			frm.refresh_field("table_ycas");
		}
	},

	nourishment_date: function(frm) {
		if (frm.doc.nourishment_date) {
			render_record_field(frm);
		} else {
			render_html_field(frm, "record", "<p>No nourishment date selected.</p>");
		}
	}

});

frappe.ui.form.on('Nourishment Table', {
	animal_feed(frm, cdt, cdn) {
		// Get the current row
		const row = locals[cdt][cdn];
		if (!row.animal_feed) {
			frappe.model.set_value(cdt, cdn, 'animal_feed_name', '');
			frappe.model.set_value(cdt, cdn, 'feed_default_uom', '');
			frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
			return;
		}
		frappe.db.get_doc('Animal Feeds', row.animal_feed)
			.then(doc => {
				// Extract feed_name
				const feed_name = (doc.feed_name || '').trim();

				// Extract uom from Table MultiSelect field
				let uom_value = '';
				if (doc.uom && doc.uom.length > 0 && doc.uom[0].uom) {
					uom_value = doc.uom[0].uom;
				}

				// Set animal_feed_name and feed_default_uom
				frappe.model.set_value(cdt, cdn, 'animal_feed_name', feed_name);
				frappe.model.set_value(cdt, cdn, 'feed_default_uom', uom_value);

				// If feed_name exists, fetch stock balance from Stock Ledger Entry
				if (feed_name) {
					// Find Item matching feed_name
					frappe.db.get_list('Item', {
						filters: { item_code: feed_name },
						fields: ['name']
					}).then(items => {
						if (!items || !items.length) {
							frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
							return;
						}

						const item_name = items[0].name;

						// Fetch default warehouse from Item Defaults
						frappe.db.get_doc('Item', item_name)
							.then(item_doc => {
								const item_defaults = item_doc.item_defaults || [];
								const warehouse = item_defaults.length > 0 ? item_defaults[0].default_warehouse : null;

								if (!warehouse) {
									frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
									return;
								}

								// Fetch latest Stock Ledger Entry for item and warehouse
								frappe.db.get_list('Stock Ledger Entry', {
									filters: {
										item_code: item_name,
										warehouse: warehouse
									},
									fields: ['qty_after_transaction'],
									order_by: 'creation desc',
									limit: 1
								}).then(sle_rows => {
									const stock_balance = sle_rows.length > 0 ? flt(sle_rows[0].qty_after_transaction) : 0.0;
									frappe.model.set_value(cdt, cdn, 'current_available_stock', stock_balance);
								}).catch(err => {
									// frappe.msgprint({
									// 	title: __('Error'),
									// 	message: __('Failed to fetch stock balance: ') + err.message,
									// 	indicator: 'red'
									// });
									frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
								});
							}).catch(err => {
								// frappe.msgprint({
								// 	title: __('Error'),
								// 	message: __('Failed to fetch Item details: ') + err.message,
								// 	indicator: 'red'
								// });
								frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
							});
					}).catch(err => {
						// frappe.msgprint({
						// 	title: __('Error'),
						// 	message: __('Failed to fetch Item: ') + err.message,
						// 	indicator: 'red'
						// });
						frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
					});
				} else {
					frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
				}
			}).catch(err => {
				frappe.msgprint({
					title: __('Error'),
					message: __('Failed to fetch Animal Feeds: ') + err.message,
					indicator: 'red'
				});
				// Clear fields on error
				frappe.model.set_value(cdt, cdn, 'animal_feed_name', '');
				frappe.model.set_value(cdt, cdn, 'feed_default_uom', '');
				frappe.model.set_value(cdt, cdn, 'current_available_stock', 0.0);
			});
	}
});

// Fetch matching Animal Feeds from server and prefill table_ycas
function fetch_and_prefill_feeds(frm, specify_animal_value) {
	frappe.call({
		method: "farm_management_system.savanna_farm_suite.doctype.feeding_and_watering_tool.feeding_and_watering_tool.get_animal_feeds_by_animal",
		args: { specify_animal: specify_animal_value },
		freeze: true,
		freeze_message: __("Searching feeds for {0}...", [specify_animal_value])
	}).then(function(r) {
		const matches = (r && r.message) || [];
		// Clear existing rows
		frm.clear_table("table_ycas");

		// Add rows for each match (only 1 UOM if it's multiselect, we used server side first-one strategy)
		matches.forEach(function(m) {
			const row = frm.add_child("table_ycas");
			row.animal_feed = m.name;
			row.animal_feed_name = m.feed_name;
			row.feed_default_uom = m.uom || "";
            row.current_available_stock = m.stock || "";
			// Default qty to 0 so user can set if needed
			row.qty = row.qty || 0;
		});

		frm.refresh_field("table_ycas");
	}).catch(function(err) {
		console.error("Error fetching animal feeds:", err);
		frappe.msgprint({ title: __("Error"), message: __("Could not fetch matching feeds. See console for details."), indicator: "red" });
	});
}


// Handler executed when primary "Process Record" button is clicked
function process_record_action(frm) {
	// Basic validation: ensure table_ycas has rows
	const rows = frm.doc.table_ycas || [];
	if (!rows.length) {
		frappe.show_alert({ message: __("No feeds found in table_ycas to process."), indicator: "orange" });
		return;
	}

	// Collect payload
	const payload_rows = rows.map(r => ({
		animal_feed: r.animal_feed,
		feed_default_uom: r.feed_default_uom,
		qty: (typeof r.qty !== "undefined" && r.qty !== null) ? r.qty : 0
	}));

	const args = {
		nourishment_date: frm.doc.nourishment_date || frappe.datetime.get_today(),
		user: frm.doc.user || (frappe.session && frappe.session.user),
		table_rows: JSON.stringify(payload_rows),
		poultry_batch: frm.doc.poultry_batch || null,
		poultry_house: frm.doc.poultry_house || null,
		incl_hydration: (frm.doc.incl_hydration ? true : false)
	};

	// Show confirmation dialog before proceeding
	frappe.warn(
		__('Are you sure you want to proceed?'),
		__('NOTE: Feeding and Watering Logs CANNOT be changed.'),
		() => {
			// User clicked Continue - proceed with processing
			process_nourishment_logs(frm, args);
		},
		__('Continue'),
		true // Sets dialog as minimizable
	);
}

// Separate function to handle the actual processing after confirmation
function process_nourishment_logs(frm, args) {
	// Freeze UI
	frappe.dom.freeze(__("Processing Nourishment Logs..."));

	// Call server to create logs
	frappe.call({
		method: "farm_management_system.savanna_farm_suite.doctype.feeding_and_watering_tool.feeding_and_watering_tool.create_nourishment_logs",
		args: args,
	}).then(function(r) {
		frappe.dom.unfreeze();

		const created = (r && r.message) || [];
		if (created.length) {
			// Notify user with doc names created
			const namesText = created.join(", ");
			frappe.show_alert({
				message: __("Created and submitted: {0}", [namesText]),
				indicator: "green"
			});
			
			// Play success sound
			frappe.utils.play_sound('success');
		} else {
			frappe.show_alert({
				message: __("No Nourishment Logs were created. Check server logs or permissions."),
				indicator: "orange"
			});
		}

		// Clear form fields used and refresh for a fresh run
		clear_form_after_processing(frm);
	}).catch(function(err) {
		frappe.dom.unfreeze();
		console.error("Error creating Nourishment Logs:", err);
		frappe.show_alert({
			message: __("Error creating Nourishment Logs. See console for details."),
			indicator: "red"
		});
	});
}


// Clear the fields that had values and prepare the form for another run
function clear_form_after_processing(frm) {
	// Fields to clear - adjust if you have more fields to reset
	const fields_to_clear = [
		"specify_animal",
		"poultry_batch",
		"poultry_house",
		"table_ycas",
		"incl_hydration"
	];

	fields_to_clear.forEach(function(fn) {
		if (fn === "table_ycas") {
			frm.clear_table(fn);
			frm.refresh_field(fn);
		} else {
			frm.set_value(fn, null);
			frm.refresh_field(fn);
		}
	});

	// Clear nourishment_date and user as requested
	frm.set_value("nourishment_date", null);
	frm.set_value("user", null);

	// Refresh entire form
	frm.refresh();
}


function render_html_field(frm, fieldname, html) {
	const field = frm.fields_dict && frm.fields_dict[fieldname];
	if (field && field.$wrapper) {
		field.$wrapper.html(html);
	} else {
		// fallback: store value (may not render nicely)
		frm.set_value(fieldname, html);
		frm.refresh_field(fieldname);
	}
}

/* ---------- Main renderer ---------- */
function render_record_field(frm) {
	// ensure field exists
	if (!frm.doc.nourishment_date) {
		render_html_field(frm, "record", "<p>Please select a nourishment_date to view the last week's logs.</p>");
		return;
	}
	const selected = frm.doc.nourishment_date;
	const dates_table = [];
	for (let i = 1; i <= 7; i++) {
		const d = frappe.datetime.add_days(selected, -i);
		dates_table.push(d); 
	}
	const start_date = dates_table[dates_table.length - 1]; // oldest
	const end_date = dates_table[0]; // newest (selected -1)
	const today = frappe.datetime.get_today();
	const chart_dates = [];
	for (let i = 7; i >= 1; i--) {
		chart_dates.push(frappe.datetime.add_days(today, -i)); // earliest -> latest
	}
	const chart_start = chart_dates[0];
	const chart_end = chart_dates[chart_dates.length - 1];

	// call server for both ranges in parallel (two calls)
	const call_table = frappe.call({
		method: "farm_management_system.savanna_farm_suite.doctype.feeding_and_watering_tool.feeding_and_watering_tool.get_nourishment_logs_by_date_range",
		args: { start_date: start_date, end_date: end_date }
	});

	const call_chart = frappe.call({
		method: "farm_management_system.savanna_farm_suite.doctype.feeding_and_watering_tool.feeding_and_watering_tool.get_nourishment_logs_by_date_range",
		args: { start_date: chart_start, end_date: chart_end }
	});

	// Wait for both to complete
	Promise.all([call_table, call_chart]).then(function(results) {
		let table_res = (results[0] && results[0].message) || [];
		let chart_res = (results[1] && results[1].message) || [];

		// Normalize date strings from server to YYYY-MM-DD
		table_res = normalize_rows_dates(table_res);
		chart_res = normalize_rows_dates(chart_res);

		// Render pivot table for table_res using dates_table (newest -> oldest)
		const table_html = build_pivot_table_html(dates_table, table_res);
		// Render chart (avg_consumption) for chart_res using chart_dates (earliest -> latest)
		const chart_html = build_chart_container_html();

		// Combine and render into HTML field 'record'
		const full_html = `
			<div class="nourishment-record">
				${table_html}
				<div style="height:18px;"></div>
				${chart_html}
			</div>
		`;
		render_html_field(frm, "record", full_html);

		// After injecting DOM, instantiate the frappe.Chart in the chart container
		try {
			render_avg_consumption_chart(chart_res, chart_dates, "nourishment_chart_container");
		} catch (err) {
			console.error("Chart render error:", err);
			// fallback: append a simple message (chart area already exists)
			const field = frm.fields_dict && frm.fields_dict["record"];
			if (field && field.$wrapper) {
				$(field.$wrapper).find("#nourishment_chart_container").html("<p style='color:orange'>Unable to render chart. See console for details.</p>");
			}
		}
	}).catch(function(err) {
		console.error("Error fetching nourishment logs:", err);
		render_html_field(frm, "record", `<p style="color:red">Error loading nourishment logs: ${frappe.utils.escape_html(err.message || String(err))}</p>`);
	});
}

// Normalize rows' date strings to YYYY-MM-DD
function normalize_rows_dates(rows) {
	return (rows || []).map(r => {
		let d = r.date_of_nourishment;
		try {
			// Try Frappe helper first
			const obj = frappe.datetime.str_to_obj(String(d));
			if (obj) {
				// obj_to_str returns YYYY-MM-DD
				d = frappe.datetime.obj_to_str(obj);
			}
		} catch (e) {
			// Fallback: trim time portion if present
			if (typeof d === 'string' && d.length >= 10) {
				d = d.slice(0, 10);
			}
		}
		return Object.assign({}, r, { date_of_nourishment: d });
	});
}

/* ---------- Build pivot table HTML ---------- */
function build_pivot_table_html(dates_table, rows) {
	// dates_table is array of 'YYYY-MM-DD' newest -> oldest
	// rows: array of logs { name, date_of_nourishment, feed_issued, qty_issued, default_uom, avg_consumption }

	// Find distinct feed_issued values (sorted)
	const feeds = Array.from(new Set(rows.map(r => r.animal_feed_name).filter(Boolean))).sort();

	// Header: show display dates in user format (same order as dates_table)
	const headers = dates_table.map(d => frappe.datetime.str_to_user(d));

	// Build header row
	let html = `
		<div style="overflow-x:auto;">
			<table style="width:100%; border-collapse:collapse; font-size:13px; min-width:700px;">
				<thead>
					<tr>
						<th style="border:1px solid #ddd; padding:8px; background:#f7f7f7; text-align:left;">Feed Issued</th>
	`;
	headers.forEach(h => {
		html += `<th style="border:1px solid #ddd; padding:8px; background:#f7f7f7; text-align:center;">${frappe.utils.escape_html(h)}</th>`;
	});
	html += `</tr></thead><tbody>`;

	// For each feed, build row cells for each date (newest -> oldest)
	if (feeds.length === 0) {
		// if no feeds found in the rows, show a helpful message with the date columns still present
		html += `<tr><td style="border:1px solid #ddd; padding:8px;" colspan="${1 + headers.length}">No Nourishment Logs found in the selected date window.</td></tr>`;
	} else {
		feeds.forEach(feed => {
			html += `<tr>`;
			html += `<td style=\"border:1px solid #ddd; padding:8px; vertical-align:top; font-weight:600;\">${frappe.utils.escape_html(feed)}</td>`;

			dates_table.forEach(date => {
				// find logs for this feed and date
				const cell_logs = rows.filter(r => r.animal_feed_name === feed && r.date_of_nourishment === date);
				if (!cell_logs.length) {
					html += `<td style="border:1px solid #ddd; padding:8px; text-align:center; color:#666;">—</td>`;
				} else {
					// show each log as qty + default_uom; new line for each
					const lines = cell_logs.map(l => {
						const qty = (typeof l.qty_issued !== "undefined" && l.qty_issued !== null) ? String(l.qty_issued) : "";
						const uom = l.default_uom ? ` ${l.default_uom}` : "";
						return `<div style="margin-bottom:6px;">${frappe.utils.escape_html(qty + uom)}</div>`;
					}).join("");
					html += `<td style="border:1px solid #ddd; padding:8px; vertical-align:top;">${lines}</td>`;
				}
			});

			html += `</tr>`;
		});
	}

	html += `</tbody></table></div>`;
	return html;
}


/* ---------- Build chart container HTML ---------- */
function build_chart_container_html() {
	// chart has its own container id
	return `
		<div style="margin-top:12px;">
			<div id="nourishment_chart_container" style="width:100%; height:360px; box-sizing:border-box;"></div>
			<div style="margin-top:8px; font-size:12px; color:#666;">
				<small>Bar chart of Average Consumption by feed (last 7 days excluding today). Hover over bars to see feed name and value.</small>
			</div>
		</div>
	`;
}

/* ---------- Render avg_consumption chart (frappe.Chart) ---------- */
function render_avg_consumption_chart(rows, chart_dates, container_id) {
    // rows: list of logs within chart date range
    // chart_dates: array of 'YYYY-MM-DD' earliest -> latest

    // Normalize dates in rows to match chart_dates
    rows = normalize_rows_dates(rows);

    // Robustly find feed key and uom key from row objects
    const getFeed = (r) => r.animal_feed_name || r.feed_issued || r.animal_feed || "";
    const getUom = (r) => r.default_uom || r.feed_default_uom || r.uom || "";

    // Build mapping feed -> uom (take first non-empty found)
    const feed_uom_map = {};
    rows.forEach(r => {
        const feed = getFeed(r);
        if (!feed) return;
        const uom = getUom(r) || "";
        if (!feed_uom_map[feed] && uom) {
            feed_uom_map[feed] = uom;
        } else if (!feed_uom_map[feed]) {
            feed_uom_map[feed] = ""; // ensure key exists
        }
    });

    // Build distinct feed list (sorted)
    const feeds = Array.from(new Set(rows.map(r => getFeed(r)).filter(Boolean))).sort();

    // Build date -> index map
    const dateIndex = {};
    chart_dates.forEach((d, i) => dateIndex[d] = i);

    // Prepare accumulators for sums and counts (for averaging)
    const datasets_map = {};
    const counts_map = {};
    feeds.forEach(feed => {
        datasets_map[feed] = new Array(chart_dates.length).fill(0);
        counts_map[feed] = new Array(chart_dates.length).fill(0);
    });

    rows.forEach(r => {
        const feed = getFeed(r);
        const date = (r.date_of_nourishment || "").split(' ')[0]; // normalize
        if (!feed || !date || typeof dateIndex[date] === "undefined") return;
        const idx = dateIndex[date];
        const avg = Number(r.avg_consumption) || 0;
        datasets_map[feed][idx] += avg;
        counts_map[feed][idx] += 1;
    });

    // finalize averages and build dataset objects with feed name + uom
    const datasets = [];
    feeds.forEach(feed => {
        const values = datasets_map[feed].map((sum, i) => {
            const cnt = counts_map[feed][i] || 0;
            return cnt ? (sum / cnt) : 0;
        });
        const uom = feed_uom_map[feed] || "";
        const series_name = uom ? `${feed} (${uom})` : feed;
        datasets.push({
            name: series_name,
            values: values,
            feed: feed,
            uom: uom
        });
    });

    // Render area
    const container = document.getElementById(container_id);
    if (!container) {
        console.warn("Chart container not found:", container_id);
        return;
    }
    container.innerHTML = "";

    if (typeof frappe.Chart !== "undefined" && datasets.length) {
        // Chart-ready data: frappe.Chart expects name and values
        const chartData = {
            labels: chart_dates.map(d => frappe.datetime.str_to_user(d)),
            datasets: datasets.map(ds => ({ name: ds.name, values: ds.values }))
        };

        // Random color per series
        const colors = datasets.map(() => random_color_hex());

        new frappe.Chart(container, {
            title: __("Avg Consumption (last 7 days)"),
            data: chartData,
            type: 'bar',
            height: 340,
            colors: colors
        });
    } else {
        // fallback: build grouped bar HTML including unit in headings and title attributes
        container.innerHTML = build_simple_grouped_bar_html_with_uom(datasets, chart_dates);
    }
}


/* ---------- Fallback grouped bar HTML (if frappe.Chart missing) - includes UOM in hover/title ---------- */
function build_simple_grouped_bar_html_with_uom(datasets, chart_dates) {
    if (!datasets.length) {
        return `<div style="padding:12px; color:#666">No avg_consumption data available for the last 7 days.</div>`;
    }

    // compute global max for scaling
    let maxVal = 0;
    datasets.forEach(ds => ds.values.forEach(v => { if (v > maxVal) maxVal = v; }));
    if (maxVal <= 0) maxVal = 1;

    let html = `<div style="display:flex; gap:12px; align-items:flex-end; padding:12px; overflow:auto;">`;

    datasets.forEach(ds => {
        // ds.name already contains unit in parentheses when available
        const color = random_color_hex();
        // extract displayName and uom from ds.name if present
        let displayName = ds.name;
        let uom = ds.uom || "";
        if (!uom) {
            const m = ds.name.match(/\(([^)]+)\)\s*$/);
            if (m) {
                uom = m[1];
                displayName = ds.name.replace(/\s*\([^)]+\)$/, "");
            }
        }

        html += `<div style="min-width:140px; text-align:center;">`;
        html += `<div style="font-weight:600; margin-bottom:8px;">${frappe.utils.escape_html(displayName)}${uom ? ' <small style="color:#666">(' + frappe.utils.escape_html(uom) + ')</small>' : ''}</div>`;
        html += `<div style="display:flex; flex-direction:column; gap:6px; align-items:center;">`;

        ds.values.forEach((v, idx) => {
            const pct = (v / maxVal) * 100;
            const valueLabel = `${v}${uom ? ' ' + uom : ''}`;
            html += `
                <div style="width:36px; height:${Math.max(pct,1)}px; background:${color}; margin-bottom:4px;" title="${frappe.utils.escape_html(valueLabel)}"></div>
                <div style="font-size:10px; color:#666;">${frappe.datetime.str_to_user(chart_dates[idx])}</div>
            `;
        });

        html += `</div></div>`;
    });

    html += `</div>`;
    return html;
}

/* ---------- Small helper: random hex color ---------- */
function random_color_hex() {
	// ensure decent contrast and saturation (avoid very light)
	const r = Math.floor(80 + Math.random() * 160);
	const g = Math.floor(80 + Math.random() * 160);
	const b = Math.floor(80 + Math.random() * 160);
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

