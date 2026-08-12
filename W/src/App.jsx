import React, { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getStoredSession } from "./services/authService";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import LoadingSpinner from "./components/LoadingSpinner";
import GlobalToastCenter from "./components/GlobalToastCenter";
import LandingPage from "./pages/public/LandingPage";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import ForgotPassword from "./pages/public/ForgotPassword";
import ResetPassword from "./pages/public/ResetPassword";
import Unauthorized from "./pages/public/Unauthorized";
import QueueDisplay from "./pages/display/QueueDisplay";

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const StaffDashboard = lazy(() => import("./pages/staff/StaffDashboard"));
const VeterinarianDashboard = lazy(() => import("./pages/veterinarian/VeterinarianDashboard"));
const PetOwnerDashboard = lazy(() => import("./pages/petOwner/PetOwnerDashboard"));
const ChatBot = lazy(() => import("./pages/petOwner/ChatBot"));
const MyPets = lazy(() => import("./pages/petOwner/MyPets"));
const BookAppointment = lazy(() => import("./pages/petOwner/BookAppointment"));
const MyAppointments = lazy(() => import("./pages/petOwner/MyAppointments"));
const AppointmentManagement = lazy(() => import("./pages/staff/AppointmentManagement"));
const WalkInRegistration = lazy(() => import("./pages/staff/WalkInRegistration"));
const VeterinarianAppointments = lazy(() => import("./pages/veterinarian/VeterinarianAppointments"));
const VeterinarianScheduleManagement = lazy(() => import("./pages/staff/VeterinarianScheduleManagement"));
const AnimalPatientManagement = lazy(() => import("./pages/staff/AnimalPatientManagement"));
const VeterinarianPatients = lazy(() => import("./pages/veterinarian/VeterinarianPatients"));
const AdminPetManagement = lazy(() => import("./pages/admin/PetManagement"));
const AdminMedicalRecords = lazy(() => import("./pages/admin/AdminMedicalRecords"));
const StaffMedicalRecords = lazy(() => import("./pages/staff/MedicalRecordsManagement"));
const VeterinarianMedicalRecords = lazy(() => import("./pages/veterinarian/MedicalRecordsManagement"));
const OwnerMedicalRecords = lazy(() => import("./pages/petOwner/MyPetMedicalRecords"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const StaffMessages = lazy(() => import("./pages/staff/StaffMessages"));
const VeterinarianMessages = lazy(() => import("./pages/veterinarian/VeterinarianMessages"));
const OwnerMessages = lazy(() => import("./pages/petOwner/OwnerMessages"));
const AdminInventory = lazy(() => import("./pages/admin/InventoryManagement"));
const StaffInventory = lazy(() => import("./pages/staff/InventoryManagement"));
const VeterinarianInventory = lazy(() => import("./pages/veterinarian/InventoryManagement"));
const StaffQueue = lazy(() => import("./pages/staff/QueueManagement"));
const VeterinarianQueue = lazy(() => import("./pages/veterinarian/VeterinarianQueue"));
const OwnerQueue = lazy(() => import("./pages/petOwner/MyQueue"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const ReportsAnalytics = lazy(() => import("./pages/admin/ReportsAnalytics"));
const NotificationsPage = lazy(() => import("./pages/shared/NotificationsPage"));
const AdminProfile = lazy(() => import("./pages/admin/AdminProfile"));
const StaffProfile = lazy(() => import("./pages/staff/StaffProfile"));
const VeterinarianProfile = lazy(() => import("./pages/veterinarian/VeterinarianProfile"));
const OwnerProfile = lazy(() => import("./pages/petOwner/OwnerProfile"));

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function syncSession() {
      const stored = getStoredSession();
      setSession(stored);
      setProfile(stored?.profile || null);
      setLoading(false);
    }
    syncSession();
    window.addEventListener("pawcruz-auth-change", syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("pawcruz-auth-change", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  const guarded = (roles, element) => (
    <ProtectedRoute session={session} loading={loading}>
      <RoleRoute profile={profile} loading={loading} allowedRoles={roles}>{element}</RoleRoute>
    </ProtectedRoute>
  );

  return (
    <>
      <GlobalToastCenter />
      <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/queue-display" element={<QueueDisplay />} />
        <Route path="/admin/dashboard" element={guarded(["admin"], <AdminDashboard profile={profile} />)} />
        <Route path="/staff/dashboard" element={guarded(["staff"], <StaffDashboard profile={profile} />)} />
        <Route path="/veterinarian/dashboard" element={guarded(["veterinarian"], <VeterinarianDashboard profile={profile} />)} />
        <Route path="/pet-owner/dashboard" element={guarded(["pet_owner"], <PetOwnerDashboard profile={profile} />)} />
        <Route path="/pet-owner/chatbot" element={guarded(["pet_owner"], <ChatBot profile={profile} />)} />
        <Route path="/pet-owner/pets" element={guarded(["pet_owner"], <MyPets profile={profile} />)} />
        <Route path="/pet-owner/book-appointment" element={guarded(["pet_owner"], <BookAppointment profile={profile} />)} />
        <Route path="/pet-owner/appointments" element={guarded(["pet_owner"], <MyAppointments profile={profile} />)} />
        <Route path="/staff/appointments" element={guarded(["staff", "admin"], <AppointmentManagement profile={profile} />)} />
        <Route path="/staff/walk-in" element={guarded(["staff", "admin"], <WalkInRegistration profile={profile} />)} />
        <Route path="/staff/veterinarian-schedules" element={guarded(["staff", "admin"], <VeterinarianScheduleManagement profile={profile} />)} />
        <Route path="/staff/patients" element={guarded(["staff"], <AnimalPatientManagement profile={profile} />)} />
        <Route path="/admin/pets" element={guarded(["admin"], <AdminPetManagement profile={profile} />)} />
        <Route path="/veterinarian/appointments" element={guarded(["veterinarian"], <VeterinarianAppointments profile={profile} />)} />
        <Route path="/veterinarian/patients" element={guarded(["veterinarian"], <VeterinarianPatients profile={profile} />)} />
        <Route path="/admin/medical-records" element={guarded(["admin"], <AdminMedicalRecords profile={profile} />)} />
        <Route path="/staff/medical-records" element={guarded(["staff"], <StaffMedicalRecords profile={profile} />)} />
        <Route path="/veterinarian/medical-records" element={guarded(["veterinarian"], <VeterinarianMedicalRecords profile={profile} />)} />
        <Route path="/pet-owner/medical-records" element={guarded(["pet_owner"], <OwnerMedicalRecords profile={profile} />)} />
        <Route path="/admin/messages" element={guarded(["admin"], <AdminMessages profile={profile} />)} />
        <Route path="/staff/messages" element={guarded(["staff"], <StaffMessages profile={profile} />)} />
        <Route path="/veterinarian/messages" element={guarded(["veterinarian"], <VeterinarianMessages profile={profile} />)} />
        <Route path="/pet-owner/messages" element={guarded(["pet_owner"], <OwnerMessages profile={profile} />)} />
        <Route path="/admin/inventory" element={guarded(["admin"], <AdminInventory profile={profile} />)} />
        <Route path="/staff/inventory" element={guarded(["staff"], <StaffInventory profile={profile} />)} />
        <Route path="/veterinarian/inventory" element={guarded(["veterinarian"], <VeterinarianInventory profile={profile} />)} />
        <Route path="/admin/queue" element={guarded(["admin"], <StaffQueue profile={profile} />)} />
        <Route path="/staff/queue" element={guarded(["staff"], <StaffQueue profile={profile} />)} />
        <Route path="/veterinarian/queue" element={guarded(["veterinarian"], <VeterinarianQueue profile={profile} />)} />
        <Route path="/pet-owner/queue" element={guarded(["pet_owner"], <OwnerQueue profile={profile} />)} />
        <Route path="/admin/users" element={guarded(["admin"], <UserManagement profile={profile} />)} />
        <Route path="/admin/reports" element={guarded(["admin"], <ReportsAnalytics profile={profile} />)} />
        <Route path="/admin/notifications" element={guarded(["admin"], <NotificationsPage profile={profile} />)} />
        <Route path="/staff/notifications" element={guarded(["staff"], <NotificationsPage profile={profile} />)} />
        <Route path="/veterinarian/notifications" element={guarded(["veterinarian"], <NotificationsPage profile={profile} />)} />
        <Route path="/pet-owner/notifications" element={guarded(["pet_owner"], <NotificationsPage profile={profile} />)} />
        <Route path="/admin/profile" element={guarded(["admin"], <AdminProfile profile={profile} />)} />
        <Route path="/staff/profile" element={guarded(["staff"], <StaffProfile profile={profile} />)} />
        <Route path="/veterinarian/profile" element={guarded(["veterinarian"], <VeterinarianProfile profile={profile} />)} />
        <Route path="/pet-owner/profile" element={guarded(["pet_owner"], <OwnerProfile profile={profile} />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
