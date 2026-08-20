import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileHeart,
  MessageCircle, PackageSearch, PawPrint, RefreshCw, Stethoscope, Users
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell from "./AppShell";
import { loadDashboardData } from "../services/dashboardService";
import { subscribeToQueue } from "../services/queueService";
import { formatTime12h, formatClockTime } from "../utils/timeFormat";

const ACTIVE_QUEUE = ["Waiting", "Serving"];
const TODAY_STATUSES = ["Confirmed", "Completed"];

const roleConfig = {
  admin: {
    title: "Admin Dashboard",
    eyebrow: "SYSTEM OVERVIEW",
    subtitle: "Monitor clinic operations, users, patients, appointments, queue activity, and inventory.",
    links: [
      ["Manage Appointments", "/staff/appointments"], ["Queue Management", "/admin/queue"],
      ["Animal Patients", "/admin/pets"], ["Inventory", "/admin/inventory"]
    ]
  },
  staff: {
    title: "Staff Dashboard",
    eyebrow: "CLINIC OPERATIONS",
    subtitle: "Manage today’s appointments, walk-ins, queue flow, patients, and clinic stock.",
    links: [
      ["Check Appointments", "/staff/appointments"], ["Register Walk-In", "/staff/walk-in"],
      ["Manage Queue", "/staff/queue"], ["Animal Patients", "/staff/patients"]
    ]
  },
  veterinarian: {
    title: "Veterinarian Dashboard",
    eyebrow: "CLINICAL WORKSPACE",
    subtitle: "Review your appointments, assigned queue, patients, records, and medicine availability.",
    links: [
      ["My Appointments", "/veterinarian/appointments"], ["My Queue", "/veterinarian/queue"],
      ["Animal Patients", "/veterinarian/patients"], ["Inventory", "/veterinarian/inventory"]
    ]
  },
  pet_owner: {
    title: "Pet Owner Dashboard",
    eyebrow: "MY PET CARE",
    subtitle: "Keep track of your pets, appointments, queue position, records, and clinic messages.",
    links: [
      ["Animal Patients", "/pet-owner/pets"], ["Book Appointment", "/pet-owner/book-appointment"],
      ["My Queue", "/pet-owner/queue"], ["Messages", "/pet-owner/messages"]
    ]
  }
};

function dateKey(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

const formatTime = formatTime12h;

// A queue row's time is either its linked appointment's scheduled slot
// ("HH:MM") or, for a walk-in with no appointment, the timestamp it
// actually checked in at (an ISO datetime) -- so this needs to accept both.
function formatQueueTime(row) {
  const slot = row.appointment?.start_time;
  if (slot) return formatTime(slot);
  if (row.arrived_at) return formatClockTime(row.arrived_at);
  return "—";
}

function queuePetLabel(row) {
  const names = (row.pets?.length ? row.pets : (row.pet ? [row.pet] : [])).map((pet) => pet.pet_name).filter(Boolean);
  if (!names.length) return "Unnamed pet";
  return names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0];
}

