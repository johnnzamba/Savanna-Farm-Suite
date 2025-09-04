// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Poultry Batches", {
	refresh(frm) {
        if (!frm.is_new()) {
            render_collection_chart(frm);
            render_nourishment_chart(frm);
        }
        update_batch_intro (frm);
		if (frm.is_new() && !frm.doc.animals_received_on) {
			frm.set_value("animals_received_on", frappe.datetime.get_today());
		}
        if (frm.doc.batch_status) {
            let color = "gray";
            if (frm.doc.batch_status === "Active") color = "green";
            else if (frm.doc.batch_status === "Partially Sold") color = "yellow";
            else if (frm.doc.batch_status === "Culled") color = "red";

            frm.page.set_indicator(frm.doc.batch_status, color);
        }
		frm.set_query("lpo", function() {
			const supplier = frm.doc.received_from;
			const filters = supplier ? { supplier: supplier } : {};
			return {
				filters,
				page_length: 50,
				query: undefined
			};
		});
		update_average_weight(frm);

        if (!frm.doc.name) return;
        frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.nourishment_log.nourishment_log.get_batch_totals",
        args: {
            batch_name: frm.doc.name
        },
        callback: function(r) {
            if (!r || !r.message) return;
            const res = r.message;
            if (res.total_feed !== undefined) {
            frm.set_value("total_feed", res.total_feed || "");
            frm.fields_dict["total_feed"] && frm.refresh_field("total_feed");
            }
            if (res.total_water !== undefined) {
            frm.set_value("total_water", res.total_water || "");
            frm.fields_dict["total_water"] && frm.refresh_field("total_water");
            }
        }
        });

        if (!frm.doc || !frm.doc.name) return;
		if (frm.__syncing_treatments) return;
		try {
			const k = `poultry_sync_suppress_${frm.doc.name}`;
			const ts = window.sessionStorage ? Number(window.sessionStorage.getItem(k) || 0) : 0;
			if (ts && Date.now() - ts < 5000) return;
		} catch (e) {}

		frm.__syncing_treatments = true;
		syncPoultryTreatmentLogs(frm).always(() => {
			frm.__syncing_treatments = false;
		});

        renderTreatmentChart(frm);
		try {
			const tableWrapper = frm.get_field('treatment_and_vaccination_log') ? frm.get_field('treatment_and_vaccination_log').$wrapper.get(0) : null;
			if (tableWrapper) {
				if (!tableWrapper._treatment_chart_observer) {
					const mo = new MutationObserver(() => {
						if (tableWrapper._treatment_chart_timer) clearTimeout(tableWrapper._treatment_chart_timer);
						tableWrapper._treatment_chart_timer = setTimeout(() => {
							renderTreatmentChart(frm);
						}, 150);
					});
					mo.observe(tableWrapper, { childList: true, subtree: true, attributes: true, characterData: true });
					tableWrapper._treatment_chart_observer = mo;
				}
			}
		} catch (e) {
			console.error('treatment chart observer error', e);
		}
	},

	received_from(frm) {
		frm.set_query("lpo", function() {
			const supplier = frm.doc.received_from;
			const filters = supplier ? { supplier: supplier } : {};
			return { filters };
		});
		if (frm.doc.lpo) {
			frappe.db.get_value("Purchase Order", frm.doc.lpo, "supplier").then(r => {
				if (r && r.message && r.message.supplier && r.message.supplier !== frm.doc.received_from) {
					frm.set_value("lpo", null);
				}
			});
		}
	},

	animal_batch(frm) {
		if (!frm.doc.animal_batch) {
			return;
		}

		frappe.db.get_doc("Animals", frm.doc.animal_batch).then(animal_doc => {
			const allowed_categories = (animal_doc.animal_categories || [])
				.map(row => row.animal_category)
				.filter(Boolean);
			frm.set_query("animal_category", function() {
				if (allowed_categories.length === 0) {
					// restrict to none if no categories defined
					return { filters: { name: ["in", []] } };
				}
				return { filters: { name: ["in", allowed_categories] } };
			});
		}).catch(() => {
			frm.set_query("animal_category", function() {
				return {};
			});
		});
		
		frm.set_query("animal_stage", function() {
			return {
				filters: {
					applicable_for: frm.doc.animal_batch
				}
			};
		});
	},

	batch_weight(frm) {
		update_average_weight(frm);
	},

	total_animals(frm) {
		update_average_weight(frm);
	}
});

