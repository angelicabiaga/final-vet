import React, { useState } from "react";
import { drName } from "./VetLeaveImpact";
import { formatTime12h } from "../utils/timeFormat";

// Doctor first, then that doctor's free times. `slots` is the vets list from
// the reschedule-options RPCs (null while loading). onChange gets
// "veterinarianId|HH:MM", or "" until a time is picked. Give it key={date}
// so a new date starts from "Choose a doctor" again.
export default function DoctorTimeFields({ slots, value, onChange }) {
  const [vetId, setVetId] = useState("");
  const vets = slots || [];
  const vet = vets.find(item => item.veterinarian_id === vetId);
  const times = (vet?.starts || []).map(time => String(time).slice(0, 5));
  const anyFree = vets.some(item => item.starts?.length);

  return (
    <>
      <label>Doctor
        <select value={vetId} disabled={!slots || !anyFree} onChange={event => { setVetId(event.target.value); onChange(""); }}>
          <option value="">{!slots ? "Loading doctors…" : anyFree ? "Choose a doctor" : "No free times that day"}</option>
          {vets.map(item => (
            <option key={item.veterinarian_id} value={item.veterinarian_id} disabled={!item.starts?.length}>
              {drName(item.full_name)}{item.starts?.length ? "" : " (no free times)"}
            </option>
          ))}
        </select>
      </label>
      <label>Time
        <select value={value ? value.split("|")[1] : ""} disabled={!vet || !times.length} onChange={event => onChange(event.target.value ? `${vetId}|${event.target.value}` : "")}>
          <option value="">{vet ? "Choose a time" : "Choose a doctor first"}</option>
          {times.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}
        </select>
      </label>
    </>
  );
}
