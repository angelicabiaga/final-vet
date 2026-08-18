import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import AppShell from "../../components/AppShell";
import MedicalRecordsModule from "../../components/MedicalRecordsModule";

export default function MedicalRecordsManagement({ profile }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  // Medical Records no longer has its own sidebar tab -- it now lives inside
  // Animal Patients. A bare visit to this URL redirects there; the queue's
  // "start this visit's record" deep link (queueEntryId) and Animal
  // Patients' own "Add Medical Record" link (petId) still open straight
  // into the record tool, unchanged.
  if (!params.get("queueEntryId") && !params.get("petId")) {
    return <Navigate to="/staff/patients" replace />;
  }

  return <AppShell profile={profile} title="Animal Patient Profile"><MedicalRecordsModule profile={profile}/></AppShell>;
}