function render_collection_chart(frm) {
    const wrapper = frm.fields_dict["collection_tracker"].$wrapper;
    wrapper.empty().addClass("text-center").append(`<div class="text-muted">${__("Loading...")}</div>`);

    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.get_collection_data",
        args: {
            batch_name: frm.doc.name
        },
        callback: function(r) {
            wrapper.empty(); // Clear loading message

            if (!r.message || !r.message.labels || r.message.labels.length === 0) {
                wrapper.html(`<div class="text-center text-muted" style="line-height: 150px;">
                    ${__("No Product Collections Logged Yet")}
                </div>`);
                return;
            }

            const data = r.message;
            const tooltipData = data.tooltip_data || {};

            const chart = new frappe.Chart(wrapper.get(0), {
                title: "Daily Product Collections",
                data: {
                    labels: data.labels,
                    datasets: data.datasets
                },
                type: 'bar',
                height: 250,
                colors: ['#7cd6fd', '#743ee2', '#ffa3ef', '#5e64ff', '#ff5858', '#00e096'],
                is_stacked: 1, // This creates the stacked bar chart
                tooltipOptions: {
                    formatTooltipY: (value, label, index, dataset_index) => {
                        // `label` is the x-axis value (date)
                        // `dataset_index` corresponds to the product series
                        if (!data.datasets[dataset_index]) return value;
                        
                        const productName = data.datasets[dataset_index].name;                        
                        if (tooltipData[productName] && tooltipData[productName][label]) {
                            return tooltipData[productName][label];
                        }
                        return value;
                    }
                }
            });
        }
    });
}

