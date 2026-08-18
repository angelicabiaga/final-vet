import React from "react";
import { Navigate } from "react-router-dom";

// Medical Records no longer has its own sidebar tab -- it now lives inside
// Animal Patients (select a pet there to see its full medical history).
export default function MyPetMedicalRecords() {
  return <Navigate to="/pet-owner/pets" replace />;
}
