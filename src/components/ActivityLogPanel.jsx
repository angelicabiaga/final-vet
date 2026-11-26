import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, History, Printer, Search } from "lucide-react";
import PrintPreviewModal from "./PrintPreviewModal";
import usePrintPreview from "../hooks/usePrintPreview";
import { exportCsv } from "../services/reportService";
import {
  ACTIVITY_LOG_PAGE_SIZE,
  ROLE_LABELS,
  getActivityLogModules,
  getActivityLogs,
  getActivityLogsForReport,
} from "../services/activityLogService";
import { MANILA_TIME_ZONE, formatDateLong, formatDateTime12h } from "../utils/timeFormat";

// Admin dashboard panel: every saved activity log (logins, account changes,
// verifications, leave requests...), searchable and filterable, with a
// printable report and CSV export. `reloadSignal` changes whenever the
// dashboard refreshes, so the list refreshes with it.

const EMPTY_QUERY = { search: "", module: "", from: "", to: "", page: 1 };

function roleLabel(role) {
  return ROLE_LABELS[role] || "—";
}

// A log with no user is a failed login (nobody signed in yet) or an action
// by an account that has since been deleted.
function userLabel(row) {
  return row.user_name || "Unknown user";
}

// Page buttons to show: every page when there are 7 or fewer; otherwise the
// first and last page, the current page with one neighbour on each side,
// and "gap" for each skipped run (1 … 9 10 11 … 40). A gap of exactly one
// page shows that page instead of "…".
function pageItems(current, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (index > 0 && page - previous === 2) items.push(page - 1);
    else if (index > 0 && page - previous > 2) items.push("gap");
    items.push(page);
  });
  return items;
}

function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: MANILA_TIME_ZONE });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function filterSummary(filters) {
  const parts = [];
  if (filters.from || filters.to) {
    parts.push(`Dates: ${filters.from ? formatDateLong(filters.from) : "Earliest"} – ${filters.to ? formatDateLong(filters.to) : "Latest"}`);
  }
  if (filters.module) parts.push(`Module: ${filters.module}`);
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  return parts.length ? parts.join(" · ") : "All recorded activity";
}

function buildReportHtml(rows, total, filters) {
  const body = rows.map((row) => `<tr>
    <td class="nowrap">${escapeHtml(formatDateTime12h(row.created_at))}</td>
    <td>${escapeHtml(userLabel(row))}</td>
    <td class="nowrap">${escapeHtml(roleLabel(row.role))}</td>
    <td>${escapeHtml(row.module || "—")}</td>
    <td>${escapeHtml(row.action || "—")}</td>
    <td>${escapeHtml(row.description || "")}</td>
  </tr>`).join("");
  const truncated = total > rows.length
    ? `<p class="note">Showing the latest ${rows.length.toLocaleString()} of ${total.toLocaleString()} matching entries. Narrow the date range to print the rest.</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>PawCruz Activity Log Report</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#20313B;margin:24px;background:#fff}
    h1{font-size:20px;margin:0 0 6px}
    .sub{color:#5f7884;font-size:12px;margin:0 0 3px}
    .note{font-size:11px;color:#9d6817;margin:8px 0 0}
    table{width:100%;border-collapse:collapse;margin-top:14px;font-size:11px}
    th,td{border:1px solid #cfdde4;padding:6px 7px;text-align:left;vertical-align:top}
    th{background:#eaf8fd}
    tr{page-break-inside:avoid}
    .nowrap{white-space:nowrap}
    @page{size:landscape;margin:12mm}
  </style></head><body>
    <h1>PawCruz Activity Log Report</h1>
    <p class="sub">Cruz Veterinary Clinic</p>
    <p class="sub">Generated: ${escapeHtml(formatDateTime12h(new Date()))}</p>
    <p class="sub">${escapeHtml(filterSummary(filters))} · ${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}</p>
    ${truncated}
    <table>
      <thead><tr><th>Date &amp; Time</th><th>User</th><th>Role</th><th>Module</th><th>Action</th><th>Details</th></tr></thead>
      <tbody>${body || '<tr><td colspan="6">No activity logs match these filters.</td></tr>'}</tbody>
    </table>
  </body></html>`;
}

