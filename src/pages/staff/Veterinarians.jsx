import React from "react";
import AppShell from "../../components/AppShell";
import VeterinariansModule from "../../components/VeterinariansModule";

export default function Veterinarians({ profile }) {
  return (
    <AppShell profile={profile} title="Veterinarians">
      <VeterinariansModule profile={profile} />
    </AppShell>
  );
}
