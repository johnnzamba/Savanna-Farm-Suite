import frappe
from frappe import _

def create_default_asset_category():
    """
    Create or update 'Default Livestock Category' Asset Category with a single
    accounts child row built from Global Defaults.default_company and Company.abbr.
    Uses the Doc API to avoid SQL errors when writing child tables.
    """
    try:
        # 1. Fetch default company from Global Defaults single
        defaults = frappe.get_single("Global Defaults")
        default_company = defaults.get("default_company")
        if not default_company:
            frappe.log_error("Global Defaults.default_company is not set",
                             "Create Default Asset Category Error")
            return

        if not frappe.db.exists("Company", default_company):
            frappe.log_error(f"Company '{default_company}' does not exist",
                             "Create Default Asset Category Error")
            return

        # 2. Fetch company abbreviation
        company = frappe.get_doc("Company", default_company)
        abbr = (company.get("abbr") or "").strip()

        # 3. Build fixed asset account name
        fixed_asset_account = f"Capital Equipments - {abbr}" if abbr else "Capital Equipments"

        # 4. Prepare desired values
        asset_category_name = "Default Livestock Category"

        # Helper: map expected fieldnames for the child table row
        def populate_accounts_row(doc, default_company, fixed_asset_account):
            """
            Append a single row to doc.accounts mapping to whatever fieldnames
            the child doctype actually uses (company/company_name, fixed_asset_account/account).
            """
            # get child doctype name from the meta (field 'accounts' must exist)
            field_meta = doc.meta.get_field("accounts")
            if not field_meta:
                # No child table called 'accounts' — just return None to indicate failure
                return None

            child_doctype = field_meta.options
            child_meta = frappe.get_meta(child_doctype)
            child_fieldnames = {f.fieldname for f in child_meta.fields}

            # create empty row
            row = doc.append("accounts", {})

            # set company field (try common names)
            if "company_name" in child_fieldnames:
                row.company_name = default_company
            elif "company" in child_fieldnames:
                row.company = default_company
            elif "company_name" not in child_fieldnames and "company" not in child_fieldnames:
                # try any field that contains 'company' in its name
                for fn in child_fieldnames:
                    if "company" in fn:
                        setattr(row, fn, default_company)
                        break

            # set fixed asset account field (try common variants)
            if "fixed_asset_account" in child_fieldnames:
                row.fixed_asset_account = fixed_asset_account
            elif "fixed_asset_account_name" in child_fieldnames:
                row.fixed_asset_account_name = fixed_asset_account
            elif "account" in child_fieldnames:
                row.account = fixed_asset_account
            else:
                # fallback: find a field with 'asset' or 'account' in its name
                for fn in child_fieldnames:
                    if "asset" in fn or "account" in fn:
                        setattr(row, fn, fixed_asset_account)
                        break

            return row

        # 5. Create or update the Asset Category using Doc API
        if frappe.db.exists("Asset Category", asset_category_name):
            asset_cat = frappe.get_doc("Asset Category", asset_category_name)
            # clear existing accounts table
            asset_cat.set("accounts", [])
            # append a mapped row
            appended = populate_accounts_row(asset_cat, default_company, fixed_asset_account)
            if appended is None:
                frappe.log_error(
                    f"'Asset Category' doctype has no 'accounts' child table field.",
                    "Create Default Asset Category Error"
                )
                return

            # save and commit
            asset_cat.save(ignore_permissions=True)
            frappe.db.commit()
            frappe.logger().info(f"Updated Asset Category '{asset_category_name}' with accounts row.")
            return

        # not exists -> create new
        new_cat = frappe.new_doc("Asset Category")

        # try to set a sensible title field (support several possible fieldnames)
        title_field_candidates = [
            "asset_category_name", "asset_category", "category_name", "category",
            "title", "name"
        ]
        meta_fieldnames = {f.fieldname for f in new_cat.meta.fields}
        for candidate in title_field_candidates:
            if candidate in meta_fieldnames:
                # 'name' is not normally set as a field - skip setting 'name' here
                if candidate == "name":
                    continue
                setattr(new_cat, candidate, asset_category_name)
                break

        # ensure accounts child table exists and append a mapped row
        appended = populate_accounts_row(new_cat, default_company, fixed_asset_account)
        if appended is None:
            frappe.log_error(
                f"'Asset Category' doctype has no 'accounts' child table field.",
                "Create Default Asset Category Error"
            )
            return

        # insert and commit
        new_cat.insert(ignore_permissions=True)
        frappe.db.commit()
        frappe.logger().info(f"Created Asset Category '{asset_category_name}' with accounts row.")

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Create Default Asset Category Error")
        return
