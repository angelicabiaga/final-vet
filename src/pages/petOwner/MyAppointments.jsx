import React, { useEffect, useState, useCallback } from "react";
import jsPDF from "jspdf";
import { CalendarDays, CreditCard, Download, Eye, Pill, Receipt, RefreshCw, X, XCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import { cancelAppointment, formatTime, getAppointments, todayLocal } from "../../services/appointmentService";
import {
  getOwnerInvoices,
  getOwnerOutstandingPrescriptions,
  markPrescriptionElsewhere,
  subscribeToPrescriptions,
} from "../../services/billingService";
import {
  getTransactionById,
  getTransactionPayments,
  getTransactions,
  subscribeToTransactions,
} from "../../services/transactionService";

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-PH") : "—";
}

function remainingBalance(transaction) {
  return Math.max(0, Number(transaction?.total_amount || 0) - Number(transaction?.amount_paid || 0));
}

function invoiceRows(transaction) {
  const serviceRows = Number(transaction.checkup_fee || 0) > 0
    ? [{ id: "checkup", item_name: "Checkup / consultation service", quantity: 1, unit_price: transaction.checkup_fee, line_total: transaction.checkup_fee }]
    : [];
  return [...serviceRows, ...(transaction.transaction_items || [])];
}

/** Client-generated invoice PDF -- no server round-trip, matches the same
 * figures the printed staff invoice shows (no Subtotal line; a Remaining
 * Balance line only when there's still money owed). */
