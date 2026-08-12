# Inventory Save Fix

The screenshot error means the connected Supabase database does not currently expose the inventory tables required by the web app.

Run `FIX_INVENTORY_SAVE.sql` once in the SQL Editor of the SAME Supabase project used by the web app.

This creates/repairs the inventory tables, transaction function, permissions, RLS policies, realtime publication, and schema cache. It does not insert inventory items.

Expiry Date is required.
