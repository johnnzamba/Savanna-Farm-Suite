// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cattle", {
    refresh(frm) {
        // Render the feeding chart when form loads
        renderFeedingChart(frm);
        if (!frm.is_new()) {
            render_collection_chart(frm);
        }
        // Set indicator color based on sex
        if (frm.doc.animals__sex) {
            let color = frm.doc.animals__sex === 'Male' ? 'red' : 'blue';
            frm.page.set_indicator(frm.doc.animals__sex, color);
        }
        renderTreatmentChart(frm);
		try {
			const tableWrapper = frm.get_field('treatment_table') ? frm.get_field('treatment_table').$wrapper.get(0) : null;
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
});

function renderFeedingChart(frm) {
    // Check if feeding_log data exists
    if (!frm.doc.feeding_log || frm.doc.feeding_log.length === 0) {
        frm.fields_dict.feeding_chart.$wrapper.html('<div class="text-muted text-center" style="padding: 20px;">No feeding data available</div>');
        return;
    }

    // Prepare data for the chart
    const labels = [];
    const values = [];
    const tooltipData = [];

    // Process feeding log data
    frm.doc.feeding_log.forEach(log => {
        labels.push(log.date_fed);
        values.push(log.total_qty_issued);
        
        // Store additional data for tooltips
        tooltipData.push({
            feed: log.animal_feed_name,
            user: log.users_full_name,
            feed_code: log.fed_on // Store the feed code for UOM lookup
        });
    });

    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.id = 'feeding-chart-container';
    chartContainer.style.height = '300px';
    frm.fields_dict.feeding_chart.$wrapper.html(chartContainer);

    // Add CSS styles directly
    const style = document.createElement('style');
    style.textContent = `
        .chart-tooltip {
            pointer-events: none;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
            position: absolute;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            max-width: 250px;
        }
        
        .chart-tooltip div {
            line-height: 1.5;
            margin: 3px 0;
        }
        
        .chart-tooltip .feed-name {
            font-weight: bold;
            color: #7cd6fd;
        }
        
        .chart-tooltip .user-name {
            font-style: italic;
        }
        
        #feeding-chart-container {
            margin-top: 15px;
            background: white;
            border-radius: 4px;
            padding: 15px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            border: 1px solid #d1d8dd;
        }
        
        .feeding-chart-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #36414c;
            border-bottom: 1px solid #d1d8dd;
            padding-bottom: 8px;
        }
        
        .uom-loading {
            text-align: center;
            padding: 20px;
            color: #8D99A6;
        }
    `;
    document.head.appendChild(style);

    // Add chart title
    const chartTitle = document.createElement('div');
    chartTitle.className = 'feeding-chart-title';
    chartTitle.textContent = 'Feeding History';
    chartContainer.parentNode.insertBefore(chartTitle, chartContainer);

    // Show loading message while fetching UOM data
    chartContainer.innerHTML = '<div class="uom-loading">Loading unit of measure data...</div>';

    // Fetch UOM data for all feeds using the external API
    fetchUOMForFeeds(tooltipData).then(uomData => {
        // Update tooltipData with UOM information
        tooltipData.forEach(item => {
            // Get the first UOM from the array or default to 'units'
            const uoms = uomData[item.feed_code] || [];
            item.uom = uoms.length > 0 ? uoms[0].uom : 'units';
        });

        // Render the chart with the updated data
        renderChartWithData(labels, values, tooltipData, chartContainer);
    }).catch(error => {
        console.error("Error fetching UOM data:", error);
        chartContainer.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">Error loading chart data</div>';
    });
}

