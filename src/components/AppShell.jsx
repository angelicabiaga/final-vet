import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut, UserCircle, X } from "lucide-react";
import { logoutUser } from "../services/authService";
import { reconcileInventoryStatus, getInventoryItems, subscribeToInventoryChanges } from "../services/inventoryService";
import { getAppointments, todayLocal } from "../services/appointmentService";
import { getQueue, subscribeToQueue } from "../services/queueService";
import { getPendingBillingQueue, subscribeToPendingBilling } from "../services/billingService";
import { getConversations, subscribeToMessagingOverview } from "../services/messageService";
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

function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

const ROLE_LABELS = {
  admin: "Administrator",
  staff: "Staff",
  veterinarian: "Veterinarian",
  pet_owner: "Pet Owner",
};

function roleLabelOf(role) {
  return ROLE_LABELS[String(role || "").trim().toLowerCase()] || "PawCruz User";
}

// Sidebar module badges -- small red numbered badges next to Appointments,
// Queue/My Queue, Inventory, Transactions (POS), and Messages, scoped per
// role and (for Veterinarian/Pet Owner) per-user ownership so nobody sees
// another user's counts. Deliberately NOT routed through the Notifications
// module, which stays reserved for admin broadcasts and clinic-wide
// announcements -- these live in the sidebar as pure badge state instead,
// keyed by nav route. Module-level (not redeclared per render) so it has
// a stable identity for the effect/callback dependency arrays below.
// Transactions (POS) is staff-only -- admin's nav has no Transactions link
// at all, so it can never get that badge.
const BADGE_ROUTES = {
  admin: { "/staff/appointments": "appointments", "/admin/queue": "queue", "/admin/inventory": "inventory", "/admin/messages": "messages" },
  staff: { "/staff/appointments": "appointments", "/staff/queue": "queue", "/staff/inventory": "inventory", "/staff/transactions": "transactions", "/staff/messages": "messages" },
  veterinarian: { "/veterinarian/appointments": "appointments", "/veterinarian/queue": "queue", "/veterinarian/messages": "messages" },
  pet_owner: { "/pet-owner/appointments": "appointments", "/pet-owner/queue": "queue", "/pet-owner/messages": "messages" },
};

// Live inventory statuses (from computeLiveItemStatus) that count as an
// alert requiring restock/expiry attention -- "In Stock" is deliberately
// excluded, and "Expired" is deliberately excluded too since the user's
// spec for this badge names only these three buckets.
const INVENTORY_ALERT_STATUSES = ["Low Stock", "Out of Stock", "Near Expiry"];

