# Veterinarian Schedule: Shifts, Leave & Emergencies

| Vet | Regular hours (every day) |
| --- | --- |
| Dr. Redmond Lopez | 9:00 AM – 5:00 PM |
| Dr. Neil Norman A. Cruz | 11:00 AM – 7:00 PM |

Both are on duty 11 AM – 5 PM. Only Dr. Redmond covers 9–11 AM and only
Dr. Neil covers 5–7 PM, so when one of them is off, those hours have no vet.

Vets request planned leave or report a same-day emergency from **My Schedule**
(web: `/veterinarian/schedule`, mobile: Schedule tab). Staff and admins run
everything from **Veterinarian Schedules**:

- **Leave & Emergency Requests**: tabs **Needs action** (pending, emergencies
  to acknowledge, patients to move), **All requests** (every pending or
  upcoming leave) and **History** (completed, declined, withdrawn or revoked).
  **Record leave** when a vet calls the clinic.
- **Clinic Schedule**: every vet's hours side by side, one week at a time
  (‹ › back 26 weeks as history, forward 26 weeks), including adjusted hours
  and leave with its reason, the clinic hours (9 AM – 7 PM) no vet covers, and
  dates with no created schedule yet. Adjusted-hours days have a **Remove** link.
- **Booked outside current hours**: bookings that no longer fit their vet's
  hours, e.g. after a schedule change.
- **Create Schedule**: publish a vet's schedule ahead of time. Tick *Apply for
  a whole month* (pick the month) or *Apply for a whole week* (pick the week);
  each suggests the period right after the vet's current schedule ends. Untick
  both for a From/To date range (up to 3 months). The vet works every day of
  the period at the chosen hours (prefilled from their usual hours); days off
  are recorded as leave. Creating again over the same dates replaces them;
  leave and adjusted hours stay on top.
- **Adjusted Hours (Specific Date)**: different hours for one date. Use *Record
  leave* for leave.

The vet's **My Schedule** uses the same week-at-a-time view.

## Setup

In the Supabase SQL Editor (the project shared by web and mobile):

1. Run `supabase/VET_LEAVE_REQUESTS.sql`. Safe to run again; re-run it after
   updates, since it replaces the older version in place.
2. If `VET_SHIFTS_NEIL_MORNING_REDMOND_AFTERNOON.sql` was ever run (it set the
   wrong 9–2 / 2–7 split and has been removed), run
   `supabase/VET_SHIFTS_REDMOND_9AM_5PM_NEIL_11AM_7PM.sql` once. It restores
   the hours above and lists any upcoming booking outside its vet's hours.
3. Run `supabase/QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql` (after step 1). It adds
   the owner-confirmed doctor change below. Safe to run again.
4. Run `supabase/VET_SCHEDULE_CALENDAR.sql` (after steps 1 and 3). It adds
   created schedules: pet owners can only book dates staff have created a
   schedule for. The first run copies each vet's usual hours from 60 days ago
   through the end of next month (and any later date that already has a
   booking), so nothing booked breaks; create later months with **Create
   Schedule**. Safe to run again (the copy happens once). Re-run it after
   re-running step 1 or any older script that redefines
   `validate_appointment_slot`.

Default hours for new vet accounts (and all repair scripts) only fill empty
days, so saving a vet's profile or re-running a repair script never resets
hours staff have set.

## How scheduling works (corporate model)

| Layer | Owner | Where it lives |
| --- | --- | --- |
| Created schedule (per date) | Staff/Admin, **Create Schedule** | `veterinarian_schedule_days` |
| Usual hours (prefills Create Schedule) | updated by Create Schedule | `veterinarian_schedules` |
| Date exceptions (adjusted hours) | Staff/Admin | `veterinarian_schedule_overrides` |
| Leave & emergencies | Vet requests, Staff/Admin decide | `veterinarian_leave_requests` → writes overrides tagged `leave_request_id` |

