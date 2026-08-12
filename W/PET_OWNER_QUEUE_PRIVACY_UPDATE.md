# Pet Owner Queue Display Update

The Pet Owner mobile app no longer displays the clinic live queue.

## Mobile Pet Owner behavior
- Booking an online appointment does **not** assign a queue number.
- Staff assigns the queue number only when the owner arrives and is checked in at the clinic.
- The Pet Owner `My Queue` screen displays only that owner's assigned queue number.
- No currently-serving number, other clients, clients-ahead count, estimated wait list, or live clinic queue is shown.
- The owner's queue number still uses Supabase Realtime so a Staff-assigned number can appear without reopening the app.

## Web behavior
The full clinic Live Queue remains a web-side feature.
