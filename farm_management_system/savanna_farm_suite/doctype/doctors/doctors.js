// Copyright (c) 2025, Techsavanna Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Doctors", {
	refresh(frm) {
		// Sync doctor's appointment table with latest Treatment and Vaccination Logs
		if (!frm.doc || !frm.doc.name) return;
		if (frm.__syncing_appointments) return;
		// Suppress immediate re-run after our own save + reload
		try {
			const k = `doctor_sync_suppress_${frm.doc.name}`;
			const ts = window.sessionStorage ? Number(window.sessionStorage.getItem(k) || 0) : 0;
			if (ts && Date.now() - ts < 5000) {
				return;
			}
		} catch (e) {}
		frm.__syncing_appointments = true;

		syncDoctorAppointments(frm).always(() => {
			frm.__syncing_appointments = false;
			// render calendar after sync completes (sync may change table_ihua)
			renderDoctorActivityCalendar(frm);
		});
		
		// initial render on refresh
		renderDoctorActivityCalendar(frm);
	},

	fetch_latest_appointments(frm) {
		// Button field handler to fetch/sync latest appointments on demand
		if (!frm.doc || !frm.doc.name) return;
		if (frm.__syncing_appointments) return;
		frm.__syncing_appointments = true;
		syncDoctorAppointments(frm).always(() => {
			frm.__syncing_appointments = false;
			// re-render after fetch
			renderDoctorActivityCalendar(frm);
		});
	}
});

