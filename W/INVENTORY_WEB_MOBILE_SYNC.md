# PawCruz Inventory Web ↔ Mobile Sync

The Veterinarian mobile Inventory screen now reads the same `public.inventory_items`
table used by the PawCruz web Inventory Management module.

## One-time Supabase step
Run `SUPABASE_INVENTORY_REALTIME_SYNC.sql` in Supabase SQL Editor.

After that:
- inventory items created/edited/archived on web are reflected in mobile;
- quantity changes and Stock In/Stock Out results update the mobile screen;
- Low Stock, Out of Stock, Near Expiry, Expired, and In Stock statuses stay consistent;
- the mobile inventory view is read-only for the Veterinarian role.
