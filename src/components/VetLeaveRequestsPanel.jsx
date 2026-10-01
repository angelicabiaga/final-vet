import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck2, CalendarPlus, CheckCircle2, ChevronDown, ClipboardCheck, RefreshCw, Siren, UserRoundCog, XCircle } from "lucide-react";
import VetLeaveImpact, { drName, formatDayLabel, formatLeavePeriod, leaveReasonText, leaveStatusMeta } from "./VetLeaveImpact";
import VetLeaveRequestModal from "./VetLeaveRequestModal";
import ScheduleConflictRow, { groupVisits, offerForVisit } from "./ScheduleConflictRow";
import DoctorChangeModal from "./DoctorChangeModal";
import ConfirmDialog from "./ConfirmDialog";
import { getLeaveBoard, getLeaveRequests, reviewLeaveRequest, subscribeToLeaveChanges } from "../services/vetLeaveService";
import { getPendingDoctorOffers } from "../services/doctorChangeService";
import { subscribeToQueue } from "../services/queueService";
import { getVeterinarians, todayLocal } from "../services/appointmentService";
import { formatDateTime12h, formatTime12h } from "../utils/timeFormat";

// Pending review, an emergency nobody acknowledged yet, or patients still
// waiting for another doctor.
const needsAttention = request =>
  request.status === "Pending" ||
  (request.request_type === "Emergency" && !request.acknowledged_at) ||
  (request.impact?.appointment_count || 0) + (request.impact?.queue_count || 0) > 0;

