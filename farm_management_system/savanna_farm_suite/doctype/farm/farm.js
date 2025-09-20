// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Farm", {
    refresh(frm) {
        // ----------------------
        // 1) Default geolocation for new docs (Kenya: 1.0,38.0)
        // ----------------------
        if (frm.is_new() && !frm.doc.farm_geo_location) {
            const pointFeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            // GeoJSON coords: [lon, lat]
                            coordinates: [38.0, 1.0]
                        },
                        properties: {}
                    }
                ]
            };

            const trySetGeo = (retries = 8) => {
                const geoField = frm.fields_dict.farm_geo_location;

                // set the doc value as a JSON string (valid GeoJSON)
                try {
                    frm.set_value("farm_geo_location", JSON.stringify(pointFeatureCollection));
                    frm.refresh_field("farm_geo_location");
                } catch (e) {
                    console.warn("Could not set farm_geo_location via frm.set_value:", e);
                }

                // bounding box for Kenya (southWest, northEast)
                // [lat, lon] pairs used by leaflet.fitBounds
                const kenyaBounds = [
                    [-4.7, 33.5],  // southwest: ~4.7°S, 33.5°E
                    [5.2, 41.9]    // northeast: ~5.2°N, 41.9°E
                ];

                // if widget exists, try to fit bounds (preferred) or set a moderate view
                if (geoField && (geoField.map || geoField.leaflet_map)) {
                    try {
                        const map = geoField.map || geoField.leaflet_map;

                        // Prefer fitBounds so the whole country is visible
                        if (typeof map.fitBounds === "function") {
                            map.fitBounds(kenyaBounds, { padding: [20, 20] });
                        }
                        // Fallbacks for other map APIs
                        else if (typeof map.setView === "function") {
                            // Center on Kenya and use a zoom that shows the country
                            map.setView([0.75, 37.7], 6); // lat, lon, zoom ~6 shows country
                        } else if (typeof map.setCenter === "function") {
                            map.setCenter({ lat: 1.0, lng: 38.0 });
                            if (map.setZoom) map.setZoom(6);
                        }
                    } catch (e) {
                        console.warn("Could not adjust geolocation map view:", e);
                    }
                    return;
                }

                // retry if widget not ready
                if (retries > 0) {
                    setTimeout(() => trySetGeo(retries - 1), 200);
                }
            };

            trySetGeo();
        }

        // ----------------------
        // 2) Live keystroke -> convert land_acres (sqft) to acres
        // ----------------------
        const landFld = frm.fields_dict.land_acres;
        const ns = ".farm_acres_ns"; // namespaced events
        if (landFld && landFld.$input && landFld.$input.length) {
            // remove previous namespaced handlers
            landFld.$input.off(`input${ns} keyup${ns}`);

            // attach fresh handler
            landFld.$input.on(`input${ns} keyup${ns}`, function () {
                let raw = landFld.$input.val() || "";
                raw = String(raw).replace(/,/g, "").trim();
                const sqft = parseFloat(raw);
                const estimateFld = frm.fields_dict.estimate_in_acres;

                if (!isNaN(sqft) && sqft > 0) {
                    const acres = sqft / 43560;
                    // decide whether estimate_in_acres is numeric or text
                    if (estimateFld && estimateFld.df && estimateFld.df.fieldtype) {
                        const ft = estimateFld.df.fieldtype;
                        if (["Data", "Small Text", "Text"].includes(ft)) {
                            frm.set_value("estimate_in_acres", acres.toFixed(2) + " Acres");
                        } else {
                            // numeric types: Float, Int, Currency, etc.
                            frm.set_value("estimate_in_acres", parseFloat(acres.toFixed(2)));
                        }
                    } else {
                        // fallback: text
                        frm.set_value("estimate_in_acres", acres.toFixed(2) + " Acres");
                    }
                } else {
                    // clear estimate when input is empty/invalid
                    frm.set_value("estimate_in_acres", "");
                }
            });
        } else {
            // land_acres input not yet rendered — retry once shortly
            setTimeout(() => {
                const lf = frm.fields_dict.land_acres;
                if (lf && lf.$input && lf.$input.length) {
                    lf.$input.off(`input${ns} keyup${ns}`);
                    lf.$input.on(`input${ns} keyup${ns}`, function () {
                        let raw = lf.$input.val() || "";
                        raw = String(raw).replace(/,/g, "").trim();
                        const sqft = parseFloat(raw);
                        const acres = isNaN(sqft) ? 0 : sqft / 43560;
                        if (!isNaN(acres) && acres > 0) {
                            if (frm.fields_dict.estimate_in_acres && frm.fields_dict.estimate_in_acres.df && 
                                ["Data", "Small Text", "Text"].includes(frm.fields_dict.estimate_in_acres.df.fieldtype)) {
                                frm.set_value("estimate_in_acres", acres.toFixed(2) + " Acres");
                            } else {
                                frm.set_value("estimate_in_acres", parseFloat(acres.toFixed(2)));
                            }
                        } else {
                            frm.set_value("estimate_in_acres", "");
                        }
                    });
                }
            }, 200);
        }
    },
});
