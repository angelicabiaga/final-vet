import React from "react";
import { useLocation } from "react-router-dom";
import AppShell from "../../components/AppShell";
import AppointmentManagementTable from "../../components/AppointmentManagementTable";
export default function VeterinarianAppointments({profile}){
  const location = useLocation();
  return <AppShell profile={profile} title="My Appointments"><AppointmentManagementTable profile={profile} veterinarianOnly focusToday={Boolean(location.state?.focusToday)}/></AppShell>;
}
