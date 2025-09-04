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
