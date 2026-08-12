import React from "react";
import AppShell from "../../components/AppShell";
import AppointmentManagementTable from "../../components/AppointmentManagementTable";
export default function VeterinarianAppointments({profile}){return <AppShell profile={profile} title="My Appointments"><AppointmentManagementTable profile={profile} veterinarianOnly/></AppShell>}
