import React from "react";
import AppShell from "../../components/AppShell";
import AppointmentManagementTable from "../../components/AppointmentManagementTable";
export default function AppointmentManagement({profile}){return <AppShell profile={profile} title="Appointment Management"><AppointmentManagementTable profile={profile}/></AppShell>}