export default function RoleDashboard({ profile }) {
  const config = roleConfig[profile?.role] || roleConfig.pet_owner;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      setData(await loadDashboardData(profile));
    } catch (loadError) {
      console.error(loadError);
      setError("Some dashboard information could not be loaded. Check your Supabase connection and refresh.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Live Queue must react the same way Queue Management does: any check-in,
  // walk-in, status change, completion, or cancellation refreshes it right
  // away, plus a refresh whenever the dashboard tab regains focus.
  useEffect(() => {
    const unsubscribe = subscribeToQueue(() => load(true));
    return unsubscribe;
  }, [load]);

  useEffect(() => {
    function handleFocus() { load(true); }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const summary = useMemo(() => {
    const empty = { cards: [], appointments: [], queues: [], chart: [], recent: [], inventoryAlerts: [], unread: 0 };
    if (!data) return empty;
    const todayAppointments = data.appointments.filter((a) => dateKey(a.appointment_date) === data.currentDate && TODAY_STATUSES.includes(a.status));
    const activeQueues = data.queues.filter((q) => ACTIVE_QUEUE.includes(q.status));
    const lowStock = data.inventory.filter((i) => Number(i.quantity || 0) <= Number(i.reorder_level || 0) || ["Low Stock", "Out of Stock", "Expired", "Near Expiry"].includes(i.status));
    const unread = data.messages.filter((message) => message.sender_id !== profile?.id).length;
    const last7 = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, day: date.toLocaleDateString(undefined, { weekday: "short" }), appointments: data.appointments.filter((a) => dateKey(a.appointment_date) === key).length };
    });

    let cards;
    if (profile?.role === "admin") {
      cards = [
        [Users, "Total Users", data.profiles.length, `${data.profiles.filter((p) => p.account_status === "active").length} active accounts`],
        [PawPrint, "Animal Patients", data.pets.filter((p) => !p.is_archived).length, "Active patient profiles"],
        [CalendarDays, "Today's Appointments", todayAppointments.length, "Across both veterinarians"],
        [Clock3, "Current Queue", activeQueues.length, `${activeQueues.filter((q) => q.status === "Serving").length} currently serving`],
        [PackageSearch, "Stock Alerts", lowStock.length, "Low stock or expiring items"],
        [FileHeart, "Medical History", data.medicalRecords.length, "Recent clinical records"]
      ];
    } else if (profile?.role === "staff") {
      cards = [
        [CalendarDays, "Today's Appointments", todayAppointments.length, `${todayAppointments.filter((a) => a.appointment_source === "Walk-In").length} walk-ins`],
        [Clock3, "Waiting Queue", activeQueues.filter((q) => q.status === "Waiting").length, `${activeQueues.length} active entries`],
        [PawPrint, "Animal Patients", data.pets.filter((p) => !p.is_archived).length, "Registered patient records"],
        [AlertTriangle, "Stock Alerts", lowStock.length, "Items needing attention"]
      ];
    } else if (profile?.role === "veterinarian") {
      cards = [
        [CalendarDays, "My Appointments Today", todayAppointments.length, `${todayAppointments.filter((a) => a.status === "Completed").length} completed`],
        [Clock3, "My Active Queue", activeQueues.length, `${activeQueues.filter((q) => q.status === "Waiting").length} waiting`],
        [FileHeart, "My Medical History", data.medicalRecords.length, "Recent records handled"],
        [PackageSearch, "Medicine Alerts", lowStock.length, "Low or unavailable stock"]
      ];
    } else {
      const upcoming = data.appointments.filter((a) => dateKey(a.appointment_date) >= data.currentDate && !["Cancelled", "Completed"].includes(a.status));
      cards = [
        [PawPrint, "Animal Patients", data.pets.filter((p) => !p.is_archived).length, "Registered pet profiles"],
        [CalendarDays, "Upcoming Appointments", upcoming.length, upcoming[0] ? `${dateKey(upcoming[0].appointment_date)} at ${formatTime(upcoming[0].start_time)}` : "No upcoming booking"],
        [Clock3, "My Queue", activeQueues.length, activeQueues[0]?.queue_number || "Not currently queued"],
        [FileHeart, "My Medical History", data.medicalRecords.length, "Finalized records available"]
      ];
    }

    const recentAppointments = [...data.appointments]
      .sort((a, b) => `${b.appointment_date}${b.start_time}`.localeCompare(`${a.appointment_date}${a.start_time}`))
      .slice(0, 6);
    return { cards, appointments: recentAppointments, queues: activeQueues.slice(0, 6), chart: last7, recent: data.logs, inventoryAlerts: lowStock.slice(0, 5), unread };
  }, [data, profile]);

  return (
    <AppShell profile={profile} title={config.title}>
      <div className="dash-head">
        <div><span>{config.eyebrow}</span><h2>Welcome, {profile?.full_name || "User"}</h2><p>{config.subtitle}</p></div>
        <button onClick={() => load(true)} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "spin" : ""}/>{refreshing ? "Refreshing" : "Refresh"}</button>
      </div>
      {error && <div className="dash-alert"><AlertTriangle size={18}/>{error}</div>}
      {loading ? <div className="dash-loading"><RefreshCw className="spin"/> Loading dashboard...</div> : (
        <>
          <div className="dash-cards">{summary.cards.map(([Icon, label, value, detail]) => <article key={label}><div className="icon"><Icon size={22}/></div><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>)}</div>
          <div className="quick-links">{config.links.map(([label, to]) => <Link key={to} to={to}>{label}<span>→</span></Link>)}</div>
          <div className="dash-grid">
            <section className="dash-panel wide"><header><div><h3>Appointment Activity</h3><p>Appointments recorded during the last seven days</p></div><Activity size={20}/></header><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.chart} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="appointments" fill="#4DA8DA" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></section>
            <section className="dash-panel">
              <header><div><h3>Live Queue</h3><p>Current active queue entries</p></div><Clock3 size={20}/></header>
              <div className="list">
                {data?.queueError ? (
                  <div className="queue-error"><AlertTriangle size={16}/> {data.queueError}</div>
                ) : summary.queues.length ? summary.queues.map((q) => (
                  <div key={q.id} className="queue-row">
                    <span className="queue-row-top">
                      <b>#{q.queue_number ?? "—"} · {queuePetLabel(q)}</b>
                      <i className={`queue-pill ${q.status === "Serving" ? "serving" : ""}`}>{q.status}</i>
                    </span>
                    <small className="queue-meta">{q.owner?.full_name || "Unknown owner"} → {q.veterinarian?.full_name || "Unassigned vet"}</small>
                    <small className="queue-meta">{formatQueueTime(q)} · {q.source || "Walk-In"}</small>
                  </div>
                )) : <em>No active queue entries.</em>}
              </div>
            </section>
          </div>
          <div className="dash-grid lower">
            <section className="dash-panel wide"><header><div><h3>Recent Appointments</h3><p>Latest connected appointment records</p></div><CalendarDays size={20}/></header><div className="appointments">{summary.appointments.length ? summary.appointments.map((a) => <div key={a.id}><span className="date">{dateKey(a.appointment_date)}</span><div><b>{a.visit_reason || "General Consultation"}</b><small>{formatTime(a.start_time)} · {a.appointment_source || "Online"}</small></div><i>{a.status}</i></div>) : <em>No appointment records available.</em>}</div></section>
            <section className="dash-panel"><header><div><h3>{profile?.role === "pet_owner" ? "Messages" : "Inventory Alerts"}</h3><p>{profile?.role === "pet_owner" ? "Recent incoming message count" : "Items requiring attention"}</p></div>{profile?.role === "pet_owner" ? <MessageCircle size={20}/> : <PackageSearch size={20}/>}</header>{profile?.role === "pet_owner" ? <div className="message-count"><strong>{summary.unread}</strong><span>Recent incoming messages</span><Link to="/pet-owner/messages">Open Messages</Link></div> : <div className="list">{summary.inventoryAlerts.length ? summary.inventoryAlerts.map((item) => <div key={item.id}><b>{item.item_name}</b><span>{item.quantity ?? 0} left</span></div>) : <em>No stock alerts.</em>}</div>}</section>
          </div>
        </>
      )}
      <style>{`
        .dash-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.dash-head span{font-size:11px;font-weight:800;letter-spacing:1.5px;color:#4DA8DA}.dash-head h2{font-size:27px;margin:5px 0 7px}.dash-head p{margin:0;color:#6F7F88;max-width:700px}.dash-head button{border:0;background:#fff;color:#318fbe;border-radius:12px;padding:11px 15px;display:flex;align-items:center;gap:8px;box-shadow:0 6px 18px rgba(47,117,150,.1);cursor:pointer}.dash-alert,.dash-loading{background:#fff4e2;color:#9d6817;padding:14px 16px;border-radius:13px;display:flex;gap:9px;align-items:center;margin-bottom:18px}.dash-loading{background:#fff;color:#4b6571}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.dash-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px}.dash-cards article{background:#fff;border:1px solid #e6f2f7;border-radius:18px;padding:18px;display:flex;gap:14px;box-shadow:0 8px 24px rgba(47,117,150,.07)}.dash-cards .icon{height:44px;width:44px;border-radius:13px;background:#eaf8fd;color:#318fbe;display:grid;place-items:center;flex:none}.dash-cards p{margin:0 0 3px;color:#6F7F88;font-size:13px}.dash-cards strong{display:block;font-size:26px}.dash-cards small{display:block;color:#7a8d96;margin-top:4px}.quick-links{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.quick-links a{background:#4DA8DA;color:white;text-decoration:none;padding:13px 15px;border-radius:13px;font-weight:700;display:flex;justify-content:space-between}.dash-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:18px;margin-top:18px}.dash-panel{background:#fff;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(47,117,150,.07);min-width:0}.dash-panel header{display:flex;justify-content:space-between;color:#4DA8DA}.dash-panel h3{margin:0;color:#20313B}.dash-panel header p{margin:4px 0 0;color:#78909b;font-size:12px}.chart{height:250px;margin-top:15px}.list{display:grid;gap:10px;margin-top:17px}.list div{display:flex;justify-content:space-between;background:#f4fbfd;padding:12px;border-radius:11px}.list span{font-size:12px;color:#5f7884}.list em,.appointments em{color:#80949d;font-style:normal}.list .queue-row{display:grid!important;gap:4px}.queue-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.queue-row-top b{color:#20313B;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.queue-meta{display:block;color:#5f7884;font-size:11.5px}.queue-pill{flex-shrink:0;font-style:normal;font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;background:#eaf8fd;color:#318fbe}.queue-pill.serving{background:#e7f7ed;color:#26754a}.queue-error{display:flex;align-items:center;gap:8px;color:#b34848;background:#fff0f0;padding:12px;border-radius:11px;font-size:13px}.appointments{display:grid;gap:10px;margin-top:15px}.appointments>div{display:grid;grid-template-columns:95px 1fr auto;gap:12px;align-items:center;border-bottom:1px solid #eaf1f4;padding:10px 0}.appointments .date{font-size:12px;color:#5d7682}.appointments b{display:block}.appointments small{color:#7c9099}.appointments i{font-style:normal;font-size:11px;background:#eaf8fd;color:#318fbe;padding:6px 9px;border-radius:999px}.message-count{text-align:center;padding:30px 10px}.message-count strong{font-size:46px;color:#4DA8DA;display:block}.message-count span{display:block;color:#6F7F88}.message-count a{display:inline-block;margin-top:16px;color:#318fbe;font-weight:700}@media(max-width:950px){.quick-links{grid-template-columns:repeat(2,1fr)}.dash-grid{grid-template-columns:1fr}}@media(max-width:600px){.dash-head{display:block}.dash-head button{margin-top:14px}.quick-links{grid-template-columns:1fr}.appointments>div{grid-template-columns:1fr}.appointments i{justify-self:start}}
      `}</style>
    </AppShell>
  );
}
