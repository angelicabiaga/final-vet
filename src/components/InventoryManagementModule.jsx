import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

import {
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileDown,
  History,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import jsPDF from "jspdf";

import {
  downloadInventoryImportTemplate,
  commitInventoryImport,
  exportInventoryCsv,
  getInventoryBatches,
  getInventoryBatchCounts,
  getInventoryCategories,
  getInventoryItems,
  getInventorySummary,
  getInventoryTransactions,
  getInventoryTransactionBatch,
  getInventoryUnits,
  getInventoryForecasts,
  mergeInventoryItems,
  parseInventoryImportCsv,
  previewInventoryImport,
  recordInventoryTransaction,
  saveInventoryItem,
  setBatchActive,
  setInventoryArchived,
  summarizeForecastWithGroq,
  updateInventoryBatch,
} from "../services/inventoryService";

import { formatDateTime12h } from "../utils/timeFormat";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";
import ConfirmDialog from "./ConfirmDialog";
import InventoryForecastReport from "./InventoryForecastReport";

const EMPTY_ITEM = {
  id: "",
  item_name: "",
  category: "Vaccines",
  custom_category: "",
  sku: "",
  description: "",
  quantity: "0",
  unit: "pcs",
  unit_price: "0",
  reorder_level: "5",
  expiry_date: "",
  supplier_name: "",
  batch_number: "",
};

const EMPTY_TX = {
  itemId: "",
  transactionType: "Stock In",
  quantity: "",
  reason: "",
  notes: "",
  batchNumber: "",
  dateReceived: "",
  expiryDate: "",
  isBatchEntry: true,
};

const BATCH_CREATING_TX_TYPES = [
  "Stock In",
  "Adjustment Add",
];

const BATCH_PAGE_SIZE = 10;
const UNIT_PAGE_SIZE = 12;
const ITEMS_PAGE_SIZE = 10;

// Matches the sidebar's Inventory alert badge -- the statuses that mean a
// staff/admin member actually needs to act on this item.
const ALERT_STATUSES = ["Low Stock", "Out of Stock", "Near Expiry"];

function formatUnitId(unitNo) {
  return `UNIT-${String(unitNo).padStart(6, "0")}`;
}

const statuses = [
  "",
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Near Expiry",
  "Expired",
];

function formatDate(date) {
  if (!date) return "—";

  return new Date(
    `${date}T00:00:00`
  ).toLocaleDateString();
}

/**
 * Client-side preview of the Unique Unit ID pawcruz_generate_units_for_batch
 * will assign on the backend at save time -- same {SKU}-{BATCH}-{SEQUENCE}
 * formula (including the auto batch reference when none is entered), shown
 * read-only before saving so staff can see what will be generated. The
 * backend is authoritative: on the rare same-day collision it appends a
 * numeric suffix to the batch reference that this preview can't predict, so
 * the actual saved ID may differ slightly from the preview in that one case.
 */
function buildPreviewUnitCode(sku, batchNumber, sequence) {
  const skuPart = (sku || "").trim().toUpperCase() || "ITEM";
  const trimmedBatch = (batchNumber || "").trim();
  const batchPart = trimmedBatch
    ? trimmedBatch.toUpperCase()
    : `B${new Date().getFullYear()}${skuPart.replace(/[^A-Z0-9]/g, "")}`;

  return `${skuPart}-${batchPart}-${String(sequence).padStart(3, "0")}`;
}

function importStatusBadgeClass(status) {
  switch (status) {
    case "New Item":
    case "New Item – Imported":
      return "new-item";
    case "Existing Item – Add Stock":
    case "Existing Item – Stock Updated":
      return "stock-updated";
    case "Duplicate Item – Skipped":
    case "Duplicate Batch – Skipped":
      return "inactive";
    case "Duplicate SKU – Conflict":
    case "Invalid Row":
      return "out-of-stock";
    default:
      return "";
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// Which of an item's batches actually back its current status -- e.g. an
// item can show "Expired" overall while only 1 of its 3 batches is the one
// that's actually expired; this is what turns that into "(1 expired)"
// instead of implying the whole 3 are.
function batchCountHint(itemStatus, counts) {
  if (!counts) return null;

  if (itemStatus === "Expired" && counts.expired > 0) {
    return `${counts.expired} expired`;
  }
  if (itemStatus === "Near Expiry" && counts.nearExpiry > 0) {
    return `${counts.nearExpiry} near expiry`;
  }
  if (itemStatus === "Out of Stock" && counts.outOfStock > 0) {
    return `${counts.outOfStock} out of stock`;
  }
  if (counts.inStock > 0) {
    return `${counts.inStock} in stock`;
  }
  return null;
}

// Display-only classification for a single batch (Active / Low Stock /
// Near Expiry / Out of Stock / Expired / Inactive) -- distinct from the
// batch's stored `status` column, which only tracks Active/Expired/Depleted
// and drives which batches FEFO deduction is allowed to touch.
// "Inactive" is a separate, staff-controlled on/off switch (is_active) --
// FEFO deduction skips a deactivated batch even if it still has stock and
// hasn't expired.
function batchDisplayStatus(batch) {
  const remaining = Number(batch.quantity_remaining || 0);
  const received = Number(batch.quantity_received || 0);
  const days = daysUntil(batch.expiry_date);

  if (days !== null && days < 0) return "Expired";
  if (batch.is_active === false) return "Inactive";
  if (remaining <= 0) return "Out of Stock";
  if (days !== null && days <= 30) return "Near Expiry";
  if (received > 0 && remaining / received <= 0.2) return "Low Stock";
  return "Active";
}

// FEFO order: nearest expiration first (no-expiry batches sorted last,
// since they carry no expiry urgency), tied broken by whichever arrived
// earlier -- the same order the checkout RPC deducts from.
function sortBatchesFefo(batches) {
  return [...batches].sort((a, b) => {
    const aExpiry = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const bExpiry = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    return new Date(a.date_received || 0) - new Date(b.date_received || 0);
  });
}

const ORDINAL_LABELS = ["Next to Use", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

function ordinalLabel(rank) {
  return ORDINAL_LABELS[rank - 1] || `${rank}th`;
}

// Priority only ranks batches POS is actually allowed to deduct from
// (Expired / Out of Stock / Inactive batches are shown but never get a
// rank) -- walked in the same FEFO order already used to sort the table.
function rankBatches(fefoSortedBatches) {
  let rank = 0;
  return fefoSortedBatches.map((batch) => {
    const status = batchDisplayStatus(batch);
    const eligible = !["Expired", "Out of Stock", "Inactive"].includes(status);
    if (eligible) rank += 1;
    return { ...batch, priorityLabel: eligible ? ordinalLabel(rank) : "—" };
  });
}

function cleanAiText(text) {
  if (!text) return "";

  return String(text)
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fingerprints the numbers the AI narrative is actually based on, so
// reopening the forecast modal can skip a fresh Groq call when nothing
// about the underlying stock/usage picture has changed.
function forecastSignature(rows) {
  return (rows || [])
    .map((row) =>
      [
        row.id,
        row.quantity,
        row.stockRisk,
        row.expiryRisk,
        row.usageTrend,
        row.recommended,
        row.daysOfStock,
      ].join(":")
    )
    .sort()
    .join("|");
}

export default function InventoryManagementModule({
  profile,
}) {
  // Set by AppShell's Inventory badge link (state: { prioritizeAlerts: true })
  // so arriving from the badge surfaces the alert items first without
  // filtering anything out of view or touching any stock record.
  const location = useLocation();
  const prioritizeAlerts = Boolean(location.state?.prioritizeAlerts);
  const scrolledForAlertsRef = useRef(false);

  // Set by the Staff dashboard's "Stock Alerts" card (state: { filterAlerts: true })
  // -- unlike prioritizeAlerts (which only reorders), this actually narrows
  // the list to Low Stock/Out of Stock/Near Expiry items, as that card's
  // spec explicitly asks for a filtered view. Kept as its own state (not
  // read directly from location.state) so it can self-clear the moment the
  // staff member changes any filter themselves -- see the effect below.
  const [filterAlertsActive, setFilterAlertsActive] = useState(Boolean(location.state?.filterAlerts));
  const isFirstFiltersRender = useRef(true);

  const canManageItems = [
    "admin",
    "staff",
  ].includes(profile?.role);

  const canRecordUsage = [
    "admin",
    "staff",
    "veterinarian",
  ].includes(profile?.role);

  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [batchCounts, setBatchCounts] = useState({});

  const [summary, setSummary] = useState({
    totalItems: 0,
    totalUnits: 0,
    lowStock: 0,
    outOfStock: 0,
    expiringSoon: 0,
  });

  const [categories, setCategories] = useState([]);
  const [forecasts, setForecasts] = useState([]);

  const [
    forecastSummary,
    setForecastSummary,
  ] = useState("");

  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(false);

  const [
    summaryError,
    setSummaryError,
  ] = useState("");

  const summarySignatureRef = useRef("");
  const listSectionRef = useRef(null);

  const [filters, setFilters] = useState({
    search: "",
    category: "",
    status: "",
    includeArchived: false,
  });

  // The Stock Alerts card's filter is a one-time starting point, not a
  // sticky mode -- the instant the staff member changes search, category,
  // status, or the quick-filter stat cards (all of which go through
  // setFilters), it gets out of their way rather than silently hiding
  // items that no longer match "alerts" but do match what they just asked for.
  useEffect(() => {
    if (isFirstFiltersRender.current) {
      isFirstFiltersRender.current = false;
      return;
    }
    setFilterAlertsActive(false);
  }, [filters]);

  const [itemForm, setItemForm] =
    useState(EMPTY_ITEM);
  const [itemFieldErrors, setItemFieldErrors] = useState({});
  const itemFieldRefs = useRef({}).current;
  const registerItemFieldRef = (name) => (el) => { itemFieldRefs[name] = el; };

  const [txForm, setTxForm] =
    useState(EMPTY_TX);

  const [modal, setModal] =
    useState("");

  const [
    selectedItem,
    setSelectedItem,
  ] = useState(null);

  const unitIdPreview = useMemo(() => {
    if (!BATCH_CREATING_TX_TYPES.includes(txForm.transactionType)) return [];

    const count = txForm.isBatchEntry
      ? Math.max(0, Math.floor(Number(txForm.quantity) || 0))
      : 1;

    if (!count) return [];

    return Array.from({ length: count }, (_, index) =>
      buildPreviewUnitCode(selectedItem?.sku, txForm.batchNumber, index + 1)
    );
  }, [
    txForm.transactionType,
    txForm.isBatchEntry,
    txForm.quantity,
    txForm.batchNumber,
    selectedItem?.sku,
  ]);

  const [batchRows, setBatchRows] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState("");

  const [editingBatchId, setEditingBatchId] = useState("");
  const [batchEditForm, setBatchEditForm] = useState({
    batchNumber: "",
    dateReceived: "",
    expiryDate: "",
  });
  const [mergingId, setMergingId] = useState("");
  const [togglingBatchId, setTogglingBatchId] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [showArchivedBatches, setShowArchivedBatches] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);

  const [viewingUnitsBatch, setViewingUnitsBatch] = useState(null);
  const [unitRows, setUnitRows] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState("");
  const [unitPage, setUnitPage] = useState(1);

  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importing, setImporting] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [notice, setNotice] = useState({
    type: "",
    text: "",
  });

  const [pendingArchive, setPendingArchive] =
    useState(null);

  const [stockChoiceItem, setStockChoiceItem] =
    useState(null);

  const [unitModalOpen, setUnitModalOpen] =
    useState(false);

  const [archiving, setArchiving] =
    useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    setNotice({
      type: "",
      text: "",
    });

    try {
      const [
        itemRows,
        txRows,
        totals,
        categoryRows,
        batchCountRows,
      ] = await Promise.all([
        getInventoryItems(filters),
        getInventoryTransactions("", 80),
        getInventorySummary(),
        getInventoryCategories(),
        getInventoryBatchCounts(),
      ]);

      setItems(itemRows);
      setTransactions(txRows);
      setSummary(totals);
      setCategories(categoryRows);
      setBatchCounts(batchCountRows);
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setItemsPage(1);
  }, [filters]);

  // Neither path ever mutates `items` or writes anything back to the
  // database -- both are display-only. filterAlertsActive (Staff dashboard's
  // Stock Alerts card) actually narrows the list to alert-status items;
  // prioritizeAlerts (the sidebar Inventory badge) only reorders, keeping
  // every item visible.
  const displayItems = useMemo(() => {
    let result = items;
    if (filterAlertsActive) {
      result = result.filter((item) => ALERT_STATUSES.includes(item.status));
    }
    if (prioritizeAlerts) {
      const alerts = [];
      const rest = [];
      result.forEach((item) => {
        (ALERT_STATUSES.includes(item.status) ? alerts : rest).push(item);
      });
      result = [...alerts, ...rest];
    }
    return result;
  }, [items, prioritizeAlerts, filterAlertsActive]);

  const itemsTotalPages = Math.max(1, Math.ceil(displayItems.length / ITEMS_PAGE_SIZE));
  const itemsCurrentPage = Math.min(itemsPage, itemsTotalPages);
  const pagedItems = displayItems.slice(
    (itemsCurrentPage - 1) * ITEMS_PAGE_SIZE,
    itemsCurrentPage * ITEMS_PAGE_SIZE
  );

  // Scrolls to the item list once, the first time the alert-narrowed or
  // alert-prioritized list finishes loading after arriving from the badge
  // or the Stock Alerts card -- not on every subsequent refresh/filter change.
  useEffect(() => {
    if ((!prioritizeAlerts && !filterAlertsActive) || loading || scrolledForAlertsRef.current) return;
    scrolledForAlertsRef.current = true;
    listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prioritizeAlerts, filterAlertsActive, loading]);

  const transactionRows = useMemo(() => {
    if (!selectedItem) {
      return transactions;
    }

    return transactions.filter(
      (row) =>
        row.item_id === selectedItem.id
    );
  }, [transactions, selectedItem]);

  function openNewItem() {
    setItemForm(EMPTY_ITEM);
    setItemFieldErrors({});
    setModal("item");
  }

  // Turns the summary cards into filter shortcuts: "Total Units" isn't a
  // status bucket, so it (like the total-items card) just clears the filter
  // back to "show everything".
  function handleStatFilter(status) {
    setFilters((current) => ({ ...current, status }));
    listSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // Only relevant while creating a brand-new item (editing an existing one
  // always matches itself). Case-insensitive, exact-name match against
  // active items -- catches the "restocked through Add Item instead of
  // Stock" mistake that silently forks a duplicate inventory_items row.
  const duplicateMatch = useMemo(() => {
    if (itemForm.id) return null;
    const name = itemForm.item_name.trim().toLowerCase();
    if (!name) return null;
    return (
      items.find(
        (item) =>
          !item.is_archived &&
          item.item_name.trim().toLowerCase() === name
      ) || null
    );
  }, [items, itemForm.id, itemForm.item_name]);

  // Other items sharing the currently-open item's exact name -- including
  // already-archived duplicates, so an old deactivated row can still be
  // folded into the active one -- surfaced inside the item details modal so
  // staff can merge them away instead of leaving the product split across
  // rows. Only offered while viewing the active item: merging always
  // archives the source and leaves the target's own archived flag alone, so
  // merging into an already-archived target would just hide the combined
  // stock instead of resolving the duplicate.
  const duplicatesOfSelected = useMemo(() => {
    if (!selectedItem || selectedItem.is_archived) return [];
    const name = selectedItem.item_name.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.id !== selectedItem.id &&
        item.item_name.trim().toLowerCase() === name
    );
  }, [items, selectedItem]);

  // When viewing an archived item that has an active twin, point staff at
  // the active one instead of offering a merge here -- merging always
  // archives the source and never un-archives the target, so merging into
  // this (already-archived) item would just hide the combined stock again.
  const activeTwinOfArchivedSelected = useMemo(() => {
    if (!selectedItem || !selectedItem.is_archived) return null;
    const name = selectedItem.item_name.trim().toLowerCase();
    return (
      items.find(
        (item) =>
          item.id !== selectedItem.id &&
          !item.is_archived &&
          item.item_name.trim().toLowerCase() === name
      ) || null
    );
  }, [items, selectedItem]);

  const visibleBatchRows = useMemo(
    () =>
      showArchivedBatches
        ? batchRows.filter((batch) => batch.is_active === false)
        : batchRows.filter((batch) => batch.is_active !== false),
    [batchRows, showArchivedBatches]
  );

  const sortedBatchRows = useMemo(
    () => sortBatchesFefo(visibleBatchRows),
    [visibleBatchRows]
  );

  const rankedBatchRows = useMemo(
    () => rankBatches(sortedBatchRows),
    [sortedBatchRows]
  );


  // Always-visible mini summary above Batch Records -- same three buckets
  // as the page-level stat cards, scoped to just this item's batches, shown
  // even at 0 so it's clearly present whether or not anything needs
  // attention (a conditional banner that vanishes when nothing's wrong
  // reads as "missing" rather than "all clear").
  const batchAlerts = useMemo(() => {
    const lowStock = rankedBatchRows.filter(
      (batch) => batchDisplayStatus(batch) === "Low Stock"
    );
    const outOfStock = rankedBatchRows.filter(
      (batch) => batchDisplayStatus(batch) === "Out of Stock"
    );
    const nearExpiry = rankedBatchRows.filter(
      (batch) => batchDisplayStatus(batch) === "Near Expiry"
    );
    return { lowStock, outOfStock, nearExpiry };
  }, [rankedBatchRows]);

  const batchTotalPages = Math.max(
    1,
    Math.ceil(rankedBatchRows.length / BATCH_PAGE_SIZE)
  );
  const batchCurrentPage = Math.min(batchPage, batchTotalPages);
  const paginatedBatchRows = useMemo(
    () =>
      rankedBatchRows.slice(
        (batchCurrentPage - 1) * BATCH_PAGE_SIZE,
        batchCurrentPage * BATCH_PAGE_SIZE
      ),
    [rankedBatchRows, batchCurrentPage]
  );

  const unitsTotalPages = Math.max(
    1,
    Math.ceil(unitRows.length / UNIT_PAGE_SIZE)
  );
  const unitsCurrentPage = Math.min(unitPage, unitsTotalPages);
  const paginatedUnitRows = useMemo(
    () =>
      unitRows.slice(
        (unitsCurrentPage - 1) * UNIT_PAGE_SIZE,
        unitsCurrentPage * UNIT_PAGE_SIZE
      ),
    [unitRows, unitsCurrentPage]
  );

  function resetImportState() {
    setImportFileName("");
    setImportPreview(null);
    setImportPreviewLoading(false);
    setImportResults(null);
  }

  function openImportModal() {
    resetImportState();
    setModal("import");
  }

  function closeImportModal() {
    setModal("");
    resetImportState();
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportFileName(file.name);
    setImportResults(null);
    setImportPreviewLoading(true);

    const reader = new FileReader();

    reader.onload = async () => {
      const parsed = parseInventoryImportCsv(String(reader.result || ""));

      if (!parsed.items.length) {
        setImportPreview(parsed);
        setImportPreviewLoading(false);
        return;
      }

      try {
        const items = await previewInventoryImport(parsed.items);
        setImportPreview({ items, errors: parsed.errors });
      } catch (previewError) {
        setImportPreview({
          items: [],
          errors: [previewError.message || "Unable to check the file against current inventory."],
        });
      } finally {
        setImportPreviewLoading(false);
      }
    };

    reader.onerror = () => {
      setImportPreview({
        items: [],
        errors: ["Unable to read the selected file."],
      });
      setImportPreviewLoading(false);
    };

    reader.readAsText(file);
  }

  async function runImport() {
    const rows = importPreview?.items || [];
    if (!rows.length) return;

    setImporting(true);

    try {
      const outcome = await commitInventoryImport(rows, profile);
      setImportResults(outcome);

      const { summary } = outcome;
      if (summary.new_items > 0 || summary.updated_items > 0) {
        setNotice({
          type: "success",
          text: `${summary.new_items} new item(s) created, ${summary.updated_items} existing item(s) updated.`,
        });

        await load();
      }
    } catch (error) {
      setImportResults({
        results: [],
        summary: { new_items: 0, updated_items: 0, skipped: 0, invalid: rows.length },
        error: error.message || "Unable to import inventory items.",
      });
    } finally {
      setImporting(false);
    }
  }

  function openEdit(item) {
    setItemForm({
      ...item,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      reorder_level: String(item.reorder_level),
      expiry_date: item.expiry_date || "",
    });
    setItemFieldErrors({});

    setModal("item");
  }

  function openTransaction(
    item,
    type = "Stock In",
    isBatchEntry = true
  ) {
    setSelectedItem(item);

    setTxForm({
      ...EMPTY_TX,
      itemId: item.id,
      transactionType: type,
      isBatchEntry,
      quantity: isBatchEntry ? "" : "1",
    });

    setUnitModalOpen(false);

    setModal("transaction");
  }

  function openStockChoice(item) {
    setStockChoiceItem(item);
  }

  function chooseStockEntry(isBatchEntry) {
    const item = stockChoiceItem;
    setStockChoiceItem(null);
    openTransaction(item, "Stock In", isBatchEntry);
  }

  function openUnitPreviewModal() {
    if (!unitIdPreview.length) {
      setNotice({
        type: "error",
        text: "Enter a valid quantity to preview unit IDs.",
      });
      return;
    }

    setUnitModalOpen(true);
  }

  function openHistory(item = null) {
    setSelectedItem(item);
    setModal("history");
  }

  async function openBatches(item) {
    setSelectedItem(item);
    setModal("batches");
    setBatchesError("");
    setEditingBatchId("");
    setBatchPage(1);
    setShowArchivedBatches(false);
    setBatchesLoading(true);

    try {
      setBatchRows(await getInventoryBatches(item.id));
    } catch (error) {
      setBatchesError(error.message);
    } finally {
      setBatchesLoading(false);
    }
  }

  async function refreshBatches(item) {
    setBatchesError("");
    setBatchesLoading(true);

    try {
      setBatchRows(await getInventoryBatches(item.id));
    } catch (error) {
      setBatchesError(error.message);
    } finally {
      setBatchesLoading(false);
    }
  }

  async function handleMergeDuplicate(duplicate) {
    if (!selectedItem || mergingId) return;
    setMergingId(duplicate.id);

    try {
      await mergeInventoryItems(duplicate.id, selectedItem.id, profile);
      setNotice({
        type: "success",
        text: `Merged "${duplicate.item_name}" into this item.`,
      });
      await refreshBatches(selectedItem);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setMergingId("");
    }
  }

  function startEditBatch(batch) {
    setEditingBatchId(batch.id);
    setBatchEditForm({
      batchNumber: batch.batch_number || "",
      dateReceived: batch.date_received || "",
      expiryDate: batch.expiry_date || "",
    });
  }

  async function handleToggleBatchActive(batch) {
    if (togglingBatchId) return;
    setTogglingBatchId(batch.id);

    try {
      await setBatchActive(batch.id, batch.is_active === false);
      setNotice({
        type: "success",
        text: `Batch ${batch.batch_number || "—"} marked ${
          batch.is_active === false ? "Active" : "Inactive"
        }.`,
      });
      await refreshBatches(selectedItem);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setTogglingBatchId("");
    }
  }

  async function submitBatchEdit(event, batchId) {
    event.preventDefault();
    setSaving(true);

    try {
      await updateInventoryBatch(batchId, {
        batchNumber: batchEditForm.batchNumber,
        dateReceived: batchEditForm.dateReceived,
        expiryDate: batchEditForm.expiryDate,
      });
      setEditingBatchId("");
      setNotice({ type: "success", text: "Batch updated." });
      await refreshBatches(selectedItem);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function openUnits(batch) {
    setViewingUnitsBatch(batch);
    setUnitsError("");
    setUnitPage(1);
    setUnitsLoading(true);

    try {
      setUnitRows(await getInventoryUnits(batch.id));
    } catch (error) {
      setUnitsError(error.message);
    } finally {
      setUnitsLoading(false);
    }
  }

  async function openForecasts() {
    try {
      setSaving(true);

      const rows =
        await getInventoryForecasts(
          items.filter(
            (item) => !item.is_archived
          )
        );

      setForecasts(rows);
      setModal("forecast");

      // Only call the AI service when there's no cached narrative yet or the
      // underlying stock/usage numbers actually moved since it was generated,
      // so reopening the modal to glance at it doesn't burn Groq's rate limit.
      const signature = forecastSignature(rows);

      if (
        !forecastSummary ||
        signature !== summarySignatureRef.current
      ) {
        generateForecastSummary(rows, signature);
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function generateForecastSummary(
    rows,
    signature = forecastSignature(rows)
  ) {
    setSummaryLoading(true);
    setSummaryError("");
    setForecastSummary("");

    try {
      const text =
        await summarizeForecastWithGroq(
          rows
        );

      setForecastSummary(
        cleanAiText(text)
      );

      summarySignatureRef.current = signature;
    } catch (error) {
      setSummaryError(error.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  function downloadSummaryPdf() {
    if (!forecastSummary) {
      setSummaryError(
        "Generate the AI inventory analysis first before downloading the PDF."
      );
      return;
    }

    try {
      setSummaryError("");

      const cleanSummary = cleanAiText(forecastSummary);

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const leftMargin = 20;
      const rightMargin = 20;
      const topMargin = 20;
      const bottomMargin = 20;

      const contentWidth =
        pageWidth - leftMargin - rightMargin;

      const PRIMARY = [62, 143, 190];
      const DARK = [35, 50, 58];
      const MUTED = [100, 112, 118];
      const LINE = [214, 228, 235];
      const LIGHT = [242, 249, 252];

      let y = topMargin;

      const headings = [
        "INVENTORY CONDITION",
        "USAGE AND DEMAND ANALYSIS",
        "RESTOCK PRIORITIES",
        "EXPIRY AND STOCK RISK",
        "RECOMMENDED ACTIONS",
      ];

      function sanitizePdfText(value) {
        if (!value) return "";

        return String(value)
          .normalize("NFKC")
          .replace(/\u00A0/g, " ")
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/\u2018|\u2019/g, "'")
          .replace(/\u201C|\u201D/g, '"')
          .replace(/\u2013|\u2014/g, "-")
          .replace(/\t/g, " ")
          .replace(/[ ]{2,}/g, " ")
          .trim();
      }

      function applyBodyFont() {
        pdf.setFont("times", "normal");
        pdf.setFontSize(10.5);
        pdf.setCharSpace(0);
        pdf.setTextColor(...DARK);
      }

      function drawPageHeader() {
        pdf.setFillColor(...PRIMARY);

        pdf.rect(
          0,
          0,
          pageWidth,
          7,
          "F"
        );

        pdf.setFont("times", "bold");
        pdf.setFontSize(10);
        pdf.setCharSpace(0);
        pdf.setTextColor(...MUTED);

        pdf.text(
          "PAWCRUZ VETERINARY MANAGEMENT SYSTEM",
          leftMargin,
          14
        );

        pdf.setDrawColor(...LINE);
        pdf.setLineWidth(0.3);

        pdf.line(
          leftMargin,
          17,
          pageWidth - rightMargin,
          17
        );
      }

      function drawPageFooter() {
        const currentPage =
          pdf.internal.getCurrentPageInfo().pageNumber;

        pdf.setDrawColor(...LINE);
        pdf.setLineWidth(0.25);

        pdf.line(
          leftMargin,
          pageHeight - 14,
          pageWidth - rightMargin,
          pageHeight - 14
        );

        pdf.setFont("times", "normal");
        pdf.setFontSize(8);
        pdf.setCharSpace(0);
        pdf.setTextColor(...MUTED);

        pdf.text(
          "AI Inventory Analysis Report",
          leftMargin,
          pageHeight - 9
        );

        pdf.text(
          `Page ${currentPage}`,
          pageWidth - rightMargin,
          pageHeight - 9,
          {
            align: "right",
          }
        );
      }

      function addNewPage() {
        drawPageFooter();

        pdf.addPage();

        drawPageHeader();

        y = 27;

        applyBodyFont();
      }

      function ensureSpace(requiredHeight = 8) {
        if (
          y + requiredHeight >
          pageHeight - bottomMargin
        ) {
          addNewPage();
        }
      }

      function writeWrappedText(
        text,
        {
          fontSize = 10.5,
          fontStyle = "normal",
          lineHeight = 5.4,
          spaceAfter = 4,
          indent = 0,
        } = {}
      ) {
        const safeText =
          sanitizePdfText(text);

        if (!safeText) {
          y += spaceAfter;
          return;
        }

        pdf.setFont(
          "times",
          fontStyle
        );

        pdf.setFontSize(fontSize);
        pdf.setCharSpace(0);
        pdf.setTextColor(...DARK);

        const lines =
          pdf.splitTextToSize(
            safeText,
            contentWidth - indent
          );

        for (const rawLine of lines) {
          const line =
            sanitizePdfText(rawLine);

          if (!line) continue;

          ensureSpace(
            lineHeight + 1
          );

          pdf.setCharSpace(0);

          pdf.text(
            line,
            leftMargin + indent,
            y,
            {
              align: "left",
            }
          );

          y += lineHeight;
        }

        y += spaceAfter;
      }

      function writeSectionHeading(
        heading
      ) {
        ensureSpace(18);

        y += 3;

        pdf.setFillColor(...LIGHT);

        pdf.roundedRect(
          leftMargin,
          y - 5,
          contentWidth,
          11,
          2,
          2,
          "F"
        );

        pdf.setFillColor(...PRIMARY);

        pdf.rect(
          leftMargin,
          y - 5,
          2.5,
          11,
          "F"
        );

        pdf.setFont("times", "bold");
        pdf.setFontSize(11);
        pdf.setCharSpace(0);
        pdf.setTextColor(...DARK);

        pdf.text(
          heading,
          leftMargin + 6,
          y + 1.7
        );

        y += 12;

        applyBodyFont();
      }

      function writeNumberedAction(
        number,
        action
      ) {
        ensureSpace(10);

        const safeAction =
          sanitizePdfText(action);

        pdf.setFillColor(...PRIMARY);

        pdf.circle(
          leftMargin + 2.5,
          y - 1,
          2.5,
          "F"
        );

        pdf.setFont("times", "bold");
        pdf.setFontSize(8);
        pdf.setCharSpace(0);
        pdf.setTextColor(255, 255, 255);

        pdf.text(
          String(number),
          leftMargin + 2.5,
          y - 0.2,
          {
            align: "center",
          }
        );

        pdf.setFont("times", "normal");
        pdf.setFontSize(10.5);
        pdf.setCharSpace(0);
        pdf.setTextColor(...DARK);

        const actionLines =
          pdf.splitTextToSize(
            safeAction,
            contentWidth - 10
          );

        for (const rawLine of actionLines) {
          const line =
            sanitizePdfText(rawLine);

          ensureSpace(5.4);

          pdf.setCharSpace(0);

          pdf.text(
            line,
            leftMargin + 9,
            y
          );

          y += 5.4;
        }

        y += 3;
      }

      drawPageHeader();

      y = 28;

      pdf.setFont("times", "bold");
      pdf.setFontSize(22);
      pdf.setCharSpace(0);
      pdf.setTextColor(...DARK);

      pdf.text(
        "PawCruz",
        leftMargin,
        y
      );

      y += 9;

      pdf.setFontSize(17);
      pdf.setTextColor(...PRIMARY);

      pdf.text(
        "AI Inventory Analysis",
        leftMargin,
        y
      );

      y += 7;

      pdf.setFont("times", "normal");
      pdf.setFontSize(9);
      pdf.setCharSpace(0);
      pdf.setTextColor(...MUTED);

      const generatedDate = formatDateTime12h(new Date(), {
        month: "long",
      });

      pdf.text(
        `Generated on ${generatedDate}`,
        leftMargin,
        y
      );

      y += 7;

      pdf.setFillColor(...LIGHT);

      pdf.roundedRect(
        leftMargin,
        y,
        contentWidth,
        17,
        2,
        2,
        "F"
      );

      pdf.setFont("times", "bold");
      pdf.setFontSize(9);
      pdf.setCharSpace(0);
      pdf.setTextColor(...PRIMARY);

      pdf.text(
        "REPORT PURPOSE",
        leftMargin + 5,
        y + 6
      );

      pdf.setFont("times", "normal");
      pdf.setFontSize(8.7);
      pdf.setTextColor(...DARK);

      pdf.text(
        "AI-assisted review of inventory condition, usage trends, stock risk, and restocking needs.",
        leftMargin + 5,
        y + 12
      );

      y += 25;

      applyBodyFont();

      const paragraphs =
        cleanSummary
          .split("\n")
          .map((line) =>
            sanitizePdfText(line)
          );

      for (
        let index = 0;
        index < paragraphs.length;
        index++
      ) {
        const paragraph =
          paragraphs[index];

        if (!paragraph) {
          y += 2;
          continue;
        }

        const upper =
          paragraph.toUpperCase();

        if (
          headings.includes(upper)
        ) {
          writeSectionHeading(
            upper
          );

          continue;
        }

        const numberedAction =
          paragraph.match(
            /^(\d+)\.\s*(.+)$/
          );

        if (numberedAction) {
          writeNumberedAction(
            numberedAction[1],
            numberedAction[2]
          );

          continue;
        }

        const isDisclaimer =
          paragraph
            .toLowerCase()
            .startsWith(
              "ai inventory analysis is based"
            );

        if (isDisclaimer) {
          ensureSpace(22);

          y += 4;

          pdf.setFillColor(
            248,
            248,
            248
          );

          pdf.roundedRect(
            leftMargin,
            y - 2,
            contentWidth,
            16,
            2,
            2,
            "F"
          );

          pdf.setFont(
            "times",
            "italic"
          );

          pdf.setFontSize(8.8);
          pdf.setCharSpace(0);
          pdf.setTextColor(
            ...MUTED
          );

          const disclaimerLines =
            pdf.splitTextToSize(
              paragraph,
              contentWidth - 10
            );

          let disclaimerY =
            y + 4;

          disclaimerLines.forEach(
            (line) => {
              pdf.text(
                sanitizePdfText(
                  line
                ),
                leftMargin + 5,
                disclaimerY
              );

              disclaimerY += 4;
            }
          );

          y =
            disclaimerY + 4;

          applyBodyFont();

          continue;
        }

        writeWrappedText(
          paragraph
        );
      }

      drawPageFooter();

      const totalPages =
        pdf.internal.getNumberOfPages();

      for (
        let page = 1;
        page <= totalPages;
        page++
      ) {
        pdf.setPage(page);

        pdf.setFont(
          "times",
          "normal"
        );

        pdf.setFontSize(7.5);
        pdf.setCharSpace(0);
        pdf.setTextColor(...MUTED);

        pdf.text(
          "Confidential Clinic Inventory Report",
          pageWidth / 2,
          pageHeight - 9,
          {
            align: "center",
          }
        );
      }

      const fileDate =
        new Date()
          .toISOString()
          .slice(0, 10);

      pdf.save(
        `PawCruz-AI-Inventory-Analysis-${fileDate}.pdf`
      );
    } catch (error) {
      console.error(
        "PDF generation error:",
        error
      );

      setSummaryError(
        "Unable to generate the PDF. Please try again."
      );
    }
  }

  async function submitItem(
    event
  ) {
    event.preventDefault();

    if (duplicateMatch) {
      setNotice({
        type: "error",
        text: `"${duplicateMatch.item_name}" already exists. Use "Add Stock to Existing Item" instead of creating a duplicate.`,
      });
      return;
    }

    const fieldsToCheck = ["item_name", "sku", "category", "unit"];
    const errors = {};
    const allFieldRefs = {};

    fieldsToCheck.forEach((name) => {
      const errorMessage = validateItemField(name, itemForm[name], itemForm);
      if (!errorMessage) return;
      errors[name] = errorMessage;
      const refTarget = name === "category" && itemForm.category === "Others" ? itemFieldRefs.custom_category : itemFieldRefs[name];
      if (refTarget) allFieldRefs[name] = refTarget;
    });

    setItemFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setNotice({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(allFieldRefs, errors);
      return;
    }

    setSaving(true);

    try {
      await saveInventoryItem(
        {
          ...itemForm,
          category:
            itemForm.category === "Others"
              ? itemForm.custom_category?.trim()
              : itemForm.category,
        },
        profile
      );

      setModal("");

      setNotice({
        type: "success",
        text: itemForm.id
          ? "Inventory item updated."
          : "Inventory item created.",
      });

      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitTransaction(
    event
  ) {
    event.preventDefault();

    const createsBatch = BATCH_CREATING_TX_TYPES.includes(
      txForm.transactionType
    );

    setSaving(true);

    try {
      const transactionId = await recordInventoryTransaction(
        txForm,
        profile
      );

      setModal("");

      setNotice({
        type: "success",
        text: createsBatch
          ? "Stock transaction recorded successfully. Unique Unit IDs were generated automatically."
          : "Stock transaction recorded successfully.",
      });

      await load();

      // Unit IDs are assigned by the backend as part of the transaction
      // above -- show the real, saved (read-only) codes for this batch now,
      // via the same Individual Units viewer used elsewhere.
      if (createsBatch) {
        const batch = await getInventoryTransactionBatch(transactionId);
        if (batch) await openUnits(batch);
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleArchive(
    item
  ) {
    setPendingArchive(item);
  }

  async function confirmToggleArchive() {
    if (!pendingArchive) return;

    const item = pendingArchive;

    setArchiving(true);

    try {
      await setInventoryArchived(
        item.id,
        !item.is_archived
      );

      setNotice({
        type: "success",
        text: item.is_archived
          ? "Item restored."
          : "Item deactivated.",
      });

      setPendingArchive(null);

      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="inventory-module">
      {notice.text && (
        <div
          className={`notice ${notice.type}`}
        >
          <span>{notice.text}</span>

          <button
            type="button"
            onClick={() =>
              setNotice({
                type: "",
                text: "",
              })
            }
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="stats">
        <Stat
          icon={<Boxes />}
          label="Inventory Items"
          value={summary.totalItems}
          active={!filters.status}
          onClick={() => handleStatFilter("")}
        />

        <Stat
          icon={<PackagePlus />}
          label="Total Units"
          value={summary.totalUnits}
          active={!filters.status}
          onClick={() => handleStatFilter("")}
        />

        <Stat
          icon={
            <TriangleAlert />
          }
          label="Low Stock"
          value={summary.lowStock}
          active={filters.status === "Low Stock"}
          onClick={() => handleStatFilter("Low Stock")}
        />

        <Stat
          icon={
            <TriangleAlert />
          }
          label="Out of Stock"
          value={
            summary.outOfStock
          }
          active={filters.status === "Out of Stock"}
          onClick={() => handleStatFilter("Out of Stock")}
        />

        <Stat
          icon={<History />}
          label="Expiring in 30 Days"
          value={
            summary.expiringSoon
          }
          active={filters.status === "Near Expiry"}
          onClick={() => handleStatFilter("Near Expiry")}
        />
      </div>

      <div className="toolbar card">
        <div className="search">
          <Search size={18} />

          <input
            value={filters.search}
            placeholder="Search item, SKU, supplier, or batch"
            onChange={(e) =>
              setFilters({
                ...filters,
                search:
                  e.target.value,
              })
            }
          />
        </div>

        <select
          value={
            filters.category
          }
          onChange={(e) =>
            setFilters({
              ...filters,
              category:
                e.target.value,
            })
          }
        >
          <option value="">
            All categories
          </option>

          {categories.map(
            (category) => (
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            )
          )}
        </select>

        <select
          value={filters.status}
          onChange={(e) =>
            setFilters({
              ...filters,
              status:
                e.target.value,
            })
          }
        >
          {statuses.map(
            (status) => (
              <option
                key={status}
                value={status}
              >
                {status ||
                  "All statuses"}
              </option>
            )
          )}
        </select>

        {canManageItems && (
          <label className="check">
            <input
              type="checkbox"
              checked={
                filters.includeArchived
              }
              onChange={(e) =>
                setFilters({
                  ...filters,
                  includeArchived:
                    e.target
                      .checked,
                })
              }
            />

            Deactivated
          </label>
        )}

        <button
          type="button"
          className="secondary"
          onClick={load}
        >
          <RefreshCw size={17} />
          Refresh
        </button>

        <button
          type="button"
          className="secondary"
          onClick={() =>
            exportInventoryCsv(
              items
            )
          }
        >
          <Download size={17} />
          CSV
        </button>

        <button
          type="button"
          className="secondary"
          onClick={
            openForecasts
          }
          disabled={saving}
        >
          <TriangleAlert
            size={17}
          />

          {saving
            ? "Loading..."
            : "Forecast"}
        </button>

        {canManageItems && (
          <button
            type="button"
            className="secondary"
            onClick={
              openImportModal
            }
          >
            <Upload
              size={17}
            />

            Import
          </button>
        )}

        {canManageItems && (
          <button
            type="button"
            className="primary"
            onClick={
              openNewItem
            }
          >
            <PackagePlus
              size={17}
            />

            Add Item
          </button>
        )}
      </div>

      <div className="card table-card" ref={listSectionRef}>
        {filterAlertsActive && (
          <div className="alert-filter-banner">
            <TriangleAlert size={16} />
            <span>Showing only Low Stock, Out of Stock, and Near Expiry items.</span>
            <button type="button" onClick={() => setFilterAlertsActive(false)}>
              Show all items
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty">
            Loading inventory…
          </div>
        ) : displayItems.length ===
          0 ? (
          <div className="empty">
            {filterAlertsActive
              ? "No low-stock, out-of-stock, or near-expiry items right now."
              : "No inventory items match the selected filters."}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {pagedItems.map(
                  (item) => (
                    <tr
                      key={item.id}
                      className={
                        item.is_archived
                          ? "archived"
                          : ""
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="item-name-link"
                          onClick={() => openBatches(item)}
                          title="View batch records"
                        >
                          {item.item_name}
                        </button>

                        <small>
                          {item.sku}

                          {item.batch_number
                            ? ` • Nearest batch ${item.batch_number}`
                            : ""}
                        </small>
                      </td>

                      <td>
                        {
                          item.category
                        }

                        <small>
                          {item.supplier_name ||
                            "No supplier"}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {
                            item.quantity
                          }{" "}
                          {
                            item.unit
                          }
                        </strong>

                        <small>
                          Reorder at{" "}
                          {
                            item.reorder_level
                          }
                        </small>
                      </td>

                      <td>
                        {money(
                          item.unit_price
                        )}
                      </td>

                      <td>
                        <span
                          className={`badge ${String(
                            item.status ||
                              ""
                          )
                            .toLowerCase()
                            .replaceAll(
                              " ",
                              "-"
                            )}`}
                        >
                          {item.status}
                        </span>
                        {(() => {
                          const hint = batchCountHint(
                            item.status,
                            batchCounts[item.id]
                          );
                          return (
                            hint && (
                              <span className="batch-count-hint">
                                ({hint})
                              </span>
                            )
                          );
                        })()}
                      </td>

                      <td>
                        <div className="actions">
                          {canManageItems && (
                            <button
                              type="button"
                              title="Edit"
                              onClick={() =>
                                openEdit(
                                  item
                                )
                              }
                            >
                              <Edit3
                                size={
                                  16
                                }
                              />
                            </button>
                          )}

                          {canRecordUsage &&
                            !item.is_archived && (
                              <button
                                type="button"
                                onClick={() =>
                                  profile?.role ===
                                  "veterinarian"
                                    ? openTransaction(
                                        item,
                                        "Medicine Usage"
                                      )
                                    : openStockChoice(
                                        item
                                      )
                                }
                              >
                                {profile?.role ===
                                "veterinarian"
                                  ? "Use"
                                  : "Stock"}
                              </button>
                            )}

                          <button
                            type="button"
                            title="Batch records"
                            onClick={() =>
                              openBatches(
                                item
                              )
                            }
                          >
                            <Boxes
                              size={
                                16
                              }
                            />
                          </button>

                          <button
                            type="button"
                            title="History"
                            onClick={() =>
                              openHistory(
                                item
                              )
                            }
                          >
                            <History
                              size={
                                16
                              }
                            />
                          </button>

                          {canManageItems && (
                            <button
                              type="button"
                              title={
                                item.is_archived
                                  ? "Restore"
                                  : "Deactivate"
                              }
                              onClick={() =>
                                toggleArchive(
                                  item
                                )
                              }
                            >
                              {item.is_archived ? (
                                <Undo2
                                  size={
                                    16
                                  }
                                />
                              ) : (
                                <Archive
                                  size={
                                    16
                                  }
                                />
                              )}
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 && itemsTotalPages > 1 && (
          <div className="batch-pagination">
            <button
              type="button"
              className="page-nav"
              aria-label="Previous page"
              disabled={itemsCurrentPage === 1}
              onClick={() => setItemsPage(itemsCurrentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>

            <div className="batch-pagination-pages">
              {Array.from({ length: itemsTotalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={pageNumber === itemsCurrentPage ? "active" : ""}
                    onClick={() => setItemsPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              className="page-nav"
              aria-label="Next page"
              disabled={itemsCurrentPage === itemsTotalPages}
              onClick={() => setItemsPage(itemsCurrentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {modal === "item" && (
        <Modal
          title={
            itemForm.id
              ? "Edit Inventory Item"
              : "Add Inventory Item"
          }
          close={() =>
            setModal("")
          }
        >
          <form
            className="form-grid"
            onSubmit={
              submitItem
            }
          >
            <Field label="Item Name" required error={itemFieldErrors.item_name}>
              <input
                ref={registerItemFieldRef("item_name")}
                className={invalidClass(itemFieldErrors, "item_name")}
                value={
                  itemForm.item_name
                }
                required
                onChange={(e) => {
                  setItemForm({
                    ...itemForm,
                    item_name:
                      e.target
                        .value,
                  });
                  if (itemFieldErrors.item_name && e.target.value.trim()) {
                    setItemFieldErrors((current) => ({ ...current, item_name: "" }));
                  }
                }}
              />
            </Field>

            {itemForm.id && (
              <div className="wide field-lock-note">
                Only the item name can be edited here. The other details are
                locked to keep stock and batch records accurate — use Stock
                to record incoming/outgoing quantity or Batch Records to
                update pricing, expiry, or batch details.
              </div>
            )}

            {duplicateMatch && (
              <div className="wide duplicate-item-warning">
                <span>
                  "{duplicateMatch.item_name}" already exists (
                  {duplicateMatch.quantity} {duplicateMatch.unit} in stock).
                  Add this as a new batch instead of a duplicate item.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setModal("");
                    openTransaction(duplicateMatch, "Stock In");
                  }}
                >
                  Add Stock to Existing Item
                </button>
              </div>
            )}

            <Field label="Item Code (SKU)" required error={itemFieldErrors.sku}>
              <input
                ref={registerItemFieldRef("sku")}
                className={invalidClass(itemFieldErrors, "sku")}
                value={
                  itemForm.sku
                }
                required
                disabled={!!itemForm.id}
                placeholder="Example: VAC-001"
                onChange={(e) => {
                  setItemForm({
                    ...itemForm,
                    sku:
                      e.target
                        .value,
                  });
                  if (itemFieldErrors.sku && e.target.value.trim()) {
                    setItemFieldErrors((current) => ({ ...current, sku: "" }));
                  }
                }}
              />
            </Field>

            <Field label="Product Category" required error={itemForm.category !== "Others" ? itemFieldErrors.category : ""}>
              <select
                ref={registerItemFieldRef("category")}
                className={invalidClass(itemFieldErrors, "category")}
                value={itemForm.category}
                required
                disabled={!!itemForm.id}
                onChange={(e) => {
                  setItemForm({
                    ...itemForm,
                    category: e.target.value,
                    custom_category:
                      e.target.value === "Others"
                        ? itemForm.custom_category || ""
                        : "",
                  });
                  if (itemFieldErrors.category && e.target.value && e.target.value !== "Others") {
                    setItemFieldErrors((current) => ({ ...current, category: "" }));
                  }
                }}
              >
                <option value="">Select product category</option>
                <option value="Vaccines">Vaccines</option>
                <option value="Test Kits">Test Kits</option>
                <option value="Antibiotics">Antibiotics</option>
                <option value="Supplements">Supplements</option>
                <option value="Food Supplements">Food Supplements</option>
                <option value="Anti Parasite">Anti Parasite</option>
                <option value="Anti Inflammatory">Anti Inflammatory</option>
                <option value="Eye Drops">Eye Drops</option>
                <option value="Ear Drops">Ear Drops</option>
                <option value="Others">Others</option>
              </select>

              {itemForm.category === "Others" && (
                <input
                  ref={registerItemFieldRef("custom_category")}
                  className={invalidClass(itemFieldErrors, "category")}
                  value={itemForm.custom_category || ""}
                  placeholder="Type category"
                  required
                  disabled={!!itemForm.id}
                  onChange={(e) => {
                    setItemForm({
                      ...itemForm,
                      custom_category: e.target.value,
                    });
                    if (itemFieldErrors.category && e.target.value.trim()) {
                      setItemFieldErrors((current) => ({ ...current, category: "" }));
                    }
                  }}
                />
              )}
              {itemForm.category === "Others" && itemFieldErrors.category && (
                <span className="field-error-text">{itemFieldErrors.category}</span>
              )}
            </Field>

            <Field label="Unit of Measure" required error={itemFieldErrors.unit}>
              <input
                ref={registerItemFieldRef("unit")}
                className={invalidClass(itemFieldErrors, "unit")}
                value={
                  itemForm.unit
                }
                placeholder="Example: pcs, vial, bottle, box, tablet, kg"
                required
                disabled={!!itemForm.id}
                onChange={(e) => {
                  setItemForm({
                    ...itemForm,
                    unit:
                      e.target
                        .value,
                  });
                  if (itemFieldErrors.unit && e.target.value.trim()) {
                    setItemFieldErrors((current) => ({ ...current, unit: "" }));
                  }
                }}
              />
            </Field>

            {!itemForm.id && (
              <Field label="Current Stock Quantity" optional>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    itemForm.quantity
                  }
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      quantity: e.target.value.replace(/[^\d]/g, ""),
                    })
                  }
                />
              </Field>
            )}

            <Field label="Price per Unit (₱)" optional>
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  itemForm.unit_price
                }
                disabled={!!itemForm.id}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    unit_price:
                      e.target
                        .value,
                  })
                }
              />
            </Field>

            <Field label="Low-Stock Alert Level" optional>
              <input
                type="number"
                min="0"
                step="1"
                value={
                  itemForm.reorder_level
                }
                disabled={!!itemForm.id}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    reorder_level: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
              />
            </Field>

            <Field label="Supplier Name" optional>
              <input
                value={
                  itemForm.supplier_name
                }
                placeholder="Example: ABC Veterinary Supply"
                disabled={!!itemForm.id}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    supplier_name:
                      e.target
                        .value,
                  })
                }
              />
            </Field>

            <Field
              label="Description / Notes"
              wide
            >
              <textarea
                value={
                  itemForm.description
                }
                placeholder="Example: 100 mg tablet, store below 25°C, special pricing notes..."
                disabled={!!itemForm.id}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    description:
                      e.target
                        .value,
                  })
                }
              />
            </Field>

            <div className="form-actions wide">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setModal("")
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : "Save Item"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "import" && (
        <Modal
          title="Import Inventory Items"
          close={closeImportModal}
          large
        >
          <div className="import-panel">
            <p className="forecast-note">
              Upload a CSV file to add multiple items at once. Each
              row needs at least Item Name, SKU, Category, Unit, and
              Expiry Date — the same fields required when adding an
              item manually. Any starting quantity in the file is
              recorded as an initial Stock In transaction.
            </p>

            <div className="import-toolbar">
              <button
                type="button"
                className="secondary"
                onClick={downloadInventoryImportTemplate}
              >
                <FileDown size={16} />
                Download CSV Template
              </button>

              <label className="file-input">
                <Upload size={16} />
                {importFileName || "Choose CSV file…"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFile}
                />
              </label>
            </div>

            {importPreview?.errors?.length > 0 && (
              <div className="notice error">
                <span>{importPreview.errors[0]}</span>
              </div>
            )}

            {importPreviewLoading && (
              <div className="notice">
                <span>Checking this file against current inventory…</span>
              </div>
            )}

            {!importPreviewLoading &&
              importPreview?.items?.length > 0 &&
              !importResults && (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Category</th>
                          <th>Qty</th>
                          <th>Expiry Date</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {importPreview.items
                          .slice(0, 25)
                          .map((row) => (
                            <tr key={row._row}>
                              <td>{row._row}</td>
                              <td>
                                {row.item_name || (
                                  <em>Missing</em>
                                )}
                              </td>
                              <td>
                                {row.sku || <em>Missing</em>}
                              </td>
                              <td>
                                {row.category || (
                                  <em>Missing</em>
                                )}
                              </td>
                              <td>{row.quantity}</td>
                              <td>
                                {row.expiry_date || (
                                  <em>Missing</em>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`badge ${importStatusBadgeClass(row.status)}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td>{row.statusMessage || "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {importPreview.items.length > 25 && (
                    <small>
                      …and{" "}
                      {importPreview.items.length - 25} more
                      row(s) not shown.
                    </small>
                  )}

                  <p className="forecast-note">
                    New Item rows create a new inventory item. Existing
                    Item rows only add a new stock batch — item details
                    are never overwritten. Duplicate and Invalid rows are
                    skipped automatically; nothing is imported twice.
                  </p>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={closeImportModal}
                      disabled={importing}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="primary"
                      onClick={runImport}
                      disabled={importing}
                    >
                      {importing
                        ? "Importing…"
                        : `Import ${importPreview.items.length} Item${
                            importPreview.items.length === 1
                              ? ""
                              : "s"
                          }`}
                    </button>
                  </div>
                </>
              )}

            {importResults && (
              <div className="import-results">
                {importResults.error ? (
                  <div className="notice error">
                    <span>{importResults.error}</span>
                  </div>
                ) : (
                  <div
                    className={`notice ${
                      importResults.summary.invalid > 0 ||
                      importResults.summary.skipped > 0
                        ? "error"
                        : "success"
                    }`}
                  >
                    <span>
                      {importResults.summary.new_items} new item(s)
                      created, {importResults.summary.updated_items}{" "}
                      existing item(s) updated,{" "}
                      {importResults.summary.skipped} duplicate row(s)
                      skipped, {importResults.summary.invalid} invalid
                      row(s) rejected.
                    </span>
                  </div>
                )}

                {importResults.results?.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Item</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {importResults.results.map((result) => (
                          <tr key={result.row}>
                            <td>{result.row}</td>
                            <td>
                              {result.item_name || "—"}
                            </td>
                            <td>
                              <span
                                className={`badge ${importStatusBadgeClass(result.status)}`}
                              >
                                {result.status}
                              </span>
                            </td>
                            <td>{result.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={resetImportState}
                  >
                    Import Another File
                  </button>

                  <button
                    type="button"
                    className="primary"
                    onClick={closeImportModal}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {stockChoiceItem && (
        <Modal
          title={`Add Stock: ${stockChoiceItem.item_name}`}
          close={() => setStockChoiceItem(null)}
        >
          <div className="stock-choice-grid">
            <button
              type="button"
              className="stock-choice-option"
              onClick={() => chooseStockEntry(false)}
            >
              <strong>Add Single Item</strong>
              <span>
                Quick stock-in without batch tracking. Expiry date is
                still required.
              </span>
            </button>

            <button
              type="button"
              className="stock-choice-option"
              onClick={() => chooseStockEntry(true)}
            >
              <strong>Add Batch</strong>
              <span>
                Track this stock-in as its own batch, with a batch
                number and date received.
              </span>
            </button>
          </div>
        </Modal>
      )}

      {unitModalOpen && (
        <Modal
          title={`Unique Unit IDs (${unitIdPreview.length})`}
          close={() => setUnitModalOpen(false)}
          large
          elevated
        >
          <p className="forecast-note">
            Automatically generated by the system. These IDs cannot be
            edited and the final values are assigned when you save this
            transaction.
          </p>

          <div className="table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Unique Unit ID (preview)</th>
                </tr>
              </thead>
              <tbody>
                {unitIdPreview.map((code, index) => (
                  <tr key={code}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        readOnly
                        tabIndex={-1}
                        aria-readonly="true"
                        autoComplete="off"
                        className="readonly-field"
                        value={code}
                        onPaste={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="primary"
              onClick={() => setUnitModalOpen(false)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {modal ===
        "transaction" && (
        <Modal
          title={`${
            txForm.transactionType
          }: ${
            selectedItem?.item_name ||
            "Inventory Item"
          }`}
          close={() =>
            setModal("")
          }
        >
          <form
            className="form-grid"
            onSubmit={
              submitTransaction
            }
          >
            <Field label="Transaction type">
              <select
                value={
                  txForm.transactionType
                }
                onChange={(e) =>
                  setTxForm({
                    ...txForm,
                    transactionType:
                      e.target
                        .value,
                  })
                }
              >
                {profile?.role !==
                  "veterinarian" && (
                  <>
                    <option value="Stock In">
                      Stock In
                    </option>

                    <option value="Stock Out">
                      Stock Out
                    </option>

                    <option value="Adjustment Add">
                      Adjustment Add
                    </option>

                    <option value="Adjustment Deduct">
                      Adjustment Deduct
                    </option>

                    <option value="Expired">
                      Expired
                    </option>

                    <option value="Damaged">
                      Damaged
                    </option>
                  </>
                )}

                <option value="Medicine Usage">
                  Medicine Usage
                </option>
              </select>
            </Field>

            {!(
              BATCH_CREATING_TX_TYPES.includes(txForm.transactionType) &&
              !txForm.isBatchEntry
            ) && (
              <Field
                label={`Quantity (${
                  selectedItem?.unit ||
                  "unit"
                })`}
                required
              >
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={
                    txForm.quantity
                  }
                  onChange={(e) => {
                    setTxForm({
                      ...txForm,
                      quantity: e.target.value.replace(/[^\d]/g, ""),
                    });
                  }}
                />
              </Field>
            )}

            {BATCH_CREATING_TX_TYPES.includes(
              txForm.transactionType
            ) && (
              <>
                {txForm.isBatchEntry && (
                  <Field label="Batch/Lot Number" optional>
                    <input
                      value={
                        txForm.batchNumber
                      }
                      placeholder="e.g. B-2026-01"
                      onChange={(e) =>
                        setTxForm({
                          ...txForm,
                          batchNumber:
                            e.target
                              .value,
                        })
                      }
                    />
                  </Field>
                )}

                <Field label="Date Received" optional>
                  <input
                    type="date"
                    value={
                      txForm.dateReceived
                    }
                    onChange={(e) =>
                      setTxForm({
                        ...txForm,
                        dateReceived:
                          e.target
                            .value,
                      })
                    }
                  />
                </Field>

                <Field label="Expiry Date" required>
                  <input
                    type="date"
                    required
                    value={
                      txForm.expiryDate
                    }
                    onChange={(e) =>
                      setTxForm({
                        ...txForm,
                        expiryDate:
                          e.target
                            .value,
                      })
                    }
                  />
                </Field>

                {txForm.isBatchEntry ? (
                  <div className="wide unit-entry-row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={openUnitPreviewModal}
                    >
                      Preview Unit IDs
                    </button>
                    {unitIdPreview.length > 0 && (
                      <span className="unit-entry-status">
                        {unitIdPreview.length} unique unit ID(s) will be
                        generated automatically
                      </span>
                    )}
                  </div>
                ) : (
                  <Field label="Unique Unit ID" wide>
                    <input
                      readOnly
                      tabIndex={-1}
                      aria-readonly="true"
                      autoComplete="off"
                      className="readonly-field"
                      value={unitIdPreview[0] || ""}
                      onPaste={(e) => e.preventDefault()}
                      onCut={(e) => e.preventDefault()}
                    />
                    <small className="readonly-hint">
                      Automatically generated by the system
                    </small>
                  </Field>
                )}
              </>
            )}

            <Field
              label="Notes"
              wide
            >
              <textarea
                value={
                  txForm.notes
                }
                onChange={(e) =>
                  setTxForm({
                    ...txForm,
                    notes:
                      e.target
                        .value,
                  })
                }
              />
            </Field>

            <div className="form-actions wide">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setModal("")
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? "Recording…"
                  : "Record Transaction"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "history" && (
        <Modal
          title={
            selectedItem
              ? `History: ${selectedItem.item_name}`
              : "Inventory Transaction History"
          }
          close={() =>
            setModal("")
          }
          large
        >
          <div className="history-list">
            {transactionRows.length ===
            0 ? (
              <div className="empty">
                No transactions
                recorded.
              </div>
            ) : (
              transactionRows.map(
                (tx) => (
                  <div
                    className="history-row"
                    key={tx.id}
                  >
                    <div>
                      <strong>
                        {
                          tx.transaction_type
                        }
                      </strong>

                      <span>
                        {tx.item
                          ?.item_name ||
                          "Inventory item"}{" "}
                        •{" "}
                        {formatDateTime12h(tx.created_at)}
                      </span>

                      <small>
                        {tx.reason ||
                          "No reason"}

                        {tx.notes
                          ? ` — ${tx.notes}`
                          : ""}
                      </small>
                    </div>

                    <div
                      className={
                        Number(
                          tx.quantity_after
                        ) >=
                        Number(
                          tx.quantity_before
                        )
                          ? "plus"
                          : "minus"
                      }
                    >
                      <strong>
                        {
                          tx.quantity_before
                        }{" "}
                        →{" "}
                        {
                          tx.quantity_after
                        }
                      </strong>

                      <small>
                        {
                          tx.quantity
                        }{" "}
                        {tx.item
                          ?.unit || ""}
                      </small>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </Modal>
      )}

      {modal === "batches" && selectedItem && (
        <Modal
          title={`Batch Records: ${selectedItem.item_name}`}
          close={() => setModal("")}
          large
        >
          {batchesError && (
            <div className="notice error">{batchesError}</div>
          )}

          {activeTwinOfArchivedSelected && (
            <div className="duplicate-item-warning wide">
              <span>
                This item is deactivated. Open the active "
                {activeTwinOfArchivedSelected.item_name}" item's batch
                records instead to merge this one into it.
              </span>
            </div>
          )}

          {duplicatesOfSelected.length > 0 && (
            <div className="duplicate-item-warning wide">
              <span>
                {duplicatesOfSelected.length} other item(s) share this
                exact name — merge them into this one so stock isn't
                split across rows.
              </span>
            </div>
          )}

          {duplicatesOfSelected.map((duplicate) => (
            <div className="duplicate-merge-row" key={duplicate.id}>
              <span>
                {duplicate.sku} · {duplicate.category} ·{" "}
                {duplicate.quantity} {duplicate.unit} in stock
              </span>
              <button
                type="button"
                disabled={mergingId === duplicate.id}
                onClick={() => handleMergeDuplicate(duplicate)}
              >
                {mergingId === duplicate.id
                  ? "Merging…"
                  : "Merge into this item"}
              </button>
            </div>
          ))}

          <label className="check batch-archived-toggle">
            <input
              type="checkbox"
              checked={showArchivedBatches}
              onChange={(e) => {
                setShowArchivedBatches(e.target.checked);
                setBatchPage(1);
              }}
            />
            Archived (
            {batchRows.filter((batch) => batch.is_active === false).length})
          </label>

          <div className="batch-mini-stats">
                <div className="batch-mini-stat">
                  <TriangleAlert size={16} />
                  <div>
                    <b>{batchAlerts.lowStock.length}</b>
                    <span>Low Stock</span>
                  </div>
                </div>
                <div className="batch-mini-stat">
                  <TriangleAlert size={16} />
                  <div>
                    <b>{batchAlerts.outOfStock.length}</b>
                    <span>Out of Stock</span>
                  </div>
                </div>
                <div className="batch-mini-stat">
                  <History size={16} />
                  <div>
                    <b>{batchAlerts.nearExpiry.length}</b>
                    <span>Near Expiry</span>
                  </div>
                </div>
              </div>

              {batchesLoading ? (
                <div className="empty">Loading batch records…</div>
              ) : rankedBatchRows.length === 0 ? (
                <div className="empty">
                  No batches recorded for this item yet. Use the Stock
                  button on this item to add the first one.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="batch-table">
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th>Batch Number</th>
                        <th>Date Received</th>
                        <th>Expiration</th>
                        <th>Original Qty</th>
                        <th>Remaining</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBatchRows.map((batch) => {
                        const displayStatus = batchDisplayStatus(batch);
                        const isEditing = editingBatchId === batch.id;

                        if (isEditing) {
                          return (
                            <tr key={batch.id}>
                              <td colSpan="8">
                                <form
                                  className="batch-edit-form"
                                  onSubmit={(event) => submitBatchEdit(event, batch.id)}
                                >
                                  <Field label="Batch Number" optional>
                                    <input
                                      value={batchEditForm.batchNumber}
                                      onChange={(event) =>
                                        setBatchEditForm((current) => ({
                                          ...current,
                                          batchNumber: event.target.value,
                                        }))
                                      }
                                    />
                                  </Field>
                                  <Field label="Date Received" required>
                                    <input
                                      type="date"
                                      required
                                      value={batchEditForm.dateReceived}
                                      onChange={(event) =>
                                        setBatchEditForm((current) => ({
                                          ...current,
                                          dateReceived: event.target.value,
                                        }))
                                      }
                                    />
                                  </Field>
                                  <Field label="Expiration Date" optional>
                                    <input
                                      type="date"
                                      value={batchEditForm.expiryDate}
                                      onChange={(event) =>
                                        setBatchEditForm((current) => ({
                                          ...current,
                                          expiryDate: event.target.value,
                                        }))
                                      }
                                    />
                                  </Field>
                                  <div className="batch-edit-actions">
                                    <button
                                      type="button"
                                      onClick={() => setEditingBatchId("")}
                                    >
                                      Cancel
                                    </button>
                                    <button type="submit" disabled={saving}>
                                      {saving ? "Saving…" : "Save"}
                                    </button>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={batch.id}>
                            <td>
                              <span
                                className={
                                  batch.priorityLabel === "Next to Use"
                                    ? "fifo-next-badge"
                                    : ""
                                }
                              >
                                {batch.priorityLabel}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="batch-number-link"
                                onClick={() => openUnits(batch)}
                                title="View this batch's individual unit records"
                              >
                                {batch.batch_number || "—"}
                              </button>
                            </td>
                            <td>{formatDate(batch.date_received)}</td>
                            <td>{formatDate(batch.expiry_date)}</td>
                            <td>{batch.quantity_received}</td>
                            <td>{batch.quantity_remaining}</td>
                            <td>
                              <span
                                className={`badge ${displayStatus
                                  .toLowerCase()
                                  .replaceAll(" ", "-")}`}
                              >
                                {displayStatus}
                              </span>
                            </td>
                            <td>
                              <div className="batch-row-actions">
                                <button
                                  type="button"
                                  onClick={() => openUnits(batch)}
                                >
                                  View Units
                                </button>
                                {canManageItems && (
                                  <button
                                    type="button"
                                    onClick={() => startEditBatch(batch)}
                                  >
                                    Edit
                                  </button>
                                )}
                                {canManageItems && (
                                  <button
                                    type="button"
                                    className={batch.is_active === false ? "batch-activate-btn" : "batch-deactivate-btn"}
                                    disabled={togglingBatchId === batch.id}
                                    onClick={() => handleToggleBatchActive(batch)}
                                  >
                                    {togglingBatchId === batch.id
                                      ? "Saving…"
                                      : batch.is_active === false
                                      ? "Restore"
                                      : "Archive"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!batchesLoading && batchTotalPages > 1 && (
                <div className="batch-pagination">
                  <button
                    type="button"
                    className="page-nav"
                    aria-label="Previous page"
                    disabled={batchCurrentPage === 1}
                    onClick={() => setBatchPage(batchCurrentPage - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="batch-pagination-pages">
                    {Array.from({ length: batchTotalPages }, (_, index) => index + 1).map(
                      (pageNumber) => (
                        <button
                          key={pageNumber}
                          type="button"
                          className={pageNumber === batchCurrentPage ? "active" : ""}
                          onClick={() => setBatchPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    className="page-nav"
                    aria-label="Next page"
                    disabled={batchCurrentPage === batchTotalPages}
                    onClick={() => setBatchPage(batchCurrentPage + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

          <div className="modal-footer-actions">
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setModal("")}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {viewingUnitsBatch && (
        <Modal
          title={`Individual Units: Batch ${viewingUnitsBatch.batch_number || "—"}`}
          close={() => setViewingUnitsBatch(null)}
          large
        >
          {unitsError && <div className="notice error">{unitsError}</div>}

          {!unitsLoading && unitRows.length > 0 && (
            <div className="batch-total-row">
              <span>Total unit records in this batch</span>
              <strong>{unitRows.length}</strong>
            </div>
          )}

          {unitsLoading ? (
            <div className="empty">Loading unit records…</div>
          ) : unitRows.length === 0 ? (
            <div className="empty">No individual unit records for this batch yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>Unique Unit ID</th>
                    <th>Batch Number</th>
                    <th>Expiration Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUnitRows.map((unit) => (
                    <tr key={unit.id}>
                      <td>{unit.unit_code || formatUnitId(unit.unit_no)}</td>
                      <td>{viewingUnitsBatch.batch_number || "—"}</td>
                      <td>{formatDate(viewingUnitsBatch.expiry_date)}</td>
                      <td>
                        <span
                          className={`badge ${unit.status.toLowerCase()}`}
                        >
                          {unit.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!unitsLoading && unitsTotalPages > 1 && (
            <div className="batch-pagination">
              <button
                type="button"
                className="page-nav"
                aria-label="Previous page"
                disabled={unitsCurrentPage === 1}
                onClick={() => setUnitPage(unitsCurrentPage - 1)}
              >
                <ChevronLeft size={16} />
              </button>

              <div className="batch-pagination-pages">
                {Array.from({ length: unitsTotalPages }, (_, index) => index + 1).map(
                  (pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={pageNumber === unitsCurrentPage ? "active" : ""}
                      onClick={() => setUnitPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                className="page-nav"
                aria-label="Next page"
                disabled={unitsCurrentPage === unitsTotalPages}
                onClick={() => setUnitPage(unitsCurrentPage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <div className="modal-footer-actions">
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setViewingUnitsBatch(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {modal === "forecast" && (
        <Modal
          title="30-Day Demand Forecast and Restock Estimates"
          close={() =>
            setModal("")
          }
          large
        >
          <p className="forecast-note">
            These figures are
            estimates based on
            stock-out and
            medicine-usage
            transactions from the
            past 90 days. They do
            not perform automatic
            procurement.
          </p>

          <div className="ai-summary">
            <div className="ai-summary-head">
              <Sparkles
                size={17}
              />

              <div className="ai-title">
                <strong>
                  AI Inventory
                  Analysis
                </strong>

                <small>
                  Inventory
                  condition, usage,
                  demand and
                  restock analysis
                </small>
              </div>

              <div className="ai-summary-actions">
                <button
                  type="button"
                  className="ai-action-btn"
                  onClick={() =>
                    generateForecastSummary(
                      forecasts
                    )
                  }
                  disabled={
                    summaryLoading
                  }
                >
                  <RefreshCw
                    size={14}
                  />

                  {summaryLoading
                    ? "Generating…"
                    : "Regenerate"}
                </button>

                <button
                  type="button"
                  className="download-pdf-btn"
                  onClick={
                    downloadSummaryPdf
                  }
                  disabled={
                    summaryLoading ||
                    !forecastSummary
                  }
                >
                  <FileDown
                    size={15}
                  />

                  Download PDF
                </button>
              </div>
            </div>

            {summaryLoading && (
              <div className="ai-loading">
                <div className="ai-loader" />

                <div>
                  <strong>
                    Analyzing
                    inventory
                  </strong>

                  <p>
                    Reviewing
                    current stock,
                    historical
                    usage, demand
                    trends and
                    restock needs…
                  </p>
                </div>
              </div>
            )}

            {!summaryLoading &&
              summaryError && (
                <p className="ai-summary-text error">
                  {summaryError}
                </p>
              )}

            {!summaryLoading &&
              !summaryError &&
              forecastSummary && (
                <InventoryForecastReport
                  forecasts={forecasts}
                  summaryText={forecastSummary}
                />
              )}

            {!summaryLoading &&
              !summaryError &&
              !forecastSummary && (
                <p className="ai-summary-text muted">
                  Generate the AI
                  analysis to
                  review the
                  clinic's
                  inventory
                  condition.
                </p>
              )}
          </div>

          <div className="forecast-table-title">
            <div>
              <h3>
                Forecast Details
              </h3>

              <p>
                Computed from
                recorded inventory
                transactions
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>
                    Current Stock
                  </th>
                  <th>
                    Used in 90 Days
                  </th>
                  <th>
                    Estimated
                    30-Day Demand
                  </th>
                  <th>
                    Suggested
                    Restock
                  </th>
                </tr>
              </thead>

              <tbody>
                {forecasts.map(
                  (row) => (
                    <tr
                      key={row.id}
                    >
                      <td>
                        <strong>
                          {
                            row.item_name
                          }
                        </strong>

                        <small>
                          {row.sku}
                        </small>
                      </td>

                      <td>
                        {row.quantity}{" "}
                        {row.unit}
                      </td>

                      <td>
                        {row.used90}{" "}
                        {row.unit}
                      </td>

                      <td>
                        {
                          row.estimated30
                        }{" "}
                        {row.unit}
                      </td>

                      <td>
                        <strong>
                          {
                            row.recommended
                          }{" "}
                          {row.unit}
                        </strong>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      <style>{`
        .inventory-module {
          display: grid;
          gap: 18px;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
        }

        .stat {
          background: #fff;
          border: 2px solid transparent;
          border-radius: 16px;
          padding: 17px;
          box-shadow: 0 7px 22px rgba(47,117,150,.08);
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          font: inherit;
          cursor: pointer;
          width: 100%;
        }

        .stat:hover {
          box-shadow: 0 9px 26px rgba(47,117,150,.14);
        }

        .stat.active {
          border-color: #318fbe;
        }

        .stat svg {
          color: #318fbe;
        }

        .stat b {
          display: block;
          font-size: 23px;
        }

        .stat span {
          color: #6f7f88;
          font-size: 12px;
        }

        .toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .search {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 1;
          min-width: 230px;
          border: 1px solid #cfe4ec;
          border-radius: 10px;
          padding: 0 10px;
        }

        .search input {
          border: 0;
          outline: 0;
          width: 100%;
          padding: 10px 0;
        }

        .toolbar select,
        .form-grid input,
        .form-grid select,
        .form-grid textarea {
          border: 1px solid #cfe4ec;
          border-radius: 10px;
          padding: 10px;
          background: #fff;
          color: #20313b;
        }

        .check {
          font-size: 13px;
          color: #526b77;
        }

        .primary,
        .secondary,
        .actions button {
          border: 0;
          border-radius: 10px;
          padding: 10px 13px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .primary {
          background: #4da8da;
          color: #fff;
        }

        .secondary {
          background: #eaf7fb;
          color: #297da8;
        }

        button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .table-card {
          padding: 0;
          overflow: hidden;
        }

        .table-wrap {
          overflow: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 930px;
        }

        th,
        td {
          text-align: left;
          padding: 14px;
          border-bottom: 1px solid #e9f2f6;
          font-size: 13px;
        }

        th {
          background: #f5fbfd;
          color: #526b77;
        }

        td small {
          display: block;
          color: #7b8e97;
          margin-top: 4px;
        }

        .badge {
          padding: 5px 9px;
          border-radius: 99px;
          background: #e9f7ee;
          color: #2e7b4d;
          font-size: 11px;
          font-weight: 700;
        }

        .badge.low-stock,
        .badge.near-expiry {
          background: #fff5dc;
          color: #a06c00;
        }

        .badge.out-of-stock,
        .badge.expired {
          background: #ffebeb;
          color: #b84646;
        }

        .badge.used,
        .badge.sold {
          background: #eaf1fb;
          color: #2c5ab5;
        }

        .badge.inactive {
          background: #eef1f4;
          color: #5b6b76;
        }

        .badge.new-item {
          background: #e6f7ee;
          color: #1f8550;
        }

        .badge.stock-updated {
          background: #eaf1fb;
          color: #2c5ab5;
        }

        .actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .actions button {
          padding: 7px 9px;
          background: #eaf7fb;
          color: #287ca5;
        }

        .archived {
          opacity: .55;
        }

        .notice {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          border-radius: 11px;
        }

        .notice.success {
          background: #e9f7ee;
          color: #2b7448;
        }

        .notice.error {
          background: #ffeded;
          color: #a74141;
        }

        .notice button {
          border: 0;
          background: transparent;
          cursor: pointer;
        }

        .alert-filter-banner {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 15px;
          margin-bottom: 14px;
          border-radius: 11px;
          background: #fff6e0;
          color: #9a7000;
          font-size: 14px;
          font-weight: 600;
        }

        .alert-filter-banner span {
          flex: 1;
        }

        .alert-filter-banner button {
          flex-shrink: 0;
          border: 1px solid #e7cf94;
          background: #fff;
          color: #9a7000;
          border-radius: 8px;
          padding: 7px 11px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .alert-filter-banner button:hover {
          background: #fffaf0;
        }

        .empty {
          text-align: center;
          padding: 35px;
          color: #71838d;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(28,50,61,.45);
          display: grid;
          place-items: center;
          z-index: 100;
          padding: 18px;
        }

        .modal-backdrop.elevated {
          z-index: 200;
        }

        .modal-card {
          background: #fff;
          border-radius: 18px;
          width: min(760px, 100%);
          max-height: 90vh;
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal-card.large {
          width: min(1000px, 100%);
        }

        .modal-head {
          flex-shrink: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .modal-head h2 {
          margin: 0;
          color: #20313b;
        }

        .modal-head button {
          border: 0;
          background: #edf7fb;
          padding: 7px;
          border-radius: 9px;
          cursor: pointer;
        }

        .modal-body {
          overflow-y: auto;
          min-height: 0;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .field label {
          font-size: 12px;
          font-weight: 700;
          color: #536b76;
        }

        .wide {
          grid-column: 1 / -1;
        }

        .duplicate-item-warning {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 14px;
          border-radius: 12px;
          background: #fff8ee;
          border: 1px solid #e4d3ba;
          color: #8a6414;
          font-size: 13px;
        }

        .batch-count-hint {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: #7c8c94;
        }

        .unit-entry-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .unit-entry-status {
          font-size: 13px;
          color: #64798a;
        }

        .batch-archived-toggle {
          display: flex !important;
          grid-template-columns: auto 1fr !important;
          align-items: center;
          gap: 8px;
          font-weight: 600 !important;
          margin-bottom: 14px;
        }

        .batch-archived-toggle input {
          width: auto;
        }

        .readonly-field {
          background: #eceff1;
          color: #2e4750;
          cursor: not-allowed;
        }

        .readonly-hint {
          display: block;
          margin-top: 6px;
          font-size: 12.5px;
          color: #7c8f99;
          font-style: italic;
        }

        .field-lock-note {
          padding: 12px 14px;
          border-radius: 12px;
          background: #eef5f9;
          border: 1px solid #cfe4ed;
          color: #45606c;
          font-size: 13px;
          line-height: 1.5;
        }

        .stock-choice-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .stock-choice-option {
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: left;
          border: 1px solid #cfe4ed;
          border-radius: 14px;
          padding: 16px;
          background: #fbfeff;
          cursor: pointer;
        }

        .stock-choice-option:hover {
          border-color: #318fbe;
          background: #f2fafd;
        }

        .stock-choice-option strong {
          color: #20313b;
          font-size: 15px;
        }

        .stock-choice-option span {
          color: #64798a;
          font-size: 13px;
          line-height: 1.45;
        }

        @media (max-width: 560px) {
          .stock-choice-grid {
            grid-template-columns: 1fr;
          }
        }

        .duplicate-item-warning button {
          flex-shrink: 0;
          border: 0;
          border-radius: 9px;
          padding: 9px 13px;
          font-size: 12.5px;
          font-weight: 700;
          color: #fff;
          background: #b0620a;
          cursor: pointer;
          white-space: nowrap;
        }

        .form-grid textarea {
          min-height: 90px;
          resize: vertical;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .forecast-note {
          background: #fff7e2;
          color: #85620b;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.5;
          margin: 0 0 12px;
        }

        .import-panel {
          display: grid;
          gap: 16px;
        }

        .import-toolbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .file-input {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          border: 1px dashed #b9d8e4;
          border-radius: 9px;
          background: #f5fbfd;
          color: #297da8;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .file-input input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .import-results {
          display: grid;
          gap: 14px;
        }

        .ai-summary {
          background: #f5fbfd;
          border: 1px solid #d6eaf2;
          border-radius: 16px;
          padding: 16px;
          margin: 12px 0 18px;
        }

        .ai-summary-head {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #297da8;
          padding-bottom: 14px;
          border-bottom: 1px solid #deedf3;
        }

        .ai-title {
          display: grid;
          gap: 2px;
        }

        .ai-title strong {
          font-size: 14px;
        }

        .ai-title small {
          color: #748993;
          font-size: 11px;
          font-weight: 400;
        }

        .ai-summary-actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .ai-action-btn,
        .download-pdf-btn {
          border: 0;
          border-radius: 9px;
          padding: 8px 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .ai-action-btn {
          color: #297da8;
          background: #e4f3f9;
        }

        .download-pdf-btn {
          color: #fff;
          background: #4da8da;
        }

        .ai-summary-text {
          margin-top: 14px;
          font-size: 13.5px;
          line-height: 1.7;
          color: #2d3f47;
          white-space: pre-line;
          font-family: Arial, Helvetica, sans-serif;
        }

        .ai-summary-text.muted {
          color: #7b8e97;
          font-style: italic;
        }

        .ai-summary-text.error {
          color: #a74141;
        }

        .ai-loading {
          padding: 18px 4px 4px;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .ai-loading strong {
          font-size: 13px;
          color: #365563;
        }

        .ai-loading p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #7a8d96;
        }

        .ai-loader {
          width: 24px;
          height: 24px;
          border: 3px solid #d8ebf3;
          border-top-color: #4da8da;
          border-radius: 50%;
          animation: ai-spin .8s linear infinite;
          flex-shrink: 0;
        }

        @keyframes ai-spin {
          to {
            transform: rotate(360deg);
          }
        }

        .forecast-table-title {
          margin-bottom: 10px;
        }

        .forecast-table-title h3 {
          margin: 0;
          color: #2b414c;
          font-size: 15px;
        }

        .forecast-table-title p {
          margin: 3px 0 0;
          color: #81929a;
          font-size: 11px;
        }

        .history-list {
          display: grid;
          gap: 10px;
        }

        .history-row {
          display: flex;
          justify-content: space-between;
          border: 1px solid #e1eef3;
          border-radius: 12px;
          padding: 13px;
          gap: 15px;
        }

        .history-row span,
        .history-row small {
          display: block;
          color: #70838c;
          font-size: 12px;
          margin-top: 3px;
        }

        .history-row > div:last-child {
          text-align: right;
        }

        .plus {
          color: #2f8150;
        }

        .minus {
          color: #ba4d4d;
        }

        .item-name-link {
          border: 0;
          background: none;
          padding: 0;
          font-weight: 700;
          color: #21697f;
          cursor: pointer;
          text-align: left;
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color .15s ease;
        }

        .item-name-link:hover {
          text-decoration-color: #21697f;
        }

        .batch-number-link {
          border: 0;
          background: none;
          padding: 0;
          font: inherit;
          font-weight: 700;
          color: #21697f;
          cursor: pointer;
          text-align: left;
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color .15s ease;
        }

        .batch-number-link:hover {
          text-decoration-color: #21697f;
        }

        .batch-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          margin-bottom: 12px;
          border-radius: 12px;
          background: #f5fbfd;
          border: 1px solid #e1eef3;
          color: #536b78;
          font-size: 13px;
          font-weight: 700;
        }

        .batch-total-row strong {
          color: #21697f;
          font-size: 17px;
        }

        .fifo-next-badge {
          display: inline-block;
          width: max-content;
          margin-top: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          background: #eafaf0;
          color: #227a52;
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .3px;
        }

        .details-tabs {
          position: relative;
          display: flex;
          margin-bottom: 18px;
          padding: 4px;
          border-radius: 12px;
          background: #eaf3f7;
        }

        .details-tabs-slider {
          position: absolute;
          top: 4px;
          bottom: 4px;
          border-radius: 9px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(33, 105, 127, .18);
          transition: left .22s ease;
        }

        .details-tab {
          position: relative;
          z-index: 1;
          flex: 1;
          border: 0;
          background: none;
          padding: 10px 8px;
          font-size: 13.5px;
          font-weight: 800;
          color: #627985;
          cursor: pointer;
          border-radius: 9px;
          white-space: nowrap;
        }

        .details-tab.active {
          color: #21697f;
        }

        .batch-table td .fifo-next-badge {
          margin-top: 0;
        }


        @media (max-width: 700px) {
          .details-tab {
            font-size: 11.5px;
            padding: 9px 4px;
          }
        }

        .modal-section-title {
          margin: 22px 0 10px;
          color: #213944;
          font-size: 16px;
        }

        .modal-section-title:first-child {
          margin-top: 0;
        }

        .item-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .item-summary-grid > div {
          display: grid;
          gap: 4px;
          padding: 11px 13px;
          border: 1px solid #e1eef3;
          border-radius: 11px;
          background: #fbfeff;
        }

        .item-summary-grid span:first-child {
          color: #7b8e97;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .3px;
        }

        .item-summary-grid strong {
          color: #213944;
          font-size: 15px;
        }

        .batch-mini-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }

        .batch-mini-stat {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 13px;
          border-radius: 12px;
          background: #f5fbfd;
          border: 1px solid #e1eef3;
        }

        .batch-mini-stat svg {
          flex-shrink: 0;
          color: #318fbe;
        }

        .batch-mini-stat b {
          display: block;
          font-size: 18px;
          color: #213944;
        }

        .batch-mini-stat span {
          color: #6f7f88;
          font-size: 11px;
        }

        @media (max-width: 700px) {
          .batch-mini-stats {
            grid-template-columns: 1fr;
          }
        }

        .duplicate-merge-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          margin-top: 8px;
          border-radius: 10px;
          background: #fff8ee;
          border: 1px solid #e4d3ba;
          font-size: 12.5px;
          color: #8a6414;
        }

        .duplicate-merge-row button {
          border: 0;
          border-radius: 8px;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          background: #b0620a;
          cursor: pointer;
          white-space: nowrap;
        }

        .duplicate-merge-row button:disabled {
          opacity: .6;
          cursor: wait;
        }

        .modal-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .modal-section-head .modal-section-title {
          margin: 0;
        }

        .add-batch-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          border-radius: 10px;
          padding: 8px 13px;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(135deg, #318fbe, #2c5c74);
          cursor: pointer;
          white-space: nowrap;
        }


        .batch-row-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
          margin-top: 6px;
        }

        .batch-row-actions button {
          border: 1px solid #cfe4ed;
          background: #fff;
          border-radius: 8px;
          padding: 6px 9px;
          font-size: 11.5px;
          font-weight: 700;
          color: #257fa9;
          cursor: pointer;
        }

        .batch-row-actions button:disabled {
          opacity: .6;
          cursor: wait;
        }

        .batch-deactivate-btn {
          border-color: #e4d3ba !important;
          background: #fff8ee !important;
          color: #8a6414 !important;
        }

        .batch-activate-btn {
          border-color: #bfe0c9 !important;
          background: #f0faf3 !important;
          color: #227a52 !important;
        }

        .batch-edit-form {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          align-items: end;
        }

        .batch-edit-actions {
          display: flex;
          gap: 8px;
          grid-column: 1 / -1;
          justify-content: flex-end;
        }

        .batch-edit-actions button {
          border: 0;
          border-radius: 8px;
          padding: 8px 13px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .batch-edit-actions button[type="button"] {
          background: #eff4f6;
          color: #536b78;
        }

        .batch-edit-actions button[type="submit"] {
          background: #318fbe;
          color: #fff;
        }

        .batch-edit-actions button[type="submit"]:disabled {
          opacity: .6;
          cursor: wait;
        }

        .batch-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #e5eef1;
        }

        .page-nav {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          border: 1px solid #cfe4ed;
          border-radius: 50%;
          background: #fff;
          color: #2b6f8f;
          cursor: pointer;
        }

        .page-nav:hover:not(:disabled) {
          background: #eaf6fb;
          border-color: #a9dff0;
        }

        .page-nav:disabled {
          cursor: not-allowed;
          opacity: .4;
        }

        .batch-pagination-pages {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .batch-pagination-pages button {
          min-width: 32px;
          min-height: 32px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: #536b78;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .batch-pagination-pages button:hover {
          background: #eaf6fb;
        }

        .batch-pagination-pages button.active {
          border-color: #318fbe;
          background: #318fbe;
          color: #fff;
        }

        .modal-footer-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #e5eef1;
        }

        .modal-close-btn {
          border: 1px solid #cfe4ed;
          background: #fff;
          border-radius: 10px;
          padding: 10px 16px;
          font-size: 13.5px;
          font-weight: 700;
          color: #536b78;
          cursor: pointer;
        }

        @media (max-width: 700px) {
          .item-summary-grid,
          .batch-edit-form {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 1100px) {
          .stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .stats {
            grid-template-columns: 1fr;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .wide {
            grid-column: auto;
          }

          .toolbar > * {
            width: 100%;
          }

          .history-row {
            flex-direction: column;
          }

          .history-row > div:last-child {
            text-align: left;
          }

          .ai-summary-head {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .ai-summary-actions {
            width: 100%;
            margin-left: 0;
          }

          .ai-action-btn,
          .download-pdf-btn {
            flex: 1;
          }
        }
      `}</style>

      <ConfirmDialog
        open={!!pendingArchive}
        tone="danger"
        title={
          pendingArchive?.is_archived
            ? "Restore Item?"
            : "Deactivate Item?"
        }
        description={
          pendingArchive
            ? pendingArchive.is_archived
              ? `Restore ${pendingArchive.item_name}?`
              : Number(pendingArchive.quantity) > 0
              ? `Deactivate ${pendingArchive.item_name}? It still has ${pendingArchive.quantity} ${pendingArchive.unit || "unit(s)"} in stock — deactivating hides it from staff/veterinarian views and stops it from being used in new transactions.`
              : `Deactivate ${pendingArchive.item_name}?`
            : ""
        }
        confirmLabel={
          pendingArchive?.is_archived
            ? "Yes, Restore Item"
            : "Yes, Deactivate Item"
        }
        cancelLabel="Cancel"
        busy={archiving}
        onConfirm={confirmToggleArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  onClick,
  active,
}) {
  return (
    <button
      type="button"
      className={`stat${active ? " active" : ""}`}
      onClick={onClick}
    >
      {icon}

      <div>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    </button>
  );
}

function Field({
  label,
  wide,
  required,
  optional,
  error,
  children,
}) {
  return (
    <div
      className={`field ${
        wide ? "wide" : ""
      }`}
    >
      <label>
        {label}
        {required && <span className="required-mark"> *</span>}
        {optional && <span className="optional-mark"> (Optional)</span>}
      </label>
      {children}
      {error && <span className="field-error-text">{error}</span>}
    </div>
  );
}

function validateItemField(name, value, itemForm) {
  switch (name) {
    case "item_name":
      return String(value || "").trim() ? "" : "Item name is required.";
    case "sku":
      return String(value || "").trim() ? "" : "Item code (SKU) is required.";
    case "category": {
      if (!String(value || "").trim()) return "Please select a product category.";
      if (value === "Others" && !String(itemForm.custom_category || "").trim()) return "Please type the product category.";
      return "";
    }
    case "unit":
      return String(value || "").trim() ? "" : "Unit of measure is required.";
    default:
      return "";
  }
}

function Modal({
  title,
  close,
  children,
  large,
  elevated,
}) {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div
      className={`modal-backdrop ${elevated ? "elevated" : ""}`}
      onMouseDown={(e) => {
        if (
          e.target ===
          e.currentTarget
        ) {
          close();
        }
      }}
    >
      <div
        className={`modal-card ${
          large ? "large" : ""
        }`}
      >
        <div className="modal-head">
          <h2>{title}</h2>

          <button
            type="button"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}