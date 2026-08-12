import React from "react";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";
export default function WalkInRegistration({ profile }) {
  return <AppShell profile={profile} title="Create Appointment / Walk-In"><AppointmentForm profile={profile} mode="staff" /></AppShell>;
}
