import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";

import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import { getInventoryItems, getInventoryItemsByIds } from "../../services/inventoryService";
import { getLatestMedicalRecordForPet } from "../../services/medicalRecordService";
import { getPets } from "../../services/petService";
import {
  checkoutTransaction,
  getTransactionAuditTrail,
  getTransactionById,
  getTransactions,
  initiateGcashPayment,
  pollTransactionStatus,
  reverseTransaction,
} from "../../services/transactionService";

const GCASH_EXPIRY_SECONDS = 5 * 60;
const PAYMENT_METHODS = ["Cash", "GCash", "Split Payment"];
const PAYMENT_STATUSES = ["", "Paid", "Pending", "Voided", "Cancelled"];
const HISTORY_PAGE_SIZE = 15;

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-PH") : "—";
}

function guessItemType(inventoryItem) {
  const haystack = `${inventoryItem.category || ""} ${inventoryItem.item_name || ""}`.toLowerCase();
  if (haystack.includes("test") || haystack.includes("lab") || haystack.includes("diagnostic")) return "Test";
  if (haystack.includes("medic") || haystack.includes("drug") || haystack.includes("vaccine") || haystack.includes("antibiotic")) return "Medicine";
  return "Product";
}

function statusClass(status) {
  return String(status || "Pending").toLowerCase().replace(/\s+/g, "-");
}

