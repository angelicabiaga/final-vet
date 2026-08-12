import React, { useEffect, useRef, useState } from "react";
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
  getNotifications,
  markAllRead,
  requestBrowserNotifications,
  showBrowserNotification,
  subscribeNotifications,
} from "../services/notificationService";

export default function NotificationBell({ profile }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pushStatus, setPushStatus] = useState("");
  const panelRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile?.id) return undefined;

    let active = true;

    getNotifications(profile.id)
      .then((notifications) => {
        if (active) setItems(Array.isArray(notifications) ? notifications : []);
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

      // Only pop a browser notification for genuinely new records. UPDATE
      // events include mobile read-state changes and should remain silent.
      if (eventType === "INSERT") {
        showBrowserNotification(notification);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [profile?.id]);

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
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getNotificationTitle(notification) {
    return notification?.title?.trim() || "PawCruz update";
  }

  function getNotificationMessage(notification) {
    return notification?.message?.trim() || "You have a new clinic notification.";
  }

  return (
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
                    <span className="notificationType"><span className="typeDot" />Notification</span>
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
        .nb .bell{position:relative;width:48px;height:48px;border:1px solid rgba(38,139,183,.12);background:linear-gradient(145deg,#f5fcff,#e7f6fb);color:#238ab8;border-radius:15px;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 18px rgba(36,125,162,.12);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
        .nb .bell:hover,.nb .bell.active{transform:translateY(-2px);box-shadow:0 10px 24px rgba(36,125,162,.2);background:#fff}
        .nb .bell b{position:absolute;right:-6px;top:-6px;background:#e85f68;color:#fff;font-size:10px;font-weight:800;border:3px solid #fff;border-radius:999px;min-width:22px;height:22px;padding:0 4px;display:grid;place-items:center;box-sizing:border-box}
        .nb .panel{position:absolute;right:0;top:60px;width:min(460px,calc(100vw - 24px));background:#fff;border:1px solid #dcecf2;border-radius:22px;box-shadow:0 24px 70px rgba(30,79,101,.24);overflow:hidden;z-index:100;animation:notifDrop .18s ease-out}
        @keyframes notifDrop{from{opacity:0;transform:translateY(-8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        .nb .panelHead{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:20px 20px 17px;background:linear-gradient(135deg,#f7fdff,#eaf7fc);border-bottom:1px solid #dfeef3}
        .nb .panelHead>div{min-width:0}
        .nb .panelHead h3{margin:3px 0 6px !important;color:#164b66 !important;font-size:22px !important;line-height:1.15 !important;font-weight:800 !important}
        .nb .panelSubtitle{margin:0 !important;color:#688594 !important;font-size:13px !important;line-height:1.35 !important;font-weight:600 !important}
        .nb .eyebrow{display:block;color:#2c96c2 !important;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
        .nb .closeButton{width:36px;height:36px;border:0;border-radius:11px;background:#fff;color:#638393;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 12px rgba(31,94,120,.08);flex:0 0 auto}
        .nb .closeButton:hover{color:#194f68;background:#f8fcfd}
        .nb .panelActions{padding:14px 16px 12px;border-bottom:1px solid #edf3f5;background:#fff}
        .nb .push{width:100%;border:1px solid #d3eadc;border-radius:15px;padding:12px 13px;cursor:pointer;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;background:linear-gradient(135deg,#f1fbf5,#e9f8ef);color:#2b7950;text-align:left;transition:transform .18s ease,box-shadow .18s ease}
        .nb .push:hover{transform:translateY(-1px);box-shadow:0 7px 18px rgba(57,137,92,.12)}
        .nb .push span:nth-child(2){display:flex;flex-direction:column;gap:2px;min-width:0}
        .nb .push strong{font-size:14px;color:#2d7550;line-height:1.25}
        .nb .push small{font-size:11px;color:#68907a;white-space:normal;line-height:1.35}
        .nb .actionIcon{width:35px;height:35px;border-radius:11px;background:#fff;display:grid;place-items:center;box-shadow:0 4px 10px rgba(56,130,87,.1)}
        .nb .readAll{margin-top:10px;margin-left:auto;border:0;border-radius:10px;padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;background:#edf7fb;color:#237da5;font-weight:700;font-size:12px}
        .nb .readAll:disabled{opacity:.48;cursor:not-allowed}
        .nb .message{margin:0 16px 10px;padding:9px 11px;border-radius:10px;font-size:12px}
        .nb .errorMessage{background:#fff1f1;color:#a04444;border:1px solid #f5d9d9}
        .nb .successMessage{background:#eef9f2;color:#2f7850;border:1px solid #d9eedf}
        .nb .list{max-height:430px;overflow:auto;padding:12px 14px;scrollbar-width:thin;scrollbar-color:#bad2dc transparent;background:#fff}
        .nb .list::-webkit-scrollbar{width:7px}
        .nb .list::-webkit-scrollbar-thumb{background:#bad2dc;border-radius:999px}
        .nb .list article{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;margin:8px 0;padding:18px 18px;border:1px solid transparent;border-radius:15px;transition:background .18s ease,border-color .18s ease,transform .18s ease;box-sizing:border-box}
        .nb .list article:hover{background:#f8fcfd;border-color:#e1edf2;transform:translateX(2px)}
        .nb .list article.unread{background:#f5fbfe;border-color:#bfe0ec;box-shadow:0 5px 14px rgba(39,118,151,.08)}
        .nb .notificationIcon{width:40px;height:40px;border-radius:13px;background:#e9f6fb;color:#298db7;display:grid;place-items:center;flex:0 0 auto;margin-top:1px}
        .nb .unread .notificationIcon{background:#d9f1fb;color:#197da8}
        .nb .notificationContent{min-width:0;overflow:hidden}
.nb .notificationTypeRow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .nb .notificationType{display:inline-flex;align-items:center;gap:9px;color:#557481 !important;font-size:12px !important;font-weight:800 !important;line-height:1.2}
        .nb .typeDot{width:10px;height:10px;border-radius:50%;background:#2da5df;box-shadow:0 0 0 3px rgba(45,165,223,.08);flex:0 0 auto}
        .nb .unreadPill{display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #2e9fd4;border-radius:999px;padding:5px 11px;color:#248fc2 !important;background:#fff;font-size:11px !important;font-weight:800 !important;line-height:1;white-space:nowrap}
        .nb .notificationCardTitle{display:block;color:#174e66 !important;font-size:15px !important;line-height:1.35 !important;font-weight:850 !important;margin:0 0 7px !important;overflow-wrap:anywhere}
                .nb .notificationTitleRow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px}
        .nb .notificationTitleRow strong{display:block;color:#194f68 !important;font-size:14px !important;line-height:1.3 !important;font-weight:800 !important;overflow-wrap:anywhere;word-break:normal}
        .nb .notificationMessage{display:block;margin:0 0 12px !important;color:#4f6f7e !important;font-size:13px !important;line-height:1.55 !important;font-weight:600 !important;overflow-wrap:anywhere;word-break:normal;white-space:normal !important;opacity:1 !important}
        .nb .notificationMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:18px}
        .nb .notificationMeta small{color:#7893a0 !important;font-size:11.5px !important;line-height:1.3 !important;font-weight:600 !important}
        .nb .unreadLabel{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;background:#d9f1fb;color:#197da8;font-size:10px;font-weight:800;letter-spacing:.02em}
        .nb .unreadDot{width:8px;height:8px;border-radius:50%;background:#32a5d5;box-shadow:0 0 0 4px rgba(50,165,213,.12);flex:0 0 auto;margin-top:5px}
        .nb .empty{text-align:center;padding:34px 24px 36px;color:#7a939f}
        .nb .emptyIcon{width:54px;height:54px;margin:0 auto 12px;border-radius:17px;background:#edf8fc;color:#3d98bd;display:grid;place-items:center}
        .nb .empty strong{display:block;color:#315c70;font-size:14px;margin-bottom:5px}
        .nb .empty p{margin:0;color:#7a939f !important;font-size:12px;line-height:1.5}
        .nb .panelFooter{padding:12px 16px 16px;border-top:1px solid #edf3f5;background:#fbfdfe}
        .nb .view,.nb .broadcast{width:100%;justify-content:center;border:0;border-radius:13px;padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:7px;font-weight:800;font-size:13px;transition:transform .18s ease,box-shadow .18s ease}
        .nb .view{background:linear-gradient(135deg,#49a9d5,#2f95c4);color:#fff;box-shadow:0 8px 18px rgba(50,151,197,.22)}
        .nb .view:hover,.nb .broadcast:hover{transform:translateY(-1px)}
        .nb .broadcast{margin-top:9px;background:#eaf7ef;color:#337754;border:1px solid #d7ebdf}
        @media(max-width:600px){
          .nb .panel{position:fixed;left:12px;right:12px;top:76px;width:auto;max-height:calc(100vh - 90px);display:flex;flex-direction:column}
          .nb .list{max-height:none;flex:1}
          .nb .panelHead{padding:18px 17px 14px}
          .nb .panelActions{padding:12px}
          .nb .panelFooter{padding:11px 12px 13px}
          .nb .list article{grid-template-columns:38px minmax(0,1fr);padding:12px 11px;gap:10px}
          .nb .notificationIcon{width:37px;height:37px}
        }
      `}</style>
    </div>
  );
}
