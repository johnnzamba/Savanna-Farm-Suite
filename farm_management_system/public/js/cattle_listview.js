// farm_management_system/public/js/cattle_listview.js
frappe.listview_settings['Cattle'] = {
    onload: function(list_view) {
        // only show to users who should see it (optional): skip role check here for brevity
        list_view.page.add_inner_button(__('Make Collection'), () => {
            const dialog = new frappe.ui.Dialog({
                title: __('Make a Collection of Animal Products'),
                fields: [
                    { fieldtype: 'Date', fieldname: 'date_of_collection', label: __('Date of Collection'), default: frappe.datetime.get_today(), reqd: 1 },
                    { fieldtype: 'Link', fieldname: 'animal', label: __('Specify Animal'), options: 'Animals', default: "Cattle", reqd: 1 },
                    { fieldtype: 'Link', fieldname: 'cattle', label: __('Specify Cow'), options: 'Cattle', reqd: 1 },
                    {
                        fieldtype: 'Table',
                        fieldname: 'production_table',
                        label: __('Collections Table'),
                        fields: [
                            { fieldtype: 'Link', fieldname: 'animal_product', label: __('Animal Product'), options: 'Animal Products', reqd: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'default_uom', label: __('Default UOM'), read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'quantity_collected', label: __('Quantity Collected'), reqd: 1, in_list_view: 1 }
                        ]
                    }
                ],
                primary_action_label: __('Make Entry'),
                primary_action: function() {
                    const dvalues = dialog.get_values(true);

                    // --- extra safety: prevent future date at submit time ---
                    const selected_date = dvalues && dvalues.date_of_collection;
                    const today = frappe.datetime.get_today();
                    if (selected_date && selected_date > today) {
                        frappe.msgprint({
                            title: __('Invalid Date'),
                            message: __('Date of Collection cannot be a future date.'),
                            indicator: 'red'
                        });
                        return;
                    }

                    const rows = dvalues.production_table || [];
                    if (!rows.length) {
                        frappe.msgprint(__('No products found to collect.'));
                        return;
                    }

                    frappe.warn(
                        __('Are you sure you want to proceed?'),
                        __('Please Note this Action is Irreversible'),
                        () => {
                            frappe.dom.freeze(__('Creating collection...'));
                            frappe.call({
                                method: 'farm_management_system.savanna_farm_suite.doctype.cattle.cattle.create_collection_entry',
                                args: {
                                    cattle: dvalues.cattle,
                                    date_of_collection: dvalues.date_of_collection,
                                    rows: rows
                                },
                                callback: function(r) {
                                    frappe.dom.unfreeze();
                                    if (!r.exc && r.message) {
                                        frappe.utils.play_sound('success');
                                        dialog.hide();
                                        list_view.refresh();
                                        frappe.show_alert({ message: __('Collection recorded'), indicator: 'green' });
                                    } else if (r.exc) {
                                        frappe.msgprint({ title: __('Error'), message: r.exc, indicator: 'red' });
                                    }
                                },
                                error: function() {
                                    frappe.dom.unfreeze();
                                    frappe.msgprint({ title: __('Network Error'), message: __('Please try again.'), indicator: 'red' });
                                }
                            });
                        },
                        'Continue',
                        true
                    );
                }
            });

            dialog.show();
            dialog.$wrapper.find('.modal-dialog').addClass('modal-lg');

            // --- helper: apply/remove query on child table's animal_product link field ---
            function set_product_query_for_animal(animal_name) {
                const tbl = dialog.fields_dict.production_table;
                if (!tbl || !tbl.grid) return;
                const grid = tbl.grid;

                const get_query_fn = function() {
                    if (!animal_name) {
                        return { filters: {} };
                    }
                    return { filters: { product_tied_to_which_animal: animal_name } };
                };

                try {
                    const field = grid.get_field('animal_product');
                    if (field) {
                        field.get_query = get_query_fn;
                        if (field.df) field.df.get_query = get_query_fn;
                    }
                } catch (e) {
                    console.warn('set_product_query_for_animal: could not set on grid.get_field', e);
                }

                if (grid.grid_rows && grid.grid_rows.length) {
                    grid.grid_rows.forEach(function(gr) {
                        try {
                            const f = gr.fields_map && gr.fields_map.animal_product;
                            if (f) {
                                f.get_query = get_query_fn;
                                if (f.df) f.df.get_query = get_query_fn;
                            }
                        } catch (e) {
                            // ignore per-row errors
                        }
                    });
                }

                grid.refresh();
                console.log('product query set for animal:', animal_name);
            }

            // Initialize query (no animal selected yet)
            set_product_query_for_animal(null);

            // When animal is selected, fetch Animal Products tied to that animal and populate production_table
            dialog.$wrapper.on('change', 'input[data-fieldname="animal"]', function() {
                const animal = $(this).val();

                // set the client-side query immediately
                set_product_query_for_animal(animal);

                if (!animal) {
                    const tbl = dialog.fields_dict.production_table;
                    if (tbl) {
                        tbl.df.data = [];
                        if (tbl.grid) tbl.grid.refresh();
                    }
                    return;
                }

                // fetch matching Animal Products and populate the table rows
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Animal Products',
                        filters: { product_tied_to_which_animal: animal },
                        fields: ['name', 'default_unit_of_measure'],
                        limit_page_length: 500
                    },
                    callback: function(r) {
                        if (!r.message || !r.message.length) {
                            const tbl = dialog.fields_dict.production_table;
                            if (tbl) {
                                tbl.df.data = [];
                                if (tbl.grid) tbl.grid.refresh();
                            }
                            frappe.show_alert({ message: __('No products found for selected animal'), indicator: 'orange' });
                            return;
                        }

                        const products = r.message;
                        const rows = products.map(p => ({
                            animal_product: p.name,
                            default_uom: p.default_unit_of_measure || '',
                            quantity_collected: 0.0
                        }));

                        const tbl = dialog.fields_dict.production_table;
                        if (tbl) {
                            tbl.df.data = rows;
                            if (tbl.grid) tbl.grid.refresh();
                        }
                    }
                });
            });

            // --- Prevent future date on blur: reset to today and notify user ---
            dialog.$wrapper.on('blur', 'input[data-fieldname="date_of_collection"]', function() {
                const $input = $(this);
                const val = $input.val();
                if (!val) return;
                const today = frappe.datetime.get_today();

                // date strings in YYYY-MM-DD can be compared lexicographically
                if (val > today) {
                    frappe.msgprint({
                        title: __('Invalid Date'),
                        message: __('Date of Collection cannot be a future date. The value has been reset to today.'),
                        indicator: 'orange'
                    });

                    // set dialog field and input to today's date
                    dialog.set_value('date_of_collection', today);
                    $input.val(today);

                    // If datepicker is open, close it (best effort)
                    try {
                        $input.blur();
                    } catch (e) {
                        // ignore
                    }
                }
            });

            // When an animal_product link is chosen (awesomplete completes), auto-fill default_uom
            dialog.$wrapper.on('awesomplete-selectcomplete', 'input[data-fieldname="animal_product"]', function() {
                const $input = $(this);
                const val = $input.val();
                const $row = $input.closest('.grid-row');
                const rowName = $row.attr('data-name');
                const grid = dialog.fields_dict.production_table.grid;
                if (!grid) return;
                frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Animal Products', filters: { name: val }, fieldname: 'default_unit_of_measure' },
                    callback: function(r) {
                        const uom = (r && r.message && r.message.default_unit_of_measure) || '';
                        const row = grid.get_row(rowName);
                        if (row && row.doc) {
                            row.doc.default_uom = uom;
                            if (row.refresh_field) row.refresh_field('default_uom');
                        } else {
                            grid.refresh();
                        }
                    }
                });
            });

            // If user clicks "Add Row", ensure the new row picks up the query
            dialog.$wrapper.on('click', '.grid-add-row, .grid-add-rows, .grid-row-add', function() {
                setTimeout(function() {
                    const animal_val = dialog.get_value('animal');
                    set_product_query_for_animal(animal_val);
                }, 50);
            });

        }).addClass('btn-primary');
    }
};