function fetchUOMForFeeds(tooltipData) {
    return new Promise((resolve, reject) => {
        // Get unique feed codes from tooltipData
        const feedCodes = [...new Set(tooltipData.map(item => item.feed_code))];
        
        if (feedCodes.length === 0) {
            resolve({});
            return;
        }
        
        // Call the external API to get UOM data
        frappe.call({
            method: 'farm_management_system.savanna_farm_suite.doctype.cattle.cattle.get_animal_feed_uoms',
            args: {
                feeds: feedCodes.join(',')
            },
            callback: function(response) {
                if (response.message) {
                    resolve(response.message);
                } else {
                    reject(new Error("No response from UOM API"));
                }
            },
            error: function(err) {
                reject(err);
            }
        });
    });
}

function renderChartWithData(labels, values, tooltipData, chartContainer) {
    // Clear loading message
    chartContainer.innerHTML = '';
    
    // Initialize and render the chart
    const chart = new frappe.Chart('#feeding-chart-container', {
        data: {
            labels: labels,
            datasets: [
                {
                    name: 'Quantity Issued',
                    values: values,
                    chartType: 'bar'
                }
            ]
        },
        type: 'bar',
        height: 280,
        colors: ['#5e64ff'],
        barOptions: {
            spaceRatio: 0.5
        },
        axisOptions: {
            xAxisMode: 'tick',
            yAxisMode: 'tick',
            xIsSeries: false
        },
        tooltipOptions: {
            formatTooltipX: d => {
                // Format date for better display
                return frappe.datetime.str_to_user(d);
            },
            formatTooltipY: d => {
                return d;
            }
        },
        lineOptions: {
            hideDots: 1,
            heatline: 0
        }
    });

    // Add custom tooltip with additional information
    const chartElement = $('#feeding-chart-container');
    chartElement.on('plothover', function(event, pos, item) {
        if (item) {
            const index = item.dataIndex;
            const dataPoint = tooltipData[index];
            
            // Create custom tooltip
            $('.chart-tooltip').remove();
            const tooltip = $('<div class="chart-tooltip"></div>')
                .css({
                    top: item.pageY - 100,
                    left: item.pageX + 10
                })
                .html(`
                    <div><strong>Date:</strong> ${frappe.datetime.str_to_user(labels[index])}</div>
                    <div class="feed-name">${dataPoint.feed}</div>
                    <div><strong>Quantity:</strong> ${values[index]} ${dataPoint.uom}</div>
                    <div class="user-name"><strong>Fed By:</strong> ${dataPoint.user}</div>
                `)
                .appendTo('body');
        } else {
            $('.chart-tooltip').remove();
        }
    });

    // Remove tooltip when mouse leaves chart area
    chartElement.on('mouseleave', function() {
        $('.chart-tooltip').remove();
    });
}

function render_collection_chart(frm) {
    const wrapper = frm.fields_dict["production_chart"].$wrapper;
    wrapper.empty().addClass("text-center").append(`<div class="text-muted">${__("Loading...")}</div>`);

    frappe.call({
        method: "farm_management_system.savanna_farm_suite.doctype.cattle.cattle.get_collection_data",
        args: {
            cattle: frm.doc.name
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

function renderTreatmentChart(frm) {
	const field = frm.get_field('html_pxry');
	if (!field) return;
	const $wrap = field.$wrapper;
	$wrap.empty();

	if (!frm.doc || !frm.doc.name) {
		$wrap.html('<div class="text-muted">No Cow Selected.</div>');
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
		method: 'farm_management_system.savanna_farm_suite.doctype.cattle.cattle.get_treatment_chart_data',
		args: { cattle: frm.doc.name },
		freeze: true,
		freeze_message: __('Loading treatment/vaccination data...')
	}).then(r => {
		const payload = (r && r.message) || { dates: [], vaccines: [], series: {} };
		const dates = payload.dates || [];
		let vaccines = payload.vaccines || [];
		const series = payload.series || {};

		vaccines = vaccines.filter(v => v && v.trim() !== '');

		if (!dates.length || !vaccines.length) {
			$wrap.html('<div class="text-muted">No treatment / vaccination logs found for this cow.</div>');
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
