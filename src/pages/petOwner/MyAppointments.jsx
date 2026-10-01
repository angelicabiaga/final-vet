import React from "react";
import AppShell from "../../components/AppShell";
import AppointmentManagementTable from "../../components/AppointmentManagementTable";

// Same table, filters and rebook window as the staff and vet Appointments
// pages, limited to this pet owner's own appointments.
export default function MyAppointments({ profile }) {
  return (
    <AppShell profile={profile} title="Appointments">
      <AppointmentManagementTable profile={profile} ownerOnly />
    </AppShell>
  );
}