// Staff/Admin side of the leave workflow, shown on Veterinarian Schedules:
// review pending requests and acknowledge emergencies. Booked patients never
// block a leave; staff offer them another doctor and each owner confirms
// (the same flow as Queue Management).
export default function VetLeaveRequestsPanel({ profile }) {
  const [board, setBoard] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [notes, setNotes] = useState({});
  const [pendingOffers, setPendingOffers] = useState([]);
  const [changeTarget, setChangeTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  // All requests list: the row whose details are open.
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState("");
  const [vets, setVets] = useState([]);
  const [recording, setRecording] = useState(false);
  // Re-keys the toast source so repeating the same message toasts again.
  const [noticeKey, setNoticeKey] = useState(0);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [nextBoard, nextHistory, offers] = await Promise.all([
        getLeaveBoard(), getLeaveRequests({ limit: 150 }), getPendingDoctorOffers().catch(() => [])
      ]);
      setPendingOffers(offers);
      setBoard(nextBoard);
      setHistory(nextHistory);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getVeterinarians().then(setVets).catch(() => setVets([])); }, []);
  // One approval writes several override rows; coalesce the burst of
  // realtime events into a single reload.
  useEffect(() => {
    let timer;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(true), 400);
    };
    const offLeave = subscribeToLeaveChanges(reload);
    const offQueue = subscribeToQueue(reload);
    return () => { clearTimeout(timer); offLeave(); offQueue(); };
  }, [load]);

  const today = board?.today;
  const requests = useMemo(() => board?.requests || [], [board]);
  const attention = requests.filter(needsAttention);
  // Requests list: the ones needing action first.
  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))),
    [requests]
  );

  // History: requests that are over -- ended, declined, withdrawn or revoked.
  // Pending and still-running approved ones live under All requests.
  const pastRequests = useMemo(() => history.filter(request =>
    !(request.status === "Pending" || (request.status === "Approved" && request.end_date >= (today || "")))
  ), [history, today]);
  const filteredHistory = pastRequests;

  async function run(key, action, success) {
    if (busy) return;
    try {
      setBusy(key);
      setActionError("");
      const result = await action();
      setMessage(typeof success === "function" ? success(result) : success);
      setNoticeKey(value => value + 1);
      await load(true);
    } catch (error) {
      setActionError(error.message);
      setNoticeKey(value => value + 1);
    } finally {
      setBusy("");
    }
  }

  // Only declining needs a note (it tells the vet why). Revoking asks for
  // confirmation instead; the database still records a short note.
  function review(request, action) {
    const note = action === "revoke" ? "Revoked by the clinic." : (notes[request.id] || "").trim();
    if (action === "reject" && !note) {
      setActionError("Add a note explaining why the request is declined.");
      setNoticeKey(value => value + 1);
      return;
    }
    const vet = drName(request.veterinarian_name);
    const done = {
      approve: `Leave approved. ${vet}'s schedule is updated and bookings are blocked for that period.`,
      reject: `Request declined. ${vet} has been notified.`,
      acknowledge: `Emergency acknowledged. ${vet} has been notified.`,
      revoke: `Leave revoked. ${vet}'s regular hours are back.`
    }[action];
    run(`${action}-${request.id}`, async () => {
      await reviewLeaveRequest(request.id, profile.id, action, note);
      setNotes(current => ({ ...current, [request.id]: "" }));
    }, done);
  }

  function handleRecorded(result) {
    setRecording(false);
    const vet = drName(vets.find(item => item.id === result?.request?.veterinarian_id)?.full_name);
    const count = (result?.impact?.appointment_count || 0) + (result?.impact?.queue_count || 0);
    setMessage(`Leave recorded for ${vet}. Their schedule is updated${count ? ` and ${count} patient${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} another doctor below (the owner confirms)` : ""}.`);
    setNoticeKey(value => value + 1);
    load(true);
  }

  function renderConflicts(request) {
    const visits = groupVisits(request.impact?.appointments);
    const queue = request.impact?.queue || [];
    const pending = request.status === "Pending";
    const queuePath = profile?.role === "admin" ? "/admin/queue" : "/staff/queue";
    if (!visits.length && !queue.length) {
      return pending ? null : (
        <p className="vlr-clear"><CheckCircle2 size={16} /> No booked patients left without a doctor.</p>
      );
    }
    return (
      <div className="vlr-conflicts">
        <div className="vlr-conflicts-head">
          <b>{pending ? "Patients affected if approved" : "Patients to offer another doctor"}</b>
        </div>
        <p className="vlr-hint">
          {pending
            ? "This doesn't block approval. Once approved, offer each patient another doctor here or in Queue Management; the owner confirms the new doctor and time, reschedules, or cancels."
            : "Pick a doctor and a free time for each visit. The owner confirms, reschedules, or cancels in My Queue (web or app); nothing changes until they answer."}
        </p>

        {visits.map(visit => pending ? (
          <div key={visit.key} className="vlr-conflict">
            <div className="vlr-conflict-info">
              <span>{visit.appointment_date === today ? "Today" : formatDayLabel(visit.appointment_date)} · {formatTime12h(visit.start_time)}</span>
              <b>{visit.petNames.join(", ") || "Pet"}</b>
              <small>{visit.owner_name || "Owner"}{visit.visit_reason ? ` · ${visit.visit_reason}` : ""}</small>
            </div>
          </div>
        ) : (
          <ScheduleConflictRow
            key={visit.key}
            visit={visit}
            offer={offerForVisit(pendingOffers, visit)}
            today={today}
            disabled={Boolean(busy)}
            onChangeDoctor={setChangeTarget}
          />
        ))}

        {queue.map(entry => {
          const offer = pendingOffers.find(item => item.queue_entry_id === entry.id);
          return (
            <div key={entry.id} className="vlr-conflict">
              <div className="vlr-conflict-info">
                <span>Queue #{entry.queue_number} · {entry.status}</span>
                <b>{entry.pet_name || "Pet"}</b>
                <small>{entry.owner_name || "Owner"}</small>
              </div>
              {!pending && (entry.status === "Waiting" ? (
                offer ? (
                  <small className="vlr-serving">Waiting for the owner to confirm {drName(offer.proposed_veterinarian?.full_name)} at {formatTime12h(offer.proposed_time)}.</small>
                ) : (
                  <div className="vlr-conflict-actions">
                    <button type="button" className="vlr-small" disabled={Boolean(busy)}
                      onClick={() => setChangeTarget({ queueEntryId: entry.id, label: `Queue #${entry.queue_number} · ${entry.pet_name || "Pet"}`, petNames: entry.pet_name })}>
                      Change doctor
                    </button>
                  </div>
                )
              ) : (
                <small className="vlr-serving">In consultation. Let {drName(request.veterinarian_name)} finish, or hand over in Queue Management.</small>
              ))}
            </div>
          );
        })}

        {!pending && (
          <p className="vlr-hint">Today's visits are also flagged in <Link to={queuePath}>Queue Management</Link> (red note and Change doctor on the check-in card).</p>
        )}
      </div>
    );
  }

  function renderActions(request) {
    const isPending = request.status === "Pending";
    const needsAck = request.request_type === "Emergency" && request.status === "Approved" && !request.acknowledged_at;
    const canRevoke = request.status === "Approved";
    const blocked = isPending && request.impact && !request.impact.ok;
    return (
      <div className="vlr-actions">
        {isPending && (
          <textarea rows={2} value={notes[request.id] || ""} onChange={event => setNotes(current => ({ ...current, [request.id]: event.target.value }))}
            placeholder="Note to the vet (required when declining)" />
        )}
        <div className="vlr-buttons">
          {isPending && <button type="button" className="vlr-btn vlr-approve" disabled={Boolean(busy) || blocked} title={blocked ? "Fix the blocking issue above first" : undefined} onClick={() => review(request, "approve")}><CheckCircle2 size={16} /> {busy === `approve-${request.id}` ? "Approving…" : "Approve"}</button>}
          {isPending && <button type="button" className="vlr-btn vlr-decline" disabled={Boolean(busy)} onClick={() => review(request, "reject")}><XCircle size={16} /> {busy === `reject-${request.id}` ? "Declining…" : "Decline"}</button>}
          {needsAck && <button type="button" className="vlr-btn vlr-approve" disabled={Boolean(busy)} onClick={() => review(request, "acknowledge")}><ClipboardCheck size={16} /> {busy === `acknowledge-${request.id}` ? "Saving…" : "Acknowledge"}</button>}
          {canRevoke && <button type="button" className="vlr-btn vlr-decline" disabled={Boolean(busy)} onClick={() => setRevokeTarget(request)}><XCircle size={16} /> {busy === `revoke-${request.id}` ? "Revoking…" : "Revoke leave"}</button>}
        </div>
      </div>
    );
  }

  const typeTag = request => {
    const emergency = request.request_type === "Emergency";
    return <span className={`vlr-type${emergency ? " vlr-type-emergency" : ""}`}>{emergency ? <Siren size={13} /> : <UserRoundCog size={13} />} {request.request_type}</span>;
  };

  // Everything below a request's header: reason, impact, patients, actions.
  function renderDetails(request) {
    const emergency = request.request_type === "Emergency";
    return (
      <>
        <p className="vlr-period"><b>{request.leave_type}</b> · {formatLeavePeriod(request, today)}</p>
        {leaveReasonText(request) && <p className="vlr-reason">“{leaveReasonText(request)}”</p>}
        <small className="vlr-meta">Filed {formatDateTime12h(request.created_at)}{request.reviewer_name ? ` · Approved by ${request.reviewer_name}` : ""}{request.acknowledged_by_name && emergency ? ` · Acknowledged by ${request.acknowledged_by_name}` : ""}</small>
        <VetLeaveImpact impact={request.impact} audience="staff" showConflicts={false} showPatientNote={false} />
        {renderConflicts(request)}
        {renderActions(request)}
      </>
    );
  }

  // All requests: one row per request; click to open its details.
  function renderRow(request) {
    const status = leaveStatusMeta(request, today);
    const open = openId === request.id;
    const affected = (request.impact?.appointment_count || 0) + (request.impact?.queue_count || 0);
    return (
      <div key={request.id} className={`vlr-item${open ? " open" : ""}${request.request_type === "Emergency" ? " vlr-item-emergency" : ""}`}>
        <button type="button" className="vlr-row" aria-expanded={open} onClick={() => setOpenId(open ? null : request.id)}>
          {typeTag(request)}
          <span className="vlr-row-main">
            <b>{drName(request.veterinarian_name)}</b>
            <small>{request.leave_type} · {formatLeavePeriod(request, today)}</small>
          </span>
          {affected > 0 && <span className="vlr-row-affected">{affected} patient{affected === 1 ? "" : "s"} affected</span>}
          <span className={`vlr-pill vlr-pill-${status.tone}`}>{status.label}</span>
          <ChevronDown size={17} className="vlr-row-chevron" />
        </button>
        {open && <div className="vlr-row-detail">{renderDetails(request)}</div>}
      </div>
    );
  }

  return (
    <section className="vlr">
      {message && <div className="ok" key={`ok-${noticeKey}`}>{message}</div>}
      {actionError && <div className="err" key={`err-${noticeKey}`}>{actionError}</div>}

      <header className="vlr-head">
        <div>
          <h2><CalendarCheck2 size={22} /> Leave &amp; Emergency Requests</h2>
          <p>Approve planned leave, acknowledge same-day emergencies, and offer the patients they affect another doctor.</p>
        </div>
        <div className="vlr-head-right">
          <button type="button" className="vlr-record" onClick={() => setRecording(true)} disabled={Boolean(loadError)}><CalendarPlus size={16} /> Record leave</button>
          <div className="vlr-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}
              title={attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} action` : undefined}>
              Requests{requests.length > 0 && <span className={`vlr-count${attention.length ? "" : " vlr-count-muted"}`}>{requests.length}</span>}
            </button>
            <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
          </div>
          <button type="button" className="vlr-refresh" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "vlr-spin" : ""} /></button>
        </div>
      </header>

      {loadError ? (
        <div className="vlr-setup">{loadError}</div>
      ) : loading && !board ? (
        <p className="vlr-empty">Loading requests…</p>
      ) : tab === "all" ? (
        requests.length === 0 ? (
          <p className="vlr-empty">No pending or upcoming leave. Past requests are under History.</p>
        ) : (
          <div className="vlr-rows">
            <div className="vlr-rows-head"><span>Type</span><span>Veterinarian · leave</span><span>Status</span></div>
            {sortedRequests.map(renderRow)}
          </div>
        )
      ) : (
        <div className="vlr-history">
          {filteredHistory.length === 0 ? <p className="vlr-empty">No past requests yet.</p> : (
            <div className="vlr-table-wrap">
              <table className="vlr-table">
                <thead><tr><th>Filed</th><th>Veterinarian</th><th>Type</th><th>Period</th><th>Reason</th><th>Status</th><th>Handled by</th></tr></thead>
                <tbody>
                  {filteredHistory.map(request => {
                    const status = leaveStatusMeta(request, today);
                    return (
                      <tr key={request.id}>
                        <td>{formatDateTime12h(request.created_at)}</td>
                        <td>{drName(request.veterinarian?.full_name)}</td>
                        <td>{request.request_type}<small>{request.leave_type}</small></td>
                        <td>{formatLeavePeriod(request, today)}</td>
                        <td className="vlr-td-reason">{leaveReasonText(request) || "—"}{request.review_note && <small>Note: {request.review_note}</small>}{request.cancel_note && <small>Cancel note: {request.cancel_note}</small>}</td>
                        <td><span className={`vlr-pill vlr-pill-${status.tone}`}>{status.label}</span></td>
                        <td>{request.canceller?.full_name || request.reviewer?.full_name || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        tone="danger"
        title="Revoke this leave?"
        description={revokeTarget ? `${drName(revokeTarget.veterinarian_name)}'s schedule goes back to normal for ${formatLeavePeriod(revokeTarget, today)} and pet owners can book them again. The vet is notified.` : ""}
        confirmLabel="Revoke leave"
        cancelLabel="Keep leave"
        onConfirm={() => { const request = revokeTarget; setRevokeTarget(null); review(request, "revoke"); }}
        onCancel={() => setRevokeTarget(null)}
      />

      {changeTarget && (
        <DoctorChangeModal
          profile={profile}
          target={changeTarget}
          onClose={() => setChangeTarget(null)}
          onSent={(offer, picked) => {
            setChangeTarget(null);
            setMessage(`Sent to the owner: ${drName(picked?.vetName)} at ${formatTime12h(picked?.time)}. Nothing changes until they confirm, reschedule, or cancel in My Queue.`);
            setNoticeKey(value => value + 1);
            load(true);
          }}
        />
      )}

      {recording && (
        <VetLeaveRequestModal
          profile={profile}
          staffMode
          veterinarians={vets}
          today={today || todayLocal()}
          onClose={() => setRecording(false)}
          onSubmitted={handleRecorded}
        />
      )}

      <style>{`
        .vlr{background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 4px 10px rgba(0,0,0,.04);margin-bottom:14px;display:grid;gap:14px}
        .vlr-spin{animation:vlrSpin 1s linear infinite}@keyframes vlrSpin{to{transform:rotate(360deg)}}
        .vlr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
        .vlr-head h2{display:flex;align-items:center;gap:8px;margin:0;color:#20313b;font-size:20px}
        .vlr-head p{margin:5px 0 0;color:#6f7f88;font-size:13px}
        .vlr-head-right{display:flex;gap:8px;align-items:center}
        .vlr-tabs{display:flex;background:#eef6fa;border-radius:11px;padding:3px}
        .vlr-tabs button{border:0;background:none;border-radius:9px;padding:8px 14px;font-weight:700;color:#4f7384;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
        .vlr-tabs button.active{background:#fff;color:#1d3a4a;box-shadow:0 1px 4px rgba(20,60,80,.12)}
        .vlr-count{background:#e53935;color:#fff;border-radius:999px;font-size:11px;min-width:18px;padding:1px 6px}
        .vlr-count-muted{background:#d9e9f1;color:#2c6ba3}
        .vlr-record{display:inline-flex;gap:6px;align-items:center;border:0;background:#2c6ba3;color:#fff;border-radius:10px;padding:9px 14px;font-weight:800;cursor:pointer}
        .vlr-record:disabled{opacity:.5;cursor:not-allowed}
        .vlr-refresh{border:1px solid #d9e9ef;background:#fff;color:#318fbe;border-radius:10px;padding:8px;cursor:pointer;display:grid;place-items:center}
        .vlr-setup{background:#fff8e8;color:#865e12;border:1px solid #f1dfb0;border-radius:12px;padding:12px 14px;font-size:13.5px}
        .vlr-empty{margin:0;color:#80949d}
        .vlr-list{display:grid;gap:12px}
        .vlr-group{margin:6px 0 0;font-size:12px;font-weight:800;color:#52707d;text-transform:uppercase;letter-spacing:.05em}
        .vlr-card{border:1px solid #dcebf2;border-left:5px solid #4DA8DA;border-radius:14px;padding:14px 16px;display:grid;gap:9px;background:#fcfeff}
        .vlr-rows{border:1px solid #dcebf2;border-radius:14px;overflow:hidden}
        .vlr-rows-head{display:flex;gap:12px;padding:9px 16px;background:#f2fafd;color:#52707d;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
        .vlr-rows-head span:first-child{min-width:92px}.vlr-rows-head span:nth-child(2){flex:1}
        .vlr-item{border-top:1px solid #e6f0f4;border-left:4px solid transparent}
        .vlr-item.open{border-left-color:#4DA8DA;background:#fcfeff}
        .vlr-item-emergency.open{border-left-color:#c0392b;background:#fffafa}
        .vlr-row{width:100%;display:flex;align-items:center;gap:12px;border:0;background:none;padding:12px 16px;text-align:left;cursor:pointer;font:inherit}
        .vlr-row:hover{background:#f5fbfe}
        .vlr-row .vlr-type{min-width:92px;justify-content:center}
        .vlr-row-main{flex:1;display:grid;gap:2px;min-width:0}
        .vlr-row-main b{color:#1d3a4a;font-size:14px}
        .vlr-row-main small{color:#5f7884;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vlr-row .vlr-pill{margin-left:0}
        .vlr-row-affected{font-size:12px;font-weight:800;color:#a4561b;background:#fff1e6;border-radius:999px;padding:4px 10px;white-space:nowrap}
        .vlr-row-chevron{color:#6f8591;flex-shrink:0;transition:transform .15s ease}
        .vlr-item.open .vlr-row-chevron{transform:rotate(180deg)}
        .vlr-row-detail{display:grid;gap:9px;padding:4px 16px 16px 20px}
        @media(max-width:640px){.vlr-rows-head{display:none}.vlr-row{flex-wrap:wrap}.vlr-row-main{flex-basis:100%;order:3}}
        .vlr-card-emergency{border-left-color:#c0392b;background:#fffafa}
        .vlr-card-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .vlr-card-top h3{margin:0;font-size:16px;color:#1d3a4a}
        .vlr-type{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#e6f4fb;color:#2c6ba3;border-radius:6px;padding:4px 8px}
        .vlr-type-emergency{background:#fdecec;color:#c0392b}
        .vlr-pill{margin-left:auto;font-size:12px;font-weight:800;border-radius:999px;padding:4px 10px;white-space:nowrap}
        td .vlr-pill{margin-left:0}
        .vlr-pill-amber{background:#fff4e2;color:#9d6817}.vlr-pill-green{background:#e7f7ed;color:#26754a}.vlr-pill-blue{background:#eaf8fd;color:#2c6ba3}.vlr-pill-red{background:#fdecec;color:#b34848}.vlr-pill-muted{background:#eef2f4;color:#6a7c85}
        .vlr-period{margin:0;color:#2f5566}.vlr-reason{margin:0;color:#56707e;font-style:italic}.vlr-meta{color:#80949d}
        .vlr-conflicts{display:grid;gap:7px;border-top:1px dashed #d8e8ef;padding-top:10px}
        .vlr-conflicts-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .vlr-conflicts-head b{color:#1d3a4a;font-size:14px}
        .vlr-conflict{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #e3eff4;border-radius:11px;padding:9px 12px}
        .vlr-conflict-info{display:grid;grid-template-columns:150px auto;column-gap:10px;align-items:center;font-size:13px}
        .vlr-conflict-info span{color:#52707d;font-weight:700;grid-row:span 2}
        .vlr-conflict-info b{color:#20313b}.vlr-conflict-info small{color:#6f8591}
        .vlr-conflict-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        .vlr-conflict-actions select{border:1px solid #cfe4ed;border-radius:9px;padding:7px 9px;font:inherit;font-size:13px;background:#fff;max-width:210px}
        .vlr-small{border:0;background:#2c6ba3;color:#fff;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer;font-size:13px}
        .vlr-small-muted{background:#f3f6f7;color:#9b3d3d}
        .vlr-small:disabled,.vlr-btn:disabled{opacity:.5;cursor:not-allowed}
        .vlr-serving{color:#9d6817;font-weight:700}
        .vlr-hint{margin:0;font-size:12.5px;color:#6f8591}.vlr-hint a{color:#257fa9;font-weight:700}
        .vlr-clear{display:flex;gap:7px;align-items:center;margin:0;color:#26754a;font-weight:700;font-size:13px}
        .vlr-actions{display:grid;gap:8px;border-top:1px solid #edf3f6;padding-top:10px}
        .vlr-actions textarea{font:inherit;font-size:13px;border:1px solid #cfe4ed;border-radius:10px;padding:8px 10px;resize:vertical;min-height:40px}
        .vlr-buttons{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .vlr-btn{display:inline-flex;gap:6px;align-items:center;border-radius:10px;padding:9px 15px;font-weight:800;cursor:pointer;border:1px solid transparent}
        .vlr-approve{background:#2d9d63;color:#fff}.vlr-decline{background:#fff;color:#b34848;border-color:#efc2c2}
        .vlr-history{display:grid;gap:10px}
        .vlr-table-wrap{overflow:auto}
        .vlr-table{width:100%;border-collapse:collapse;min-width:820px}
        .vlr-table th,.vlr-table td{text-align:left;padding:10px;border-bottom:1px solid #edf3f6;font-size:13px;vertical-align:top}
        .vlr-table th{background:#f2fafd;color:#52707d}
        .vlr-table small{display:block;color:#7c8c94;margin-top:3px}
        .vlr-td-reason{max-width:260px}
        @media(max-width:640px){.vlr{padding:14px}.vlr-conflict-info{grid-template-columns:1fr}.vlr-conflict-info span{grid-row:auto}}
      `}</style>
    </section>
  );
}
