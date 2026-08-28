import React from "react";
import { useLocation } from "react-router-dom";
import AppShell from "../../components/AppShell";
import AppointmentManagementTable from "../../components/AppointmentManagementTable";
export default function AppointmentManagement({profile}){
  const location = useLocation();
  // Set by the Admin dashboard's "Today's Appointments" card
  // (state: { focusToday: true }) -- AppointmentManagementTable already
  // seeds its own date filter to today and stops hiding today's
  // not-yet-checked-in Confirmed appointments when this is true, exactly
  // matching that card's "filtered to today" spec. Staff's own entry into
  // this same shared route (sidebar, shortcut card) never sets this state,
  // so their view is completely unaffected.
  const focusToday = Boolean(location.state?.focusToday);
  return <AppShell profile={profile} title="List of Appointments"><AppointmentManagementTable profile={profile} focusToday={focusToday}/></AppShell>;
}
