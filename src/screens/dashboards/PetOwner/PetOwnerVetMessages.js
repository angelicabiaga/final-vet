import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";
export default function PetOwnerVetMessages(props) {
  return <MobileMessagingScreen {...props} allowedRoles={["veterinarian"]} title="Chat with Veterinarian" backRoute="PetOwnerMessages" />;
}
