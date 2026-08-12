# PawCruz Inventory Management Setup

1. Open Supabase SQL Editor.
2. Run the complete contents of `supabase/inventory_module.sql`.
3. Restart all React localhost instances.

## Role access

- Admin: full item management, stock adjustments, archive/restore, history, CSV export.
- Staff: full item management and stock transactions.
- Veterinarian: inventory viewing and medicine-usage deductions only.
- Pet Owner: no inventory page.

## Inventory statuses

The database automatically calculates:

- In Stock
- Low Stock
- Out of Stock
- Near Expiry (within 30 days)
- Expired

## Stock transaction types

- Stock In
- Stock Out
- Medicine Usage
- Adjustment Add
- Adjustment Deduct
- Expired
- Damaged

Every movement is stored in `inventory_transactions`. Stock cannot go below zero.
