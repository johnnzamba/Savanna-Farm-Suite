// Email Override - Multiple approaches
console.log("Loading email override...");

// Approach 1: Try to trigger Python monkey-patching via server call
if (typeof frappe !== 'undefined') {
    frappe.call({
        method: 'frappe.utils.execute_cmd',
        args: {
            cmd: 'farm_management_system.config.email.monkey_patch_email',
            args: []
        },
        callback: function(r) {
            if (r.exc) {
                console.log("Python monkey-patch failed:", r.exc);
            } else {
                console.log("Python monkey-patch result:", r.message);
            }
        }
    });
}

// Approach 2: Try to trigger Python monkey-patching via direct method call
if (typeof frappe !== 'undefined') {
    frappe.call({
        method: 'farm_management_system.config.email.monkey_patch_email',
        args: [],
        callback: function(r) {
            if (r.exc) {
                console.log("Direct Python monkey-patch failed:", r.exc);
            } else {
                console.log("Direct Python monkey-patch result:", r.message);
            }
        }
    });
}

// Approach 3: JavaScript monkey-patching as fallback
if (typeof frappe !== 'undefined' && frappe.email && frappe.email.receive) {
    console.log("Attempting to monkey-patch Email.set_subject...");
    
    // This is a fallback approach if the Python override doesn't work
    const originalSetSubject = frappe.email.receive.Email.prototype.set_subject;
    
    frappe.email.receive.Email.prototype.set_subject = function() {
        console.log("Custom set_subject called!");
        
        // Call original method first
        if (originalSetSubject) {
            originalSetSubject.call(this);
        }
        
        // Apply our custom SPAM tag removal
        if (this.subject) {
            // Remove leading SPAM tags using regex
            const spamTagRegex = /^(?:\s*(?:<|&lt;)\s*spam\s*(?:>|&gt;)\s*)+/i;
            this.subject = this.subject.replace(spamTagRegex, '');
            this.subject = this.subject.trim();
            
            console.log("Subject after SPAM removal:", this.subject);
        }
    };
    
    console.log("Email.set_subject monkey-patched successfully");
} else {
    console.log("Email class not available for monkey-patching");
}
