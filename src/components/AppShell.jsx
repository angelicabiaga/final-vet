import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, UserCircle, X } from "lucide-react";
import { logoutUser } from "../services/authService";
import NotificationBell from "./NotificationBell";

import pawLogo from "../assets/reference/paw.png";
import dashboardIcon from "../assets/reference/Dashboard_Icon.png";
import appointmentIcon from "../assets/reference/Appointment_Icon.png";
import inventoryIcon from "../assets/reference/Inventory_Icon.png";
import medicalIcon from "../assets/reference/Medical_Icon.png";
import messageIcon from "../assets/reference/Message_Icon.png";
import petsIcon from "../assets/reference/Pets_Icon.png";
import userIcon from "../assets/reference/User_Icon.png";
import userManagementIcon from "../assets/reference/UserManagement_Icon.png";
import paymentIcon from "../assets/reference/payment_icon.png";
import bellIcon from "../assets/reference/Bell_Icon.png";
import chatbotIcon from "../assets/reference/chatbot.png";

const iconByType = {
  dashboard: dashboardIcon,
  appointment: appointmentIcon,
  queue: appointmentIcon,
  schedule: appointmentIcon,
  pet: petsIcon,
  medical: medicalIcon,
  inventory: inventoryIcon,
  message: messageIcon,
  notification: bellIcon,
  profile: userIcon,
  user: userManagementIcon,
  report: medicalIcon,
  payment: paymentIcon
};

