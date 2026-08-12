import React from "react";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";
export default function BookAppointment({ profile }) {
  return <AppShell profile={profile} title="Book Appointment"><AppointmentForm profile={profile} mode="owner" /></AppShell>;
}