export default function ActivityLogPanel({ reloadSignal }) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState(EMPTY_QUERY);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reportBusy, setReportBusy] = useState("");
  const printPreview = usePrintPreview();
  const requestRef = useRef(0);

  const rangeInvalid = Boolean(query.from && query.to && query.from > query.to);
  const hasFilters = Boolean(searchInput.trim() || query.module || query.from || query.to);

  useEffect(() => {
    getActivityLogModules().then(setModules).catch(() => setModules([]));
  }, []);

  // Search runs once typing pauses instead of on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setQuery((current) => (current.search === next ? current : { ...current, search: next, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (query.from && query.to && query.from > query.to) {
      setResult({ rows: [], total: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    getActivityLogs(query, query.page)
      .then((next) => {
        if (requestId !== requestRef.current) return;
        const lastPage = Math.max(1, Math.ceil(next.total / ACTIVITY_LOG_PAGE_SIZE));
        // The list shrank (e.g. after a refresh) and this page no longer exists.
        if (query.page > lastPage) {
          setQuery((current) => ({ ...current, page: lastPage }));
          return;
        }
        setResult(next);
      })
      .catch((loadError) => {
        if (requestId === requestRef.current) setError(loadError.message);
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [query, reloadSignal]);

  function updateFilter(key) {
    return (event) => {
      const value = event.target.value;
      setNotice("");
      setQuery((current) => ({ ...current, [key]: value, page: 1 }));
    };
  }

  function clearFilters() {
    setSearchInput("");
    setNotice("");
    setQuery(EMPTY_QUERY);
  }

  function goToPage(page) {
    setQuery((current) => (page === current.page ? current : { ...current, page }));
  }

  // Print/CSV use the search box as typed, even if the debounce hasn't fired.
  async function loadReport(kind) {
    setReportBusy(kind);
    setNotice("");
    try {
      const filters = { ...query, search: searchInput.trim() };
      return { filters, ...(await getActivityLogsForReport(filters)) };
    } catch (reportError) {
      setNotice(reportError.message);
      return null;
    } finally {
      setReportBusy("");
    }
  }

  async function handlePrint() {
    const report = await loadReport("print");
    if (!report) return;
    printPreview.showHtml(buildReportHtml(report.rows, report.total, report.filters), "Activity Log Report");
  }

  async function handleExport() {
    const report = await loadReport("csv");
    if (!report) return;
    if (!report.rows.length) {
      setNotice("There are no activity logs to export for these filters.");
      return;
    }
    exportCsv(`pawcruz-activity-logs-${manilaToday()}.csv`, report.rows.map((row) => ({
      "Date & Time": formatDateTime12h(row.created_at),
      User: userLabel(row),
      Role: roleLabel(row.role),
      Module: row.module || "",
      Action: row.action || "",
      Details: row.description || "",
      "Device / Browser": row.device_browser || "",
    })));
    if (report.total > report.rows.length) {
      setNotice(`Exported the latest ${report.rows.length.toLocaleString()} of ${report.total.toLocaleString()} matching entries. Narrow the date range to export the rest.`);
    }
  }

  const { rows, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_LOG_PAGE_SIZE));
  const firstShown = total ? (query.page - 1) * ACTIVITY_LOG_PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(total, query.page * ACTIVITY_LOG_PAGE_SIZE);

  return (
    <section className="dash-panel alp" aria-labelledby="alp-title">
      <header>
        <div><h3 id="alp-title">Activity Logs</h3><p>Who did what in the system, newest first</p></div>
        <History size={20} />
      </header>

      <div className="alp-toolbar">
        <label className="alp-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search user, action, or details"
            aria-label="Search activity logs"
          />
        </label>
        <label className="alp-field">
          <span>Module</span>
          <select value={query.module} onChange={updateFilter("module")}>
            <option value="">All modules</option>
            {modules.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="alp-field">
          <span>From</span>
          <input type="date" value={query.from} max={query.to || undefined} onChange={updateFilter("from")} />
        </label>
        <label className="alp-field">
          <span>To</span>
          <input type="date" value={query.to} min={query.from || undefined} onChange={updateFilter("to")} />
        </label>
        {hasFilters && <button type="button" className="alp-clear" onClick={clearFilters}>Clear filters</button>}
        <div className="alp-actions">
          <button type="button" onClick={handlePrint} disabled={Boolean(reportBusy) || rangeInvalid}>
            <Printer size={16} />{reportBusy === "print" ? "Preparing..." : "Print"}
          </button>
          <button type="button" onClick={handleExport} disabled={Boolean(reportBusy) || rangeInvalid}>
            <Download size={16} />{reportBusy === "csv" ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {rangeInvalid && <div className="alp-msg warn">The From date must be on or before the To date.</div>}
      {error && <div className="alp-msg error">{error}</div>}
      {notice && <div className="alp-msg">{notice}</div>}

      <div className="alp-table-wrap" aria-busy={loading}>
        <table className="alp-table">
          <thead>
            <tr><th>Date &amp; Time</th><th>User</th><th>Role</th><th>Module</th><th>Action</th><th>Details</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td className="nowrap">{formatDateTime12h(row.created_at)}</td>
                <td>{userLabel(row)}</td>
                <td className="nowrap">{roleLabel(row.role)}</td>
                <td className="nowrap">{row.module || "—"}</td>
                <td><span className="alp-pill">{row.action || "—"}</span></td>
                <td className="alp-details">{row.description || "—"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="alp-empty">
                  {loading ? "Loading activity logs..." : hasFilters ? "No activity logs match these filters." : "No activity has been recorded yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="alp-pager">
          <span className="alp-summary">
            Showing {firstShown}–{lastShown} of {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          </span>
          {totalPages > 1 && (
            <nav className="alp-pagination" aria-label="Activity log pages">
              <button
                type="button"
                className="alp-page-nav"
                aria-label="Previous page"
                disabled={query.page <= 1}
                onClick={() => goToPage(query.page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="alp-pages">
                {pageItems(query.page, totalPages).map((item, index) => (item === "gap" ? (
                  <span key={`gap-${index}`} className="alp-gap" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === query.page ? "active" : ""}
                    aria-current={item === query.page ? "page" : undefined}
                    aria-label={`Page ${item}`}
                    onClick={() => goToPage(item)}
                  >
                    {item}
                  </button>
                )))}
              </div>
              <button
                type="button"
                className="alp-page-nav"
                aria-label="Next page"
                disabled={query.page >= totalPages}
                onClick={() => goToPage(query.page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
        </div>
      )}

      <PrintPreviewModal
        open={!!printPreview.preview}
        title={printPreview.preview?.title}
        src={printPreview.preview?.src}
        html={printPreview.preview?.html}
        onDownload={printPreview.preview?.onDownload}
        showPrint={printPreview.preview?.showPrint}
        onClose={printPreview.close}
      />

      <style>{`
        .alp{margin-top:14px}
        .alp-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:14px}
        .alp-search{flex:1 1 240px;display:flex;align-items:center;gap:8px;background:#f4fbfd;border:1px solid #dcebf1;border-radius:11px;padding:0 12px;color:#5f7884}
        .alp-search:focus-within{border-color:#4DA8DA}
        .alp-search input{border:0;background:transparent;outline:none;padding:10px 0;font:inherit;width:100%;color:#20313B}
        .alp-field{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;color:#6F7F88}
        .alp-field select,.alp-field input{border:1px solid #dcebf1;background:#fff;border-radius:11px;padding:9px 10px;font:inherit;font-size:13px;font-weight:400;color:#20313B}
        .alp-clear{border:0;background:none;color:#318fbe;font-weight:700;cursor:pointer;padding:10px 4px}
        .alp-actions{display:flex;gap:8px;margin-left:auto}
        .alp-actions button{border:1px solid #cfe6f0;background:#fff;color:#318fbe;border-radius:11px;padding:9px 13px;display:flex;align-items:center;gap:6px;font-weight:700;cursor:pointer}
        .alp-actions button:hover:not(:disabled){background:#f0f8fc}
        .alp button:disabled{opacity:.5;cursor:not-allowed}
        .alp-msg{margin-top:12px;padding:10px 12px;border-radius:11px;font-size:13px;background:#eef7fb;color:#2f6f8f}
        .alp-msg.warn{background:#fff4e2;color:#9d6817}
        .alp-msg.error{background:#fff0f0;color:#b34848}
        .alp-table-wrap{margin-top:12px;overflow-x:auto;border:1px solid #eaf1f4;border-radius:12px}
        .alp-table{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}
        .alp-table th{background:#f4fbfd;color:#5f7884;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;text-align:left;padding:10px 12px;white-space:nowrap}
        .alp-table td{padding:10px 12px;border-top:1px solid #eaf1f4;color:#20313B;vertical-align:top}
        .alp-table .nowrap{white-space:nowrap}
        .alp-details{color:#4b6571;min-width:220px}
        .alp-pill{display:inline-block;font-size:11.5px;font-weight:700;background:#eaf8fd;color:#318fbe;padding:4px 9px;border-radius:999px;white-space:nowrap}
        .alp-table td.alp-empty{text-align:center;color:#80949d;padding:22px 12px}
        .alp-table-wrap[aria-busy="true"] tbody{opacity:.55;transition:opacity .15s}
        /* Same look as the Pet Owners pagination: summary on the left, page
           buttons in the true center (1fr | auto | 1fr grid). */
        .alp-pager{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;margin-top:16px;padding-top:15px;border-top:1px solid #edf3f6}
        .alp-summary{grid-column:1;justify-self:start;color:#6f7f88;font-size:13px;font-weight:600}
        .alp-pagination{grid-column:2;display:flex;align-items:center;justify-content:center;gap:14px}
        .alp-page-nav{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex-shrink:0;border:1px solid #cfe4ed;border-radius:50%;background:#fff;color:#2b6f8f;cursor:pointer;transition:background .2s ease,border-color .2s ease,opacity .2s ease}
        .alp-page-nav:hover:not(:disabled){background:#eaf8fd;border-color:#a9dff0}
        .alp .alp-page-nav:disabled{cursor:not-allowed;opacity:.4}
        .alp-pages{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
        .alp-pages button{min-width:36px;min-height:36px;border:1px solid transparent;border-radius:9px;background:transparent;color:#55707d;font-weight:700;font-size:13px;cursor:pointer;transition:background .2s ease,color .2s ease}
        .alp-pages button:hover{background:#eaf8fd}
        .alp-pages button.active{border-color:#4da8da;background:#4da8da;color:#fff}
        .alp-gap{min-width:20px;text-align:center;color:#8aa0aa;font-weight:700}
        @media(max-width:600px){
          .alp-field{flex:1 1 130px}
          .alp-actions{margin-left:0;width:100%}
          .alp-actions button{flex:1;justify-content:center}
          .alp-pager{grid-template-columns:1fr;justify-items:center}
          .alp-summary,.alp-pagination{grid-column:1;justify-self:center}
          .alp-pagination{gap:8px}
        }
      `}</style>
    </section>
  );
}