function renderDoctorActivityCalendar(frm) {
	const wrapper_field = frm.get_field('doctors_activity_chart');
	if (!wrapper_field) return;

	const $wrap = wrapper_field.$wrapper;
	$wrap.empty();

	const rows = (frm.doc.table_ihua || []).filter(r => r.date_of_appointment);
	if (!rows.length) {
		$wrap.html('<div class="text-muted">No appointments found to visualize.</div>');
		return;
	}

	// HTML escape + newline -> <br>
	const esc = (s) => {
		if (s === null || s === undefined) return '';
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;")
			.replace(/\n/g, "<br>");
	};

	// group rows by YYYY-MM-DD
	const groupByDate = {};
	rows.forEach((r) => {
		if (!r.date_of_appointment) return;
		let raw = r.date_of_appointment;
		let key;
		if (typeof raw === 'string') key = raw.substr(0, 10);
		else if (raw instanceof Date) {
			key = `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;
		} else key = String(raw).substr(0,10);
		if (!groupByDate[key]) groupByDate[key] = [];
		groupByDate[key].push({
			log: r.appointment_log || '',
			status: r.appointment_status || '',
			row: r
		});
	});

	// deterministic color per date
	function hashString(s) {
		let h = 2166136261 >>> 0;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
		}
		return (h >>> 0);
	}
	function colorForKey(key) {
		const h = hashString(key) % 360;
		const light = 72 - (hashString(key + 'L') % 14);
		const sat = 62 + (hashString(key + 'S') % 18);
		return `hsl(${h}, ${sat}%, ${light}%)`;
	}
	function statusColor(status) {
	const s = String(status || '').trim();
	switch (s) {
		case 'Upcoming':
		return '#3b82f6';           // Blue
		case 'Appointment Set for This Month':
		return '#f59e0b';           // Yellow (amber)
		case 'Appointment Set for This Week':
		return '#8b5cf6';           // Purple
		case 'Appointment Scheduled for Today':
		return '#10b981';           // Green
		case 'Appointment Passed':
		return '#ef4444';           // Red
		default:
		return '#e6e6e6';           // neutral
	}
	}
	function statusTextColor(status) {
	// Yellow needs dark text for legibility, others use white
	const bg = statusColor(status);
	if (bg === '#f59e0b') return '#000';
	return '#fff';
	}


	// container id
	const id = `doctor-calendar-${(Math.random()*1e9|0)}`;

	const calendarHTML = `
		<style>
		#${id} { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; max-width: 700px; }
		#${id} .cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
		#${id} .cal-nav { cursor:pointer; padding:6px 10px; border-radius:6px; user-select:none; }
		#${id} .cal-month { font-weight:600; font-size:1.05rem; }
		#${id} .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
		#${id} .weekday { text-align:center; font-size:0.8rem; color:#666; padding:6px 0; }
		#${id} .day { min-height:70px; border-radius:8px; padding:6px; position:relative; background: #f7f7f7; outline: none; }
		#${id} .day.outside { opacity:0.25; background:transparent; }
		#${id} .day .date-num { font-weight:600; font-size:0.95rem; display:block; margin-bottom:6px; }
		#${id} .has-appointments { cursor:pointer; box-shadow: inset 0 0 0 2px rgba(0,0,0,0.03); }
		#${id} .status-pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; margin-right:6px; color:#111; }
		#${id} .cal-footer { margin-top:10px; color:#666; font-size:0.85rem; }
		/* Tooltip (empty placeholder - actual tooltip is appended to body to avoid clipping) */
		</style>

		<div id="${id}">
			<div class="cal-header">
				<div>
					<span class="cal-nav" id="${id}-prev" title="Previous month">&#9664;</span>
					<span class="cal-nav" id="${id}-next" title="Next month" style="margin-left:8px;">&#9654;</span>
				</div>
				<div class="cal-month" id="${id}-month"></div>
				<div style="width:46px"></div>
			</div>
			<div class="cal-grid" id="${id}-weekdays">
				<div class="weekday">Sun</div><div class="weekday">Mon</div><div class="weekday">Tue</div><div class="weekday">Wed</div><div class="weekday">Thu</div><div class="weekday">Fri</div><div class="weekday">Sat</div>
			</div>
			<div class="cal-grid" id="${id}-days" style="margin-top:8px;"></div>
			<div class="cal-footer">Highlighted days are appointment dates (tap/click for details on mobile).</div>
		</div>
	`;

	$wrap.append(calendarHTML);

	let currentMonth, currentYear;
	// default month: month with earliest appointment or today
	const keys = Object.keys(groupByDate);
	if (keys.length) {
		const sorted = keys.slice().sort();
		const first = new Date(sorted[0] + 'T00:00:00');
		currentMonth = first.getMonth();
		currentYear = first.getFullYear();
	} else {
		const now = new Date();
		currentMonth = now.getMonth();
		currentYear = now.getFullYear();
	}

	const $monthLabel = $wrap.find(`#${id}-month`);
	const $days = $wrap.find(`#${id}-days`);
	$wrap.find(`#${id}-prev`).on('click', () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderMonth(); });
	$wrap.find(`#${id}-next`).on('click', () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderMonth(); });

	// Tooltip manager: single tooltip element appended to body
	let tooltipEl = null;
	let tooltipVisibleFor = null; // dateKey tracked
	function createTooltip() {
		if (tooltipEl) return tooltipEl;
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'doctor-appt-tooltip';
		Object.assign(tooltipEl.style, {
			position: 'fixed',
			zIndex: 2147483647,
			padding: '10px',
			borderRadius: '8px',
			background: 'rgba(255,255,255,0.98)',
			boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
			maxWidth: '320px',
			fontSize: '0.87rem',
			color: '#111',
			display: 'none',
			pointerEvents: 'none'
		});
		document.body.appendChild(tooltipEl);
		return tooltipEl;
	}
	function showTooltipFor(dateKey, x, y, appts) {
		const el = createTooltip();
		tooltipVisibleFor = dateKey;
		// produce HTML
		const parts = appts.map(a => {
			const pillColor = statusColor(a.status);
			return `<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed rgba(0,0,0,0.06)">
						<span class="status-pill" style="background:${pillColor};">${esc(a.status || '—')}</span>
						<div style="display:inline-block;vertical-align:middle;max-width:220px">${esc(a.log || '(no note)')}</div>
					</div>`;
		}).join('');
		el.innerHTML = parts || '<div style="opacity:0.7">No details</div>';
		el.style.display = 'block';
		el.style.pointerEvents = 'none';
		positionTooltip(x, y, el);
	}
	function hideTooltip() {
		if (!tooltipEl) return;
		tooltipEl.style.display = 'none';
		tooltipVisibleFor = null;
	}
	function positionTooltip(clientX, clientY, el) {
		if (!el) el = tooltipEl;
		const pad = 12;
		const rect = el.getBoundingClientRect();
		const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
		const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

		// default: below and slightly right of cursor
		let left = clientX + 12;
		let top = clientY + 16;

		// flip to left if overflow
		if (left + rect.width + pad > vw) left = clientX - rect.width - 12;
		// if still overflow left, clamp
		left = Math.max(pad, Math.min(left, vw - rect.width - pad));
		// if bottom overflow, place above cursor
		if (top + rect.height + pad > vh) top = clientY - rect.height - 12;
		top = Math.max(pad, Math.min(top, vh - rect.height - pad));

		el.style.left = `${left}px`;
		el.style.top = `${top}px`;
	}

	// Event binding helpers (delegated)
	function attachDayHandlers($container) {
		// Remove existing handlers to avoid duplicates
		$container.off('.docCal');
		$container.on('mouseenter.docCal', '.has-appointments', function (ev) {
			// show tooltip
			const $d = $(this);
			// dataset key stored
			const dateKey = $d.data('date-key');
			if (!dateKey || !groupByDate[dateKey]) return;
			const appts = groupByDate[dateKey];
			// show tooltip near mouse position
			showTooltipFor(dateKey, ev.clientX, ev.clientY, appts);

			// follow the cursor
			const moveHandler = function(e) {
				positionTooltip(e.clientX, e.clientY);
			};
			$(document).on('mousemove.docCal', moveHandler);

			$d.data('docCal_moveHandler', moveHandler);
		});
		$container.on('mouseleave.docCal', '.has-appointments', function () {
			const $d = $(this);
			// remove move handler
			const moveHandler = $d.data('docCal_moveHandler');
			if (moveHandler) $(document).off('mousemove.docCal', moveHandler);
			$d.removeData('docCal_moveHandler');
			hideTooltip();
		});

		// keyboard focus accessibility
		$container.on('focus.docCal', '.has-appointments', function (ev) {
			const $d = $(this);
			const dateKey = $d.data('date-key');
			if (!dateKey || !groupByDate[dateKey]) return;
			const appts = groupByDate[dateKey];
			// show tooltip near element (center-top)
			const rect = this.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			showTooltipFor(dateKey, cx, cy, appts);
		});
		$container.on('blur.docCal', '.has-appointments', function () {
			hideTooltip();
		});

		// handle click/tap toggle for mobile (touch)
		$container.on('click.docCal', '.has-appointments', function (ev) {
			// For touch devices the mouseenter may not fire consistently, so toggle tooltip
			const $d = $(this);
			const dateKey = $d.data('date-key');
			if (!dateKey || !groupByDate[dateKey]) return;
			const appts = groupByDate[dateKey];
			if (tooltipVisibleFor === dateKey) {
				hideTooltip();
			} else {
				showTooltipFor(dateKey, ev.clientX || (this.getBoundingClientRect().left + 10), ev.clientY || (this.getBoundingClientRect().top + 10), appts);
			}
		});
	}

	function pad(n) { return String(n).padStart(2,'0'); }
	function dateKeyFromYMD(y,m,d) { return `${y}-${pad(m)}-${pad(d)}`; }

	function renderMonth() {
		const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
		$monthLabel.text(`${monthNames[currentMonth]} ${currentYear}`);
		$days.empty();

		const firstWeekday = new Date(currentYear, currentMonth, 1).getDay();
		const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();

		for (let i=0;i<firstWeekday;i++) $days.append(`<div class="day outside"></div>`);

		for (let d=1; d<=daysInMonth; d++) {
			const key = dateKeyFromYMD(currentYear, currentMonth+1, d);
			const appts = groupByDate[key] || [];
			const has = !!appts.length;
			const $day = $(`<div class="day ${has ? 'has-appointments' : ''}" tabindex="${has ? 0 : -1}" data-date-key="${key}"></div>`);
			$day.append(`<span class="date-num">${d}</span>`);
			if (has) {
				const bg = colorForKey(key);
				$day.css('background', bg);
				// compact preview lines inside day (first item)
				const preview = esc((appts[0] && appts[0].log) || (appts[0] && appts[0].status) || '');
				$day.append(`<div style="font-size:0.78rem;opacity:0.95;max-height:40px;overflow:hidden">${preview}</div>`);
			}
			$days.append($day);
		}

		const totalCells = firstWeekday + daysInMonth;
		const trailing = (7 - (totalCells % 7)) % 7;
		for (let i=0;i<trailing;i++) $days.append(`<div class="day outside"></div>`);

		// attach events (delegated on parent container)
		attachDayHandlers($days);
	}

	// initial render
	renderMonth();

	// mutation observer (rebuild when child table changes)
	try {
		const tableWrapper = frm.get_field('table_ihua') ? frm.get_field('table_ihua').$wrapper.get(0) : null;
		if (tableWrapper) {
			if (!tableWrapper._doctor_calendar_observer) {
				const mo = new MutationObserver((mutations) => {
					if (tableWrapper._doctor_calendar_timer) clearTimeout(tableWrapper._doctor_calendar_timer);
					tableWrapper._doctor_calendar_timer = setTimeout(() => {
						// rebuild entire calendar to sync data (safe, simple)
						renderDoctorActivityCalendar(frm);
					}, 150);
				});
				mo.observe(tableWrapper, { childList: true, subtree: true, attributes: true, characterData: true });
				tableWrapper._doctor_calendar_observer = mo;
			}
		}
	} catch (e) {
		console.error('calendar observer error', e);
	}
}


function syncDoctorAppointments(frm) {
	const dfd = $.Deferred();
	// Fetch latest Treatment and Vaccination Logs for this doctor
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Treatment and Vaccination Logs',
			filters: { doctor: frm.doc.name },
			fields: ['name', 'treatment_date', 'status', 'doctors_purchase_order_based_on_appointment_fee', 'creation'],
			order_by: 'treatment_date desc, creation desc',
			limit_page_length: 500
		},
		callback: function(r) {
			const logs = r.message || [];
			let changed = false;
			// If any existing rows, clear and reappend fresh to avoid link errors
			if ((frm.doc.table_ihua || []).length > 0) {
				frm.clear_table('table_ihua');
				changed = true;
			}

			// Rebuild rows newest to oldest by treatment_date
			logs.forEach(log => {
				const target_date = log.treatment_date ? String(log.treatment_date) : null;
				const target_status = String(log.status || '');
				// const target_po = Number(!!log.doctors_purchase_order_based_on_appointment_fee);
				const newRow = frm.add_child('table_ihua');
				newRow.appointment_log = log.name;
				newRow.date_of_appointment = target_date;
				newRow.appointment_status = target_status;
				newRow.purchase_order_generated = log.doctors_purchase_order_based_on_appointment_fee;
				changed = true;
			});

			if (changed) {
				frm.refresh_field('table_ihua');
				frm.save().then(() => {
					// Set suppress flag for a short period to avoid loops after reload
					try {
						const k = `doctor_sync_suppress_${frm.doc.name}`;
						if (window.sessionStorage) window.sessionStorage.setItem(k, String(Date.now()));
					} catch (e) {}
					frm.reload_doc().then(() => dfd.resolve());
				}).catch(() => dfd.resolve());
			} else {
				dfd.resolve();
			}
		}
	});

	return dfd.promise();
}

// Child table button: View linked Treatment and Vaccination Log
frappe.ui.form.on('Doc Treatment Table', {
	view_log(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		// Prefer direct link if present
		if (row.appointment_log) {
			frappe.set_route('Form', 'Treatment and Vaccination Logs', row.appointment_log);
			return;
		}
		// Fallback: find by doctor + date + status
		const filters = {
			doctor: frm.doc.name
		};
		if (row.date_of_appointment) filters.treatment_date = row.date_of_appointment;
		if (row.appointment_status) filters.status = row.appointment_status;
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Treatment and Vaccination Logs',
				filters,
				fields: ['name'],
				limit_page_length: 1
			},
			callback: function(r) {
				if (r.message && r.message.length) {
					frappe.set_route('Form', 'Treatment and Vaccination Logs', r.message[0].name);
				} else {
					frappe.msgprint(__('Could not locate the linked Treatment and Vaccination Log.'));
				}
			}
		});
	}
});