export default function AppShell({ profile, title, children }) {
  const [open, setOpen] = useState(false);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] =
    useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const rolePath = profile?.role === "pet_owner" ? "pet-owner" : profile?.role;

  const navByRole = {
    pet_owner: [
      { label: "Dashboard", to: "/pet-owner/dashboard", type: "dashboard" },
      { label: "My Pets", to: "/pet-owner/pets", type: "pet" },
      { label: "Book Appointment", to: "/pet-owner/book-appointment", type: "appointment" },
      { label: "My Appointments", to: "/pet-owner/appointments", type: "appointment" },
      { label: "My Queue", to: "/pet-owner/queue", type: "queue" },
      { label: "Medical Records", to: "/pet-owner/medical-records", type: "medical" },
      { label: "Messages", to: "/pet-owner/messages", type: "message" },

    ],
    staff: [
      { label: "Dashboard", to: "/staff/dashboard", type: "dashboard" },
      { label: "Appointments", to: "/staff/appointments", type: "appointment" },
      { label: "Create / Walk-In", to: "/staff/walk-in", type: "pet" },
      { label: "Queue Management", to: "/staff/queue", type: "queue" },
      { label: "Veterinarian Schedules", to: "/staff/veterinarian-schedules", type: "schedule" },
      { label: "Animal Patients", to: "/staff/patients", type: "pet" },
      { label: "Medical Records", to: "/staff/medical-records", type: "medical" },
      { label: "Inventory", to: "/staff/inventory", type: "inventory" },
      { label: "Messages", to: "/staff/messages", type: "message" },

    ],
    veterinarian: [
      { label: "Dashboard", to: "/veterinarian/dashboard", type: "dashboard" },
      { label: "My Appointments", to: "/veterinarian/appointments", type: "appointment" },
      { label: "My Queue", to: "/veterinarian/queue", type: "queue" },
      { label: "Animal Patients", to: "/veterinarian/patients", type: "pet" },
      { label: "Medical Records", to: "/veterinarian/medical-records", type: "medical" },

      { label: "Messages", to: "/veterinarian/messages", type: "message" },

    ],
    admin: [
      { label: "Dashboard", to: "/admin/dashboard", type: "dashboard" },
      { label: "Appointments", to: "/staff/appointments", type: "appointment" },
      { label: "Create / Walk-In", to: "/staff/walk-in", type: "pet" },
      { label: "Queue Management", to: "/admin/queue", type: "queue" },
      { label: "Veterinarian Schedules", to: "/staff/veterinarian-schedules", type: "schedule" },
      { label: "Pet Management", to: "/admin/pets", type: "pet" },
      { label: "Medical Records", to: "/admin/medical-records", type: "medical" },
      { label: "Inventory", to: "/admin/inventory", type: "inventory" },
      { label: "Messages", to: "/admin/messages", type: "message" },
      { label: "User Management", to: "/admin/users", type: "user" },
      { label: "Reports & Analytics", to: "/admin/reports", type: "report" },

    ]
  };

  const nav = navByRole[profile?.role] || [
    { label: "Dashboard", to: `/${rolePath}/dashboard`, type: "dashboard" }
  ];

  async function handleLogout() {
    if (!logoutConfirmationOpen) {
      setOpen(false);
      setLogoutConfirmationOpen(true);
      return;
    }

    await logoutUser();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell pawcruz-shell">
      <div className={open ? "sidebarOverlay visible" : "sidebarOverlay"} onClick={() => setOpen(false)} />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="sidebarBrand">
          <img src={pawLogo} alt="PawCruz logo" />
          <span>PawCruz</span>
          <button className="sidebarClose" type="button" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20}/></button>
        </div>
        <div className="clinic">Cruz Veterinary Clinic</div>
        <nav className="sidebarNav">
          {nav.map((item) => (
            <Link
              key={item.to}
              className={location.pathname === item.to ? "active" : ""}
              to={item.to}
              onClick={() => setOpen(false)}
            >
              <img src={iconByType[item.type] || dashboardIcon} alt="" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button className="logout" onClick={handleLogout}><LogOut size={18} /> Logout</button>
      </aside>

      <main>
        <header className="topBar">
          <button className="menu" onClick={() => setOpen(!open)} aria-label="Open navigation"><Menu /></button>
          <div className="pageHeading"><h1>{title}</h1><p>Monday–Sunday, 9:00 AM–7:00 PM</p></div>
          <div className="headerActions">
            <NotificationBell profile={profile} />
            <Link className="user profileLink" to={`/${rolePath}/profile`}>
              <UserCircle />
              <span>{profile?.full_name || "User"}</span>
            </Link>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>

      {logoutConfirmationOpen && (
        <div
          className='logoutConfirmOverlay'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setLogoutConfirmationOpen(false);
            }
          }}
        >
          <section
            className='logoutConfirmDialog'
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='logout-confirm-title'
            aria-describedby='logout-confirm-description'
          >
            <span className='logoutConfirmIcon' aria-hidden='true'>
              <LogOut size={31} strokeWidth={2.1} />
            </span>

            <h2 id='logout-confirm-title'>
              Are you sure you want to log out?
            </h2>

            <p id='logout-confirm-description'>
              You will need to sign in again to access your PawCruz
              account.
            </p>

            <div className='logoutConfirmActions'>
              <button
                className='logoutConfirmCancel'
                type='button'
                onClick={() => setLogoutConfirmationOpen(false)}
              >
                No, stay
              </button>

              <button
                className='logoutConfirmAccept'
                type='button'
                onClick={handleLogout}
              >
                Yes, log out
              </button>
            </div>
          </section>

          <style>{`
            .logoutConfirmOverlay {
              position: fixed;
              inset: 0;
              z-index: 1200;
              display: grid;
              place-items: center;
              padding: 20px;
              background: rgba(11, 35, 49, 0.58);
              backdrop-filter: blur(7px);
              -webkit-backdrop-filter: blur(7px);
            }

            .logoutConfirmDialog {
              width: min(430px, 100%);
              padding: 30px;
              color: #18394c;
              background: linear-gradient(
                145deg,
                rgba(255, 255, 255, 0.98),
                rgba(235, 247, 252, 0.97)
              );
              border: 1px solid rgba(255, 255, 255, 0.92);
              border-radius: 24px;
              box-shadow: 0 24px 70px rgba(4, 31, 45, 0.34);
              text-align: center;
            }

            .logoutConfirmIcon {
              width: 62px;
              height: 62px;
              display: grid;
              place-items: center;
              margin: 0 auto 17px;
              color: #237da4;
              background: #e1f3fa;
              border: 1px solid #bfe3f1;
              border-radius: 19px;
            }

            .logoutConfirmDialog h2 {
              margin: 0;
              color: #17394b;
              font-size: 23px;
              line-height: 1.25;
            }

            .logoutConfirmDialog p {
              margin: 10px auto 24px;
              color: #637f8e;
              font-size: 14px;
              line-height: 1.55;
            }

            .logoutConfirmActions {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }

            .logoutConfirmActions button {
              min-height: 45px;
              padding: 10px 15px;
              border-radius: 11px;
              font-family: inherit;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
            }

            .logoutConfirmCancel {
              color: #315a6e;
              background: #ffffff;
              border: 1px solid #bcd7e2;
            }

            .logoutConfirmAccept {
              color: #ffffff;
              background: linear-gradient(115deg, #237da4, #174e69);
              border: 1px solid #1e6687;
              box-shadow: 0 8px 18px rgba(28, 94, 124, 0.2);
            }

            .logoutConfirmCancel:hover {
              background: #eef8fc;
            }

            .logoutConfirmAccept:hover {
              background: linear-gradient(115deg, #1e7095, #123f56);
            }

            @media (max-width: 480px) {
              .logoutConfirmDialog {
                padding: 25px 20px 20px;
                border-radius: 20px;
              }

              .logoutConfirmDialog h2 {
                font-size: 20px;
              }

              .logoutConfirmActions {
                grid-template-columns: 1fr;
              }
            }
          `}</style>
        </div>
      )}

      {profile?.role === "pet_owner" && location.pathname !== "/pet-owner/chatbot" && (
        <Link
          className="chatbotLauncher"
          to="/pet-owner/chatbot"
          aria-label="Open PawCruz chatbot"
          title="Chat with PawCruz"
        >
          <img src={chatbotIcon} alt="" aria-hidden="true" />
        </Link>
      )}

      <style>{`
        *{box-sizing:border-box}.shell{display:flex;min-height:100vh}.sidebar{width:280px;height:100dvh;background:linear-gradient(180deg,#438fb5 0%,#255065 100%);color:#fff;display:flex;flex-direction:column;position:fixed;left:0;top:0;z-index:100;padding:0;box-shadow:5px 0 20px rgba(37,80,101,.15)}
        .sidebarBrand{padding:34px 28px 8px;display:flex;align-items:center;gap:12px;flex-shrink:0}.sidebarBrand>img{width:42px;height:42px;object-fit:contain;filter:brightness(0) invert(1)}.sidebarBrand>span{font-size:30px;font-weight:700;font-family:"Quicksand",sans-serif}.clinic{font-size:12px;color:rgba(255,255,255,.78);padding:0 30px 22px;flex-shrink:0}.sidebarClose{display:none;margin-left:auto;border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:9px;padding:7px}
        .sidebarNav{display:flex;flex-direction:column;gap:3px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scroll-behavior:smooth;padding:0 15px 10px;overscroll-behavior:contain}.sidebarNav::-webkit-scrollbar{width:6px}.sidebarNav::-webkit-scrollbar-track{background:transparent}.sidebarNav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.34);border-radius:999px}.sidebarNav a{display:flex;align-items:center;gap:15px;padding:12px 18px;border-radius:8px;text-decoration:none;color:#fff;font-size:14px;font-weight:500;flex-shrink:0}.sidebarNav a img{width:22px;height:22px;object-fit:contain;filter:brightness(0) invert(1)}.sidebarNav a:hover,.sidebarNav a.active{background:rgba(255,255,255,.27);color:#fff}.sidebarNav a.active{font-weight:600}
        .logout{flex-shrink:0;margin:12px 15px 20px;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);color:#fff;padding:12px;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-weight:600}.logout:hover{background:rgba(255,255,255,.22)}
        .shell main{margin-left:280px;flex:1;min-width:0}.topBar{height:96px;background:linear-gradient(110deg,#4aa3c7 0%,#66bcc8 48%,#78c4ca 100%);display:flex;align-items:center;padding:0 38px;justify-content:space-between;color:#fff;position:fixed;left:280px;right:0;top:0;z-index:80;border-bottom:1px solid rgba(255,255,255,.32);box-shadow:0 8px 26px rgba(35,91,116,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}.pageHeading{display:flex;flex-direction:column;justify-content:center;min-width:0}.topBar h1{margin:0;font-size:26px;line-height:1.12;color:#fff;font-weight:800;letter-spacing:-.02em;text-shadow:0 1px 2px rgba(20,73,94,.08)}.topBar p{margin:7px 0 0;color:rgba(255,255,255,.92);font-size:13px;font-weight:600;letter-spacing:.01em}.menu{display:none;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.16);color:#fff;padding:10px;border-radius:14px;box-shadow:0 4px 12px rgba(28,84,106,.08)}.headerActions{display:flex;align-items:center;gap:14px}.headerActions>.nb .bell{width:52px;height:52px;border-radius:17px!important;border:1px solid rgba(255,255,255,.6)!important;background:rgba(255,255,255,.92)!important;box-shadow:0 8px 18px rgba(31,91,115,.14)!important}.user{display:flex;align-items:center;gap:10px;color:#fff}.profileLink{text-decoration:none;padding:10px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.10);font-weight:700;transition:background .18s ease,transform .18s ease}.profileLink svg{width:25px;height:25px}.profileLink:hover{background:rgba(255,255,255,.2);color:#fff;transform:translateY(-1px)}.content{padding:126px 30px 30px}.card{background:#fff;border-radius:15px;padding:22px;box-shadow:0 4px 10px rgba(0,0,0,.04)}.sidebarOverlay{display:none}
        .chatbotLauncher{position:fixed;right:28px;bottom:28px;z-index:80;width:72px;height:72px;display:grid;place-items:center;overflow:hidden;border:3px solid #fff;border-radius:50%;background:#fff;box-shadow:0 8px 24px rgba(37,80,101,.3);transition:transform .2s ease,box-shadow .2s ease}.chatbotLauncher img{display:block;width:100%;height:100%;object-fit:contain;border-radius:50%}.chatbotLauncher:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 12px 28px rgba(37,80,101,.38)}.chatbotLauncher:focus-visible{outline:4px solid #173e52;outline-offset:4px}
        @media(max-width:800px){.sidebar{transform:translateX(-105%);transition:transform .25s ease}.sidebar.open{transform:translateX(0)}.sidebarClose{display:grid}.sidebarOverlay{display:block;position:fixed;inset:0;background:rgba(16,41,54,.45);opacity:0;visibility:hidden;transition:.2s;z-index:90}.sidebarOverlay.visible{opacity:1;visibility:visible}.shell main{margin-left:0}.menu{display:grid}.topBar{left:0;height:86px;padding:0 14px;gap:10px}.pageHeading{min-width:0;flex:1}.topBar h1{font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topBar p{font-size:11px;margin-top:4px}.headerActions{gap:8px}.headerActions>.nb .bell{width:46px;height:46px;border-radius:15px!important}.profileLink{padding:8px 9px;border-radius:13px}.user span{display:none}.content{padding:108px 16px 16px}.chatbotLauncher{width:62px;height:62px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px))}}
      `}</style>
    </div>
  );
}