Booking (web + mobile) and the `validate_appointment_slot` trigger read the
override first, then the created schedule. A date with neither can't be
booked ("The clinic hasn't released the veterinarians' schedule for this date
yet"), and an approved leave blocks new bookings everywhere at once.

- **Planned leave:** the vet files ≥ 1 day ahead → *Pending* → staff/admin
  *Approve* (schedule updated) or *Decline* (note required). Whole days (up to
  31) or one part day: *arrive late* or *leave early*, with times limited to
  that vet's hours.
- **Emergency (today only):** applies immediately, so bookings stop at once →
  staff/admins are alerted with the number of affected patients → they move the
  patients → *Acknowledge*.
- **Recorded by staff:** when a vet calls in, staff record the leave or
  emergency for them. Same checks, may start today, applied at once; the vet
  and the other staff/admins are notified.
- **Cancel / revoke:** the vet can withdraw a pending request or cancel an
  approved one until it ends; staff/admin can revoke one (note required). The
  regular hours come back, including any adjusted hours the leave replaced.

## Conflicts

Blocking (the request can't be filed or approved):
- a vet's planned leave starting today (use Emergency), or leave in the past
- more than 31 days, overlapping the same vet's pending/approved request, or no
  working hours in the range
- part-day leave that is multi-day, outside the vet's hours, off the 10-minute
  grid, or in the middle of the shift

Booked patients never block a leave. A vet can file (and staff can approve)
leave even when that doctor has appointments; the impact shows them as an info
note ("You can still send this…"), not a warning.

Good to know (shown, never blocking):
- **coverage gaps**: e.g. "No vet 9 AM–11 AM" when Dr. Redmond is off, or
  "5 PM–7 PM" when Dr. Neil is off
- other vets' leave on the same dates; adjusted hours the leave will replace

Handling affected patients (the owner always confirms):
- Once the leave applies, each affected visit (one owner's pets on the same day
  together) gets **Change doctor** in Leave & Emergency Requests, and in Queue
  Management for today's visits. Staff pick a doctor and a free time; the owner
  confirms, reschedules, or cancels in My Queue. Nothing moves until they answer.
- Bookings outside a vet's hours after a shift change get the same **Change
  doctor** in Clinic Coverage → Booked outside current hours.
- A patient already in consultation stays with the vet.

## Doctor change in Queue Management (owner confirms)

A card or ticket whose doctor is available just shows **Check In** (or the
usual queue buttons); there is nothing to change. Only when the doctor can't
see the visit (leave, emergency, outside their hours) does the card turn red
with a note such as "Dr. Neil … is not available today (on leave)", and
**Change doctor** replaces **Check In** (the database refuses a change for a
card whose doctor is available). In the Live Queue every waiting ticket keeps
the red reassign icon, e.g. to move a patient off a busy doctor; tickets whose
doctor can't see them also show the red note.

1. Staff click **Change doctor**. Each doctor shows their hours and real free
   times only: not before their shift, not a time already booked or held for
   another owner, and not a time already past. Example: a 10:00 AM visit with
   Dr. Redmond on emergency is offered Dr. Neil from 11:00 AM, or his next free
   time if 11:00 is taken.
2. Staff pick the time and reason and **Send to owner to confirm**. The time is
   held for that owner. A checked-in ticket leaves the Live Queue and waits in
   **Waiting for owner confirmation**.
3. The owner sees in **My Queue** (web and app): "Dr. Redmond can't see Coco as
   planned due to …", the offered doctor and time, and **Confirm**,
   **Reschedule** (another day, doctor and free time) or **Cancel visit**.
4. **Confirm** moves the booking to the new doctor and time and puts the visit
   in the Live Queue (checked in automatically when the visit is today).
   **Reschedule** books the new slot, **Cancel** cancels the visit. Staff are
   notified either way.

If the owner is at the desk, staff can **Confirm for owner**. **Withdraw**
releases the held time and tells the owner. An offer whose time has passed
can't be confirmed; withdraw it and offer a new time.

## Notes

- Writes go only through the RPCs; direct inserts/updates on
  `veterinarian_leave_requests` are blocked by RLS. Like the rest of this app's
  custom login, the RPCs trust the profile id the app sends.
- The two old slot scripts no longer stretch schedules to 7 PM, so re-running
  them can't change Dr. Redmond's hours or undo a "leave early" day.
- If you change a vet's weekly hours, part-day leave already approved for a
  later date keeps its old window; revoke and record it again.
- Leave days in Clinic Coverage have no **Remove** link (only adjusted hours
  do); to undo leave, revoke it under Leave & Emergency Requests.
