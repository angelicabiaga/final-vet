# PawCruz Connected Dashboards

No new SQL file is required. The dashboards read from the existing PawCruz tables and gracefully skip an optional module if its table is unavailable.

Dashboards included:
- Admin: users, pets, appointments, queue, inventory alerts, medical records
- Staff: today's appointments, walk-ins, queue, patients, inventory alerts
- Veterinarian: assigned appointments, queue, records, medicine alerts
- Pet Owner: own pets, upcoming appointments, queue, finalized records, messages

Restart the React dev servers after replacing the project:

npm install
npm start

Multi-role testing remains available through start:admin, start:staff, start:vet, and start:owner.
