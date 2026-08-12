# Inventory Items Added

Imported 135 products from `inventory.xlsx` into a Supabase seed script.

- Categories and product names are preserved.
- Numeric prices are imported directly.
- Text prices such as `by kilos 2,800-3,500`, `3/50`, and `1/1800` are preserved in the item description.
- A usable numeric base price is stored in `unit_price`.
- Initial quantity is `0` because the spreadsheet did not provide stock quantities.
- Default reorder level is `5`.
- Existing matching inventory item quantities are not overwritten.

Run `SUPABASE_INVENTORY_2026_ITEMS_SEED.sql` in Supabase SQL Editor for an existing database.