export default function AppShell({ profile, title, children }) {
  const [open, setOpen] = useState(false);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] =
    useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const rolePath = profile?.role === "pet_owner" ? "pet-owner" : profile?.role;
  const firstName = firstNameOf(profile?.full_name) || profile?.username || "there";
  const roleText = roleLabelOf(profile?.role);

  // Inventory statuses (Low Stock / Out of Stock / Near Expiry / Expired)
  // already update automatically on every write (POS sale, stock
  // transaction, manual edit). This just catches items that drifted purely
  // from time passing, so Near Expiry/Expired notifications still fire even
  // if nobody has touched that item recently. Admin/Staff only, throttled.
  useEffect(() => {
    if (!["admin", "staff"].includes(profile?.role)) return;
    reconcileInventoryStatus().catch(() => {});
  }, [profile?.role]);

  const [badgeCounts, setBadgeCounts] = useState({});

  const loadBadgeCounts = useCallback(async () => {
    const role = profile?.role;
    if (!profile?.id || !BADGE_ROUTES[role]) return;
    const today = todayLocal();
    const jobs = {};

    // Only completed/cancelled/other-owner/unrelated records are excluded
    // by these filters -- everything counted here is an active record the
    // signed-in user is actually responsible for.
    if (role === "veterinarian") {
      jobs.appointments = getAppointments({ veterinarianId: profile.id, status: "Confirmed", date: today })
        .then((rows) => rows.length);
      jobs.queue = getQueue({ veterinarianId: profile.id })
        .then((rows) => rows.filter((entry) => ["Waiting", "Serving"].includes(entry.status)).length);
    } else if (role === "admin" || role === "staff") {
      // Every Confirmed appointment still ahead of the clinic (today or a
      // future date) requires admin/staff attention -- not just today's, so
      // a booking made for tomorrow shows up as soon as it's created rather
      // than waiting until its date arrives. Only past dates are excluded.
      jobs.appointments = getAppointments({ status: "Confirmed" })
        .then((rows) => rows.filter((row) => row.appointment_date >= today).length);
      jobs.queue = getQueue({})
        .then((rows) => rows.filter((entry) => ["Waiting", "Serving"].includes(entry.status)).length);
      jobs.inventory = getInventoryItems({})
        .then((rows) => rows.filter((item) => INVENTORY_ALERT_STATUSES.includes(item.status)).length);
      if (role === "staff") {
        // Only consultations a veterinarian just finalized that staff has not
        // yet opened ("Pending Billing") count -- once staff clicks Process
        // Payment the queue entry flips to "Processing" and drops out of this
        // count, and once it's actually paid it isn't in this table's status
        // set at all. Ordinary transactions.payment_status (Paid/Partially
        // Paid/Voided/Cancelled/plain history rows) never factor in here, and
        // since each consultation has exactly one billing_status, this can
        // never double-count a visit the way multiple transaction rows could.
        jobs.transactions = getPendingBillingQueue()
          .then((rows) => rows.filter((row) => row.billing_status === "Pending Billing").length);
      }
    } else if (role === "pet_owner") {
      jobs.appointments = getAppointments({ ownerId: profile.id, status: "Confirmed" })
        .then((rows) => rows.filter((row) => row.appointment_date >= today).length);
      jobs.queue = getQueue({ ownerId: profile.id })
        .then((rows) => rows.filter((entry) => ["Waiting", "Serving"].includes(entry.status)).length);
    }

    // "Unread conversations" (not total unread messages) for every role.
    jobs.messages = getConversations(profile).then((rows) => rows.filter((row) => row.unread > 0).length);

    const keys = Object.keys(jobs);
    const settled = await Promise.all(keys.map((key) => jobs[key].catch(() => null)));
    setBadgeCounts((current) => {
      const next = { ...current };
      keys.forEach((key, index) => {
        // A failed refresh for one module leaves that badge's last known
        // count in place rather than surfacing an app-wide error or
        // flashing it to zero.
        if (settled[index] !== null) next[key] = settled[index];
      });
      return next;
    });
  }, [profile?.role, profile?.id]);

  useEffect(() => {
    if (!profile?.id || !BADGE_ROUTES[profile?.role]) return;
    loadBadgeCounts();
    // subscribeToQueue already listens to queue_entries, queue_entry_pets,
    // and appointments -- covers both the Appointments and Queue/My Queue
    // badges through one realtime channel instead of opening a second one
    // for the same tables. Inventory/Transactions (POS) subscriptions are
    // only opened for the roles that actually have those badges.
    const unsubQueue = subscribeToQueue(loadBadgeCounts);
    const unsubMessages = subscribeToMessagingOverview(profile.id, loadBadgeCounts);
    const unsubInventory = ["admin", "staff"].includes(profile.role) ? subscribeToInventoryChanges(loadBadgeCounts) : null;
    const unsubBilling = profile.role === "staff" ? subscribeToPendingBilling(loadBadgeCounts) : null;
    return () => {
      unsubQueue?.();
      unsubInventory?.();
      unsubMessages?.();
      unsubBilling?.();
    };
  }, [profile?.role, profile?.id, loadBadgeCounts]);

  function badgeLabel(count) {
    return count > 9 ? "9+" : String(count);
  }

  const navByRole = {
    pet_owner: [
      { label: "Dashboard", to: "/pet-owner/dashboard", type: "dashboard" },
      { label: "Animal Patients", to: "/pet-owner/pets", type: "pet" },
      { label: "Book Appointment", to: "/pet-owner/book-appointment", type: "appointment" },
      { label: "My Appointments", to: "/pet-owner/appointments", type: "appointment" },
      { label: "My Queue", to: "/pet-owner/queue", type: "queue" },
      { label: "Messages", to: "/pet-owner/messages", type: "message" },

    ],
    staff: [
      { label: "Dashboard", to: "/staff/dashboard", type: "dashboard" },
      { label: "Appointments", to: "/staff/appointments", type: "appointment" },
      { label: "Create / Walk-In", to: "/staff/walk-in", type: "pet" },
      { label: "Queue Management", to: "/staff/queue", type: "queue" },
      { label: "Veterinarian Schedules", to: "/staff/veterinarian-schedules", type: "schedule" },
      { label: "Animal Patients", to: "/staff/patients", type: "pet" },
      { label: "Inventory", to: "/staff/inventory", type: "inventory" },
      { label: "POS", to: "/staff/transactions", type: "payment" },
      { label: "Messages", to: "/staff/messages", type: "message" },

    ],
    veterinarian: [
      { label: "Dashboard", to: "/veterinarian/dashboard", type: "dashboard" },
      { label: "My Appointments", to: "/veterinarian/appointments", type: "appointment" },
      { label: "My Queue", to: "/veterinarian/queue", type: "queue" },
      { label: "Animal Patients", to: "/veterinarian/patients", type: "pet" },
      { label: "Veterinarian Prescriptions", to: "/veterinarian/prescriptions", type: "medical" },

      { label: "Messages", to: "/veterinarian/messages", type: "message" },

    ],
    admin: [
      { label: "Dashboard", to: "/admin/dashboard", type: "dashboard" },
      { label: "Appointments", to: "/staff/appointments", type: "appointment" },
      { label: "Create / Walk-In", to: "/staff/walk-in", type: "pet" },
      { label: "Queue Management", to: "/admin/queue", type: "queue" },
      { label: "Veterinarian Schedules", to: "/staff/veterinarian-schedules", type: "schedule" },
      { label: "Animal Patients", to: "/admin/pets", type: "pet" },
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
          {nav.map((item) => {
            const badgeKey = BADGE_ROUTES[profile?.role]?.[item.to];
            const badgeCount = badgeKey ? (badgeCounts[badgeKey] || 0) : 0;
            const isVetAppointments = profile?.role === "veterinarian" && item.to === "/veterinarian/appointments";
            const isInventoryLink = badgeKey === "inventory" && ["admin", "staff"].includes(profile?.role);
            const linkState = isVetAppointments
              ? { focusToday: true }
              : isInventoryLink
                ? { prioritizeAlerts: true }
                : undefined;
            return (
              <Link
                key={item.to}
                className={location.pathname === item.to ? "active" : ""}
                to={item.to}
                state={linkState}
                onClick={() => setOpen(false)}
              >
                <span className="navIconWrap">
                  <img src={iconByType[item.type] || dashboardIcon} alt="" aria-hidden="true" />
                  {badgeCount > 0 && <span className="navBadge">{badgeLabel(badgeCount)}</span>}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
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
              <span className="userText">
                <span className="userGreeting">Hi, {firstName}!</span>
                <span className="userRole">{roleText}</span>
              </span>
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
        .navIconWrap{position:relative;display:inline-flex;flex-shrink:0}
        .navBadge{position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;padding:0 4px;display:flex;align-items:center;justify-content:center;background:#e53935;color:#fff;font-size:10px;line-height:1;font-weight:700;border-radius:999px;box-shadow:0 0 0 2px rgba(37,80,101,.55),0 1px 3px rgba(0,0,0,.25)}
        .logout{flex-shrink:0;margin:12px 15px 20px;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);color:#fff;padding:12px;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-weight:600}.logout:hover{background:rgba(255,255,255,.22)}
        .shell main{margin-left:280px;flex:1;min-width:0}.topBar{height:96px;background:linear-gradient(110deg,#4aa3c7 0%,#66bcc8 48%,#78c4ca 100%);display:flex;align-items:center;padding:0 38px;justify-content:space-between;color:#fff;position:fixed;left:280px;right:0;top:0;z-index:80;border-bottom:1px solid rgba(255,255,255,.32);box-shadow:0 8px 26px rgba(35,91,116,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}.pageHeading{display:flex;flex-direction:column;justify-content:center;min-width:0}.topBar h1{margin:0;font-size:26px;line-height:1.12;color:#fff;font-weight:800;letter-spacing:-.02em;text-shadow:0 1px 2px rgba(20,73,94,.08)}.topBar p{margin:7px 0 0;color:rgba(255,255,255,.92);font-size:13px;font-weight:600;letter-spacing:.01em}.menu{display:none;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.16);color:#fff;padding:10px;border-radius:14px;box-shadow:0 4px 12px rgba(28,84,106,.08)}.headerActions{display:flex;align-items:center;gap:14px}.headerActions>.nb .bell{width:52px;height:52px;border-radius:17px!important;border:1px solid rgba(255,255,255,.6)!important;background:rgba(255,255,255,.92)!important;box-shadow:0 8px 18px rgba(31,91,115,.14)!important}.user{display:flex;align-items:center;gap:10px;color:#fff}.userText{display:flex;flex-direction:column;gap:1px;min-width:0}.userGreeting{font-size:14px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.userRole{font-size:11px;font-weight:600;line-height:1.2;color:rgba(255,255,255,.82);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profileLink{text-decoration:none;padding:9px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.10);transition:background .18s ease,transform .18s ease}.profileLink svg{width:25px;height:25px;flex-shrink:0}.profileLink:hover{background:rgba(255,255,255,.2);color:#fff;transform:translateY(-1px)}.content{padding:126px 30px 30px}.card{background:#fff;border-radius:15px;padding:22px;box-shadow:0 4px 10px rgba(0,0,0,.04)}.sidebarOverlay{display:none}
        .chatbotLauncher{position:fixed;right:28px;bottom:28px;z-index:80;width:72px;height:72px;display:grid;place-items:center;overflow:hidden;border:3px solid #fff;border-radius:50%;background:#fff;box-shadow:0 8px 24px rgba(37,80,101,.3);transition:transform .2s ease,box-shadow .2s ease}.chatbotLauncher img{display:block;width:100%;height:100%;object-fit:contain;border-radius:50%}.chatbotLauncher:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 12px 28px rgba(37,80,101,.38)}.chatbotLauncher:focus-visible{outline:4px solid #173e52;outline-offset:4px}
        @media(max-width:800px){.sidebar{transform:translateX(-105%);transition:transform .25s ease}.sidebar.open{transform:translateX(0)}.sidebarClose{display:grid}.sidebarOverlay{display:block;position:fixed;inset:0;background:rgba(16,41,54,.45);opacity:0;visibility:hidden;transition:.2s;z-index:90}.sidebarOverlay.visible{opacity:1;visibility:visible}.shell main{margin-left:0}.menu{display:grid}.topBar{left:0;height:86px;padding:0 14px;gap:10px}.pageHeading{min-width:0;flex:1}.topBar h1{font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topBar p{font-size:11px;margin-top:4px}.headerActions{gap:8px}.headerActions>.nb .bell{width:46px;height:46px;border-radius:15px!important}.profileLink{padding:8px 9px;border-radius:13px}.userText{display:none}.content{padding:108px 16px 16px}.chatbotLauncher{width:62px;height:62px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px))}}
      `}</style>
    </div>
  );
}