function syncPoultryTreatmentLogs(frm) {
	const dfd = $.Deferred();

	if (!frm.doc || !frm.doc.name) {
		dfd.resolve();
		return dfd.promise();
	}

	// Do not sync if the table is already populated, unless it's a new document
	if (!frm.is_new() && (frm.doc.treatment_and_vaccination_log || []).length > 0) {
		dfd.resolve();
		return dfd.promise();
	}

	// Step 1: attempt to get batch size from doc; if missing, fetch from server
	function getBatchSize() {
		const p = $.Deferred();
		if (frm.doc.total_animals && Number(frm.doc.total_animals) > 0) {
			p.resolve(Number(frm.doc.total_animals));
		} else {
			// fallback: fetch the Poultry Batches doc's total_animals
			frappe.call({
				method: 'frappe.client.get',
				args: { doctype: 'Poultry Batches', name: frm.doc.name, fields: ['total_animals'] },
				callback: function(r) {
					const val = (r && r.message && r.message.total_animals) ? Number(r.message.total_animals) : 0;
					p.resolve(val);
				},
				error: function() { p.resolve(0); }
			});
		}
		return p.promise();
	}

	// Step 2: fetch matching Treatment and Vaccination Logs for this batch
	function fetchLogs() {
		const p = $.Deferred();
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Treatment and Vaccination Logs',
				filters: { poultry_batch_under_treatment: frm.doc.name },
				fields: ['name', 'treatment_date', 'vaccine_used', 'qty_vaccine', 'doctor', 'creation'],
				order_by: 'creation desc',
				limit_page_length: 1000
			},
			callback: function(r) {
				p.resolve((r.message || []).filter(log => log.vaccine_used));
			},
			error: function() { p.resolve([]); }
		});
		return p.promise();
	}

	$.when(getBatchSize(), fetchLogs()).done((batchSize, logs) => {
		// pick latest per (treatment_date, vaccine_used)
		const seen = new Set();
		const uniqueLogs = [];
		for (let i=0;i<logs.length;i++) {
			const L = logs[i];
			const dt = L.treatment_date ? String(L.treatment_date).substr(0,10) : '';
			const vaccine = L.vaccine_used ? String(L.vaccine_used) : '';
			if (!vaccine) continue; // Skip logs with no vaccine
			const key = dt + '||' + vaccine;
			if (seen.has(key)) continue;
			seen.add(key);
			uniqueLogs.push(L);
		}

		// Build a map for vaccine display -> Animal Vaccines.name
		const distinctVaccines = Array.from(new Set(uniqueLogs.map(l => String(l.vaccine_used || '')).filter(Boolean)));
		if (distinctVaccines.length === 0) {
			dfd.resolve();
			return;
		}
		function resolveVaccineNames(values) {
			const d = $.Deferred();
			const result = {};
			// First fetch by exact name
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Animal Vaccines',
					filters: { name: ['in', values] },
					fields: ['name'],
					limit_page_length: values.length
				}
			}).then(r1 => {
				(r1 && r1.message || []).forEach(row => { result[row.name] = row.name; });
				// Then fetch by vaccine_name for the ones not found yet
				const remaining = values.filter(v => !result[v]);
				if (!remaining.length) { d.resolve(result); return; }
				frappe.call({
					method: 'frappe.client.get_list',
					args: {
						doctype: 'Animal Vaccines',
						filters: { vaccine_name: ['in', remaining] },
						fields: ['name', 'vaccine_name'],
						limit_page_length: remaining.length
					}
				}).then(r2 => {
					(r2 && r2.message || []).forEach(row => { if (row.vaccine_name) result[row.vaccine_name] = row.name; });
					// Any still missing map to themselves
					remaining.forEach(v => { if (!result[v]) result[v] = v; });
					d.resolve(result);
				}).catch(() => { remaining.forEach(v => { result[v] = v; }); d.resolve(result); });
			}).catch(() => { values.forEach(v => { result[v] = v; }); d.resolve(result); });
			return d.promise();
		}

		resolveVaccineNames(distinctVaccines).then(vaccineMap => {
			let changed = false;

			// If document is submitted, do not mutate child table; render a preview instead
			if (Number(frm.doc.docstatus) === 1) {
				const rowsHtml = uniqueLogs.map(log => {
					const dt = log.treatment_date ? String(log.treatment_date).substr(0,10) : '';
					const raw = String(log.vaccine_used || '');
					const vacc = vaccineMap[raw] || raw;
					const qty = Number(log.qty_vaccine) || 0;
					const doctor = log.doctor || '';
					const denom = (Number(batchSize) && Number(batchSize) > 0) ? Number(batchSize) : 0;
					const approx = denom > 0 ? Math.round((qty / denom) * 1e6) / 1e6 : 0;
					return `<tr>
						<td>${frappe.datetime.str_to_user(dt) || ''}</td>
						<td>${frappe.utils.escape_html(vacc)}</td>
						<td style="text-align:right;">${qty}</td>
						<td>${frappe.utils.escape_html(doctor)}</td>
						<td style=\"text-align:right;\">${approx}</td>
					</tr>`;
				}).join('');
				const tableHtml = `
					<div class="table-responsive">
						<table class="table table-bordered table-sm">
							<thead>
								<tr>
									<th>Date</th>
									<th>Vaccine</th>
									<th>Qty Issued</th>
									<th>Doctor</th>
									<th>Approx Intake/Animal</th>
								</tr>
							</thead>
							<tbody>${rowsHtml || ''}</tbody>
						</table>
						<div class="text-muted">Document is submitted; showing latest entries. Child table not modified.</div>
					</div>
				`;
				if (frm.fields_dict && frm.fields_dict.treatment_log_preview && frm.fields_dict.treatment_log_preview.$wrapper) {
					frm.fields_dict.treatment_log_preview.$wrapper.html(tableHtml);
				} else {
					frappe.msgprint({
						title: __('Submitted Document'),
						indicator: 'blue',
						message: __('This batch is submitted. Displayed latest treatment logs without saving changes to the table.')
					});
				}
				dfd.resolve();
				return;
			}

			// Clear and repopulate for draft docs
			if ((frm.doc.treatment_and_vaccination_log || []).length > 0) {
				frm.clear_table('treatment_and_vaccination_log');
				changed = true;
			}

			uniqueLogs.forEach(log => {
				const newRow = frm.add_child('treatment_and_vaccination_log');
				newRow.treatment_date = log.treatment_date || null;
				const raw = String(log.vaccine_used || '');
				newRow.animal_vaccine_issued = vaccineMap[raw] || raw;
				newRow.quantity_of_vaccine_issued = Number(log.qty_vaccine) || 0;
				newRow.treatment_conducted_by = log.doctor || '';
				const qty = Number(log.qty_vaccine) || 0;
				const denom = (Number(batchSize) && Number(batchSize) > 0) ? Number(batchSize) : 0;
				let approx = 0;
				if (denom > 0) approx = Math.round((qty / denom) * 1e6) / 1e6;
				newRow.approximate_intake_per_animal = approx;
				newRow.source_log = log.name || '';
				changed = true;
			});

			if (changed) {
				frm.refresh_field('treatment_and_vaccination_log');
				frm.save().then(() => {
					try {
						const k = `poultry_sync_suppress_${frm.doc.name}`;
						if (window.sessionStorage) window.sessionStorage.setItem(k, String(Date.now()));
					} catch (e) {}
					frm.reload_doc().then(() => dfd.resolve()).catch(() => dfd.resolve());
				}).catch(() => { dfd.resolve(); });
			} else {
				dfd.resolve();
			}
		});

	}).fail(() => dfd.resolve());

	return dfd.promise();
}

