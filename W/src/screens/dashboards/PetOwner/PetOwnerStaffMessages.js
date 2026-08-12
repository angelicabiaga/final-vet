import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";
export default function PetOwnerStaffMessages(props) {
  return <MobileMessagingScreen {...props} allowedRoles={["staff", "admin"]} title="Chat with Staff" backRoute="PetOwnerMessages" />;
}
