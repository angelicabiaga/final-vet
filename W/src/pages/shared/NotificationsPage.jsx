import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Check,
  CheckCheck,
  RefreshCw,
  Send,
} from "lucide-react";

import AppShell from "../../components/AppShell";

import {
  createTestNotification,
  getNotifications,
  markAllRead,
  markNotificationRead,
  requestBrowserNotifications,
  sendBroadcast,
  subscribeNotifications,
} from "../../services/notificationService";

const FILTER_OPTIONS = [
  "Appointment Confirmation",
  "Queue Serving",
  "Low-stock Alert",
  "Broadcast Announcement",
  "New Message",
];

const INITIAL_BROADCAST_FORM = {
  title: "",
  message: "",
  related_module: "",
};

export default function NotificationsPage({ profile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filter, setFilter] = useState("all");

  const [form, setForm] = useState(INITIAL_BROADCAST_FORM);
  const [sending, setSending] = useState(false);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const loadNotifications = useCallback(
    async (showMainLoading = true) => {
      if (!profile?.id) {
        setItems([]);
        setLoading(false);
        return;
      }

      clearMessages();

      if (showMainLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const notifications = await getNotifications(profile.id);
        setItems(notifications);
      } catch (loadError) {
        console.error("Unable to load notifications:", loadError);

        setError(
          loadError?.message ||
            "Unable to load notifications. Please try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [profile?.id]
  );

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

      return notification.notification_type === filter;
    });
  }, [items, filter]);

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

  async function handleReadAll() {
    if (!profile?.id || unreadCount === 0) {
      return;
    }

    clearMessages();

    try {
      await markAllRead(profile.id);

      const readAt = new Date().toISOString();

      setItems((currentItems) =>
        currentItems.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at || readAt,
        }))
      );

      setSuccess("All notifications were marked as read.");
    } catch (readError) {
      console.error("Unable to mark all notifications as read:", readError);

      setError(
        readError?.message ||
          "Unable to mark all notifications as read."
      );
    }
  }

  async function handleTestNotification() {
    if (!profile?.id) {
      setError("Your profile information is unavailable.");
      return;
    }

    clearMessages();

    try {
      const notification = await createTestNotification(profile.id);

      setItems((currentItems) => {
        const alreadyExists = currentItems.some(
          (item) => item.id === notification.id
        );

        if (alreadyExists) {
          return currentItems;
        }

        return [notification, ...currentItems];
      });

      setSuccess("Test notification created successfully.");
    } catch (testError) {
      console.error("Unable to create test notification:", testError);

      setError(
        testError?.message ||
          "Unable to create a test notification."
      );
    }
  }

  async function handleEnablePush() {
    clearMessages();

    try {
      const permission = await requestBrowserNotifications();

      if (permission === "granted") {
        setSuccess("Browser notifications are now enabled.");
        return;
      }

      if (permission === "denied") {
        setError(
          "Browser notifications were denied. Enable them in your browser settings."
        );
        return;
      }

      setSuccess(`Browser notification permission: ${permission}`);
    } catch (pushError) {
      console.error("Unable to enable browser notifications:", pushError);

      setError(
        pushError?.message ||
          "Unable to enable browser notifications."
      );
    }
  }

  function handleBroadcastChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleBroadcast(event) {
    event.preventDefault();

    const title = form.title.trim();
    const message = form.message.trim();

    if (!title) {
      setError("Please enter a notification title.");
      return;
    }

    if (!message) {
      setError("Please enter a notification message.");
      return;
    }

    clearMessages();
    setSending(true);

    try {
      const notification = await sendBroadcast(
        {
          title,
          message,
          related_module: form.related_module,
        },
        profile
      );

      setForm(INITIAL_BROADCAST_FORM);

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
      <div className="notifications-page">
        <div className="notifications-header">
          <div>
            <h2>Notification Center</h2>

            <p>
              View appointments, queue updates, inventory alerts,
              messages, announcements, and account notices.
            </p>
          </div>
        </div>

        <div className="notification-actions" aria-label="Notification actions">
          <div className="action-group">
            <button
              type="button"
              className="secondary-button"
              onClick={() => loadNotifications(false)}
              disabled={refreshing}
            >
              <RefreshCw
                size={17}
                className={refreshing ? "rotating" : ""}
              />

              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={handleTestNotification}
            >
              <BellRing size={17} />
              Test Notification
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={handleEnablePush}
            >
              <BellRing size={17} />
              Enable Push
            </button>
          </div>

          <button
            type="button"
            className="mark-all-button"
            onClick={handleReadAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck size={17} />
            Mark all read
          </button>
        </div>

        <div className="notification-summary">
          <div>
            <strong>{items.length}</strong>
            <span>Total notifications</span>
          </div>

          <div>
            <strong>{unreadCount}</strong>
            <span>Unread notifications</span>
          </div>
        </div>

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
          >
            <h3>
              <Send size={18} />
              Broadcast Notification
            </h3>

            <div className="broadcast-grid">
              <label>
                <span>Title</span>

                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleBroadcastChange}
                  placeholder="Enter announcement title"
                  maxLength={120}
                  required
                />
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
                  <option value="Medical Records">
                    Medical Records
                  </option>
                  <option value="Messages">Messages</option>
                  <option value="Security">Security</option>
                </select>
              </label>
            </div>

            <label>
              <span>Message</span>

              <textarea
                name="message"
                value={form.message}
                onChange={handleBroadcastChange}
                placeholder="Enter the announcement message"
                maxLength={1000}
                required
              />
            </label>

            <button type="submit" disabled={sending}>
              <Send size={16} />

              {sending
                ? "Sending..."
                : "Send to All Users"}
            </button>
          </form>
        )}

        <div className="notification-filters">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>

          <button
            type="button"
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
          >
            Unread
          </button>

          {FILTER_OPTIONS.map((option) => (
            <button
              type="button"
              key={option}
              className={filter === option ? "active" : ""}
              onClick={() => setFilter(option)}
            >
              {option}
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
            shownNotifications.map((notification) => (
              <article
                key={notification.id}
                className={
                  notification.is_read
                    ? "notification-item"
                    : "notification-item unread"
                }
                onClick={() => handleRead(notification)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    handleRead(notification);
                  }
                }}
              >
                <div className="notification-icon">
                  <BellRing size={21} />
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

                  <small>
                    {notification.notification_type || "General"}
                    {" • "}
                    {notification.created_at
                      ? new Date(
                          notification.created_at
                        ).toLocaleString()
                      : "Date unavailable"}
                  </small>
                </div>

                {!notification.is_read && (
                  <Check size={18} />
                )}
              </article>
            ))
          )}
        </div>

        <style>{`
          .notifications-page {
            display: grid;
            gap: 18px;
          }

          .notifications-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 20px;
          }

          .notifications-header h2 {
            margin: 0;
            color: #20313b;
          }

          .notifications-header p {
            margin: 7px 0 0;
            color: #6f7f88;
            line-height: 1.5;
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
            gap: 8px;
            overflow-x: auto;
          }

          .notification-filters button {
            white-space: nowrap;
            background: #edf7fa;
            color: #477080;
          }

          .notification-filters button.active {
            background: #4da8da;
            color: #ffffff;
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
            .notifications-header {
              flex-direction: column;
            }

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