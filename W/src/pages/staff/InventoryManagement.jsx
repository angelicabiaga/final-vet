import React from "react";
import AppShell from "../../components/AppShell";
import InventoryManagementModule from "../../components/InventoryManagementModule";
export default function InventoryManagement({ profile }) { return <AppShell profile={profile} title="Inventory Management"><InventoryManagementModule profile={profile}/></AppShell>; }
