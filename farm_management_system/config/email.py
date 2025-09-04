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