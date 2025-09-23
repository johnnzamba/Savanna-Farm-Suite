#!/usr/bin/env python3
"""
Test script to verify if the email override is working.
"""

import frappe

def test_email_override():
    """Test if the email override is working."""
    try:
        # Try to import the Email class
        from frappe.email.receive import Email
        
        # Check if our override is in place
        if hasattr(Email, 'set_subject'):
            # Check if it's our custom method
            method_source = Email.set_subject.__module__
            print(f"Email.set_subject method source: {method_source}")
            
            if 'farm_management_system' in method_source:
                print("✅ SUCCESS: Email.set_subject is overridden with our custom method!")
                return True
            else:
                print("❌ FAILED: Email.set_subject is not our custom method")
                print("Attempting to manually patch...")
                
                # Try to manually patch
                try:
                    from farm_management_system.config.email import monkey_patch_email
                    result = monkey_patch_email()
                    if result:
                        print("✅ SUCCESS: Manual monkey-patching worked!")
                        
                        # Check again
                        method_source = Email.set_subject.__module__
                        print(f"Email.set_subject method source after patching: {method_source}")
                        
                        if 'farm_management_system' in method_source:
                            print("✅ SUCCESS: Email.set_subject is now overridden!")
                            return True
                        else:
                            print("❌ FAILED: Manual patching didn't work")
                            return False
                    else:
                        print("❌ FAILED: Manual monkey-patching failed")
                        return False
                except Exception as e:
                    print(f"❌ ERROR during manual patching: {str(e)}")
                    return False
        else:
            print("❌ FAILED: Email.set_subject method not found")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    test_email_override()


import frappe
import os
import random
import xml.etree.ElementTree as ET

def randomize_splash_image():
    # Dynamically fetch all valid .svg files from the app's public directory recursively
    public_dir = frappe.get_app_path('farm_management_system', 'public')
    logos = []
    for root, dirs, files in os.walk(public_dir):
        for file in files:
            if file.lower().endswith('.svg'):
                full_path = os.path.join(root, file)
                try:
                    tree = ET.parse(full_path)
                    svg = tree.getroot()
                    if svg.tag == '{http://www.w3.org/2000/svg}svg':
                        width = svg.get('width')
                        height = svg.get('height')
                        viewbox = svg.get('viewBox')
                        has_good_dimensions = False
                        if viewbox:
                            has_good_dimensions = True
                        elif width and height:
                            try:
                                w = float(width.rstrip('px%'))
                                h = float(height.rstrip('px%'))
                                if w > 0 and h > 0:
                                    has_good_dimensions = True
                            except ValueError:
                                pass
                        if has_good_dimensions:
                            rel_path = os.path.relpath(full_path, public_dir)
                            url = f"/assets/farm_management_system/{rel_path.replace(os.sep, '/')}"
                            logos.append(url)
                except Exception:
                    # Skip invalid or unparsable SVGs
                    pass

    if logos:
        # Use session to maintain consistency during the session
        session_key = "farm_app_logo"
        if not frappe.session.get(session_key):
            frappe.session[session_key] = random.choice(logos)
        
        app_logo = frappe.session[session_key]
    else:
        # Fallback to default logo if no valid SVGs found
        app_logo = "/assets/frappe/images/frappe-framework-logo.png"

    return app_logo