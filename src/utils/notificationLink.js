// Where a notification should take the user when they click it, based on its
// related_module / notification_type / title and the user's role. Falls back
// to the role's Notifications page when nothing more specific matches.

const ROLE_ROUTES = {
  admin: {
    appointments: "/staff/appointments",
    queue: "/admin/queue",
    inventory: "/admin/inventory",
    messages: "/admin/messages",
    schedule: "/staff/veterinarian-schedules",
    verification: "/admin/users",
    account: "/admin/profile",
    records: "/admin/medical-records",
    notifications: "/admin/notifications",
  },
  staff: {
    appointments: "/staff/appointments",
    queue: "/staff/queue",
    inventory: "/staff/inventory",
    messages: "/staff/messages",
    schedule: "/staff/veterinarian-schedules",
    billing: "/staff/transactions",
    account: "/staff/profile",
    records: "/staff/medical-records",
    notifications: "/staff/notifications",
  },
  veterinarian: {
    appointments: "/veterinarian/appointments",
    queue: "/veterinarian/queue",
    inventory: "/veterinarian/inventory",
    messages: "/veterinarian/messages",
    schedule: "/veterinarian/schedule",
    verification: "/veterinarian/profile",
    account: "/veterinarian/profile",
    records: "/veterinarian/medical-records",
    notifications: "/veterinarian/notifications",
  },
  pet_owner: {
    appointments: "/pet-owner/appointments",
    queue: "/pet-owner/queue",
    messages: "/pet-owner/messages",
    account: "/pet-owner/profile",
    records: "/pet-owner/medical-records",
    notifications: "/pet-owner/notifications",
  },
};

// Checked in order; the first match wins.
const KEYWORDS = [
  ["messages", /messag|chat/],
  ["queue", /queue|serving|now serving|reassign|confirm your visit|doctor change/],
  ["inventory", /inventory|stock|expir/],
  ["billing", /billing|payment|transaction|invoice|receipt/],
  ["verification", /verification|license|prc/],
  ["schedule", /schedule|leave/],
  ["records", /medical record|health record|prescription/],
  ["appointments", /appointment|reminder|booking|booked|rebook|cancel|veterinarian changed/],
  ["account", /account|security|password|welcome|profile/],
];

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/\s+/g, "_");
  return value === "petowner" ? "pet_owner" : value;
}

export function getNotificationLink(notification, role) {
  const routes = ROLE_ROUTES[normalizeRole(role)];
  if (!routes) return null;

  const haystack = [
    notification?.related_module,
    notification?.notification_type,
    notification?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [key, pattern] of KEYWORDS) {
    if (pattern.test(haystack)) {
      // A pet owner's schedule/leave notice is about their appointment.
      return routes[key] || (key === "schedule" ? routes.appointments : null) || routes.notifications;
    }
  }

  return routes.notifications;
}
