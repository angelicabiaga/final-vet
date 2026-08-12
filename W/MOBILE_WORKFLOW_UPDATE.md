# PawCruz Mobile Appointment and Queue Update

## Mobile roles
Only Pet Owner and Veterinarian accounts can enter authenticated mobile screens. Staff and Administrator accounts are rejected with instructions to use the web system. Public registration creates Pet Owner accounts only; veterinarian accounts remain managed by the clinic.

## Queue access
- Pet Owners can only view their own assigned queue entry after Staff checks them in.
- Veterinarians can view the live queue in read-only mode.
- The public `/queue` route requires no authentication and exposes only queue number, status, and assigned veterinarian.
- Mobile screens do not provide queue creation, queue ordering, confirmation, cancellation, or rescheduling actions.

## API routes used
The update keeps the existing Axios API configuration and uses these read-only endpoints:
- `GET /api/appointments?veterinarian_id=<id>`
- `GET /api/appointments?owner_id=<id>`
- `GET /api/queue?date=YYYY-MM-DD`
- `GET /api/queue?owner_id=<id>&date=YYYY-MM-DD`
- `GET /api/queue/public?date=YYYY-MM-DD`

Responses may be an array or an object containing `data`, `items`, `appointments`, or `queue`. Queue and appointment screens poll every five seconds so updates appear without manual refresh. The backend should continue enforcing access control and returning only authorized records.

## Allowed statuses
Appointments: Confirmed, Completed, Cancelled.
Queue: Waiting, Serving, Completed.
