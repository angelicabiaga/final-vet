import React from "react";
import UserProfileModule from "../../components/UserProfileModule";
import VetProfessionalPanel from "../../components/VetProfessionalPanel";

// Same profile page as Staff/Admin/Pet Owner, plus the vet-only
// Professional Information and PRC license verification underneath.
export default function VeterinarianProfile({ profile }) {
  return (
    <UserProfileModule profile={profile} title="Veterinarian Profile">
      <VetProfessionalPanel profile={profile} />
    </UserProfileModule>
  );
}
