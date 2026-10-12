import React from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";
export default function BookAppointment({ profile }) {
  const navigate = useNavigate();
  // After booking, go straight to My Appointments so the owner sees the new
  // booking (and can cancel it if needed).
  return <AppShell profile={profile} title="Book Appointment"><AppointmentForm profile={profile} mode="owner" onCreated={() => navigate("/pet-owner/appointments")} /></AppShell>;
}
