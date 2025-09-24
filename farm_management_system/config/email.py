import frappe
from frappe.email.receive import Email
import re
from email.header import decode_header
from frappe import safe_decode

# Your custom constants
ALTERNATE_CHARSET_MAP = {
    "windows-874": "cp874",
}

# Your custom regex for removing only leading SPAM tags
SPAM_TAG_RE = re.compile(r'^(?:\s*(?:<|&lt;)\s*spam\s*(?:>|&gt;)\s*)+', re.IGNORECASE)

def apply_email_overrides(bootinfo):
    from frappe.email.receive import Email as FrappeEmail
    FrappeEmail.set_subject = custom_set_subject
    
def custom_set_subject(self):
    """Parse and decode `Subject` header and remove only leading <SPAM> / &lt;SPAM&gt; tags."""
    raw = self.mail.get("Subject", "No Subject")
    parts = []

    try:
        for fragment, charset in decode_header(raw):
            # If fragment is bytes, try to decode it
            if isinstance(fragment, bytes):
                cs = (charset or "").lower()
                alt_cs = ALTERNATE_CHARSET_MAP.get(cs, None)

                # Prefer using safe_decode if available (keeps your existing behavior)
                try:
                    if 'safe_decode' in globals() or getattr(self, "safe_decode", None):
                        preferred_charset = charset or alt_cs or "utf-8"
                        sd = globals().get("safe_decode") or getattr(self, "safe_decode")
                        decoded = sd(fragment, preferred_charset, ALTERNATE_CHARSET_MAP)
                        if isinstance(decoded, bytes):
                            decoded = decoded.decode("utf-8", "replace")
                        parts.append(str(decoded))
                    else:
                        # fallback: use mapped charset or utf-8 with replace
                        decode_cs = alt_cs or charset or "utf-8"
                        parts.append(fragment.decode(decode_cs, "replace"))
                except Exception:
                    # last-resort: utf-8 replace
                    parts.append(fragment.decode("utf-8", "replace"))
            else:
                # fragment already str
                parts.append(str(fragment))

        subject = "".join(parts)
    except Exception:
        subject = str(raw or "No Subject")

    # Remove only leading <SPAM> or &lt;SPAM&gt; (case-insensitive), possibly repeated,
    # but do NOT remove other content (like "Fwd:" or the numeric tokens).
    subject = SPAM_TAG_RE.sub("", subject)

    # Normalize / truncate / fallback
    subject = str(subject).strip()[:140] or "No Subject"
    self.subject = subject



# # Apply the monkey patch - ONLY replaces set_subject method
# Email.set_subject = custom_set_subject


import frappe
from datetime import datetime, timedelta

def send_reminder_emails():
    # Fetch Farm Suite Settings (assuming it's a singleton doctype)
    settings = frappe.get_single("Farm Suite Settings")
    
    # Parse the days for reminders
    days_str = settings.specify_number_of_days_for_initial_reminder or ""
    days_list = [int(d.strip()) for d in days_str.split(',') if d.strip().isdigit()]
    
    # Fetch reminder time (assuming it's a Time field)
    reminder_time = settings.reminder_to_be_sent_at_what_time
    
    # Note: Assuming this function is scheduled to run daily at the reminder_time.
    # If a time check is needed, it can be added, but per description, proceeding directly.
    
    # Get today's date
    today = datetime.today().date()
    
    # Fetch all Treatment and Vaccination Logs with necessary fields
    logs = frappe.get_all(
        "Treatment and Vaccination Logs",
        fields=["name", "treatment_date", "doctor"]
    )
    
    for log in logs:
        if not log.treatment_date or not log.doctor:
            continue
        
        # Calculate days past since treatment
        days_past = (today - log.treatment_date).days
        
        # Check if days_past matches any in days_list
        if days_past in days_list:
            # Fetch doctor's email
            doctor_doc = frappe.get_doc("Doctors", log.doctor)
            email = doctor_doc.doctors_email_address
            if not email:
                continue
            
            recipients = [email]
            
            # Load the email template
            tmpl = frappe.get_doc("Email Template", "Doctor's Notification")
            
            # Get context from the log document
            context = frappe.get_doc("Treatment and Vaccination Logs", log.name).as_dict()
            
            # Render subject and body
            subject = frappe.render_template(tmpl.subject, context)
            body = frappe.render_template(tmpl.response, context)
            
            # Send the email
            frappe.sendmail(
                recipients=recipients,
                subject=subject,
                message=body,
                reference_doctype="Treatment and Vaccination Logs",
                reference_name=log.name
            )
            
            # Update the log document with new reminder log entry
            log_doc = frappe.get_doc("Treatment and Vaccination Logs", log.name)
            
            # Append to child table reminder_logs (assuming fields exist)
            new_reminder = log_doc.append("reminder_logs", {})
            new_reminder.reminder_sent_at_what_time = frappe.utils.now_datetime()
            new_reminder.follow_up_scheduled = 1
            
            # Save the document to update
            log_doc.save(ignore_permissions=True)


