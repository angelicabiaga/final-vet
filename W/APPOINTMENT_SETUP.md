# Appointment Module Setup

1. Run the previous `phase1_setup.sql` and `custom_auth_patch.sql` if not yet applied.
2. In Supabase SQL Editor, run `supabase/appointment_module.sql`.
3. Ensure veterinarian profiles exist and their `full_name` contains `Redmond` or `Neil/Cruz`.
4. Re-run the two schedule INSERT statements at the bottom of the SQL after creating veterinarian accounts.
5. Restart React with `npm start`.

Demo warning: this project uses custom localStorage authentication and plain-text passwords. The appointment RLS policies are intentionally permissive for the school demo. Do not deploy this approach with real client data.
