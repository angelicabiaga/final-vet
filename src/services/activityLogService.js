import { supabase } from "../config/supabaseClient";

// Read-only access to activity_logs for the admin dashboard's Activity Logs
// panel. Rows are written all over the app (login/logout, account changes,
// vet verification, leave requests...); only admins can read them (RLS
// policy "Admins can read activity logs").

const LOG_FIELDS = "id,user_id,role,action,module,description,device_browser,created_at";
export const ACTIVITY_LOG_PAGE_SIZE = 10;
// Print/CSV pull every matching row up to this cap; past it the report
// says how many were left out so the admin can narrow the date range.
export const ACTIVITY_LOG_REPORT_LIMIT = 1000;

export const ROLE_LABELS = {
  admin: "Administrator",
  staff: "Staff",
  veterinarian: "Veterinarian",
  pet_owner: "Pet Owner",
};

// Date filters are clinic calendar days (Asia/Manila, a fixed UTC+8 with no
// daylight saving), so "From Nov 26" means from Manila midnight of Nov 26.
function manilaDayStart(ymd) {
  return new Date(`${ymd}T00:00:00+08:00`).toISOString();
}

function manilaNextDayStart(ymd) {
  return new Date(new Date(`${ymd}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

// Commas, parentheses and quotes are syntax inside a PostgREST or() filter,
// and % / * are wildcards, so they are dropped from the search text.
function cleanSearch(text) {
  return String(text || "").replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim();
}

async function matchingUserIds(term) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
    .limit(50);
  if (error) return [];
  return (data || []).map((row) => row.id);
}

// Kept synchronous on purpose: a Supabase query builder is "thenable", so
// returning one from an async function would run it early.
function buildLogQuery(filters, term, userIds, countMode) {
  let query = supabase
    .from("activity_logs")
    .select(LOG_FIELDS, countMode ? { count: countMode } : undefined);
  if (filters.module) query = query.eq("module", filters.module);
  if (filters.from) query = query.gte("created_at", manilaDayStart(filters.from));
  if (filters.to) query = query.lt("created_at", manilaNextDayStart(filters.to));
  if (term) {
    const parts = [`action.ilike.%${term}%`, `description.ilike.%${term}%`, `module.ilike.%${term}%`];
    if (userIds.length) parts.push(`user_id.in.(${userIds.join(",")})`);
    query = query.or(parts.join(","));
  }
  return query.order("created_at", { ascending: false });
}

async function attachUserNames(rows) {
  const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  if (!ids.length) return rows.map((row) => ({ ...row, user_name: null }));
  const { data } = await supabase.from("profiles").select("id,full_name,username").in("id", ids);
  const byId = new Map((data || []).map((person) => [person.id, person]));
  return rows.map((row) => {
    const person = byId.get(row.user_id);
    return { ...row, user_name: person?.full_name || person?.username || null };
  });
}

function readableError(error) {
  return new Error(`Unable to load activity logs: ${error.message || "please try again."}`);
}

/** One page of logs, newest first, plus the total number of matching logs. */
export async function getActivityLogs(filters = {}, page = 1) {
  const term = cleanSearch(filters.search);
  const userIds = term ? await matchingUserIds(term) : [];
  const start = (Math.max(1, page) - 1) * ACTIVITY_LOG_PAGE_SIZE;
  const { data, count, error } = await buildLogQuery(filters, term, userIds, "exact")
    .range(start, start + ACTIVITY_LOG_PAGE_SIZE - 1);
  if (error) throw readableError(error);
  return { rows: await attachUserNames(data || []), total: count || 0 };
}

/** Every matching log (up to the report limit) for printing or CSV export. */
export async function getActivityLogsForReport(filters = {}) {
  const term = cleanSearch(filters.search);
  const userIds = term ? await matchingUserIds(term) : [];
  const { data, count, error } = await buildLogQuery(filters, term, userIds, "exact")
    .range(0, ACTIVITY_LOG_REPORT_LIMIT - 1);
  if (error) throw readableError(error);
  return { rows: await attachUserNames(data || []), total: count || 0 };
}

/** Module names that appear in recent logs, for the module filter. */
export async function getActivityLogModules() {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("module")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return [];
  return [...new Set((data || []).map((row) => row.module).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
