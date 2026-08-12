import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingSpinner from "./LoadingSpinner";

export default function ProtectedRoute({ session, loading, children }) {
  const location = useLocation();
  if (loading) return <LoadingSpinner label="Checking session..." />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