# farm_management_system/config/email.py
import frappe
from frappe.utils import (
    now_datetime,
    get_datetime,
    getdate,
    today,
)
from datetime import datetime, timedelta, time as dt_time

def _parse_days_list(days_raw: str):
    """Parse comma separated days string -> list[int]. Ignore invalid entries."""
    if not days_raw:
        return []
    out = []
    for part in days_raw.split(","):
        p = part.strip()
        if p.isdigit():
            out.append(int(p))
    return out

def _parse_time_str(time_raw: str):
    """
    Parse reminder time stored in settings into a datetime.time object.
    Accepts strings like "09:00", "09:00:00", or a Time type already.
    Returns None if not parseable / blank.
    """
    if not time_raw:
        return None
    # If it's already a time/datetime object (frappe may give string though)
    if isinstance(time_raw, dt_time):
        return time_raw
    try:
        # Try common HH:MM or HH:MM:SS formats
        t = get_datetime(f"1970-01-01 {time_raw}")
        return t.time()
    except Exception:
        # fallback: attempt simple split
        try:
            parts = str(time_raw).strip().split(":")
            h = int(parts[0])
            m = int(parts[1]) if len(parts) > 1 else 0
            return dt_time(hour=h, minute=m)
        except Exception:
            return None

def send_folowUp_emails():
    """
    Scheduled job:
     - For each Treatment and Vaccination Logs doc where vaccine_used is falsy,
       inspect each row in reminder_logs.
     - If reminder_sent_at_what_time.date() == today() - N (for any N in settings)
       and (current time matches settings.reminder_to_be_sent_at_what_time OR that setting empty),
       then fetch the doctor's email and send "Doctor's Notification" template.
     - Update the reminder row (set follow_up_scheduled, record reminder_email_sent_at)
    """
    try:
        settings = frappe.get_single("Farm Suite Settings")
    except Exception as e:
        frappe.log_error(message=f"Failed to load Farm Suite Settings: {e}", title="send_folowUp_emails")
        return

    days_raw = getattr(settings, "specify_number_of_days_after_missed_schedule", "") or ""
    days_list = _parse_days_list(days_raw)  # e.g. [3,5,8]
    if not days_list:
        # nothing configured — nothing to do
        return

    reminder_time_raw = getattr(settings, "reminder_to_be_sent_at_what_time", None)
    reminder_time_obj = _parse_time_str(reminder_time_raw)

    now_dt = now_datetime()
    today_date = getdate(today())

    # If reminder_time_obj is configured, only proceed when current server time matches it to the minute.
    # If not configured, allow sending immediately (whenever the scheduler runs).
    should_run_time_check = bool(reminder_time_obj)
    if should_run_time_check:
        current_time = now_dt.time()
        # compare hours and minutes
        if (current_time.hour, current_time.minute) != (reminder_time_obj.hour, reminder_time_obj.minute):
            # Not the scheduled minute, do nothing.
            return

    # Fetch all Treatment and Vaccination Logs (we filter in Python for vaccine_used falsy to be safe)
    # We fetch only names first to avoid heavy loads. We'll get_doc() for needed docs.
    logs = frappe.get_all("Treatment and Vaccination Logs", fields=["name"])

    sent_count = 0
    errors = []

    for row in logs:
        try:
            log_doc = frappe.get_doc("Treatment and Vaccination Logs", row.name)

            # Skip if vaccine_used is truthy
            vaccine_used_val = getattr(log_doc, "vaccine_used", None)
            if vaccine_used_val not in (None, "", 0, "0", False):
                continue

            # Ensure doctor field exists
            doctor_ref = getattr(log_doc, "doctor", None)
            if not doctor_ref:
                # no doctor assigned; skip
                continue

            # Iterate child table reminder_logs
            reminder_rows = getattr(log_doc, "reminder_logs", []) or []
            changed = False

            for r in reminder_rows:
                rem_dt_raw = getattr(r, "reminder_sent_at_what_time", None)
                if not rem_dt_raw:
                    continue

                # Parse to datetime
                try:
                    rem_dt = get_datetime(rem_dt_raw) if not isinstance(rem_dt_raw, (datetime,)) else rem_dt_raw
                except Exception:
                    # fallback: try frappe.utils.get_datetime on string
                    try:
                        rem_dt = get_datetime(str(rem_dt_raw))
                    except Exception:
                        continue

                rem_date = rem_dt.date()

                # For each configured day N, check if rem_date == today - N
                matched = False
                for n in days_list:
                    target_date = today_date - timedelta(days=n)
                    if rem_date == target_date:
                        matched = True
                        break

                if not matched:
                    continue

                # Prevent double-sending: check if this child already has an email-sent marker.
                # We'll try common fields: reminder_email_sent_at or email_sent or follow_up_scheduled.
                email_already_sent = False
                if getattr(r, "reminder_email_sent_at", None):
                    email_already_sent = True
                # If follow_up_scheduled already set and we used that to mark prior send, skip
                if getattr(r, "follow_up_scheduled", None):
                    # If follow_up_scheduled is used to mean a pending follow up, we can't be sure if email already went.
                    # We'll use reminder_email_sent_at preference first; if missing, still attempt send but it's possible duplicates occur.
                    pass

                if email_already_sent:
                    continue

                # Fetch doctor's email
                try:
                    doctor_doc = frappe.get_doc("Doctors", doctor_ref)
                    recipient = getattr(doctor_doc, "doctors_email_address", None)
                except Exception:
                    recipient = None

                if not recipient:
                    # no email to send to; skip but log
                    frappe.log_error(message=f"No doctors_email_address for Doctors:{doctor_ref}", title="send_folowUp_emails")
                    continue

                # Load template and render
                try:
                    tmpl = frappe.get_doc("Email Template", "Notification on Missed Schedule")
                except Exception:
                    frappe.log_error(message="Email Template 'Notification on Missed Schedule' not found", title="send_folowUp_emails")
                    continue

                # Context: use the treatment/vaccination log doc and add reminder_row info
                context = log_doc.as_dict()
                # attach shallow reminder row info
                context["_matched_reminder"] = {
                    "reminder_sent_at_what_time": getattr(r, "reminder_sent_at_what_time", None),
                    "row_index": getattr(r, "idx", None)
                }

                subject = frappe.render_template(tmpl.subject or "", context)
                body = frappe.render_template(tmpl.response or "", context)

                # Send
                try:
                    frappe.sendmail(
                        recipients=[recipient],
                        subject=subject,
                        message=body,
                        reference_doctype="Treatment and Vaccination Logs",
                        reference_name=log_doc.name,
                        now=True
                    )
                    sent_count += 1
                except Exception as e:
                    errors.append(f"Failed to send email for {log_doc.name} to {recipient}: {e}")
                    frappe.log_error(message=str(e), title="send_folowUp_emails sendmail failed")
                    continue

                # Mark the reminder row as sent: set fields if they exist.
                now_str = now_datetime()
                try:
                    # Prefer explicit fields if present
                    if "reminder_email_sent_at" in r.as_dict():
                        r.reminder_email_sent_at = now_str
                    else:
                        # fallback: create a generic field if defined on doctype; otherwise set follow_up_scheduled
                        pass

                    # Mark follow_up_scheduled to 1 (your earlier code used this)
                    try:
                        r.follow_up_scheduled = 1
                    except Exception:
                        # ignore if field not present
                        pass

                    # If no explicit reminder_email_sent_at field, try to set a common field name
                    if not getattr(r, "reminder_email_sent_at", None):
                        try:
                            r.reminder_email_sent_at = now_str
                        except Exception:
                            pass

                    changed = True
                except Exception as e:
                    # can't update child row fields — but email already sent; log and continue
                    frappe.log_error(message=f"Failed to update reminder row on {log_doc.name}: {e}", title="send_folowUp_emails update child")

            if changed:
                try:
                    log_doc.save(ignore_permissions=True)
                    frappe.db.commit()
                except Exception as e:
                    frappe.log_error(message=f"Failed to save Treatment and Vaccination Logs {log_doc.name}: {e}", title="send_folowUp_emails save failed")

        except Exception as e_outer:
            errors.append(f"Error processing log {row.get('name')}: {e_outer}")
            frappe.log_error(message=str(e_outer), title="send_folowUp_emails outer loop")

    # Optionally record a small summary in logs
    frappe.logger("farm_management_system").info(f"send_folowUp_emails: sent={sent_count}, errors={len(errors)}")
    return {"sent": sent_count, "errors": errors}
