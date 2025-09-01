// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Poultry Batches", {
	refresh(frm) {
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