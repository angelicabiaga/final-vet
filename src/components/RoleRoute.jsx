import React from "react";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "./LoadingSpinner";

export default function RoleRoute({ profile, loading, allowedRoles, children }) {
  if (loading) return <LoadingSpinner label="Checking permissions..." />;
  if (!profile || !allowedRoles.includes(profile.role)) return <Navigate to="/unauthorized" replace />;
  if (profile.account_status !== "active") return <Navigate to="/unauthorized" replace />;
  return children;
}
