import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getNotificationLink } from "../../utils/notificationLink";
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  ImagePlus,
  Clock3,
  Megaphone,
  MessageSquare,
  PackageX,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";

import AppShell from "../../components/AppShell";

import {
  getNotifications,
  markNotificationRead,
  sendBroadcast,
  subscribeNotifications,
  uploadBroadcastImage,
} from "../../services/notificationService";
import { formatDateTime12h } from "../../utils/timeFormat";
import { focusFirstInvalidField, invalidClass } from "../../utils/formValidation";
import { MAX_IMAGE_BYTES, validateImageFile } from "../../utils/validators";

// Each tab groups the notification types PawCruz actually saves, e.g.
// Appointments = "Appointment" + "Appointment Reminder". clinicOnly tabs are
// for staff, vets and admins (pet owners never get those notifications).
const CATEGORY_FILTERS = [
  { key: "appointments", label: "Appointments", pattern: /appointment|booking/ },
  { key: "queue", label: "Queue", pattern: /queue|serving|reassign/ },
  { key: "messages", label: "Messages", pattern: /message/ },
  { key: "announcements", label: "Announcements", pattern: /broadcast|announcement/ },
  { key: "inventory", label: "Inventory", pattern: /inventory|stock/, clinicOnly: true },
  { key: "schedule", label: "Schedule", pattern: /schedule|leave/, clinicOnly: true },
];

function matchesCategory(notification, category) {
  return category.pattern.test(String(notification?.notification_type || "").toLowerCase());
}

const INITIAL_BROADCAST_FORM = {
  title: "",
  message: "",
  related_module: "",
};

// Human-readable labels for the broadcast form's fields, used to name
// exactly which one(s) failed instead of a generic "highlighted field(s)"
// message.
const BROADCAST_FIELD_LABELS = {
  title: "Title",
  message: "Message",
};

function iconForNotificationType(notificationType) {
  const type = (notificationType || "").toLowerCase();

  if (type.includes("queue")) return Clock3;
  if (type.includes("appointment")) return CalendarDays;
  if (type.includes("leave") || type.includes("schedule")) return CalendarClock;
  if (type.includes("stock") || type.includes("inventory")) return PackageX;
  if (type.includes("broadcast") || type.includes("announcement")) return Megaphone;
  if (type.includes("message")) return MessageSquare;
  if (type.includes("account") || type.includes("security")) return ShieldAlert;

  return BellRing;
}