function StatusPill({ status }) {
  return <span className={`payment-status status-${statusClass(status)}`}>{status || "Pending"}</span>;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function receiptRows(transaction) {
  const serviceRows = Number(transaction.checkup_fee || 0) > 0
    ? [{ id: "checkup", item_name: "Checkup / consultation service", quantity: 1, unit_price: transaction.checkup_fee, line_total: transaction.checkup_fee }]
    : [];
  return [...serviceRows, ...(transaction.transaction_items || [])];
}

function printReceipt(transaction) {
  const receiptWindow = window.open("", "_blank", "width=440,height=720");
  if (!receiptWindow) return;
  const rows = receiptRows(transaction).map((item) => `
    <tr><td>${escapeHtml(item.item_name)} × ${escapeHtml(item.quantity)}</td><td>${escapeHtml(money(item.line_total))}</td></tr>
  `).join("");
  // Discount is only ever shown for older transactions that already carry a
  // stored discount_amount from before this feature was removed -- new
  // transactions always have 0, so the line never appears for them.
  const hasDiscount = Number(transaction.discount_amount) > 0;
  const discountRow = hasDiscount ? `<div class="row"><span>Discount</span><span>-${escapeHtml(money(transaction.discount_amount))}</span></div>` : "";
  receiptWindow.document.write(`<!doctype html><html><head><title>Receipt ${escapeHtml(transaction.or_number)}</title><style>body{font-family:Arial,sans-serif;color:#1e313a;margin:28px}.center{text-align:center}.muted{color:#617681;font-size:12px}table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:8px 0;border-bottom:1px dashed #bfd0d7}td:last-child{text-align:right;white-space:nowrap}.total{font-size:18px;font-weight:700}.row{display:flex;justify-content:space-between;padding:5px 0}</style></head><body><div class="center"><h2>PawCruz Veterinary Clinic</h2><p class="muted">Official POS Receipt</p><strong>${escapeHtml(transaction.or_number || transaction.id)}</strong><p class="muted">${escapeHtml(formatDateTime(transaction.created_at))}</p></div><div class="row"><span>Pet owner</span><b>${escapeHtml(transaction.owner?.full_name || "—")}</b></div><div class="row"><span>Pet</span><b>${escapeHtml(transaction.pet?.pet_name || "—")}</b></div><div class="row"><span>Cashier</span><b>${escapeHtml(transaction.cashier?.full_name || "—")}</b></div><table>${rows}</table><div class="row"><span>Subtotal</span><span>${escapeHtml(money(transaction.subtotal))}</span></div>${discountRow}<div class="row total"><span>Total</span><span>${escapeHtml(money(transaction.total_amount))}</span></div><div class="row"><span>Amount paid</span><span>${escapeHtml(money(transaction.amount_paid))}</span></div><div class="row"><span>Change</span><span>${escapeHtml(money(transaction.change_amount))}</span></div><div class="row"><span>Method</span><span>${escapeHtml(transaction.payment_method)}</span></div><p class="center muted">Status: ${escapeHtml(transaction.payment_status)}</p></body></html>`);
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

const styles = `
      .pos-grid,.history-module{width:100%;max-width:1280px;box-sizing:border-box;margin-left:auto;margin-right:auto}.card,.history-module{background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(47,117,150,.09)}.card h2,.history-heading h2{display:flex;align-items:center;gap:10px;margin:0 0 20px;color:#213944;font-size:25px}.pos-card-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.pos-card-head h2{margin:0}.pos-back-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cfe4ed;background:#fff;color:#536b78;border-radius:10px;padding:9px 14px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}.pos-back-btn:hover{background:#f5f9fb;border-color:#b8d2dc}.field-label{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:#536b78;text-transform:uppercase;letter-spacing:.45px;margin:21px 0 8px}.search-box,.history-search{display:flex;align-items:center;gap:10px;border:1px solid #dbe7ec;border-radius:12px;padding:13px 14px;background:#f8fbfc}.search-box input,.history-search input{border:0;background:transparent;outline:0;width:100%;font-size:17px;color:#213944}.search-box input::placeholder,.history-search input::placeholder,.notes-input::placeholder{font-size:17px;color:#80929b;opacity:1}.results-list{margin-top:8px;border:1px solid #eef3f5;border-radius:12px;overflow:hidden}.result-row{display:flex;justify-content:space-between;gap:16px;width:100%;padding:13px 14px;background:#fff;border:0;border-bottom:1px solid #f2f6f8;cursor:pointer;text-align:left;font-size:16px}.result-row:last-child{border-bottom:0}.result-row:hover{background:#f5fbfd}.result-row:disabled{opacity:.45;cursor:not-allowed}.results-empty{padding:14px 10px;color:#71858f;font-size:16px;display:flex;align-items:center;gap:8px}.cart-empty{border:1px dashed #dbe7ec;border-radius:12px;justify-content:center}.muted{color:#71858f;font-size:14px}.selected-pet{display:flex;justify-content:space-between;align-items:center;border:1px solid #dbe7ec;border-radius:12px;padding:15px;background:#f5fbfd;font-size:17px}.selected-pet span{display:block;color:#6F7F88;font-size:14px;margin-top:3px}.link-btn{display:flex;align-items:center;gap:5px;background:none;border:0;color:#318fbe;cursor:pointer;font-size:15px}.cart-scroll,.history-table-wrap{overflow-x:auto}.cart-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:16px}.cart-table th{text-align:left;color:#536b78;font-size:13px;text-transform:uppercase;padding:9px 8px}.cart-table td{padding:11px 8px;border-top:1px solid #f2f6f8}.qty-stepper{display:flex;align-items:center;gap:6px}.qty-stepper button{border:1px solid #dbe7ec;background:#fff;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer}.qty-stepper input{width:58px;text-align:center;padding:5px}.icon-btn{border:0;background:none;color:#bf4b42;cursor:pointer}.locked-items{display:flex;flex-direction:column;gap:8px;border:1px solid #dbe7ec;border-radius:12px;padding:12px 14px;background:#f5fbfd}.locked-item{display:flex;justify-content:space-between;gap:12px;font-size:16px;color:#213944;font-weight:700}.locked-badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eaf6fb;color:#21697f;font-size:12px;font-weight:800;white-space:nowrap}.extra-items-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:21px 0 8px}.extra-items-row .field-label{margin:0}.add-toggle-btn{display:flex;align-items:center;gap:6px;border:1px solid #cfe4ed;border-radius:10px;padding:8px 13px;background:#fff;color:#257fa9;font-weight:700;cursor:pointer;white-space:nowrap}.add-toggle-btn:disabled{opacity:.5;cursor:not-allowed}.fee-row{display:grid;grid-template-columns:1fr 1fr;gap:18px}.toggle-label{cursor:pointer}.inline-checkbox{width:auto!important;accent-color:#318fbe;cursor:pointer}.fee-off-note{display:block;margin-top:5px}input:disabled{background:#f2f6f8;color:#9fb0b8;cursor:not-allowed}input.fee-disabled{background:#e9eef1!important;color:#9aa8b0!important;border-color:#dce4e8!important}input[type=number],input[type=text],select,textarea{width:100%;box-sizing:border-box;border:1px solid #dbe7ec;border-radius:10px;padding:11px 12px;font-size:17px;color:#213944;background:#fff}.split-payment-form{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:17px;border:1px solid #dbe7ec;border-radius:12px;background:#f8fbfc;margin-top:17px}.split-payment-form label,.payment-amount-row label{display:grid;gap:7px;color:#536b78;font-size:15px;font-weight:700}.split-payment-form p{grid-column:1/-1;margin:0;color:#536b78;font-size:16px}.online-payment-note{display:flex;align-items:center;gap:8px;margin-top:17px;padding:14px;border-radius:12px;background:#edfaff;color:#286f91;font-size:16px}.payment-amount-row{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:18px;margin-top:17px}.payment-amount-row>div{padding:11px 12px;border:1px solid #dbe7ec;border-radius:10px;min-height:24px;display:flex;justify-content:space-between;align-items:center;color:#536b78;font-size:16px}.payment-amount-row strong{color:#213944;font-size:19px}.notes-input{margin-top:20px;min-height:90px;resize:vertical}.totals{margin-top:20px;border-top:1px solid #eef3f5;padding-top:13px;max-width:520px;margin-left:auto}.totals div{display:flex;justify-content:space-between;font-size:16px;color:#536b78;padding:5px 0}.grand-total{font-size:21px!important;color:#267fa8!important;font-weight:800}.checkout-btn,.receipt-print{margin-top:20px;width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#318fbe,#2c5c74);color:#fff;border:0;border-radius:12px;padding:15px;font-size:17px;font-weight:700;cursor:pointer}.checkout-btn:disabled{opacity:.6;cursor:wait}.history-module{margin-top:25px}.history-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.history-heading h2{margin:0;font-size:24px}.history-heading p{margin:6px 0 0;color:#627985;font-size:16px}.history-heading-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.new-transaction-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;background:linear-gradient(135deg,#318fbe,#2c5c74);color:#fff;border-radius:10px;padding:11px 15px;font-size:15px;font-weight:700;cursor:pointer;white-space:nowrap}.history-refresh,.table-action{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #c7e4ef;background:#effaff;color:#247fa8;border-radius:10px;padding:11px 13px;font-size:15px;font-weight:700;cursor:pointer}.history-refresh:disabled{opacity:.6;cursor:wait}.history-filters{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:12px;padding:17px;border-radius:14px;background:#f8fbfc;border:1px solid #edf3f5}.history-filters>label:not(.history-search){display:grid;gap:6px;color:#536b78;font-size:13px;font-weight:800;text-transform:uppercase}.history-filters input,.history-filters select{font-size:15px;padding:10px}.history-search{padding:9px 11px}.history-search input{font-size:15px}.history-error{margin-top:15px;padding:13px 15px;border-radius:10px;background:#fff0f0;color:#a33c3c;font-size:16px}.history-table{width:100%;min-width:1190px;border-collapse:collapse;margin-top:18px;font-size:15px}.history-table th{padding:12px 13px;text-align:left;color:#536b78;font-size:12px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #dce9ed}.history-table td{padding:14px 13px;color:#334f5d;border-bottom:1px solid #edf3f5;vertical-align:top;line-height:1.45}.history-table tbody tr:last-child td{border-bottom:0}.or-number{font-weight:800;color:#287ea5!important;white-space:nowrap}.amount-cell{font-weight:800;white-space:nowrap;color:#213944!important}.payment-status{display:inline-block;padding:5px 10px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}.status-paid{background:#e6f7ee;color:#1f8550}.status-pending{background:#fff6e0;color:#9a7000}.status-voided,.status-cancelled{background:#fbe9e9;color:#b33d35}.row-actions{display:flex;gap:7px}.table-action{padding:7px 9px;font-size:13px}.action-details{background:#e7f0ff!important;border-color:#c3d7fb!important;color:#2c5ab5!important}.action-details:hover{background:#d9e6ff!important}.action-reprint{background:#eef4f0!important;border-color:#cfe0d5!important;color:#3d7a55!important}.action-reprint:hover{background:#e0ede4!important}.table-message{text-align:center!important;padding:35px!important;color:#71858f!important;font-size:16px!important}.history-summary{margin-top:16px;color:#536b78;font-size:14px;font-weight:700}.history-pagination{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:20px;padding-top:18px;border-top:1px solid #edf3f6}.page-nav{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;flex-shrink:0;border:1px solid #cfe4ed;border-radius:50%;background:#fff;color:#2b6f8f;cursor:pointer}.page-nav:hover:not(:disabled){background:#eaf6fb;border-color:#a9dff0}.page-nav:disabled{cursor:not-allowed;opacity:.4}.history-pagination-pages{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}.history-pagination-pages button{min-width:40px;min-height:40px;border:1px solid transparent;border-radius:10px;background:transparent;color:#536b78;font-weight:700;font-size:15px;cursor:pointer}.history-pagination-pages button:hover{background:#eaf6fb}.history-pagination-pages button.active{border-color:#318fbe;background:#318fbe;color:#fff}.receipt-overlay{position:fixed;inset:0;background:rgba(20,40,50,.5);display:flex;align-items:center;justify-content:center;z-index:70;padding:20px}.receipt-card,.gcash-modal,.transaction-detail-card,.reversal-card{background:#fff;border-radius:18px;padding:26px;position:relative;box-sizing:border-box;max-height:90vh;overflow-y:auto;box-shadow:0 18px 44px rgba(16,50,67,.24)}.receipt-card{width:min(390px,100%)}.receipt-close,.detail-close{position:absolute;right:14px;top:14px}.receipt-card h2{margin:0 0 8px;color:#213944}.receipt-or{color:#267fa8;font-size:17px}.receipt-line{display:flex;justify-content:space-between;gap:15px;font-size:16px;padding:8px 0;border-bottom:1px dashed #eef3f5}.receipt-total{font-weight:800;color:#267fa8;font-size:19px;border-bottom:0}.receipt-print{margin-top:16px;padding:12px;font-size:15px}.receipt-redirect{text-align:center;color:#536b78;font-size:14px;font-weight:600;margin:17px 0 0}.gcash-modal{width:min(390px,100%);text-align:center;display:flex;flex-direction:column;align-items:center;gap:13px}.gcash-modal-header{width:100%;display:flex;justify-content:space-between;align-items:center;font-weight:800;color:#213944;font-size:18px}.gcash-qr{width:220px;height:220px;border:1px solid #eef3f5;border-radius:12px;padding:10px}.gcash-waiting{display:flex;align-items:center;gap:8px;font-size:16px;color:#318fbe;font-weight:700}.gcash-cancel{margin-top:0;color:#71858f}.gcash-status-text{font-size:16px;margin:8px 0}.gcash-status-text.err{color:#b33d35}.transaction-detail-card{width:min(780px,100%)}.detail-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-right:32px}.detail-eyebrow{color:#647b87;text-transform:uppercase;letter-spacing:.5px;font-size:13px;font-weight:800}.detail-top h2{margin:3px 0;color:#213944}.detail-top p{margin:0;color:#71858f}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:19px 0}.detail-grid>div{display:grid;gap:4px;padding:12px;border:1px solid #e4eff3;border-radius:11px;background:#fbfeff}.detail-grid span,.detail-totals span:first-child{color:#647b87;font-size:13px;text-transform:uppercase;font-weight:700}.detail-grid strong{color:#213944;font-size:16px}.detail-items h3,.audit-trail h3{margin:18px 0 9px;color:#213944;font-size:17px}.detail-item{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid #eef3f5}.detail-item span{display:grid;gap:3px}.detail-item small{color:#71858f;font-size:13px}.detail-totals{margin-top:16px;border-top:1px solid #dce9ed;padding-top:10px;margin-left:auto;max-width:400px}.detail-totals div{display:flex;justify-content:space-between;padding:5px 0;color:#415a66;font-size:16px}.detail-totals strong{color:#267fa8;font-size:19px}.split-summary,.detail-note{margin-top:16px;padding:12px;border-radius:10px;background:#f7fbfd;color:#536b78;display:flex;gap:9px;flex-wrap:wrap}.audit-trail{margin-top:18px;border-top:1px solid #e5eef1}.audit-trail p{margin:7px 0;color:#5e7480;font-size:14px}.detail-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}.detail-actions button{width:auto;margin:0;padding:11px 13px;font-size:14px}.void-button{border:0;border-radius:10px;display:inline-flex;align-items:center;gap:7px;color:#fff;font-weight:700;cursor:pointer;background:#b33d35}.reversal-card{width:min(420px,100%)}.reversal-card h2{margin:0;color:#213944}.reversal-card p{color:#71858f}.reversal-card label{display:grid;gap:7px;color:#536b78;font-weight:700}.reversal-card textarea{min-height:100px;margin-bottom:15px}.reversal-card>div:last-child{display:flex;gap:10px}.modal-cancel,.modal-confirm{flex:1;border-radius:10px;padding:11px;border:0;font-size:15px;font-weight:700;cursor:pointer}.modal-cancel{background:#eff4f6;color:#536b78}.modal-confirm{background:#b33d35;color:#fff}.modal-confirm:disabled{opacity:.55;cursor:not-allowed}.spin{animation:spin 1s linear infinite}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@media(max-width:900px){.fee-row,.payment-amount-row,.split-payment-form,.detail-grid{grid-template-columns:1fr}.history-filters{grid-template-columns:1fr 1fr}.history-search{grid-column:1/-1}.split-payment-form p{grid-column:auto}}@media(max-width:650px){.card,.history-module{padding:18px}.pos-card-head{flex-direction:column;align-items:flex-start;gap:10px}.pos-back-btn{width:100%;justify-content:center}.history-heading{flex-direction:column}.history-heading-actions{width:100%}.new-transaction-btn,.history-refresh{flex:1}.history-filters{grid-template-columns:1fr}.history-search{grid-column:auto}.result-row{flex-direction:column;gap:3px}.detail-item{grid-template-columns:1fr auto}.detail-actions>*{flex:1}.payment-amount-row{gap:9px}}
    `;

function PaymentTransactionHistory({ profile, onNewTransaction }) {
  const [filters, setFilters] = useState({ search: "", from: "", to: "", paymentMethod: "", paymentStatus: "" });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [actionDialog, setActionDialog] = useState(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (!details && !actionDialog) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [details, actionDialog]);

  const canReverse = ["staff", "admin"].includes(profile?.role);
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTransactions(await getTransactions({
        from: filters.from,
        to: filters.to,
        paymentMethod: filters.paymentMethod,
        paymentStatus: filters.paymentStatus,
        limit: 200,
      }));
    } catch (loadError) {
      setError(loadError.message || "Unable to load payment history.");
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.paymentMethod, filters.paymentStatus, filters.to]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const visibleTransactions = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((transaction) => [
      transaction.or_number,
      transaction.id,
      transaction.owner?.full_name,
      transaction.pet?.pet_name,
      transaction.cashier?.full_name,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [filters.search, transactions]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.from, filters.to, filters.paymentMethod, filters.paymentStatus]);

  const totalPages = Math.max(1, Math.ceil(visibleTransactions.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = useMemo(
    () => visibleTransactions.slice((currentPage - 1) * HISTORY_PAGE_SIZE, currentPage * HISTORY_PAGE_SIZE),
    [visibleTransactions, currentPage]
  );

  async function openDetails(transaction) {
    setDetails(transaction);
    setAuditTrail([]);
    try {
      const [completeTransaction, audit] = await Promise.all([
        getTransactionById(transaction.id),
        getTransactionAuditTrail(transaction.id),
      ]);
      setDetails(completeTransaction);
      setAuditTrail(audit);
    } catch (detailError) {
      setError(detailError.message || "Unable to load transaction details.");
    }
  }

  async function confirmReversal() {
    if (!actionDialog || !reversalReason.trim()) return;
    setReversing(true);
    try {
      await reverseTransaction({
        transactionId: actionDialog.transaction.id,
        reason: reversalReason,
      }, profile);
      setActionDialog(null);
      setReversalReason("");
      setDetails(null);
      await loadHistory();
    } catch (reversalError) {
      setError(reversalError.message || "Unable to void this transaction.");
    } finally {
      setReversing(false);
    }
  }

  return (
    <section className="history-module" id="payment-history">
      <div className="history-heading">
        <div>
          <h2><Receipt size={22} /> Payment Transaction History</h2>
          <p>Permanent POS audit records. Completed transactions are never deleted.</p>
        </div>
        <div className="history-heading-actions">
          {onNewTransaction && (
            <button type="button" className="new-transaction-btn" onClick={onNewTransaction}>
              <Plus size={18} /> New Transaction
            </button>
          )}
          <button type="button" className="history-refresh" onClick={loadHistory} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="history-filters">
        <label className="history-search"><Search size={19} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search OR number, owner, pet, or cashier" /></label>
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
        <label>Payment method<select value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="">All methods</option>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Status<select value={filters.paymentStatus} onChange={(event) => setFilters((current) => ({ ...current, paymentStatus: event.target.value }))}>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status || "All statuses"}</option>)}</select></label>
      </div>

      {error && <div className="history-error">{error}</div>}

      {!loading && visibleTransactions.length > 0 && (
        <div className="history-summary">
          Showing {(currentPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(currentPage * HISTORY_PAGE_SIZE, visibleTransactions.length)} of {visibleTransactions.length} transactions
        </div>
      )}

      <div className="history-table-wrap">
        <table className="history-table">
          <thead><tr><th>Transaction / OR</th><th>Date & Time</th><th>Pet Owner</th><th>Pet</th><th>Method</th><th>Total</th><th>Status</th><th>Cashier</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td className="table-message" colSpan="9">Loading payment history…</td></tr>}
            {!loading && visibleTransactions.length === 0 && <tr><td className="table-message" colSpan="9">No payment transactions match these filters.</td></tr>}
            {!loading && paginatedTransactions.map((transaction) => <tr key={transaction.id}>
              <td className="or-number">{transaction.or_number || transaction.id.slice(0, 8).toUpperCase()}</td>
              <td>{formatDateTime(transaction.created_at)}</td>
              <td>{transaction.owner?.full_name || "—"}</td>
              <td>{transaction.pet?.pet_name || "—"}</td>
              <td>{transaction.payment_method}</td>
              <td className="amount-cell">{money(transaction.total_amount)}</td>
              <td><StatusPill status={transaction.payment_status} /></td>
              <td>{transaction.cashier?.full_name || "—"}</td>
              <td><div className="row-actions"><button type="button" className="table-action action-details" onClick={() => openDetails(transaction)}><Eye size={16} /> Details</button><button type="button" className="table-action action-reprint" onClick={() => printReceipt(transaction)}><Printer size={16} /> Reprint</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {!loading && totalPages > 1 && (
        <div className="history-pagination">
          <button type="button" className="page-nav" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft size={18} />
          </button>

          <div className="history-pagination-pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={pageNumber === currentPage ? "active" : ""}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button type="button" className="page-nav" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {details && <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Transaction details">
        <div className="transaction-detail-card">
          <button type="button" className="icon-btn detail-close" onClick={() => setDetails(null)} aria-label="Close transaction details"><X size={19} /></button>
          <div className="detail-top"><div><span className="detail-eyebrow">Payment Transaction</span><h2>{details.or_number || details.id}</h2><p>{formatDateTime(details.created_at)}</p></div><StatusPill status={details.payment_status} /></div>
          <div className="detail-grid"><div><span>Pet owner</span><strong>{details.owner?.full_name || "—"}</strong></div><div><span>Pet</span><strong>{details.pet?.pet_name || "—"}</strong></div><div><span>Cashier / staff</span><strong>{details.cashier?.full_name || "—"}</strong></div><div><span>Payment method</span><strong>{details.payment_method}</strong></div></div>
          <div className="detail-items"><h3>Items & services</h3>{receiptRows(details).map((item) => <div className="detail-item" key={item.id}><span><b>{item.item_name}</b><small>{item.quantity} × {money(item.unit_price)}</small></span><strong>{money(item.line_total)}</strong></div>)}</div>
          <div className="detail-totals"><div><span>Subtotal</span><span>{money(details.subtotal)}</span></div>{Number(details.discount_amount) > 0 && <div><span>Discount</span><span>-{money(details.discount_amount)}</span></div>}<div><span>Total amount</span><strong>{money(details.total_amount)}</strong></div><div><span>Amount paid</span><span>{money(details.amount_paid)}</span></div><div><span>Change</span><span>{money(details.change_amount)}</span></div></div>
          {details.split_payment_details && <div className="split-summary"><b>Split payment</b><span>{Object.entries(details.split_payment_details).filter(([, value]) => Number(value) > 0).map(([method, value]) => `${method}: ${money(value)}`).join(" · ")}</span></div>}
          {details.notes && <p className="detail-note"><b>Notes:</b> {details.notes}</p>}
          <div className="audit-trail"><h3>Audit trail</h3>{auditTrail.length ? auditTrail.map((entry) => <p key={entry.id}><b>{entry.action}</b> · {formatDateTime(entry.created_at)}{entry.performer?.full_name ? ` by ${entry.performer.full_name}` : ""}{entry.reason ? ` — ${entry.reason}` : ""}</p>) : <p>No audit activity recorded yet.</p>}</div>
          <div className="detail-actions"><button type="button" className="receipt-print" onClick={() => printReceipt(details)}><Printer size={17} /> Reprint Receipt</button>{canReverse && ["Paid", "Pending"].includes(details.payment_status) && <button type="button" className="void-button" onClick={() => { setActionDialog({ transaction: details, label: details.payment_status === "Paid" ? "Void transaction" : "Void pending transaction" }); setReversalReason(""); }}><RotateCcw size={17} /> Void</button>}</div>
        </div>
      </div>}

      {actionDialog && <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Void transaction"><div className="reversal-card"><h2>{actionDialog.label}</h2><p>{actionDialog.transaction.or_number} · {money(actionDialog.transaction.total_amount)}</p><label>Reason <textarea value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Required reason for this audit action" autoFocus /></label><div><button type="button" className="modal-cancel" onClick={() => setActionDialog(null)}>Cancel</button><button type="button" className="modal-confirm" disabled={!reversalReason.trim() || reversing} onClick={confirmReversal}>{reversing ? "Saving…" : "Confirm Void"}</button></div></div></div>}
    </section>
  );
}

export function NewTransaction({ profile }) {
  const navigate = useNavigate();
  const [petSearch, setPetSearch] = useState("");
  const [petResults, setPetResults] = useState([]);
  const [petLoading, setPetLoading] = useState(false);
  const [petFocused, setPetFocused] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemFocused, setItemFocused] = useState(false);
  const [cart, setCart] = useState([]);
  const [vetItemsLoading, setVetItemsLoading] = useState(false);
  const [linkedMedicalRecordId, setLinkedMedicalRecordId] = useState(null);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState(null);
  const [includeCheckupFee, setIncludeCheckupFee] = useState(true);
  const [checkupFee, setCheckupFee] = useState("500");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [splitPayment, setSplitPayment] = useState({ cash: "", digital: "", digitalMethod: "GCash" });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successReceipt, setSuccessReceipt] = useState(null);
  const [redirectSeconds, setRedirectSeconds] = useState(5);
  const [gcashModal, setGcashModal] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const gcashPollRef = useRef(null);
  const gcashTimerRef = useRef(null);
  const gcashPendingTransactionRef = useRef(null);
  const gcashStatus = gcashModal?.status;

  useEffect(() => {
    if (!successReceipt && !gcashModal) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [successReceipt, gcashModal]);
  const gcashTransactionId = gcashModal?.transactionId;

  useEffect(() => {
    if (!petSearch.trim() && !petFocused) { setPetResults([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPetLoading(true);
      try { const data = await getPets({ search: petSearch.trim() }); if (!cancelled) setPetResults(data.slice(0, 8)); }
      catch (searchError) { if (!cancelled) console.error("Unable to search pets.", searchError); }
      finally { if (!cancelled) setPetLoading(false); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [petFocused, petSearch]);

  useEffect(() => {
    if (!itemSearch.trim() && !itemFocused) { setItemResults([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setItemLoading(true);
      try { const data = await getInventoryItems({ search: itemSearch.trim() }); if (!cancelled) setItemResults(data.slice(0, 8)); }
      catch (searchError) { if (!cancelled) console.error("Unable to search inventory.", searchError); }
      finally { if (!cancelled) setItemLoading(false); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [itemFocused, itemSearch]);

  // The veterinarian's medical record already says which tests/medicines/
  // vaccines were given, so the pet's selection locks those in as the
  // starting cart instead of letting staff pick them by hand.
  useEffect(() => {
    let cancelled = false;
    setItemSearchOpen(false);
    if (!selectedPet) {
      setCart([]);
      setLinkedMedicalRecordId(null);
      setLinkedAppointmentId(null);
      return undefined;
    }
    (async () => {
      setVetItemsLoading(true);
      try {
        const record = await getLatestMedicalRecordForPet(selectedPet.id);
        if (cancelled) return;
        setLinkedMedicalRecordId(record?.id || null);
        setLinkedAppointmentId(record?.appointment_id || null);
        const chosen = (record?.template_data?.inventoryItems || []).filter((entry) => !entry.isNA);
        if (!chosen.length) { setCart([]); return; }
        const freshItems = await getInventoryItemsByIds(chosen.map((entry) => entry.id));
        if (cancelled) return;
        const freshById = new Map(freshItems.map((item) => [item.id, item]));
        setCart(chosen.map((entry) => {
          const fresh = freshById.get(entry.id);
          return {
            inventory_item_id: entry.id,
            item_name: fresh?.item_name || entry.item_name,
            item_type: guessItemType(fresh || entry),
            quantity: 1,
            unit_price: Number((fresh?.unit_price ?? entry.unit_price) || 0),
            available: Number(fresh?.quantity || 0),
            deduct_inventory: true,
            locked: true,
          };
        }));
      } catch (loadError) {
        if (!cancelled) console.error("Unable to load the veterinarian's chosen items.", loadError);
      } finally {
        if (!cancelled) setVetItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPet]);

  const itemsSubtotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0), [cart]);
  const effectiveCheckupFee = includeCheckupFee ? Number(checkupFee || 0) : 0;
  const subtotal = effectiveCheckupFee + itemsSubtotal;
  // The PWD/Senior Citizen discount has been removed. No discount is ever
  // applied automatically or otherwise -- total always equals subtotal.
  const totalAmount = subtotal;
  const splitTotal = Number(splitPayment.cash || 0) + Number(splitPayment.digital || 0);
  const isGcash = paymentMethod === "GCash";
  const recordedAmountPaid = paymentMethod === "Split Payment" ? splitTotal : Number(amountPaid || 0);
  const changeAmount = paymentMethod === "Cash" ? Math.max(0, recordedAmountPaid - totalAmount) : 0;

  useEffect(() => {
    if (!isGcash && paymentMethod !== "Split Payment" && !amountTouched) setAmountPaid(totalAmount.toFixed(2));
  }, [amountTouched, isGcash, paymentMethod, totalAmount]);

  function selectPet(pet) { setSelectedPet(pet); setPetSearch(""); setPetResults([]); setPetFocused(false); }
  function addToCart(inventoryItem) {
    setCart((current) => {
      const currentLine = current.find((line) => line.inventory_item_id === inventoryItem.id && !line.locked);
      if (currentLine) return current.map((line) => line.inventory_item_id === inventoryItem.id && !line.locked ? { ...line, quantity: Number(line.quantity) + 1 } : line);
      return [...current, { inventory_item_id: inventoryItem.id, item_name: inventoryItem.item_name, item_type: guessItemType(inventoryItem), quantity: 1, unit_price: Number(inventoryItem.unit_price || 0), available: Number(inventoryItem.quantity || 0), deduct_inventory: true, locked: false }];
    });
    setItemSearch(""); setItemResults([]); setItemFocused(false);
  }
  function updateCartLine(inventoryItemId, patch) { setCart((current) => current.map((line) => line.inventory_item_id === inventoryItemId && !line.locked ? { ...line, ...patch } : line)); }
  function removeCartLine(inventoryItemId) { setCart((current) => current.filter((line) => line.inventory_item_id !== inventoryItemId || line.locked)); }
  function resetForm() { setSelectedPet(null); setIncludeCheckupFee(true); setCheckupFee("500"); setPaymentMethod("Cash"); setAmountPaid(""); setAmountTouched(false); setSplitPayment({ cash: "", digital: "", digitalMethod: "GCash" }); setNotes(""); setCart([]); setError(""); setItemSearchOpen(false); setLinkedMedicalRecordId(null); setLinkedAppointmentId(null); }

  function handleBack() {
    if (selectedPet || cart.length > 0) { setShowLeaveConfirm(true); return; }
    navigate("/staff/transactions");
  }

  function stopGcashTimers() { if (gcashPollRef.current) window.clearInterval(gcashPollRef.current); if (gcashTimerRef.current) window.clearInterval(gcashTimerRef.current); gcashPollRef.current = null; gcashTimerRef.current = null; }
  function closeGcashModal() { stopGcashTimers(); gcashPendingTransactionRef.current = null; setGcashModal(null); }

  async function handleCheckout() {
    if (submitting) return;
    setError("");
    if (!selectedPet) { setError("Select a pet owner and pet before completing the transaction."); return; }
    const overStock = cart.find((line) => Number(line.quantity) > Number(line.available));
    if (overStock) { setError(`Only ${overStock.available} ${overStock.item_name} left in stock. Reduce the quantity.`); return; }
    if (!isGcash && recordedAmountPaid < totalAmount) { setError("Amount paid must cover the total amount due."); return; }
    if (paymentMethod === "Split Payment" && (!splitPayment.digitalMethod || Number(splitPayment.cash || 0) < 0 || Number(splitPayment.digital || 0) < 0)) { setError("Enter valid split-payment amounts and a digital payment method."); return; }

    setSubmitting(true);
    try {
      const transactionId = await checkoutTransaction({
        petId: selectedPet.id,
        ownerId: selectedPet.owner?.id,
        checkupFee: effectiveCheckupFee,
        paymentMethod,
        paymentStatus: isGcash ? "Pending" : "Paid",
        discountAmount: 0,
        amountPaid: isGcash ? 0 : recordedAmountPaid,
        changeAmount: isGcash ? 0 : changeAmount,
        splitPaymentDetails: paymentMethod === "Split Payment" ? { Cash: Number(splitPayment.cash || 0), [splitPayment.digitalMethod]: Number(splitPayment.digital || 0) } : null,
        notes,
        items: cart,
        medicalRecordId: linkedMedicalRecordId,
        appointmentId: linkedAppointmentId,
      }, profile);
      const savedTransaction = await getTransactionById(transactionId);

      if (isGcash) {
        const { checkoutUrl } = await initiateGcashPayment(transactionId, totalAmount);
        const qrDataUrl = await QRCode.toDataURL(checkoutUrl, { width: 320, margin: 1 });
        gcashPendingTransactionRef.current = savedTransaction;
        setGcashModal({ transactionId, qrDataUrl, secondsLeft: GCASH_EXPIRY_SECONDS, status: "waiting" });
        resetForm();
        return;
      }

      setSuccessReceipt(savedTransaction);
      resetForm();
    } catch (checkoutError) {
      setError(checkoutError.message || "Unable to complete the transaction.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (gcashStatus !== "waiting" || !gcashTransactionId) return undefined;
    gcashPollRef.current = window.setInterval(async () => {
      try {
        const transaction = await pollTransactionStatus(gcashTransactionId, { timeoutMs: 2500, intervalMs: 1000 });
        if (transaction.payment_status === "Paid") { stopGcashTimers(); setGcashModal((current) => current ? { ...current, status: "paid" } : current); }
        if (["Cancelled", "Voided"].includes(transaction.payment_status)) { stopGcashTimers(); setGcashModal((current) => current ? { ...current, status: "cancelled" } : current); }
      } catch (pollError) { console.error("Unable to poll GCash payment status.", pollError); }
    }, 3500);
    gcashTimerRef.current = window.setInterval(() => setGcashModal((current) => { if (!current || current.status !== "waiting") return current; if (current.secondsLeft <= 1) { stopGcashTimers(); return { ...current, secondsLeft: 0, status: "expired" }; } return { ...current, secondsLeft: current.secondsLeft - 1 }; }), 1000);
    return () => stopGcashTimers();
  }, [gcashStatus, gcashTransactionId]);

  useEffect(() => {
    if (gcashStatus !== "paid" || !gcashPendingTransactionRef.current) return;
    const transactionId = gcashPendingTransactionRef.current.id;
    getTransactionById(transactionId).then((transaction) => {
      setSuccessReceipt(transaction);
    }).catch((loadError) => setError(loadError.message || "Payment was confirmed but the receipt could not be loaded."));
    gcashPendingTransactionRef.current = null;
    setGcashModal(null);
  }, [gcashStatus]);

  useEffect(() => stopGcashTimers, []);

  useEffect(() => {
    if (!successReceipt) return undefined;
    setRedirectSeconds(5);
    const countdown = window.setInterval(() => setRedirectSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    const redirect = window.setTimeout(() => {
      navigate("/staff/transactions");
    }, 5000);
    return () => { window.clearInterval(countdown); window.clearTimeout(redirect); };
  }, [navigate, successReceipt]);

  return <AppShell profile={profile} title="New Transaction"><div className="transaction-module">
    {error && <div className="error">{error}</div>}
    <div className="pos-grid"><section className="card pos-main">
      <div className="pos-card-head">
        <h2><Stethoscope size={22} /> New Transaction</h2>
        <button type="button" className="pos-back-btn" onClick={handleBack}><ArrowLeft size={16} /> Back to Transactions</button>
      </div>
      <label className="field-label">Pet owner / pet</label>
      {selectedPet ? <div className="selected-pet"><div><strong>{selectedPet.pet_name}</strong><span>{selectedPet.species} · Owner: {selectedPet.owner?.full_name || "—"}</span></div><button type="button" className="link-btn" onClick={() => setSelectedPet(null)}><X size={17} /> Change</button></div> : <div className="search-box"><Search size={18} /><input placeholder="Search pet by name, species, or breed" value={petSearch} onChange={(event) => setPetSearch(event.target.value)} onFocus={() => setPetFocused(true)} onBlur={() => window.setTimeout(() => setPetFocused(false), 150)} /></div>}
      {!selectedPet && (petSearch.trim() || petFocused) && <div className="results-list">{petLoading && <div className="results-empty">Searching…</div>}{!petLoading && petResults.length === 0 && <div className="results-empty">No pets found.</div>}{petResults.map((pet) => <button type="button" key={pet.id} className="result-row" onMouseDown={() => selectPet(pet)}><span><strong>{pet.pet_name}</strong> · {pet.species}</span><span className="muted">{pet.owner?.full_name || "No owner"}</span></button>)}</div>}

      <label className="field-label"><PackageSearch size={16} /> Tests / medicines / vaccines from the medical record</label>
      {vetItemsLoading ? <div className="results-empty">Loading the veterinarian's chosen items…</div> : cart.filter((line) => line.locked).length === 0 ? <div className="results-empty">{selectedPet ? "No items were recorded for this pet's latest medical record." : "Select a pet to load the veterinarian's chosen items."}</div> : <div className="locked-items">{cart.filter((line) => line.locked).map((line) => <div className="locked-item" key={line.inventory_item_id}><span>{line.item_name}</span><span>{money(line.unit_price)}</span></div>)}</div>}

      <div className="extra-items-row">
        <label className="field-label"><PackageSearch size={16} /> Additional products</label>
        <button type="button" className="add-toggle-btn" onClick={() => setItemSearchOpen((open) => !open)} disabled={!selectedPet}><Plus size={15} /> {itemSearchOpen ? "Hide" : "Add"}</button>
      </div>
      {itemSearchOpen && <>
        <div className="search-box"><Search size={18} /><input placeholder="Search inventory by item name or SKU" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} onFocus={() => setItemFocused(true)} onBlur={() => window.setTimeout(() => setItemFocused(false), 150)} autoFocus /></div>
        {(itemSearch.trim() || itemFocused) && <div className="results-list">{itemLoading && <div className="results-empty">Searching…</div>}{!itemLoading && itemResults.length === 0 && <div className="results-empty">No inventory items found.</div>}{itemResults.map((item) => <button type="button" key={item.id} className="result-row" disabled={Number(item.quantity) <= 0} onMouseDown={() => addToCart(item)}><span><strong>{item.item_name}</strong> · {item.category}</span><span className="muted">{money(item.unit_price)} · {item.quantity} {item.unit} in stock</span></button>)}</div>}
      </>}

      <label className="field-label"><ShoppingCart size={16} /> Cart</label>
      {cart.length === 0 ? <div className="results-empty cart-empty"><ShoppingCart size={18} /> No tests, medicines, or products added yet.</div> : <div className="cart-scroll"><table className="cart-table"><thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th /></tr></thead><tbody>{cart.map((line) => <tr key={`${line.inventory_item_id}-${line.locked ? "vet" : "extra"}`}><td>{line.item_name}</td><td>{line.item_type}</td><td>{line.locked ? <span className="locked-badge">Vet-selected</span> : <div className="qty-stepper"><button type="button" onClick={() => updateCartLine(line.inventory_item_id, { quantity: Math.max(1, Number(line.quantity) - 1) })}><Minus size={14} /></button><input type="number" min="1" max={line.available} value={line.quantity} onChange={(event) => updateCartLine(line.inventory_item_id, { quantity: event.target.value })} /><button type="button" onClick={() => updateCartLine(line.inventory_item_id, { quantity: Math.min(line.available, Number(line.quantity) + 1) })}><Plus size={14} /></button></div>}</td><td>{money(line.unit_price)}</td><td>{money(Number(line.quantity) * Number(line.unit_price))}</td><td>{!line.locked && <button type="button" className="icon-btn" onClick={() => removeCartLine(line.inventory_item_id)} aria-label={`Remove ${line.item_name}`}><Trash2 size={17} /></button>}</td></tr>)}</tbody></table></div>}

      <div className="fee-row"><div><label className="field-label toggle-label"><input type="checkbox" className="inline-checkbox" checked={includeCheckupFee} onChange={(event) => setIncludeCheckupFee(event.target.checked)} /> Checkup fee (PHP)</label><input type="number" min="0" step="0.01" value={checkupFee} disabled={!includeCheckupFee} className={!includeCheckupFee ? "fee-disabled" : ""} onChange={(event) => setCheckupFee(event.target.value)} />{!includeCheckupFee && <span className="muted fee-off-note">Off — product-only POS sale.</span>}</div><div><label className="field-label">Payment method</label><select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setAmountTouched(false); }}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div></div>

      {paymentMethod === "Split Payment" ? <div className="split-payment-form"><label>Cash portion<input type="number" min="0" step="0.01" value={splitPayment.cash} onChange={(event) => setSplitPayment((current) => ({ ...current, cash: event.target.value }))} placeholder="0.00" /></label><label>{splitPayment.digitalMethod} portion<input type="number" min="0" step="0.01" value={splitPayment.digital} onChange={(event) => setSplitPayment((current) => ({ ...current, digital: event.target.value }))} placeholder="0.00" /></label><label>Digital method<select value={splitPayment.digitalMethod} onChange={(event) => setSplitPayment((current) => ({ ...current, digitalMethod: event.target.value }))}>{PAYMENT_METHODS.filter((method) => !["Cash", "Split Payment"].includes(method)).map((method) => <option key={method}>{method}</option>)}</select></label><p>Total received: <b>{money(splitTotal)}</b></p></div> : isGcash ? <div className="online-payment-note"><CreditCard size={18} /> GCash is saved as <b>Pending</b>; inventory is deducted only after PayMongo confirms payment.</div> : <div className="payment-amount-row"><label>Amount paid<input type="number" min="0" step="0.01" value={amountPaid} onChange={(event) => { setAmountPaid(event.target.value); setAmountTouched(true); }} placeholder="0.00" /></label><div><span>Change</span><strong>{money(changeAmount)}</strong></div></div>}
      <textarea className="notes-input" placeholder="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <div className="totals"><div><span>Service subtotal</span><span>{money(effectiveCheckupFee)}</span></div><div><span>Items subtotal</span><span>{money(itemsSubtotal)}</span></div><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="grand-total"><span>Total amount due</span><span>{money(totalAmount)}</span></div></div>
      <button type="button" className="checkout-btn" disabled={submitting} onClick={handleCheckout}><Banknote size={18} />{submitting ? (isGcash ? "Preparing GCash QR…" : "Completing transaction…") : isGcash ? "Pay with GCash" : "Complete Transaction"}</button>
    </section></div>

    {successReceipt && <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Transaction complete"><div className="receipt-card"><button type="button" className="icon-btn receipt-close" onClick={() => setSuccessReceipt(null)} aria-label="Close receipt"><X size={19} /></button><h2>Transaction Complete</h2><strong className="receipt-or">{successReceipt.or_number || successReceipt.id}</strong><p className="muted">{successReceipt.pet?.pet_name || "—"} · {successReceipt.owner?.full_name || "—"}</p>{receiptRows(successReceipt).map((line) => <div className="receipt-line" key={line.id}><span>{line.item_name} × {line.quantity}</span><span>{money(line.line_total)}</span></div>)}<div className="receipt-line"><span>Subtotal</span><span>{money(successReceipt.subtotal)}</span></div>{Number(successReceipt.discount_amount) > 0 && <div className="receipt-line"><span>Discount</span><span>-{money(successReceipt.discount_amount)}</span></div>}<div className="receipt-line receipt-total"><span>Total</span><span>{money(successReceipt.total_amount)}</span></div><button type="button" className="receipt-print" onClick={() => printReceipt(successReceipt)}><Printer size={17} /> Reprint Receipt</button><p className="receipt-redirect">Redirecting to Payment Transaction History in {redirectSeconds} second{redirectSeconds === 1 ? "" : "s"}…</p></div></div>}

    {gcashModal && <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="GCash payment"><div className="gcash-modal"><div className="gcash-modal-header"><span>GCash via PayMongo</span>{gcashModal.status === "waiting" && <button type="button" className="icon-btn" onClick={closeGcashModal} aria-label="Cancel GCash payment"><X size={19} /></button>}</div>{gcashModal.status === "waiting" && <><p className="muted">Ask the customer to scan this QR code with the GCash app.</p><img src={gcashModal.qrDataUrl} alt="GCash payment QR code" className="gcash-qr" /><div className="gcash-waiting"><Loader2 size={18} className="spin" /> Waiting for payment · expires in {Math.floor(gcashModal.secondsLeft / 60)}:{String(gcashModal.secondsLeft % 60).padStart(2, "0")}</div><button type="button" className="link-btn gcash-cancel" onClick={closeGcashModal}>Cancel payment</button></>}{gcashModal.status === "expired" && <><p className="gcash-status-text err">This QR code expired before the customer paid.</p><button type="button" className="checkout-btn" onClick={closeGcashModal}>Close</button></>}{gcashModal.status === "cancelled" && <><p className="gcash-status-text err">The GCash payment was not completed.</p><button type="button" className="checkout-btn" onClick={closeGcashModal}>Close</button></>}</div></div>}

    <ConfirmDialog
      open={showLeaveConfirm}
      title="Leave this transaction?"
      description="The selected pet and cart items you've added will be discarded."
      confirmLabel="Yes, Leave"
      cancelLabel="Stay Here"
      tone="danger"
      onConfirm={() => { setShowLeaveConfirm(false); resetForm(); navigate("/staff/transactions"); }}
      onCancel={() => setShowLeaveConfirm(false)}
    />

    <style>{styles}</style>
  </div></AppShell>;
}

export default function TransactionHistoryPage({ profile }) {
  const navigate = useNavigate();

  return <AppShell profile={profile} title="Transactions"><div className="transaction-module">
    <PaymentTransactionHistory profile={profile} onNewTransaction={() => navigate("/staff/transactions/new")} />
    <style>{styles}</style>
  </div></AppShell>;
}
