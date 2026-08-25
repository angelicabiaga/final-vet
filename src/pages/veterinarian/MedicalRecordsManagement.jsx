import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import AppShell from "../../components/AppShell";
import MedicalRecordsModule from "../../components/MedicalRecordsModule";

export default function MedicalRecordsManagement({ profile }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  // Medical Records has no sidebar tab and no standalone browsing view --
  // it now lives entirely inside Animal Patients. This route only ever
  // opens the queue's "start this visit's record" consultation form
  // (queueEntryId); any other visit redirects to Animal Patients.
  if (!params.get("queueEntryId")) {
    return <Navigate to="/veterinarian/patients" replace />;
  }

  return <AppShell profile={profile} title="Create Health Record"><MedicalRecordsModule profile={profile}/></AppShell>;
}