export default function NotificationsPage({ profile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [detailNotification, setDetailNotification] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filter, setFilter] = useState("all");

  const [form, setForm] = useState(INITIAL_BROADCAST_FORM);
  // Optional picture for the broadcast, with a local preview.
  const [broadcastImage, setBroadcastImage] = useState(null);
  const [broadcastImagePreview, setBroadcastImagePreview] = useState("");
  const broadcastImageInputRef = useRef(null);

  useEffect(() => () => {
    if (broadcastImagePreview) URL.revokeObjectURL(broadcastImagePreview);
  }, [broadcastImagePreview]);

  function chooseBroadcastImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateImageFile(file);
    } catch (imageError) {
      event.target.value = "";
      setSuccess("");
      setError(imageError.message);
      return;
    }
    setBroadcastImage(file);
    setBroadcastImagePreview(URL.createObjectURL(file));
  }

  function removeBroadcastImage() {
    setBroadcastImage(null);
    setBroadcastImagePreview("");
    if (broadcastImageInputRef.current) broadcastImageInputRef.current.value = "";
  }
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({}).current;
  const registerFieldRef = (name) => (el) => { fieldRefs[name] = el; };
  const [sending, setSending] = useState(false);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    async function loadInitialNotifications() {
      setLoading(true);
      setError("");

      try {
        const notifications = await getNotifications(profile.id);

        if (active) {
          setItems(notifications);
        }
      } catch (loadError) {
        console.error("Unable to load notifications:", loadError);

        if (active) {
          setError(
            loadError?.message ||
              "Unable to load notifications. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadInitialNotifications();

    const unsubscribe = subscribeNotifications(
      profile.id,
      (notification, eventType) => {
        if (!active || !notification?.id) {
          return;
        }

        setItems((currentItems) => {
          if (eventType === "DELETE") {
            return currentItems.filter((item) => item.id !== notification.id);
          }

          const alreadyExists = currentItems.some(
            (item) => item.id === notification.id
          );

          if (alreadyExists) {
            return currentItems.map((item) =>
              item.id === notification.id ? notification : item
            );
          }

          return [notification, ...currentItems];
        });
      }
    );

    return () => {
      active = false;

      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [profile?.id]);

  const shownNotifications = useMemo(() => {
    return items.filter((notification) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "unread") {
        return !notification.is_read;
      }

      const category = CATEGORY_FILTERS.find((item) => item.key === filter);
      return category ? matchesCategory(notification, category) : true;
    });
  }, [items, filter]);

  // Tabs for this role, hiding ones with nothing in them yet (the selected
  // tab always stays visible).
  const categoryTabs = useMemo(() => {
    const isPetOwner = profile?.role === "pet_owner";
    return CATEGORY_FILTERS.filter((category) => !(category.clinicOnly && isPetOwner))
      .map((category) => ({
        ...category,
        count: items.filter((notification) => matchesCategory(notification, category)).length,
      }))
      .filter((category) => category.count > 0 || category.key === filter);
  }, [items, filter, profile?.role]);

  const unreadCount = useMemo(() => {
    return items.filter((notification) => !notification.is_read).length;
  }, [items]);

  async function handleRead(notification) {
    if (!notification?.id || notification.is_read) {
      return;
    }

    clearMessages();

    try {
      await markNotificationRead(notification.id);

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                is_read: true,
                read_at: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (readError) {
      console.error("Unable to mark notification as read:", readError);

      setError(
        readError?.message ||
          "Unable to mark the notification as read."
      );
    }
  }

  // Clicking a notification marks it read and opens the page it is about
  // (stays here when it has no more specific page, e.g. announcements).
  function openNotification(notification) {
    handleRead(notification);
    const destination = getNotificationLink(notification, profile?.role);
    if (destination && destination !== window.location.pathname) {
      navigate(destination);
      return;
    }
    // No more specific page (e.g. a broadcast): show it in full here.
    setDetailNotification(notification);
  }

  // Opened from the bell dropdown with a specific notification to show.
  const requestedNotificationId = location.state?.openNotificationId;
  useEffect(() => {
    if (!requestedNotificationId || !items.length) return;
    const match = items.find((item) => item.id === requestedNotificationId);
    if (!match) return;
    setDetailNotification(match);
    handleRead(match);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedNotificationId, items]);

  useEffect(() => {
    if (!detailNotification) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setDetailNotification(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailNotification]);

  function handleBroadcastChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setFieldErrors((current) => (
      current[name] && value.trim() ? { ...current, [name]: "" } : current
    ));
  }

  async function handleBroadcast(event) {
    event.preventDefault();

    const title = form.title.trim();
    const message = form.message.trim();

    const errors = {};
    if (!title) errors.title = "Please enter a notification title.";
    if (!message) errors.message = "Please enter a notification message.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const fieldNames = Object.keys(errors)
        .map((key) => BROADCAST_FIELD_LABELS[key] || key)
        .join(", ");
      setSuccess("");
      setError(`Please fix the following field(s): ${fieldNames}.`);
      focusFirstInvalidField(fieldRefs, errors);
      return;
    }

    clearMessages();
    setSending(true);

    try {
      const image_url = broadcastImage ? await uploadBroadcastImage(broadcastImage, profile?.id) : null;
      const notification = await sendBroadcast(
        {
          title,
          message,
          related_module: form.related_module,
          image_url,
        },
        profile
      );

      setForm(INITIAL_BROADCAST_FORM);
      removeBroadcastImage();
      setFieldErrors({});

      setItems((currentItems) => {
        if (!notification?.id) {
          return currentItems;
        }

        const alreadyExists = currentItems.some(
          (item) => item.id === notification.id
        );

        return alreadyExists
          ? currentItems
          : [notification, ...currentItems];
      });

      setSuccess("Broadcast notification sent successfully.");
    } catch (broadcastError) {
      console.error(
        "Unable to send broadcast notification:",
        broadcastError
      );

      setError(
        broadcastError?.message ||
          "Unable to send the broadcast notification."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell profile={profile} title="Notifications">
      {detailNotification && (() => {
        const DetailIcon = iconForNotificationType(detailNotification.notification_type);
        return (
          <div
            className="notif-detail-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailNotification(null); }}
          >
            <div className="notif-detail" role="dialog" aria-modal="true" aria-labelledby="notif-detail-title">
              <button type="button" className="notif-detail-close" aria-label="Close" onClick={() => setDetailNotification(null)}>
                <X size={18} />
              </button>
              <div className="notif-detail-head">
                <span className="notif-detail-icon"><DetailIcon size={22} /></span>
                <div>
                  <span className="notif-detail-type">{detailNotification.notification_type || "Notification"}</span>
                  <h3 id="notif-detail-title">{detailNotification.title || "PawCruz Notification"}</h3>
                </div>
              </div>
              <p className="notif-detail-message">{detailNotification.message || "You have a new notification."}</p>
              {detailNotification.image_url && (
                <a href={detailNotification.image_url} target="_blank" rel="noreferrer" className="notif-detail-image">
                  <img src={detailNotification.image_url} alt={detailNotification.title || "Announcement picture"} />
                </a>
              )}
              <small className="notif-detail-date">
                {detailNotification.created_at ? formatDateTime12h(detailNotification.created_at) : "Date unavailable"}
              </small>
              <button type="button" className="notif-detail-done" onClick={() => setDetailNotification(null)}>
                Close
              </button>
            </div>
          </div>
        );
      })()}
      <div className="notifications-page">

        {error && (
          <div className="alert error-alert">
            {error}
          </div>
        )}

        {success && (
          <div className="alert success-alert">
            {success}
          </div>
        )}

        {profile?.role === "admin" && (
          <form
            className="broadcast-form"
            onSubmit={handleBroadcast}
            noValidate
          >
            <h3>
              <Send size={18} />
              Broadcast Notification
            </h3>

            <div className="broadcast-grid">
              <label>
                <span>Title<span className="required-mark"> *</span></span>

                <input
                  ref={registerFieldRef("title")}
                  className={invalidClass(fieldErrors, "title")}
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleBroadcastChange}
                  placeholder="Enter announcement title"
                  maxLength={120}
                  required
                />
                {fieldErrors.title && <span className="field-error-text">{fieldErrors.title}</span>}
              </label>

              <label>
                <span>Related module</span>

                <select
                  name="related_module"
                  value={form.related_module}
                  onChange={handleBroadcastChange}
                >
                  <option value="">General</option>
                  <option value="Appointments">Appointments</option>
                  <option value="Queue">Queue</option>
                  <option value="Inventory">Inventory</option>
                  <option value="Animal Patients">
                    Animal Patients
                  </option>
                  <option value="Messages">Messages</option>
                  <option value="Security">Security</option>
                </select>
              </label>
            </div>

            <label>
              <span>Message<span className="required-mark"> *</span></span>

              <textarea
                ref={registerFieldRef("message")}
                className={invalidClass(fieldErrors, "message")}
                name="message"
                value={form.message}
                onChange={handleBroadcastChange}
                placeholder="Enter the announcement message"
                maxLength={1000}
                required
              />
              {fieldErrors.message && <span className="field-error-text">{fieldErrors.message}</span>}
            </label>

            {broadcastImagePreview && (
            <div className="broadcast-image-field">
                <div className="broadcast-image-preview">
                  <img src={broadcastImagePreview} alt="Attached preview" />
                  <div className="broadcast-image-meta">
                    <strong>{broadcastImage?.name}</strong>
                    <small>{broadcastImage ? `${(broadcastImage.size / 1024 / 1024).toFixed(2)} MB` : ""}</small>
                    <button type="button" className="broadcast-image-remove" onClick={removeBroadcastImage} disabled={sending}>
                      <X size={15} /> Remove picture
                    </button>
                  </div>
                </div>
            </div>
            )}

            <div className="broadcast-actions">
              {/* Messenger-style attach button with a hover tooltip */}
              <label
                className={`broadcast-attach${broadcastImage ? " has-file" : ""}${sending ? " disabled" : ""}`}
                data-tip={broadcastImage ? "Replace the picture" : `Attach a picture up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`}
                aria-label="Attach a picture"
              >
                <ImagePlus size={20} />
                <input
                  ref={broadcastImageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={chooseBroadcastImage}
                  disabled={sending}
                />
              </label>

              <button type="submit" disabled={sending}>
                <Send size={16} />

                {sending
                  ? "Sending..."
                  : "Send to All Users"}
              </button>
            </div>
          </form>
        )}

        <div className="notification-filters">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
            {items.length > 0 && <span className="filter-count">{items.length}</span>}
          </button>

          <button
            type="button"
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
          >
            Unread
            {unreadCount > 0 && <span className="filter-count">{unreadCount}</span>}
          </button>

          {categoryTabs.map((category) => (
            <button
              type="button"
              key={category.key}
              className={filter === category.key ? "active" : ""}
              onClick={() => setFilter(category.key)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="empty-state">
              <BellRing size={36} />
              <h3>Loading notifications...</h3>
              <p>Please wait while your notifications are retrieved.</p>
            </div>
          ) : shownNotifications.length === 0 ? (
            <div className="empty-state">
              <BellRing size={36} />
              <h3>No notifications found</h3>
              <p>
                There are no notifications matching the selected
                filter.
              </p>
            </div>
          ) : (
            shownNotifications.map((notification) => {
              const ItemIcon = iconForNotificationType(notification.notification_type);

              return (
              <article
                key={notification.id}
                className={
                  notification.is_read
                    ? "notification-item"
                    : "notification-item unread"
                }
                onClick={() => openNotification(notification)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    openNotification(notification);
                  }
                }}
              >
                <div className="notification-icon">
                  <ItemIcon size={21} />
                </div>

                <div className="notification-content">
                  <div className="notification-title">
                    <strong>
                      {notification.title || "PawCruz Notification"}
                    </strong>

                    {notification.is_read ? (
                      <span>Read</span>
                    ) : (
                      <span className="new-badge">New</span>
                    )}
                  </div>

                  <p>
                    {notification.message ||
                      "You have a new notification."}
                  </p>

                  {notification.image_url && (
                    <img className="notification-thumb" src={notification.image_url} alt="" loading="lazy" />
                  )}

                  <small>
                    {notification.notification_type || "General"}
                    {" • "}
                    {notification.created_at
                      ? formatDateTime12h(notification.created_at)
                      : "Date unavailable"}
                  </small>
                </div>

                {!notification.is_read && (
                  <Check size={18} />
                )}
              </article>
              );
            })
          )}
        </div>

        <style>{`
          .notifications-page {
            display: grid;
            gap: 18px;
          }

          .notification-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            padding: 14px;
            border: 1px solid #dcecf3;
            border-radius: 16px;
            background: #ffffff;
            box-shadow: 0 8px 24px rgba(44, 112, 143, 0.08);
          }

          .action-group {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          .notification-actions button {
            min-height: 46px;
            padding: 11px 16px;
            white-space: nowrap;
          }

          .mark-all-button {
            margin-left: auto;
            min-width: 164px;
            box-shadow: 0 6px 16px rgba(77, 168, 218, 0.24);
          }

          button {
            border: 0;
            border-radius: 10px;
            padding: 10px 13px;
            background: #4da8da;
            color: #ffffff;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            font-weight: 600;
          }

          button:hover:not(:disabled) {
            filter: brightness(0.96);
          }

          button:disabled {
            cursor: not-allowed;
            opacity: 0.55;
          }

          .secondary-button {
            background: #eaf7fb;
            color: #287fa7;
          }

          .notification-summary {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 220px));
            gap: 14px;
          }

          .notification-summary > div {
            background: #ffffff;
            padding: 18px;
            border-radius: 15px;
            box-shadow: 0 7px 22px rgba(47, 117, 150, 0.08);
            display: grid;
            gap: 5px;
          }

          .notification-summary strong {
            color: #318fbe;
            font-size: 25px;
          }

          .notification-summary span {
            color: #6f7f88;
            font-size: 13px;
          }

          .alert {
            padding: 13px 15px;
            border-radius: 11px;
            line-height: 1.5;
          }

          .error-alert {
            background: #fff0f0;
            color: #a94444;
          }

          .success-alert {
            background: #eaf8ef;
            color: #28794c;
          }

          .broadcast-form,
          .notification-list,
          .notification-filters {
            background: #ffffff;
            border-radius: 16px;
            padding: 18px;
            box-shadow: 0 7px 22px rgba(47, 117, 150, 0.08);
          }

          .broadcast-form h3 {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 17px;
          }

          .broadcast-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 13px;
          }

          .broadcast-form label {
            display: grid;
            gap: 7px;
            margin-bottom: 13px;
          }

          .broadcast-form label span {
            font-size: 13px;
            font-weight: 700;
            color: #425d69;
          }

          .broadcast-form input,
          .broadcast-form select,
          .broadcast-form textarea {
            width: 100%;
            padding: 11px;
            border: 1px solid #d8e8ef;
            border-radius: 10px;
            font: inherit;
            color: #20313b;
            outline: none;
          }

          .broadcast-form input:focus,
          .broadcast-form select:focus,
          .broadcast-form textarea:focus {
            border-color: #4da8da;
            box-shadow: 0 0 0 3px rgba(77, 168, 218, 0.13);
          }

          .broadcast-form textarea {
            min-height: 95px;
            resize: vertical;
          }

          .notification-filters {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 10px 12px;
            overflow-x: auto;
            scrollbar-width: thin;
            scrollbar-color: #cfe6f0 transparent;
          }

          .notification-filters button {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            flex-shrink: 0;
            white-space: nowrap;
            border: 0;
            border-radius: 999px;
            padding: 9px 16px;
            background: transparent;
            color: #5f7884;
            font-family: inherit;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: none;
            transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
          }

          .notification-filters button:hover:not(.active) {
            background: #eef7fb;
            color: #2c7fb8;
          }

          .notification-filters button.active {
            background: #4da8da;
            color: #ffffff;
            box-shadow: 0 6px 14px rgba(77, 168, 218, 0.28);
          }

          .notification-filters .filter-count {
            min-width: 20px;
            height: 20px;
            padding: 0 6px;
            box-sizing: border-box;
            display: inline-grid;
            place-items: center;
            border-radius: 999px;
            background: #4da8da;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
          }

          .notification-filters button.active .filter-count {
            background: #ffffff;
            color: #2c7fb8;
          }

          .notification-list {
            padding: 8px 18px;
          }

          .notification-item {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: flex-start;
            gap: 13px;
            padding: 17px 10px;
            border-bottom: 1px solid #edf4f7;
            cursor: pointer;
            border-radius: 12px;
            outline: none;
          }

          .notification-item:last-child {
            border-bottom: 0;
          }

          .notification-item:hover {
            background: #f8fcfd;
          }

          .notification-item:focus {
            box-shadow: 0 0 0 3px rgba(77, 168, 218, 0.14);
          }

          .notification-item.unread {
            background: #f0faff;
          }

          .notification-icon {
            background: #dff3fb;
            color: #318fbe;
            padding: 10px;
            border-radius: 12px;
            height: max-content;
          }

          .notification-content {
            min-width: 0;
          }

          .notification-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
          }

          .notification-title strong {
            color: #20313b;
          }

          .notification-title span {
            color: #78909b;
            font-size: 12px;
          }

          .notification-title .new-badge {
            background: #dff3fb;
            color: #318fbe;
            padding: 4px 8px;
            border-radius: 999px;
            font-weight: 700;
          }

          .notification-item p {
            margin: 7px 0;
            color: #465e68;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }

          .notification-item small {
            color: #78909b;
          }

          /* Broadcast picture attachment */
          .broadcast-image-field {
            display: grid;
            gap: 7px;
            margin-bottom: 14px;
          }

          .broadcast-actions {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .broadcast-form label.broadcast-attach {
            position: relative;
            display: grid;
            place-items: center;
            width: 44px;
            height: 44px;
            margin: 0;
            border-radius: 50%;
            background: #eaf6fc;
            color: #2c7fb8;
            cursor: pointer;
            transition: background 0.15s ease, transform 0.15s ease;
          }

          .broadcast-form label.broadcast-attach:hover {
            background: #dcf0fa;
            transform: translateY(-1px);
          }

          .broadcast-form label.broadcast-attach.has-file {
            background: #4da8da;
            color: #ffffff;
          }

          .broadcast-form label.broadcast-attach.disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .broadcast-attach input {
            display: none;
          }

          /* Dark tooltip above the button, like Messenger */
          .broadcast-attach::after {
            content: attr(data-tip);
            position: absolute;
            bottom: calc(100% + 10px);
            left: 50%;
            transform: translate(-50%, 4px);
            padding: 7px 11px;
            border-radius: 8px;
            background: #1f2a30;
            color: #ffffff;
            font-size: 12.5px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease, transform 0.15s ease;
            z-index: 5;
          }

          .broadcast-attach::before {
            content: "";
            position: absolute;
            bottom: calc(100% + 4px);
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: #1f2a30;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 5;
          }

          .broadcast-attach:hover::after,
          .broadcast-attach:focus-within::after {
            opacity: 1;
            transform: translate(-50%, 0);
          }

          .broadcast-attach:hover::before,
          .broadcast-attach:focus-within::before {
            opacity: 1;
          }

          .broadcast-image-preview {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 10px;
            border: 1px solid #d6e7ee;
            border-radius: 14px;
            background: #fbfeff;
          }

          .broadcast-image-preview img {
            width: 110px;
            height: 80px;
            object-fit: cover;
            border-radius: 10px;
            flex-shrink: 0;
          }

          .broadcast-image-meta {
            display: grid;
            gap: 4px;
            min-width: 0;
          }

          .broadcast-image-meta strong {
            font-size: 13.5px;
            color: #1d3a4a;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .broadcast-image-meta small {
            color: #8197a2;
            font-size: 12px;
          }

          .broadcast-form .broadcast-image-remove {
            justify-self: start;
            padding: 6px 12px;
            border-radius: 999px;
            background: #fff2f3;
            color: #ad3540;
            font-size: 12.5px;
            font-weight: 700;
          }

          .notification-thumb {
            display: block;
            max-width: 220px;
            max-height: 140px;
            margin: 4px 0 6px;
            border-radius: 12px;
            object-fit: cover;
            border: 1px solid #e6f0f4;
          }

          .notif-detail-image {
            display: block;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid #e6f0f4;
          }

          .notif-detail-image img {
            display: block;
            width: 100%;
            max-height: 360px;
            object-fit: contain;
            background: #f7fbfd;
          }

          /* Detail pop-up for notifications without a page of their own. */
          .notif-detail-backdrop {
            position: fixed;
            inset: 0;
            z-index: 300;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(24, 50, 63, 0.5);
            backdrop-filter: blur(3px);
          }

          .notif-detail {
            position: relative;
            width: min(500px, 100%);
            max-height: 85vh;
            overflow-y: auto;
            box-sizing: border-box;
            display: grid;
            gap: 14px;
            padding: 26px;
            border-radius: 20px;
            background: #ffffff;
            box-shadow: 0 24px 60px rgba(17, 48, 63, 0.28);
          }

          .notif-detail .notif-detail-close {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 34px;
            height: 34px;
            padding: 0;
            justify-content: center;
            border-radius: 10px;
            background: #eef6f9;
            color: #456472;
          }

          .notif-detail-head {
            display: flex;
            align-items: center;
            gap: 14px;
            padding-right: 40px;
          }

          .notif-detail-icon {
            width: 48px;
            height: 48px;
            flex-shrink: 0;
            display: grid;
            place-items: center;
            border-radius: 14px;
            background: #eaf6fc;
            color: #2c7fb8;
          }

          .notif-detail-type {
            display: block;
            color: #2c7fb8;
            font-size: 11.5px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }

          .notif-detail-head h3 {
            margin: 3px 0 0;
            color: #1d3a4a;
            font-size: 19px;
            line-height: 1.3;
          }

          .notif-detail-message {
            margin: 0;
            padding: 14px 16px;
            border-radius: 12px;
            background: #f7fbfd;
            border: 1px solid #e6f0f4;
            color: #2f4a56;
            font-size: 15px;
            line-height: 1.6;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .notif-detail-date {
            color: #8197a2;
            font-size: 12.5px;
          }

          .notif-detail .notif-detail-done {
            justify-self: end;
            padding: 10px 22px;
            border-radius: 12px;
            font-weight: 700;
          }

          /* ---- Compact layout (styles only) ---- */
          .notifications-page {
            gap: 14px;
          }

          /* List: slim rows with separators instead of padded blocks. */
          .notification-list {
            padding: 4px 0;
            overflow: hidden;
          }

          .notification-item {
            position: relative;
            gap: 14px;
            align-items: center;
            padding: 13px 22px;
            border-radius: 0;
            transition: background 0.15s ease;
          }

          .notification-item:hover {
            background: #f5fbfe;
          }

          .notification-item.unread {
            background: #f2f9fd;
          }

          .notification-item.unread::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: #4da8da;
          }

          .notification-icon {
            width: 40px;
            height: 40px;
            padding: 0;
            box-sizing: border-box;
            display: grid;
            place-items: center;
            border-radius: 12px;
            background: #eaf6fc;
            color: #2c7fb8;
            align-self: flex-start;
          }

          .notification-icon svg {
            width: 18px;
            height: 18px;
          }

          .notification-title {
            gap: 12px;
          }

          .notification-title strong {
            font-size: 15px;
            font-weight: 700;
            color: #1d3a4a;
          }

          .notification-item.unread .notification-title strong {
            font-weight: 800;
          }

          .notification-title span {
            flex-shrink: 0;
            font-size: 11.5px;
            font-weight: 600;
            color: #9aabb3;
          }

          .notification-title .new-badge {
            padding: 3px 9px;
            background: #4da8da;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
          }

          .notification-item p {
            margin: 3px 0 4px;
            font-size: 14px;
            line-height: 1.45;
            color: #4f6b78;
          }

          .notification-item small {
            font-size: 12px;
            color: #8197a2;
          }

          /* Mark-as-read tick: small and quiet until hovered. */
          .notification-item > svg {
            color: #9fcbe0;
            transition: color 0.15s ease;
          }

          .notification-item:hover > svg {
            color: #2c7fb8;
          }

          .empty-state {
            min-height: 210px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            color: #6f7f88;
          }

          .empty-state svg {
            color: #79c7e3;
          }

          .empty-state h3 {
            color: #20313b;
            margin: 12px 0 5px;
          }

          .empty-state p {
            margin: 0;
          }

          .rotating {
            animation: rotate 0.85s linear infinite;
          }

          @keyframes rotate {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }

          @media (max-width: 850px) {
            .notification-actions {
              align-items: stretch;
              flex-direction: column;
            }

            .action-group {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              width: 100%;
            }

            .mark-all-button {
              margin-left: 0;
              width: 100%;
            }

            .broadcast-grid {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 560px) {
            .notification-summary {
              grid-template-columns: 1fr;
            }

            .notification-actions {
              padding: 12px;
            }

            .action-group {
              grid-template-columns: 1fr;
            }

            .notification-actions button {
              width: 100%;
            }

            .notification-item {
              grid-template-columns: auto minmax(0, 1fr);
            }

            .notification-item > svg {
              display: none;
            }

            .notification-title {
              align-items: flex-start;
            }
          }
        `}</style>
      </div>
    </AppShell>
  );
}