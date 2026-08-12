import React from "react";
import MobileMessagingScreen from "../../../components/MobileMessagingScreen";
export default function VetMessages(props) {
  return <MobileMessagingScreen {...props} allowedRoles={["pet_owner"]} title="Owner Conversations" backRoute="vet-screen" />;
}
