import React from "react";
import AppShell from "../../components/AppShell";
import VetScheduleModule from "../../components/VetScheduleModule";

export default function VeterinarianSchedule({ profile }) {
  return (
    <AppShell profile={profile} title="My Schedule">
      <VetScheduleModule profile={profile} />
    </AppShell>
  );
}
