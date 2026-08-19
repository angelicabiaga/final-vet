import React from "react";
import AppShell from "../../components/AppShell";
import VeterinarianProfileDetail from "../../components/VeterinarianProfileDetail";

export default function VeterinarianProfile({ profile }) {
  return (
    <AppShell profile={profile} title="Veterinarian Profile">
      <VeterinarianProfileDetail vetId={profile?.id} viewerProfile={profile} />
    </AppShell>
  );
}
