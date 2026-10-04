import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  checkUpcomingAppointmentReminders,
  getNotifications,
  markAllRead,
  markNotificationRead,
  registerWebPush,
  requestBrowserNotifications,
  showBrowserNotification,
  subscribeNotifications,
} from "../services/notificationService";
import { hasBeenWelcomed, markWelcomed, playNotificationSound } from "../utils/notificationSound";
import { formatDateTime12h } from "../utils/timeFormat";
import { getNotificationLink } from "../utils/notificationLink";

const TOAST_DURATION_MS = 7000;

// "default" (not asked yet), "granted", "denied", or "unsupported".
function readPushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export default function NotificationBell({ profile }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pushStatus, setPushStatus] = useState("");
  const [pushPermission, setPushPermission] = useState(readPushPermission);

  // Keep the push button in sync if the user changes the permission from the
  // browser's own site settings while PawCruz is open.
  useEffect(() => {
    let status = null;
    let cancelled = false;
    const sync = () => setPushPermission(readPushPermission());
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "notifications" })
        .then((result) => {
          if (cancelled) return;
          status = result;
          status.onchange = sync;
        })
        .catch(() => {});
    }
    window.addEventListener("focus", sync);
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
      window.removeEventListener("focus", sync);
    };
  }, []);
  const [toasts, setToasts] = useState([]);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const toastTimersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((notification) => {
    setToasts((current) => [...current, notification].slice(-4));
    const timer = window.setTimeout(() => dismissToast(notification.id), TOAST_DURATION_MS);
    toastTimersRef.current.set(notification.id, timer);
  }, [dismissToast]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return undefined;

    let active = true;

    getNotifications(profile.id)
      .then((notifications) => {
        if (!active) return;
        const rows = Array.isArray(notifications) ? notifications : [];
        setItems(rows);

        // Announce once per real login/session -- NOT once per page, even
        // though this component remounts on every in-app navigation
        // (AppShell is re-mounted fresh by each page). hasBeenWelcomed is
        // module-level so it survives those remounts for the whole tab.
        const unreadCount = rows.filter((row) => !row.is_read).length;
        if (unreadCount > 0 && !hasBeenWelcomed(profile.id)) {
          markWelcomed(profile.id);
          playNotificationSound();
          pushToast({
            id: `login-summary-${profile.id}-${Date.now()}`,
            title: "Welcome back",
            message: `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.`,
          });
        }
      })
      .catch((e) => {
        if (active) setError(e.message || "Unable to load notifications.");
      });

    const unsubscribe = subscribeNotifications(profile.id, (notification, eventType) => {
      if (!active || !notification?.id) return;

      setItems((current) => {
        if (eventType === "DELETE") {
          return current.filter((item) => item.id !== notification.id);
        }

        const index = current.findIndex((item) => item.id === notification.id);
        if (index >= 0) {
          return current.map((item) =>
            item.id === notification.id ? notification : item
          );
        }

        return [notification, ...current];
      });

      // Only pop a sound/toast/browser notification for genuinely new
      // records. UPDATE events include mobile read-state changes and
      // should remain silent.
      if (eventType === "INSERT") {
        playNotificationSound();
        pushToast(notification);
        showBrowserNotification(notification);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [profile?.id, pushToast]);

  // "Appointment approaching" reminders have no server-side cron to fire
  // them, so a pet owner's own open session checks for one due soon --
  // on load, and every 5 minutes after (checkUpcomingAppointmentReminders
  // itself is a no-op for non-pet-owner roles and throttles internally).
  useEffect(() => {
    if (!profile?.id) return undefined;

    checkUpcomingAppointmentReminders(profile).catch(() => {});
    const interval = window.setInterval(() => {
      checkUpcomingAppointmentReminders(profile).catch(() => {});
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // One-off panel messages ("Browser notifications are enabled.", errors) are
  // cleared when the panel closes -- otherwise they reappear (and re-toast)
  // every time the bell is opened again.
  useEffect(() => {
    if (open) return;
    setPushStatus("");
    setError("");
  }, [open]);

  // Background web push: (re)register this browser whenever notifications
  // are allowed, so pushes arrive even when PawCruz is closed.
  useEffect(() => {
    if (!profile?.id || pushPermission !== "granted") return;
    registerWebPush(profile.id).catch((pushError) => {
      console.warn("Background push registration failed:", pushError);
    });
  }, [profile?.id, pushPermission]);

  const unread = items.filter((item) => !item.is_read).length;
  const rolePath = profile?.role === "pet_owner" ? "pet-owner" : profile?.role;

  async function enablePush() {
    try {
      setError("");
      const permission = await requestBrowserNotifications();
      setPushPermission(readPushPermission());
      if (permission === "granted") {
        setPushStatus("Browser notifications are enabled.");
      } else {
        setError("Browser notification permission was not granted.");
      }
    } catch (e) {
      setError(e.message || "Unable to enable browser notifications.");
    }
  }

  async function allRead() {
    if (!unread) return;
    try {
      setError("");
      await markAllRead(profile.id);
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (e) {
      setError(e.message || "Unable to mark notifications as read.");
    }
  }

  // Clicking a notification marks it read and opens the page it's about.
  function openNotification(notification) {
    if (!notification.is_read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      markNotificationRead(notification.id).catch(() => {});
    }
    setOpen(false);
    const destination = getNotificationLink(notification, profile?.role);
    if (!destination) return;
    if (destination.endsWith("/notifications")) {
      navigate(destination, { state: { openNotificationId: notification.id } });
    } else {
      navigate(destination);
    }
  }

  function formatDate(value) {
    if (!value) return "Recently";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";
    return formatDateTime12h(date);
  }

  function getNotificationTitle(notification) {
    return notification?.title?.trim() || "PawCruz update";
  }

  function getNotificationMessage(notification) {
    return notification?.message?.trim() || "You have a new clinic notification.";
  }

  function getNotificationType(notification) {
    const value = String(notification?.notification_type || "Notification").trim();
    return value || "Notification";
  }

  return (
    <>
    {toasts.length > 0 && (
      <div className="nbToastStack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="nbToast" onClick={() => dismissToast(toast.id)}>
            <div className="nbToastIcon"><BellRing size={18} /></div>
            <div className="nbToastBody">
              <strong>{getNotificationTitle(toast)}</strong>
              <p>{getNotificationMessage(toast)}</p>
            </div>
            <button
              type="button"
              className="nbToastClose"
              aria-label="Dismiss notification"
              onClick={(event) => { event.stopPropagation(); dismissToast(toast.id); }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    )}
    <div className="nb" ref={panelRef}>
      <button
        className={`bell ${open ? "active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        {unread ? <BellRing size={23} /> : <Bell size={23} />}
        {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>

      {open && (
        <div className="panel" role="dialog" aria-label="Notifications panel">
          <div className="panelHead">
            <div className="panelTitle">
              <h3>Notifications</h3>
              <span>
                {unread > 0
                  ? `${unread} notification${unread === 1 ? "" : "s"} require${unread === 1 ? "s" : ""} attention`
                  : "You're all caught up"}
              </span>
            </div>
            <div className="panelHeadActions">
              {(pushPermission === "default" || pushPermission === "denied") && (
                <button
                  type="button"
                  className="headIcon"
                  onClick={
                    pushPermission === "denied"
                      ? () => setError("Notifications are blocked for PawCruz. Allow them in your browser's site settings, then reload the page.")
                      : enablePush
                  }
                  aria-label={pushPermission === "denied" ? "Browser notifications are blocked" : "Enable browser push notifications"}
                  title={
                    pushPermission === "denied"
                      ? "Notifications are blocked. Allow them in your browser's site settings."
                      : "Get alerts even when PawCruz is in another tab"
                  }
                >
                  <ShieldCheck size={17} />
                </button>
              )}
              <button
                type="button"
                className="headIcon"
                onClick={allRead}
                disabled={!unread}
                aria-label="Mark all as read"
                title="Mark all as read"
              >
                <CheckCheck size={17} />
              </button>
            </div>
          </div>

          {error && <div className="message errorMessage">{error}</div>}
          {pushStatus && !error && <div className="message successMessage">{pushStatus}</div>}

          <div className="list">
            {items.slice(0, 6).map((notification) => (
              <article
                key={notification.id}
                className={!notification.is_read ? "unread" : ""}
                role="button"
                tabIndex={0}
                title="Open"
                onClick={() => openNotification(notification)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNotification(notification);
                  }
                }}
              >
                <div className="notificationIcon">
                  <Bell size={17} />
                </div>
                <div className="notificationContent">
                  <div className="notificationTitleLine">
                    <strong className="notificationCardTitle">{getNotificationTitle(notification)}</strong>
                    {!notification.is_read && <span className="unreadDotNew" aria-label="Unread" />}
                  </div>
                  <p className="notificationMessage">{getNotificationMessage(notification)}</p>
                  <small className="notificationMetaLine">
                    {getNotificationType(notification)} · {formatDate(notification.created_at)}
                  </small>
                </div>
              </article>
            ))}

            {items.length === 0 && (
              <div className="empty">
                <div className="emptyIcon"><Bell size={22} /></div>
                <strong>No notifications yet</strong>
                <p>Appointment, queue, and clinic updates will appear here.</p>
              </div>
            )}
          </div>

          <div className="panelFooter">
            <button
              type="button"
              className="view"
              onClick={() => {
                setOpen(false);
                navigate(`/${rolePath}/notifications`);
              }}
            >
              View all notifications
              <ChevronRight size={16} />
            </button>

            {profile?.role === "admin" && (
              <button
                type="button"
                className="broadcast"
                onClick={() => {
                  setOpen(false);
                  navigate("/admin/notifications");
                }}
              >
                <Send size={15} />
                Send broadcast
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .nb{position:relative;font-family:inherit}
        .nb .bell{
          position:relative;width:48px;height:48px;border:1px solid rgba(38,139,183,.14);
          background:linear-gradient(145deg,#f7fdff,#e8f7fb);color:#238ab8;border-radius:15px;
          display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 18px rgba(36,125,162,.13);
          transition:transform .18s ease,box-shadow .18s ease,background .18s ease
        }
        .nb .bell:hover,.nb .bell.active{transform:translateY(-1px);box-shadow:0 10px 24px rgba(36,125,162,.2);background:#fff}
        .nb .bell b{
          position:absolute;right:-7px;top:-7px;background:#e85f68;color:#fff;font-size:10px;font-weight:900;
          border:3px solid #fff;border-radius:999px;min-width:23px;height:23px;padding:0 5px;display:grid;place-items:center
        }

        .nb .panel{
          position:absolute;right:0;top:calc(100% + 12px);width:min(440px,calc(100vw - 32px));
          max-height:min(560px,calc(100dvh - 120px));background:#fff;border:1px solid #d7e9f0;border-radius:20px;
          box-shadow:0 22px 60px rgba(25,72,94,.24);overflow:hidden;z-index:1000;
          display:flex;flex-direction:column;animation:notifDrop .16s ease-out
        }
        @keyframes notifDrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}

        .nb .panelHead{
          flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:12px;
          padding:16px 16px 16px 20px;background:linear-gradient(115deg,#2c7fb8,#1f5f8f);color:#fff
        }
        .nb .panelTitle{min-width:0;display:grid;gap:2px}
        .nb .panelTitle h3{margin:0!important;color:#fff!important;font-size:18px!important;line-height:1.2!important;font-weight:800!important}
        .nb .panelTitle span{color:rgba(255,255,255,.82);font-size:12.5px;font-weight:600}
        .nb .panelHeadActions{display:flex;gap:6px;flex:0 0 auto}
        .nb .headIcon{
          width:36px;height:36px;border-radius:11px;border:1px solid rgba(255,255,255,.4);
          background:rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;cursor:pointer;
          transition:background .15s ease
        }
        .nb .headIcon:hover:not(:disabled){background:rgba(255,255,255,.26)}
        .nb .headIcon:disabled{opacity:.45;cursor:not-allowed}

        .nb .message{flex:0 0 auto;margin:10px 14px 0;padding:9px 12px;border-radius:10px;font-size:12.5px;font-weight:700}
        .nb .errorMessage{background:#fff1f1;color:#a04444;border:1px solid #f5d9d9}
        .nb .successMessage{background:#eef9f2;color:#2f7850;border:1px solid #d9eedf}

        .nb .list{
          flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
          scrollbar-width:thin;scrollbar-color:#a8cbd9 transparent;background:#fff;overscroll-behavior:contain
        }
        .nb .list::-webkit-scrollbar{width:7px}
        .nb .list::-webkit-scrollbar-thumb{background:#a8cbd9;border-radius:999px}

        .nb .list article{
          position:relative;display:flex;align-items:flex-start;gap:13px;width:100%;margin:0;
          padding:14px 18px;border-bottom:1px solid #edf4f7;background:#fff;box-sizing:border-box;min-width:0;
          transition:background .15s ease
        }
        .nb .list article:last-child{border-bottom:0}
        .nb .list article{cursor:pointer;outline:none}
        .nb .list article:hover{background:#f0f8fc}
        .nb .list article:focus-visible{box-shadow:inset 0 0 0 2px rgba(77,168,218,.45)}
        .nb .list article.unread{background:#f2f9fd}
        .nb .list article.unread::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#4DA8DA}
        .nb .notificationIcon{
          width:40px;height:40px;min-width:40px;flex:0 0 40px;border-radius:12px;
          background:#eaf6fc;color:#2c7fb8;border:1px solid #d6ebf5;display:grid;place-items:center
        }
        .nb .unread .notificationIcon{background:#dcf0fa;color:#1f6f9f}

        .nb .notificationContent{flex:1 1 auto;min-width:0;display:grid;gap:3px}
        .nb .notificationTitleLine{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
        .nb .notificationCardTitle{
          min-width:0;color:#1d3a4a!important;font-size:14.5px!important;line-height:1.3!important;font-weight:700!important;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis
        }
        .nb .unread .notificationCardTitle{font-weight:800!important}
        .nb .unreadDotNew{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
        .nb .notificationMessage{
          margin:0!important;color:#4f6b78!important;font-size:13px!important;line-height:1.45!important;font-weight:500!important;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere
        }
        .nb .notificationMetaLine{
          display:block;color:#8197a2!important;font-size:11.5px!important;line-height:1.3!important;font-weight:600!important;
          text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis
        }

        /* Page styles elsewhere (e.g. the Dashboard's ".list div") must never
           box up the pieces of a notification row -- reset, then restyle. */
        .nb .list article div{background:none;padding:0;margin:0;border:0;border-radius:0;box-shadow:none;justify-content:normal}
        .nb .list article .notificationIcon{
          display:grid;place-items:center;width:40px;height:40px;min-width:40px;flex:0 0 40px;
          border-radius:12px;background:#eaf6fc;border:1px solid #d6ebf5;color:#2c7fb8
        }
        .nb .list article.unread .notificationIcon{background:#dcf0fa;color:#1f6f9f}
        .nb .list article .notificationContent{display:grid;gap:3px;flex:1 1 auto;min-width:0}
        .nb .list article .notificationTitleLine{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
        .nb .list article{align-items:flex-start;gap:12px;padding:13px 16px 13px 18px}
        .nb .list article.unread{background:#f2f9fd}
        .nb .list article:hover{background:#eaf5fb}

        .nb .empty{text-align:center;padding:34px 22px;color:#7a939f}
        .nb .emptyIcon{width:52px;height:52px;margin:0 auto 12px;border-radius:16px;background:#edf8fc;color:#3d98bd;display:grid;place-items:center}
        .nb .empty strong{display:block;color:#315c70;font-size:14.5px;margin-bottom:5px}
        .nb .empty p{margin:0;color:#7a939f!important;font-size:12.5px;line-height:1.5}

        .nb .panelFooter{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e6eff2;background:#fbfdfe}
        .nb .view,.nb .broadcast{
          flex:1;justify-content:center;border:0;border-radius:12px;padding:10px 12px;cursor:pointer;
          display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;font-family:inherit
        }
        .nb .view{background:#eaf6fc;color:#2c7fb8}
        .nb .view:hover{background:#dcf0fa}
        .nb .broadcast{background:#fff;color:#2c7fb8;border:1px solid #cfe6f0}
        .nb .broadcast:hover{background:#f0f8fc}

        @media(max-width:600px){
          .nb .panel{position:fixed;left:8px;right:8px;top:72px;width:auto;border-radius:18px;max-height:calc(100dvh - 84px)}
          .nb .panelHead{padding:14px 12px 14px 16px}
          .nb .list article{padding:12px 14px}
          .nb .panelFooter{flex-direction:column}
        }

        .nbToastStack{
          position:fixed;top:22px;right:22px;z-index:1200;display:flex;flex-direction:column;gap:10px;
          width:min(360px,calc(100vw - 44px))
        }
        .nbToast{
          display:flex;align-items:flex-start;gap:12px;padding:14px 15px;border-radius:16px;
          background:#fff;border:1px solid #d7e9f0;box-shadow:0 16px 40px rgba(25,72,94,.22);
          cursor:pointer;animation:nbToastIn .22s ease-out
        }
        @keyframes nbToastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
        .nbToastIcon{
          flex:0 0 38px;width:38px;height:38px;border-radius:12px;background:#e9f6fb;color:#197da8;
          display:grid;place-items:center
        }
        .nbToastBody{flex:1 1 auto;min-width:0}
        .nbToastBody strong{display:block;color:#174e66;font-size:14px;font-weight:900;margin-bottom:3px}
        .nbToastBody p{margin:0;color:#4d6d7d;font-size:12.5px;line-height:1.4;overflow-wrap:anywhere}
        .nbToastClose{
          flex:0 0 auto;border:0;background:none;color:#8fa7b2;cursor:pointer;padding:2px;
          display:grid;place-items:center
        }
        @media(max-width:600px){
          .nbToastStack{left:10px;right:10px;top:14px;width:auto}
        }
      `}</style>
    </div>
    </>
  );
}