function renderTreatmentChart(frm) {
	const field = frm.get_field('treatment_chart');
	if (!field) return;
	const $wrap = field.$wrapper;
	$wrap.empty();

	if (!frm.doc || !frm.doc.name) {
		$wrap.html('<div class="text-muted">No batch selected.</div>');
		return;
	}

	// Tooltip element (single instance)
	let tooltipEl = document.querySelector('.treatment-chart-tooltip');
	if (!tooltipEl) {
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'treatment-chart-tooltip';
		Object.assign(tooltipEl.style, {
			position: 'fixed',
			pointerEvents: 'none',
			zIndex: 2147483647,
			padding: '8px 10px',
			borderRadius: '6px',
			background: 'rgba(255,255,255,0.98)',
			boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
			fontSize: '0.9rem',
			color: '#111',
			display: 'none',
			maxWidth: '320px'
		});
		document.body.appendChild(tooltipEl);
	}

	// Fetch aggregated payload from server (your server-side method)
	frappe.call({
		method: 'farm_management_system.savanna_farm_suite.doctype.poultry_batches.poultry_batches.get_treatment_chart_data',
		args: { poultry_batch_name: frm.doc.name },
		freeze: true,
		freeze_message: __('Loading treatment/vaccination data...')
	}).then(r => {
		const payload = (r && r.message) || { dates: [], vaccines: [], series: {} };
		const dates = payload.dates || [];
		let vaccines = payload.vaccines || [];
		const series = payload.series || {};

		vaccines = vaccines.filter(v => v && v.trim() !== '');

		if (!dates.length || !vaccines.length) {
			$wrap.html('<div class="text-muted">No treatment / vaccination logs found for this batch.</div>');
			return;
		}

		// Helper: deterministic color per vaccine
		function hashString(s) {
			let h = 2166136261 >>> 0;
			for (let i = 0; i < s.length; i++) {
				h ^= s.charCodeAt(i);
				h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
			}
			return (h >>> 0);
		}
		function colorForVaccine(name) {
			const h = hashString(name) % 360;
			const sat = 60 + (hashString(name + 's') % 20);
			const light = 45 + (hashString(name + 'l') % 10);
			return `hsl(${h}, ${sat}%, ${light}%)`;
		}

		// Fetch metadata (display name and UOM) for each vaccine from Animal Vaccines doc
		function fetchVaccineMeta(vaccineNames) {
			const d = $.Deferred();
			const validVaccineNames = vaccineNames.filter(v => v && v !== '(unknown)');

			if (validVaccineNames.length === 0) {
				const uomMap = {};
				const displayNameMap = {};
				vaccineNames.forEach(v => {
					displayNameMap[v] = v;
					uomMap[v] = 'unit(s)';
				});
				return $.Deferred().resolve({ uomMap, displayNameMap }).promise();
			}

			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Animal Vaccines',
					filters: { name: ['in', validVaccineNames] },
					fields: ['name', 'vaccine_name', 'uom'],
					limit_page_length: validVaccineNames.length
				},
				callback: function(r) {
					const uomMap = {};
					const displayNameMap = {};
					const found = new Set();

					(r.message || []).forEach(doc => {
						found.add(doc.name);
						displayNameMap[doc.name] = doc.vaccine_name || doc.name;
						uomMap[doc.name] = doc.uom || 'unit(s)';
					});

					vaccineNames.forEach(v => {
						if (!displayNameMap[v]) {
							displayNameMap[v] = v;
							uomMap[v] = 'unit(s)';
						}
					});

					d.resolve({ uomMap, displayNameMap });
				},
				error: function() {
					const uomMap = {};
					const displayNameMap = {};
					vaccineNames.forEach(v => {
						displayNameMap[v] = v;
						uomMap[v] = 'unit(s)';
					});
					d.resolve({ uomMap, displayNameMap });
				}
			});

			return d.promise();
		}

		// Once metadata map is ready, render chart (so tooltip shows correct unit and display name)
		fetchVaccineMeta(vaccines).then(meta => {
			const uomMap = meta.uomMap || {};
			const displayNameMap = meta.displayNameMap || {};
			console.debug('vaccine meta', meta);

			// compute max across series
			let maxQty = 0;
			vaccines.forEach(v => {
				const arr = series[v] || [];
				arr.forEach(q => { if (q > maxQty) maxQty = q; });
			});
			if (maxQty === 0) maxQty = 1;

			// Build chart HTML and SVG container
			const chartId = `treat-chart-${(Math.random()*1e9|0)}`;
			const chartHTML = `
				<style>
					#${chartId} { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial; }
					#${chartId} .chart-viewport { overflow:auto; border-radius:8px; padding:12px; background:#fff; box-shadow:0 6px 18px rgba(0,0,0,0.04); }
					#${chartId} .legend { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
					#${chartId} .legend-item { display:flex; gap:6px; align-items:center; font-size:0.9rem; }
					#${chartId} .legend-swatch { width:12px; height:12px; border-radius:3px; display:inline-block; }
				</style>
				<div id="${chartId}">
					<div class="chart-viewport">
						<svg id="${chartId}-svg" width="100%" height="340" viewBox="0 0 ${Math.max(700, dates.length * Math.max(140, vaccines.length * 26))} 340" preserveAspectRatio="xMinYMin meet"></svg>
					</div>
					<div class="legend" id="${chartId}-legend"></div>
				</div>
			`;
			$wrap.html(chartHTML);

			const svg = document.getElementById(`${chartId}-svg`);
			while (svg.firstChild) svg.removeChild(svg.firstChild);
			const svgW = Number(svg.getAttribute('viewBox').split(' ')[2]);
			const svgH = Number(svg.getAttribute('viewBox').split(' ')[3]);
			const padding = { top: 16, right: 20, bottom: 80, left: 48 };
			const plotW = svgW - padding.left - padding.right;
			const plotH = svgH - padding.top - padding.bottom;
			const slotWidth = Math.max(100, Math.floor(plotW / Math.max(1, dates.length)));
			const availableBarWidth = slotWidth - 16;
			const perVaccineWidth = vaccines.length ? Math.max(8, Math.floor((availableBarWidth - (vaccines.length-1)*6) / vaccines.length)) : availableBarWidth;

			// y grid and labels
			const ySteps = 5;
			for (let i=0;i<=ySteps;i++) {
				const yVal = (maxQty * i / ySteps);
				const y = padding.top + plotH - (plotH * i / ySteps);
				const line = document.createElementNS('http://www.w3.org/2000/svg','line');
				line.setAttribute('x1', padding.left);
				line.setAttribute('x2', svgW - padding.right);
				line.setAttribute('y1', String(y));
				line.setAttribute('y2', String(y));
				line.setAttribute('stroke', 'rgba(0,0,0,0.06)');
				line.setAttribute('stroke-width', '1');
				svg.appendChild(line);
				const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
				lbl.setAttribute('x', String(padding.left - 8));
				lbl.setAttribute('y', String(y + 4));
				lbl.setAttribute('font-size', '11');
				lbl.setAttribute('text-anchor', 'end');
				lbl.setAttribute('fill', '#444');
				lbl.textContent = Math.round(yVal * 100) / 100;
				svg.appendChild(lbl);
			}

			// draw bars & labels
			dates.forEach((dt, idx) => {
				const groupX = padding.left + idx * slotWidth + 8;
				vaccines.forEach((vac, vIdx) => {
					const qty = (series[vac] && series[vac][idx] !== undefined) ? Number(series[vac][idx]) : 0;
					const height = Math.round((qty / maxQty) * (plotH - 8));
					const x = groupX + vIdx * (perVaccineWidth + 6);
					const y = padding.top + plotH - height;
					const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
					rect.setAttribute('x', String(x));
					rect.setAttribute('y', String(y));
					rect.setAttribute('width', String(perVaccineWidth));
					rect.setAttribute('height', String(Math.max(1, height)));
					const fill = colorForVaccine(displayNameMap[vac] || vac);
					rect.setAttribute('fill', fill);
					rect.setAttribute('rx', '3');
					rect.setAttribute('ry', '3');
					rect.setAttribute('data-date', dt);
					rect.setAttribute('data-vaccine', displayNameMap[vac] || vac);
					rect.setAttribute('data-qty', String(qty));
					rect.style.cursor = 'pointer';
					svg.appendChild(rect);

					rect.addEventListener('mouseenter', (ev) => {
						const q = rect.getAttribute('data-qty');
						const d = rect.getAttribute('data-date');
						const display = displayNameMap[vac] || vac;
						const uom = (uomMap && uomMap[vac]) ? uomMap[vac] : 'unit(s)';
						tooltipEl.innerHTML = `<strong>${display}</strong><div style="opacity:0.85;margin-top:6px">${q} ${uom}</div><div style="margin-top:6px;font-size:0.82rem;color:#666">${d}</div>`;
						tooltipEl.style.display = 'block';
						positionTooltip(ev.clientX, ev.clientY);
					});
					rect.addEventListener('mousemove', (ev) => positionTooltip(ev.clientX, ev.clientY));
					rect.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
					rect.addEventListener('click', (ev) => {
						ev.stopPropagation();
						const q = rect.getAttribute('data-qty');
						const d = rect.getAttribute('data-date');
						const display = displayNameMap[vac] || vac;
						const uom = (uomMap && uomMap[vac]) ? uomMap[vac] : 'unit(s)';
						tooltipEl.innerHTML = `<strong>${display}</strong><div style=\"opacity:0.85;margin-top:6px\">${q} ${uom}</div><div style=\"margin-top:6px;font-size:0.82rem;color:#666\">${d}</div>`;
						tooltipEl.style.display = 'block';
						positionTooltip(ev.clientX, ev.clientY);
						setTimeout(()=> { tooltipEl.style.display = 'none'; }, 3000);
					});
				});

				const labelXcenter = groupX + (vaccines.length * (perVaccineWidth + 6) - 6) / 2;
				const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
				lbl.setAttribute('x', String(labelXcenter));
				lbl.setAttribute('y', String(padding.top + plotH + 22));
				lbl.setAttribute('text-anchor', 'middle');
				lbl.setAttribute('font-size', '12');
				lbl.setAttribute('fill', '#333');
				lbl.textContent = dt;
				svg.appendChild(lbl);
			});

			// legend
			const legend = document.getElementById(`${chartId}-legend`);
			while (legend.firstChild) legend.removeChild(legend.firstChild);
			vaccines.forEach(v => {
				const sw = document.createElement('div');
				sw.className = 'legend-item';
				sw.innerHTML = `<span class="legend-swatch" style="background:${colorForVaccine(displayNameMap[v] || v)}"></span><span>${displayNameMap[v] || v}</span>`;
				legend.appendChild(sw);
			});

			// tooltip position helper
			function positionTooltip(clientX, clientY) {
				const pad = 8;
				tooltipEl.style.display = 'block';
				tooltipEl.style.pointerEvents = 'none';
				const rect = tooltipEl.getBoundingClientRect();
				const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
				const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
				let left = clientX + 12;
				let top = clientY + 12;
				if (left + rect.width + pad > vw) left = clientX - rect.width - 12;
				if (left < pad) left = pad;
				if (top + rect.height + pad > vh) top = clientY - rect.height - 12;
				if (top < pad) top = pad;
				tooltipEl.style.left = left + 'px';
				tooltipEl.style.top = top + 'px';
			}

			// hide tooltip on outside click
			document.addEventListener('click', () => { if (tooltipEl) tooltipEl.style.display = 'none'; });
		}).catch(err => {
			console.error('Error fetching UOMs for vaccines', err);
			// render chart anyway but fallback unit label will be "unit(s)" because uomMap won't be available
			// (we call the same code path above by creating an empty map)
			// quick fallback: call the render logic with empty uomMap
			(function(){ /* replicate small portion to avoid repeating code - or simpler: reload page to re-render */ })();
		});
	}).catch(err => {
		console.error('Error fetching treatment chart data', err);
		$wrap.html('<div class="text-danger">Error loading treatment/vaccination data.</div>');
	});
}


