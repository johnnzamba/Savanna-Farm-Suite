// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Cow Production Report"] = {
	"filters": [
		{
			"fieldname": "cow",
			"label": __("Narrow Productivity to a cow"),
			"fieldtype": "Link",
			"options": "Cattle",
			"reqd": 0
		},
		{
			"fieldname": "product",
			"label": __("Specify Animal Product"),
			"fieldtype": "Link",
			"options": "Animal Products",
			"reqd": 0,
			"get_query": function() {
				return {
					filters: {
						"product_tied_to_which_animal": "Cow"
					}
				};
			}
		},
		{
			"fieldname": "timeline",
			"label": __("Specify Timeline"),
			"fieldtype": "Select",
			"options": "\nThis Week\nLast Fortnight\nThis Month\nThis Quarter\nThis Year",
			"default": "This Month",
			"reqd": 1
		}
	],

	// create DOM holder for chart on first load
	"onload": function(report) {
		// add container above the report results
		if (!report.page.page_chart_area) {
			const $chart_wrapper = $('<div class="cow-production-chart-wrapper" style="margin-bottom: 20px;"></div>');
			report.page.page_chart_area = $chart_wrapper;
			report.page.main.prepend($chart_wrapper);
		}
	},

	// // on refresh, re-run the report quietly to get data and draw chart
	// "on_refresh": function(report, dt, filters) {
	// 	// build filters object
	// 	const f = report.get_values ? report.get_values() : (report.page_fields || {}).get_values ? report.page_fields.get_values() : filters;

	// 	// call the query backend to get the same data as the table
	// 	frappe.call({
	// 		method: 'frappe.desk.query_report.run',
	// 		args: {
	// 			report_name: 'Cow Production Report',
	// 			filters: f || {}
	// 		},
	// 		callback: function(res) {
	// 			if (!res || !res.message) return;
	// 			const msg = res.message;
	// 			const rows = msg.result || [];
	// 			const $chart_wrapper = report.page.page_chart_area;
	// 			$chart_wrapper.empty();

	// 			if (!rows.length) {
	// 				$chart_wrapper.append($('<div class="text-muted" style="padding: 15px;">No data for chart.</div>'));
	// 				return;
	// 			}

	// 			// --- Chart Data Processing ---

	// 			// 1. Find column indexes dynamically
	// 			const colNames = (msg.columns || []).map(c => (typeof c === 'string' ? c.split(':')[0].trim() : (c.label || '')));
	// 			const idxCow = colNames.indexOf('Cow');
	// 			const idxProduct = colNames.indexOf('Product Collected');
	// 			const idxQty = colNames.indexOf('Quantity Collected');

	// 			// 2. Aggregate data for a stacked bar chart
	// 			// We need a structure like: { cowName: { productName: totalQty, ... }, ... }
	// 			const dataMap = {};
	// 			const allProducts = new Set();
	// 			const allCows = new Set();

	// 			rows.forEach(row => {
	// 				const cow = row[idxCow] || 'Unknown';
	// 				const product = row[idxProduct] || 'Unnamed Product';
	// 				const qtyCell = (row[idxQty] || '0').toString();
	// 				const match = qtyCell.match(/-?\d+(\.\d+)?/);
	// 				const qty = match ? parseFloat(match[0]) : 0;

	// 				if (!dataMap[cow]) {
	// 					dataMap[cow] = {};
	// 				}
	// 				dataMap[cow][product] = (dataMap[cow][product] || 0) + qty;
					
	// 				allCows.add(cow);
	// 				allProducts.add(product);
	// 			});

	// 			// 3. Prepare data in Frappe Charts format
	// 			const labels = Array.from(allCows).sort(); // X-axis labels (Cow names)
	// 			const uniqueProducts = Array.from(allProducts).sort();

	// 			const datasets = uniqueProducts.map(product => {
	// 				return {
	// 					name: product,
	// 					values: labels.map(cow => dataMap[cow][product] || 0) // Get qty for this product for each cow
	// 				};
	// 			});

	// 			// 4. Generate a consistent random color for each product
	// 			const productColors = {};
	// 			const randomColor = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
	// 			uniqueProducts.forEach(p => {
	// 				productColors[p] = randomColor();
	// 			});
	// 			const colors = uniqueProducts.map(p => productColors[p]);

	// 			// --- Render Chart ---
	// 			const chart_id = 'cow-production-chart';
	// 			$chart_wrapper.append(`<div id="${chart_id}"></div>`);

	// 			new frappe.Chart(`#${chart_id}`, {
	// 				title: __('Cow Production by Product'),
	// 				data: {
	// 					labels: labels,
	// 					datasets: datasets
	// 				},
	// 				type: 'bar', // bar chart
	// 				height: 350,
	// 				colors: colors,
	// 				stacked: true, // This creates the stacked bar effect!
	// 				tooltipOptions: {
	// 					formatTooltipY: d => d + ' units'
	// 				}
	// 			});
	// 		}
	// 	});
	// }
};