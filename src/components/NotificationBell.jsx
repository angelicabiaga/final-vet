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
  requestBrowserNotifications,
  showBrowserNotification,
  subscribeNotifications,
} from "../services/notificationService";
import { hasBeenWelcomed, markWelcomed, playNotificationSound } from "../utils/notificationSound";
import { formatDateTime12h } from "../utils/timeFormat";

const TOAST_DURATION_MS = 7000;

export default function NotificationBell({ profile }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pushStatus, setPushStatus] = useState("");
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

  const unread = items.filter((item) => !item.is_read).length;
  const rolePath = profile?.role === "pet_owner" ? "pet-owner" : profile?.role;

  async function enablePush() {
    try {
      setError("");
      const permission = await requestBrowserNotifications();
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
            <div>
              <span className="eyebrow">Stay updated</span>
              <h3>Notifications</h3>
              <p className="panelSubtitle">{unread ? `${unread} unread notification${unread > 1 ? "s" : ""}` : "You are all caught up"}</p>
            </div>
            <button className="closeButton" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={19} />
            </button>
          </div>

          <div className="panelActions">
            <button className="push" onClick={enablePush}>
              <span className="actionIcon"><ShieldCheck size={18} /></span>
              <span>
                <strong>Browser push notifications</strong>
                <small>Receive updates even when this panel is closed</small>
              </span>
              <ChevronRight size={18} />
            </button>

            <button className="readAll" onClick={allRead} disabled={!unread}>
              <CheckCheck size={17} />
              Mark all as read
            </button>
          </div>

          {error && <div className="message errorMessage">{error}</div>}
          {pushStatus && !error && <div className="message successMessage">{pushStatus}</div>}

          <div className="list">
            {items.slice(0, 6).map((notification) => (
              <article key={notification.id} className={!notification.is_read ? "unread" : ""}>
                <div className="notificationIcon">
                  <Bell size={17} />
                </div>
                <div className="notificationContent">
                  <div className="notificationTypeRow">
                    <span className="notificationType"><span className="typeDot" />{getNotificationType(notification)}</span>
                    {!notification.is_read && <span className="unreadPill">Unread</span>}
                  </div>
                  <strong className="notificationCardTitle">{getNotificationTitle(notification)}</strong>
                  <p className="notificationMessage">{getNotificationMessage(notification)}</p>
                  <div className="notificationMeta">
                    <small>{formatDate(notification.created_at)}</small>
                  </div>
                </div>
              </article>
            ))}

            {items.length === 0 && (
              <div className="empty">
                <div className="emptyIcon"><Bell size={25} /></div>
                <strong>No notifications yet</strong>
                <p>Appointment, queue, and clinic updates will appear here.</p>
              </div>
            )}
          </div>

          <div className="panelFooter">
            <button
              className="view"
              onClick={() => {
                setOpen(false);
                navigate(`/${rolePath}/notifications`);
              }}
            >
              View all notifications
              <ChevronRight size={18} />
            </button>

            {profile?.role === "admin" && (
              <button
                className="broadcast"
                onClick={() => {
                  setOpen(false);
                  navigate("/admin/notifications");
                }}
              >
                <Send size={16} />
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
          position:fixed;right:22px;top:88px;width:min(560px,calc(100vw - 44px));
          max-height:calc(100dvh - 110px);background:#fff;border:1px solid #d7e9f0;border-radius:24px;
          box-shadow:0 26px 80px rgba(25,72,94,.28);overflow:hidden;z-index:1000;
          display:flex;flex-direction:column;animation:notifDrop .18s ease-out
        }
        @keyframes notifDrop{from{opacity:0;transform:translateY(-8px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}

        .nb .panelHead{
          flex:0 0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:18px;
          padding:22px 24px 18px;background:linear-gradient(135deg,#f8fdff,#eaf7fc);border-bottom:1px solid #dcecf2
        }
        .nb .panelHead>div{min-width:0}
        .nb .eyebrow{display:block;color:#2696c4!important;font-size:12px!important;font-weight:900!important;letter-spacing:.13em;text-transform:uppercase}
        .nb .panelHead h3{margin:5px 0 7px!important;color:#174e67!important;font-size:27px!important;line-height:1.08!important;font-weight:900!important}
        .nb .panelSubtitle{margin:0!important;color:#658393!important;font-size:14px!important;line-height:1.4!important;font-weight:700!important}
        .nb .closeButton{
          width:44px;height:44px;border:1px solid #e3edf1;border-radius:14px;background:#fff;color:#658493;
          display:grid;place-items:center;cursor:pointer;box-shadow:0 5px 14px rgba(31,94,120,.09);flex:0 0 auto
        }

        .nb .panelActions{flex:0 0 auto;padding:16px 20px 14px;border-bottom:1px solid #e8f0f3;background:#fff}
        .nb .push{
          width:100%;border:1px solid #cfe7d8;border-radius:18px;padding:14px 15px;cursor:pointer;
          display:grid;grid-template-columns:40px minmax(0,1fr) 20px;align-items:center;gap:13px;
          background:linear-gradient(135deg,#f2fbf5,#e8f7ee);color:#2b7950;text-align:left
        }
        .nb .push span:nth-child(2){display:flex;flex-direction:column;gap:3px;min-width:0}
        .nb .push strong{font-size:15px!important;color:#2e7650!important;line-height:1.25!important;font-weight:900!important}
        .nb .push small{font-size:12px!important;color:#678c79!important;line-height:1.4!important;font-weight:600!important;white-space:normal!important}
        .nb .actionIcon{width:40px;height:40px;border-radius:13px;background:#fff;display:grid;place-items:center;box-shadow:0 4px 10px rgba(56,130,87,.1)}
        .nb .readAll{
          margin-top:12px;margin-left:auto;border:0;border-radius:12px;padding:10px 13px;cursor:pointer;
          display:flex;align-items:center;gap:7px;background:#edf7fb;color:#237da5;font-weight:800;font-size:12.5px
        }
        .nb .readAll:disabled{opacity:.46;cursor:not-allowed}

        .nb .message{flex:0 0 auto;margin:12px 20px 0;padding:10px 12px;border-radius:11px;font-size:12.5px;font-weight:700}
        .nb .errorMessage{background:#fff1f1;color:#a04444;border:1px solid #f5d9d9}
        .nb .successMessage{background:#eef9f2;color:#2f7850;border:1px solid #d9eedf}

        .nb .list{
          flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:14px 16px 16px;
          scrollbar-width:thin;scrollbar-color:#a8cbd9 transparent;background:#fff;overscroll-behavior:contain
        }
        .nb .list::-webkit-scrollbar{width:8px}
        .nb .list::-webkit-scrollbar-thumb{background:#a8cbd9;border-radius:999px}

        .nb .list article{
          display:flex!important;align-items:flex-start!important;gap:14px!important;
          width:100%!important;margin:8px 0 12px!important;padding:17px 17px!important;
          border:1px solid #dfecef!important;border-radius:19px!important;background:#fff!important;
          box-sizing:border-box!important;min-width:0!important
        }
        .nb .list article.unread{background:#f4fbfe!important;border-color:#acd7e7!important;box-shadow:0 6px 18px rgba(39,118,151,.08)!important}
        .nb .notificationIcon{
          width:46px!important;height:46px!important;min-width:46px!important;flex:0 0 46px!important;
          border-radius:15px!important;background:#e9f6fb!important;color:#298db7!important;
          display:grid!important;place-items:center!important;margin:0!important
        }
        .nb .unread .notificationIcon{background:#d9f1fb!important;color:#197da8!important}

        .nb .notificationContent{
          flex:1 1 auto!important;min-width:0!important;width:auto!important;display:block!important;
          grid-template-columns:none!important;overflow:visible!important
        }
        .nb .notificationTypeRow{
          display:flex!important;align-items:center!important;justify-content:space-between!important;
          gap:10px!important;width:100%!important;margin:0 0 9px!important;min-width:0!important
        }
        .nb .notificationType{
          display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important;
          color:#557684!important;font-size:12px!important;font-weight:900!important;line-height:1.35!important;
          text-transform:capitalize!important;white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important
        }
        .nb .typeDot{width:9px!important;height:9px!important;min-width:9px!important;border-radius:50%!important;background:#2da5df!important;box-shadow:0 0 0 3px rgba(45,165,223,.1)!important}
        .nb .unreadPill{
          flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;
          border:1.5px solid #2e9fd4!important;border-radius:999px!important;padding:5px 10px!important;
          color:#248fc2!important;background:#fff!important;font-size:11px!important;font-weight:900!important;white-space:nowrap!important
        }

        .nb .notificationCardTitle{
          display:block!important;width:100%!important;color:#174e66!important;font-size:17px!important;
          line-height:1.32!important;font-weight:900!important;margin:0 0 7px!important;
          white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important
        }
        .nb .notificationMessage{
          display:block!important;width:100%!important;margin:0 0 11px!important;color:#4d6d7d!important;
          font-size:14px!important;line-height:1.55!important;font-weight:650!important;
          white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important;opacity:1!important
        }
        .nb .notificationMeta{
          display:block!important;width:100%!important;min-height:auto!important;margin:0!important
        }
        .nb .notificationMeta small{
          display:block!important;color:#7893a0!important;font-size:12px!important;line-height:1.35!important;font-weight:700!important
        }

        .nb .notificationTitleRow,.nb .notificationTitleRow strong,.nb .unreadLabel,.nb .unreadDot{all:unset}

        .nb .empty{text-align:center;padding:42px 24px;color:#7a939f}
        .nb .emptyIcon{width:58px;height:58px;margin:0 auto 13px;border-radius:18px;background:#edf8fc;color:#3d98bd;display:grid;place-items:center}
        .nb .empty strong{display:block;color:#315c70;font-size:15px;margin-bottom:6px}
        .nb .empty p{margin:0;color:#7a939f!important;font-size:13px;line-height:1.5}

        .nb .panelFooter{flex:0 0 auto;padding:13px 16px 16px;border-top:1px solid #e6eff2;background:#fbfdfe}
        .nb .view,.nb .broadcast{
          width:100%;justify-content:center;border:0;border-radius:14px;padding:13px 15px;cursor:pointer;
          display:flex;align-items:center;gap:8px;font-weight:900;font-size:13.5px
        }
        .nb .view{background:linear-gradient(135deg,#49a9d5,#2f95c4);color:#fff;box-shadow:0 8px 18px rgba(50,151,197,.22)}
        .nb .broadcast{margin-top:9px;background:#eaf7ef;color:#337754;border:1px solid #d7ebdf}

        @media(max-width:900px){
          .nb .panel{left:14px;right:14px;top:78px;width:auto;max-height:calc(100dvh - 94px)}
        }
        @media(max-width:600px){
          .nb .panel{left:8px;right:8px;top:72px;border-radius:20px;max-height:calc(100dvh - 80px)}
          .nb .panelHead{padding:18px 16px 15px}
          .nb .panelHead h3{font-size:23px!important}
          .nb .panelActions{padding:13px 12px}
          .nb .push{grid-template-columns:36px minmax(0,1fr) 18px;padding:12px}
          .nb .actionIcon{width:36px;height:36px}
          .nb .list{padding:10px}
          .nb .list article{gap:10px!important;padding:14px 12px!important;border-radius:16px!important}
          .nb .notificationIcon{width:40px!important;height:40px!important;min-width:40px!important;flex-basis:40px!important}
          .nb .notificationCardTitle{font-size:15.5px!important}
          .nb .notificationMessage{font-size:13px!important}
          .nb .notificationType{font-size:11px!important}
          .nb .unreadPill{font-size:10px!important;padding:4px 8px!important}
          .nb .panelFooter{padding:10px 10px 12px}
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