function update_average_weight(frm) {
	const total = frm.doc.total_animals;
	const weight = frm.doc.batch_weight;
	if (weight && total && total > 0) {
		const avg = weight / total;
		frm.set_value("average_weight_per_bird", avg);
		const kg = (Math.round(avg * 1000) / 1000).toFixed(3);
		const g = Math.round(avg * 1000);
		frm.set_df_property("average_weight_per_bird", "description", `${kg} Kg or (${g} g)`);
	} else {
		frm.set_df_property("average_weight_per_bird", "description", "");
	}
}

function escapeHtml(unsafe) {
	if (!unsafe && unsafe !== 0) return '';
	return String(unsafe)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function _parseAgeToMs(ageStr) {
	if (!ageStr || !ageStr.trim()) return 0;
	const unitMs = {
		'year': 365 * 24 * 60 * 60 * 1000,
		'month': 30 * 24 * 60 * 60 * 1000,
		'week': 7 * 24 * 60 * 60 * 1000,
		'day': 24 * 60 * 60 * 1000,
		'hour': 60 * 60 * 1000,
		'minute': 60 * 1000,
		'min': 60 * 1000,
		'sec': 1000,
		'second': 1000
	};

	let ms = 0;
	const re = /(\d+)\s*([A-Za-z]+)/g;
	let m;
	while ((m = re.exec(ageStr)) !== null) {
		let n = parseInt(m[1], 10);
		let unit = m[2].toLowerCase();
		if (unit.endsWith('s')) unit = unit.slice(0, -1);
		let matched = false;
		for (const k of Object.keys(unitMs)) {
			if (unit.startsWith(k.slice(0, 2)) || unit.startsWith(k)) {
				ms += n * unitMs[k];
				matched = true;
				break;
			}
		}
		if (!matched && unitMs[unit]) {
			ms += n * unitMs[unit];
		}
	}
	return ms;
}

function _parseFrappeDatetime(s) {
	if (!s) return null;
	let base = s.trim();
	// keep up to milliseconds
	if (base.indexOf('.') !== -1) {
		let parts = base.split('.');
		let left = parts[0];
		let frac = parts[1] || '';
		let ms = frac.substring(0, 3).padEnd(3, '0');
		base = `${left}.${ms}`;
	}
	base = base.replace(' ', 'T');
	let d = new Date(base);
	if (isNaN(d.getTime())) {
		let dd = new Date(s);
		return isNaN(dd.getTime()) ? null : dd;
	}
	return d;
}

function _formatDateTimeLocal(d) {
	if (!d) return 'N/A';
	const pad = (n) => n.toString().padStart(2, '0');
	let Y = d.getFullYear();
	let M = pad(d.getMonth() + 1);
	let D = pad(d.getDate());
	let hh = pad(d.getHours());
	let mm = pad(d.getMinutes());
	let ss = pad(d.getSeconds());
	return `${Y}-${M}-${D} ${hh}:${mm}:${ss}`;
}

function update_batch_intro(frm) {
	try {
		frm.set_intro();
		let msgs = [];
		if (!frm.is_new() && frm.doc.age_from_hatch_date) {
			const ageStr = frm.doc.age_from_hatch_date;
			const parsedMs = _parseAgeToMs(ageStr);
			const creation = _parseFrappeDatetime(frm.doc.creation);

			if (parsedMs && creation) {
				const hatchDate = new Date(creation.getTime() - parsedMs);
				const now = new Date();
				let ageMs = now.getTime() - hatchDate.getTime();

				if (ageMs < 0) {
					msgs.push(`Batch Age: 0 Day(s), 0 Hour(s) — Estimated hatch date: ${_formatDateTimeLocal(hatchDate)} (derived from "${escapeHtml(ageStr)}")`);
				} else {
					const msPerDay = 24 * 60 * 60 * 1000;
					const msPerHour = 60 * 60 * 1000;
					const msPerMin = 60 * 1000;

					const days = Math.floor(ageMs / msPerDay);
					ageMs -= days * msPerDay;
					const hours = Math.floor(ageMs / msPerHour);
					ageMs -= hours * msPerHour;
					const mins = Math.floor(ageMs / msPerMin);

					const hatchStr = _formatDateTimeLocal(hatchDate);
					msgs.push(`Batch Age: ${days} Day(s), ${hours} Hour(s), ${mins} Minute(s) — Estimated hatch date: ${hatchStr} (based on <strong>Time Since Hatching</strong>)`);
				}
			} else {
				if (!creation) {
					msgs.push(`Batch Age: ${escapeHtml(ageStr)} — (Cannot compute exact hatch date: missing 'creation' timestamp)`);
				} else {
					msgs.push(`Batch Age: ${escapeHtml(ageStr)} — (Could not parse 'age_from_hatch_date')`);
				}
			}
		}
		if (msgs.length) {
			const html = msgs.map(m => `<div>${m}</div>`).join('');
			frm.set_intro(html, "red");
			console.debug("update_batch_intro: intro set", html);
		} else {
			console.debug("update_batch_intro: no intro to set");
		}
	} catch (err) {
		console.error("update_batch_intro error:", err);
	}
}

function render_nourishment_chart(frm) {
  // ensure the daily_consumption HTML field exists on form
  if (!frm.fields_dict || !frm.fields_dict.daily_consumption) return;

  const $wrapper = $(frm.fields_dict.daily_consumption.wrapper).empty();

  if (!frm.doc.name) {
    $wrapper.html('<div>No batch selected.</div>');
    return;
  }

  // fetch nourishment logs for this batch
  frappe.call({
    method: 'frappe.client.get_list',
    args: {
      doctype: 'Nourishment Log',
      filters: { poultry_batch: frm.doc.name },
      fields: ['date_of_nourishment', 'animal_feed_name', 'qty_issued', 'default_uom'],
      order_by: 'date_of_nourishment asc',
      limit_page_length: 1000
    },
    callback: function(r) {
      const rows = r.message || [];
      if (!rows.length) {
        $wrapper.html('<div>No nourishment data available.</div>');
        return;
      }

      // collect ordered unique dates (labels)
      let dates = Array.from(new Set(rows.map(rr => rr.date_of_nourishment)));
      dates.sort((a, b) => new Date(a) - new Date(b));
      const feeds = {};     
      const feedUoms = {};
      rows.forEach(row => {
        const d = row.date_of_nourishment;
        const feed = (row.animal_feed_name || 'N/A').toString();
        const qty = parseFloat(row.qty_issued) || 0;
        feeds[feed] = feeds[feed] || {};
        feeds[feed][d] = (feeds[feed][d] || 0) + qty; 
        if (!feedUoms[feed]) feedUoms[feed] = row.default_uom || '';
      });

      // build frappe.Chart style datasets
      const labels = dates;
      const datasets = [];
      const colors = [];
      const feedNames = Object.keys(feeds);
      feedNames.forEach((feedName, idx) => {
        const values = labels.map(dt => feeds[feedName][dt] || 0);
        const uom = feedUoms[feedName] || '';
        const seriesName = uom ? `${feedName} (${uom})` : feedName;
        datasets.push({
          name: seriesName,
          values: values
        });
        const hue = Math.round(360 * (idx / Math.max(1, feedNames.length)));
        colors.push(`hsl(${hue} 65% 45%)`);
      });
        const chart_id = 'nourishment_chart_' + String(frm.doc.name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        $wrapper.find(`#${chart_id}`).remove();
        const $chart_div = $(`<div id="${chart_id}" style="height:360px;"></div>`).appendTo($wrapper);
        if (frm._nourishment_chart_instance && frm._nourishment_chart_instance.wrapper) {
        try { $(frm._nourishment_chart_instance.wrapper).empty(); } catch (e) { /* ignore */ }
        frm._nourishment_chart_instance = null;
        }
        const data = {
        labels: labels,
        datasets: datasets
        };
        frm._nourishment_chart_instance = new frappe.Chart($chart_div[0], {
        title: "Daily Nourishment Consumption",
        data: data,
        type: 'line',
        height: 360,
        colors: colors,
        lineOptions: { dotSize: 4, hideLine: false },
        axisOptions: { xIsSeries: true }
        });


    }
  });
}

// --- END OF SCRIPT ---