function downloadInvoicePdf(transaction) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const centerX = 105;
  let y = 22;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(37, 80, 101);
  pdf.text("PawCruz Veterinary Clinic", centerX, y, { align: "center" });

  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Official POS Invoice", centerX, y, { align: "center" });

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 49, 58);
  pdf.text(transaction.or_number || transaction.id, centerX, y, { align: "center" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(97, 118, 129);
  pdf.text(formatDateTime(transaction.created_at), centerX, y, { align: "center" });

  y += 10;
  pdf.setDrawColor(214, 228, 235);
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFontSize(11);
  const infoRow = (label, value) => {
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, 20, y);
    pdf.setTextColor(30, 49, 58);
    pdf.setFont("helvetica", "bold");
    pdf.text(String(value ?? "—"), 190, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
  };
  infoRow("Pet owner", transaction.owner?.full_name || "—");
  infoRow("Pet", transaction.pet?.pet_name || "—");
  infoRow("Cashier", transaction.cashier?.full_name || "—");

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  invoiceRows(transaction).forEach((item) => {
    pdf.setTextColor(30, 49, 58);
    pdf.text(`${item.item_name} × ${item.quantity}`, 20, y);
    pdf.text(money(item.line_total), 190, y, { align: "right" });
    y += 7;
  });

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  infoRow("Total", money(transaction.total_amount));
  pdf.setFont("helvetica", "normal");
  infoRow("Amount paid", money(transaction.amount_paid));
  infoRow("Change", money(transaction.change_amount));

  const balance = remainingBalance(transaction);
  if (balance > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(176, 98, 10);
    pdf.text("Remaining Balance", 20, y);
    pdf.text(money(balance), 190, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
  }

  infoRow("Method", transaction.payment_method);
  infoRow("Status", transaction.payment_status);

  pdf.save(`Invoice-${transaction.or_number || transaction.id}.pdf`);
}

export default function MyAppointments({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [rxBusyId, setRxBusyId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [payments, setPayments] = useState([]);
  async function load() {
    try { setLoading(true); setRows(await getAppointments({ ownerId: profile.id })); }
    catch (e) { setNotice({ type: "error", text: e.message }); } finally { setLoading(false); }
  }
  const loadBilling = useCallback(async () => {
    if (!profile?.id) return;
    setBillingLoading(true);
    try {
      const [invoiceList, prescriptionRows] = await Promise.all([
        getOwnerInvoices(profile.id),
        getOwnerOutstandingPrescriptions(profile.id),
      ]);
      setInvoices(invoiceList);
      setPrescriptions(prescriptionRows);
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setBillingLoading(false);
    }
  }, [profile?.id]);
  const loadHistory = useCallback(async () => {
    if (!profile?.id) return;
    setHistoryLoading(true);
    try {
      setHistory(await getTransactions({ ownerId: profile.id, limit: 100 }));
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setHistoryLoading(false);
    }
  }, [profile?.id]);
  useEffect(() => { load(); }, []);
  useEffect(() => { loadBilling(); }, [loadBilling]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    const offRx = subscribeToPrescriptions(loadBilling);
    const offTx = subscribeToTransactions(() => { loadBilling(); loadHistory(); });
    return () => { offRx(); offTx(); };
  }, [loadBilling, loadHistory]);
  async function openDetails(transaction) {
    setDetails(transaction);
    setPayments([]);
    try {
      const [full, paymentRows] = await Promise.all([
        getTransactionById(transaction.id),
        getTransactionPayments(transaction.id),
      ]);
      setDetails(full);
      setPayments(paymentRows);
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    }
  }
  async function handleBuyElsewhere(prescription) {
    if (rxBusyId) return;
    setRxBusyId(prescription.id);
    try {
      await markPrescriptionElsewhere(prescription.id);
      setNotice({ type: "success", text: `Noted -- ${prescription.item_name} won't be billed here.` });
      await loadBilling();
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setRxBusyId(null);
    }
  }
  async function confirmCancel() {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await cancelAppointment(pendingCancel.id, profile.id);
      setNotice({ type: "success", text: "Appointment cancelled." });
      setPendingCancel(null);
      await load();
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setCancelling(false);
    }
  }
  return <AppShell profile={profile} title="My Appointments">
    <div className="appt-page">
      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      {!billingLoading && (invoices.length > 0 || prescriptions.length > 0) && <div className="billing-card">
        {invoices.length > 0 && <div className="billing-section">
          <h3><CreditCard size={18} /> Remaining Balance</h3>
          <div className="billing-list">
            {invoices.map((invoice) => <div className="billing-row" key={invoice.id}>
              <div><b>{invoice.pet?.pet_name || "Pet"}</b><span>{invoice.or_number} · Total {money(invoice.total_amount)} · Paid {money(invoice.amount_paid)}</span></div>
              <strong className="owed">{money(invoice.remainingBalance)} due</strong>
            </div>)}
          </div>
        </div>}
        {prescriptions.length > 0 && <div className="billing-section">
          <h3><Pill size={18} /> Remaining Medication</h3>
          <div className="billing-list">
            {prescriptions.map((rx) => <div className="billing-row" key={rx.id}>
              <div><b>{rx.item_name}</b><span>{rx.pet?.pet_name || "Pet"} · Prescribed {rx.prescribed_quantity} · Purchased {rx.total_quantity_purchased} · Remaining {rx.remainingQuantity}</span></div>
              <button type="button" className="elsewhere-btn" disabled={rxBusyId === rx.id} onClick={() => handleBuyElsewhere(rx)}>
                {rxBusyId === rx.id ? "Saving…" : "I'll buy this elsewhere"}
              </button>
            </div>)}
          </div>
        </div>}
      </div>}

      <div className="toolbar"><div><h2>Appointment History</h2><p>View and cancel eligible appointments.</p></div><button onClick={load}><RefreshCw size={17}/> Refresh</button></div>
      {loading ? <div className="card">Loading appointments…</div> : rows.length === 0 ? <div className="card empty"><CalendarDays/>No appointments yet.</div> : <div className="cards">{rows.map(row => <article className="appointment" key={row.id}>
        <div><span className={`status ${row.status.replaceAll(" ","-").toLowerCase()}`}>{row.status}</span><h3>{row.pet?.pet_name}</h3><p>{row.pet?.species} · General Consultation</p></div>
        <div className="details"><span><b>Date:</b> {row.appointment_date}</span><span><b>Time:</b> {formatTime(row.start_time)} – {formatTime(row.end_time)}</span><span><b>Veterinarian:</b> {row.veterinarian?.full_name}</span><span><b>Source:</b> {row.appointment_source}</span>{row.visit_reason && <span><b>Reason:</b> {row.visit_reason}</span>}</div>
        {row.appointment_date >= todayLocal() && row.status === "Confirmed" && <button className="cancel" onClick={() => setPendingCancel(row)}><XCircle size={16}/> Cancel</button>}
      </article>)}</div>}

      <div className="toolbar"><div><h2>Payment History</h2><p>Every invoice for your pets, paid or still owing.</p></div><button onClick={loadHistory}><RefreshCw size={17}/> Refresh</button></div>
      {historyLoading ? <div className="card">Loading payment history…</div> : history.length === 0 ? <div className="card empty"><Receipt/>No payment history yet.</div> : <div className="history-list">{history.map(transaction => <div className="history-row" key={transaction.id}>
        <div><b>{transaction.pet?.pet_name || "Pet"}</b><span>{transaction.or_number} · {formatDateTime(transaction.created_at)}</span></div>
        <div className="history-amounts"><span>Total {money(transaction.total_amount)}</span><span>Paid {money(transaction.amount_paid)}</span>{remainingBalance(transaction) > 0 && <span className="owed">{money(remainingBalance(transaction))} due</span>}</div>
        <span className={`status ${transaction.payment_status.replaceAll(" ","-").toLowerCase()}`}>{transaction.payment_status}</span>
        <div className="history-actions">
          <button type="button" className="ghost-btn" onClick={() => openDetails(transaction)}><Eye size={15}/> View Details</button>
          <button type="button" className="ghost-btn" onClick={() => downloadInvoicePdf(transaction)}><Download size={15}/> Download</button>
        </div>
      </div>)}</div>}
    </div>

    {details && <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Invoice details">
      <div className="detail-card">
        <button type="button" className="icon-close" onClick={() => setDetails(null)} aria-label="Close"><X size={19}/></button>
        <h2>{details.or_number || details.id}</h2>
        <p className="muted">{formatDateTime(details.created_at)} · {details.pet?.pet_name || "Pet"}</p>
        <div className="detail-grid">
          <div><span>Cashier</span><b>{details.cashier?.full_name || "—"}</b></div>
          <div><span>Payment method</span><b>{details.payment_method}</b></div>
        </div>
        <h3>Items &amp; services</h3>
        {invoiceRows(details).map(item => <div className="detail-item" key={item.id}><span>{item.item_name} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}
        <div className="detail-totals">
          <div><span>Total</span><b>{money(details.total_amount)}</b></div>
          <div><span>Amount paid</span><span>{money(details.amount_paid)}</span></div>
          <div><span>Remaining balance</span><span>{money(remainingBalance(details))}</span></div>
        </div>
        <h3>Payment history</h3>
        {payments.length ? payments.map(p => <div className="detail-item" key={p.id}><span>{formatDateTime(p.created_at)} · {p.payment_method}</span><b>{money(p.amount)}</b></div>) : <p className="muted">No payments recorded yet.</p>}
        <button type="button" className="download-invoice-btn" onClick={() => downloadInvoicePdf(details)}><Download size={17}/> Download Invoice</button>
      </div>
    </div>}

    <ConfirmDialog
      open={!!pendingCancel}
      tone="danger"
      title="Cancel Appointment?"
      description={pendingCancel ? `Cancel ${pendingCancel.pet?.pet_name || "this pet"}'s appointment on ${pendingCancel.appointment_date} at ${formatTime(pendingCancel.start_time)}? This cannot be undone.` : ""}
      confirmLabel="Yes, Cancel Appointment"
      cancelLabel="Keep Appointment"
      busy={cancelling}
      onConfirm={confirmCancel}
      onCancel={() => setPendingCancel(null)}
    />

    <style>{css}</style>
  </AppShell>;
}
const css=`.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.toolbar h2{margin:0}.toolbar p{margin:5px 0;color:#6F7F88}.toolbar button,.cancel{border:0;border-radius:11px;padding:10px 13px;display:flex;align-items:center;gap:7px;cursor:pointer}.toolbar button{background:#e8f7fc;color:#257fa9}.notice{padding:12px;border-radius:11px;margin-bottom:15px}.notice.success{background:#eafaf0;color:#227a52}.notice.error{background:#fff0f0;color:#b94b4b}.cards{display:grid;gap:15px}.appointment{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(47,117,150,.09);display:grid;grid-template-columns:1fr 1.5fr auto;gap:20px;align-items:center}.appointment h3{margin:9px 0 3px}.appointment p{margin:0;color:#6F7F88}.details{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px}.status{display:inline-block;padding:5px 9px;border-radius:99px;background:#eaf7fc;color:#2884ad;font-size:12px;font-weight:800}.status.cancelled{background:#fff0f0;color:#bd5050}.status.completed{background:#eaf8ef;color:#348359}.cancel{background:#fff0f0;color:#b84e4e}.empty{display:grid;place-items:center;gap:10px;color:#6F7F88;min-height:180px}.billing-card{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 24px rgba(47,117,150,.09);margin-bottom:20px;display:grid;gap:18px}.billing-section h3{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#213944;font-size:17px}.billing-list{display:grid;gap:10px}.billing-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border:1px solid #eef3f5;border-radius:12px;padding:13px 15px;background:#fbfeff}.billing-row div{display:grid;gap:3px}.billing-row b{color:#213944}.billing-row span{color:#6F7F88;font-size:13px}.billing-row .owed{color:#b0620a;font-size:16px;white-space:nowrap}.elsewhere-btn{border:1px solid #e4d3ba;background:#fff8ee;color:#8a6414;border-radius:8px;padding:9px 13px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}.elsewhere-btn:hover{background:#fbeeda}.elsewhere-btn:disabled{opacity:.6;cursor:not-allowed}.history-list{display:grid;gap:12px}.history-row{background:#fff;border-radius:16px;padding:16px 20px;box-shadow:0 8px 24px rgba(47,117,150,.09);display:grid;grid-template-columns:1.3fr 1.4fr auto auto;gap:16px;align-items:center}.history-row div{display:grid;gap:3px}.history-row b{color:#213944}.history-row span{color:#6F7F88;font-size:13px}.history-amounts{font-size:13px;color:#6F7F88}.history-amounts .owed{color:#b0620a;font-weight:800}.history-actions{display:flex;gap:8px;flex-wrap:wrap}.ghost-btn{border:1px solid #cfe4ed;background:#fff;color:#257fa9;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.ghost-btn:hover{background:#f2f9fc}.status.partially-paid{background:#fff0da;color:#b0620a}.status.unpaid{background:#fff6e0;color:#9a7000}.status.paid{background:#eafaf0;color:#227a52}.status.voided{background:#fff0f0;color:#bd5050}.modal-overlay{position:fixed;inset:0;background:rgba(20,40,50,.5);display:flex;align-items:center;justify-content:center;z-index:500;padding:20px}.detail-card{background:#fff;border-radius:18px;padding:28px;position:relative;width:min(560px,100%);max-height:90vh;overflow:auto;box-shadow:0 18px 44px rgba(16,50,67,.24)}.detail-card h2{margin:0;color:#213944}.detail-card h3{margin:20px 0 9px;color:#213944;font-size:16px}.detail-card .muted{color:#6F7F88;margin:4px 0}.icon-close{position:absolute;right:16px;top:16px;border:0;background:none;color:#71858f;cursor:pointer}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.detail-grid>div{display:grid;gap:4px;padding:12px;border:1px solid #eef3f5;border-radius:11px;background:#fbfeff}.detail-grid span{color:#6F7F88;font-size:12px;text-transform:uppercase}.detail-item{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid #eef3f5;font-size:14px}.detail-totals{margin-top:8px;border-top:1px solid #dce9ed;padding-top:8px}.detail-totals div{display:flex;justify-content:space-between;padding:5px 0;font-size:14px;color:#415a66}.download-invoice-btn{margin-top:18px;width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#318fbe,#2c5c74);color:#fff;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer}@media(max-width:800px){.appointment{grid-template-columns:1fr}.details{grid-template-columns:1fr}.history-row{grid-template-columns:1fr}}`;
