// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cattle Shed", {
	refresh(frm) {
        // Render the feeding chart when form loads
        renderFeedingChart(frm);
    },
});


function renderFeedingChart(frm) {
    // Check if feeding_logs data exists
    if (!frm.doc.feeding_logs || frm.doc.feeding_logs.length === 0) {
        frm.fields_dict.feeding_chart.$wrapper.html('<div class="text-muted text-center" style="padding: 20px;">No feeding data available</div>');
        return;
    }

    // Prepare data for the chart
    const labels = [];
    const values = [];
    const tooltipData = [];

    // Process feeding log data
    frm.doc.feeding_logs.forEach(log => {
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