import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import QRCode from "qrcode";

import {
  Banknote,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";

import AppShell from "../../components/AppShell";
import {
  getInventoryItems,
  recordInventoryTransaction,
} from "../../services/inventoryService";
import { getPets } from "../../services/petService";
import {
  checkoutTransaction,
  getTransactionById,
  getTransactions,
  initiateGcashPayment,
  updatePaymentStatus,
} from "../../services/transactionService";

const GCASH_EXPIRY_SECONDS = 5 * 60;

const ITEM_TYPES = ["Test", "Medicine", "Product"];

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function guessItemType(inventoryItem) {
  const haystack = `${inventoryItem.category || ""} ${inventoryItem.item_name || ""}`.toLowerCase();

  if (haystack.includes("test") || haystack.includes("lab") || haystack.includes("diagnostic")) {
    return "Test";
  }

  if (haystack.includes("medic") || haystack.includes("drug") || haystack.includes("vaccine") || haystack.includes("antibiotic")) {
    return "Medicine";
  }

  return "Product";
}

export default function TransactionManagement({ profile }) {
  const [petSearch, setPetSearch] = useState("");
  const [petResults, setPetResults] = useState([]);
  const [petLoading, setPetLoading] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);

  const [petFocused, setPetFocused] = useState(false);

  const [includeCheckupFee, setIncludeCheckupFee] = useState(true);
  const [checkupFee, setCheckupFee] = useState("500");
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemFocused, setItemFocused] = useState(false);

  const [cart, setCart] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successReceipt, setSuccessReceipt] = useState(null);

  const [gcashModal, setGcashModal] = useState(null);
  // gcashModal shape: { transactionId, qrDataUrl, secondsLeft, status: 'waiting'|'paid'|'expired'|'cancelled' }
  const gcashPollRef = useRef(null);
  const gcashTimerRef = useRef(null);
  const gcashPendingReceiptRef = useRef(null);

  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);

    try {
      const data = await getTransactions({ limit: 8 });
      setRecent(data);
    } catch (err) {
      console.error("Unable to load recent transactions.", err);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!petSearch.trim() && !petFocused) {
      setPetResults([]);
      return;
    }

    let cancelled = false;
    setPetLoading(true);

    const timer = setTimeout(async () => {
      try {
        // Empty search + focused just lists pets so staff can pick without typing.
        const data = await getPets({ search: petSearch.trim() });
        if (!cancelled) setPetResults(data.slice(0, 8));
      } catch (err) {
        if (!cancelled) console.error("Unable to search pets.", err);
      } finally {
        if (!cancelled) setPetLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [petSearch, petFocused]);

  useEffect(() => {
    if (!itemSearch.trim() && !itemFocused) {
      setItemResults([]);
      return;
    }

    let cancelled = false;
    setItemLoading(true);

    const timer = setTimeout(async () => {
      try {
        // Empty search + focused just lists inventory so staff can pick without typing.
        const data = await getInventoryItems({ search: itemSearch.trim() });
        if (!cancelled) setItemResults(data.slice(0, 8));
      } catch (err) {
        if (!cancelled) console.error("Unable to search inventory.", err);
      } finally {
        if (!cancelled) setItemLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [itemSearch, itemFocused]);

  const itemsSubtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
        0
      ),
    [cart]
  );

  const effectiveCheckupFee = includeCheckupFee ? Number(checkupFee || 0) : 0;

  const grossTotal = useMemo(
    () => effectiveCheckupFee + itemsSubtotal,
    [effectiveCheckupFee, itemsSubtotal]
  );

  const discountAmount = useMemo(
    () => (applyDiscount ? grossTotal * 0.2 : 0),
    [applyDiscount, grossTotal]
  );

  const totalAmount = grossTotal - discountAmount;

  function selectPet(pet) {
    setSelectedPet(pet);
    setPetSearch("");
    setPetResults([]);
    setPetFocused(false);
  }

  function addToCart(inventoryItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.inventory_item_id === inventoryItem.id);

      if (existing) {
        return prev.map((l) =>
          l.inventory_item_id === inventoryItem.id
            ? { ...l, quantity: Number(l.quantity) + 1 }
            : l
        );
      }

      return [
        ...prev,
        {
          inventory_item_id: inventoryItem.id,
          item_name: inventoryItem.item_name,
          item_type: guessItemType(inventoryItem),
          quantity: 1,
          unit_price: Number(inventoryItem.unit_price || 0),
          available: Number(inventoryItem.quantity || 0),
        },
      ];
    });

    setItemSearch("");
    setItemResults([]);
    setItemFocused(false);
  }

  function updateCartLine(inventoryItemId, patch) {
    setCart((prev) =>
      prev.map((l) =>
        l.inventory_item_id === inventoryItemId ? { ...l, ...patch } : l
      )
    );
  }

  function removeCartLine(inventoryItemId) {
    setCart((prev) => prev.filter((l) => l.inventory_item_id !== inventoryItemId));
  }

  function resetForm() {
    setSelectedPet(null);
    setIncludeCheckupFee(true);
    setCheckupFee("500");
    setApplyDiscount(false);
    setPaymentMethod("Cash");
    setNotes("");
    setCart([]);
    setError("");
  }

  async function handleCheckout() {
    setError("");

    if (!selectedPet) {
      setError("Select a pet before completing the transaction.");
      return;
    }

    const overStock = cart.find((l) => Number(l.quantity) > Number(l.available));

    if (overStock) {
      setError(
        `Only ${overStock.available} ${overStock.item_name} left in stock. Reduce the quantity.`
      );
      return;
    }

    setSubmitting(true);

    const isGcash = paymentMethod === "GCash";
    // Fold the PWD/Senior 20% discount into the fee + unit prices themselves,
    // so the stored total always matches (checkup_fee + sum of line totals)
    // without needing a separate discount column.
    const discountMultiplier = applyDiscount ? 0.8 : 1;
    const discountedCheckupFee = Number((effectiveCheckupFee * discountMultiplier).toFixed(2));
    const discountNote = applyDiscount ? "PWD/Senior Citizen 20% discount applied." : "";
    const combinedNotes = [discountNote, notes.trim()].filter(Boolean).join(" ");

    try {
      const transactionId = await checkoutTransaction(
        {
          petId: selectedPet.id,
          ownerId: selectedPet.owner?.id,
          checkupFee: discountedCheckupFee,
          paymentMethod,
          paymentStatus: isGcash ? "Pending" : "Paid",
          notes: combinedNotes,
          items: cart.map((l) => ({
            inventoryItemId: l.inventory_item_id,
            itemType: l.item_type,
            itemName: l.item_name,
            quantity: l.quantity,
            unitPrice: Number((Number(l.unit_price) * discountMultiplier).toFixed(2)),
          })),
        },
        profile
      );

      if (isGcash) {
        // Stay on the POS screen: create the GCash source, turn its checkout
        // URL into a QR code the customer scans with their own phone, and
        // poll for the webhook-confirmed "Paid" status instead of leaving.
        const { checkoutUrl } = await initiateGcashPayment(
          transactionId,
          totalAmount
        );

        const qrDataUrl = await QRCode.toDataURL(checkoutUrl, {
          width: 320,
          margin: 1,
        });

        gcashPendingReceiptRef.current = {
          id: transactionId,
          petName: selectedPet.pet_name,
          ownerName: selectedPet.owner?.full_name,
          checkupFee: discountedCheckupFee,
          items: cart.map((l) => ({ ...l, unit_price: Number((Number(l.unit_price) * discountMultiplier).toFixed(2)) })),
          total: totalAmount,
        };

        setGcashModal({
          transactionId,
          qrDataUrl,
          secondsLeft: GCASH_EXPIRY_SECONDS,
          status: "waiting",
        });

        resetForm();
        setSubmitting(false);
        return;
      }

      setSuccessReceipt({
        id: transactionId,
        petName: selectedPet.pet_name,
        ownerName: selectedPet.owner?.full_name,
        checkupFee: discountedCheckupFee,
        items: cart.map((l) => ({ ...l, unit_price: Number((Number(l.unit_price) * discountMultiplier).toFixed(2)) })),
        total: totalAmount,
      });

      resetForm();
      loadRecent();
    } catch (err) {
      setError(err.message || "Unable to complete the transaction.");
    } finally {
      setSubmitting(false);
    }
  }

  const [voidingId, setVoidingId] = useState(null);
  const [voidConfirm, setVoidConfirm] = useState(null);

  async function handleVoidTransaction(tx) {
    setVoidConfirm(tx);
  }

  async function confirmVoidTransaction() {
    const tx = voidConfirm;
    if (!tx) return;

    setVoidConfirm(null);
    setVoidingId(tx.id);

    try {
      const items = tx.transaction_items || [];
      const restoreFailures = [];

      // Add each line item's quantity back into inventory, using the same
      // audit-trailed RPC as manual stock adjustments — just in reverse.
      for (const item of items) {
        try {
          await recordInventoryTransaction(
            {
              itemId: item.inventory_item_id,
              transactionType: "Stock In",
              quantity: item.quantity,
              reason: "Void reversal",
              notes: "Restored from voided transaction",
              referenceType: "transaction",
              referenceId: tx.id,
            },
            profile
          );
        } catch (err) {
          console.error(`Unable to restore stock for ${item.item_name}.`, err);
          restoreFailures.push(item.item_name);
        }
      }

      await updatePaymentStatus(tx.id, "Cancelled");
      loadRecent();

      if (restoreFailures.length > 0) {
        setError(
          `Transaction voided, but stock for ${restoreFailures.join(", ")} could not be restored automatically. Please adjust inventory manually.`
        );
      }
    } catch (err) {
      setError(err.message || "Unable to void the transaction.");
    } finally {
      setVoidingId(null);
    }
  }

  function stopGcashTimers() {
    if (gcashPollRef.current) clearInterval(gcashPollRef.current);
    if (gcashTimerRef.current) clearInterval(gcashTimerRef.current);
    gcashPollRef.current = null;
    gcashTimerRef.current = null;
  }

  function closeGcashModal() {
    stopGcashTimers();
    gcashPendingReceiptRef.current = null;
    setGcashModal(null);
  }

  // While the QR modal is open and "waiting", poll the transaction (confirmed
  // by PayMongo's webhook, never by the redirect alone) and count down to
  // the source's ~5-minute expiry.
  useEffect(() => {
    if (!gcashModal || gcashModal.status !== "waiting") return undefined;

    gcashPollRef.current = setInterval(async () => {
      try {
        const transaction = await getTransactionById(gcashModal.transactionId);

        if (transaction.payment_status === "Paid") {
          stopGcashTimers();
          setGcashModal((prev) => (prev ? { ...prev, status: "paid" } : prev));
        } else if (transaction.payment_status === "Cancelled") {
          stopGcashTimers();
          setGcashModal((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        }
      } catch (err) {
        console.error("Unable to poll GCash payment status.", err);
      }
    }, 3000);

    gcashTimerRef.current = setInterval(() => {
      setGcashModal((prev) => {
        if (!prev || prev.status !== "waiting") return prev;
        if (prev.secondsLeft <= 1) {
          stopGcashTimers();
          return { ...prev, secondsLeft: 0, status: "expired" };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => stopGcashTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcashModal?.transactionId, gcashModal?.status]);

  // Once the webhook confirms payment, swap the QR modal for the same
  // receipt view used by cash/card transactions.
  useEffect(() => {
    if (gcashModal?.status === "paid" && gcashPendingReceiptRef.current) {
      setSuccessReceipt(gcashPendingReceiptRef.current);
      gcashPendingReceiptRef.current = null;
      setGcashModal(null);
      loadRecent();
    }
  }, [gcashModal?.status, loadRecent]);

  useEffect(() => stopGcashTimers, []);

  return (
    <AppShell profile={profile} title="Transaction Management">
      {error && <div className="error">{error}</div>}

      <div className="pos-grid">
        <div className="card pos-main">
          <h2>
            <Stethoscope size={18} /> New Transaction
          </h2>

          <label className="field-label">Pet / Owner</label>

          {selectedPet ? (
            <div className="selected-pet">
              <div>
                <strong>{selectedPet.pet_name}</strong>
                <span>
                  {selectedPet.species} · Owner: {selectedPet.owner?.full_name || "—"}
                </span>
              </div>
              <button
                type="button"
                className="link-btn"
                onClick={() => setSelectedPet(null)}
              >
                <X size={16} /> Change
              </button>
            </div>
          ) : (
            <div className="search-box">
              <Search size={16} />
              <input
                placeholder="Search pet by name, species, or breed"
                value={petSearch}
                onChange={(e) => setPetSearch(e.target.value)}
                onFocus={() => setPetFocused(true)}
                onBlur={() => setTimeout(() => setPetFocused(false), 150)}
              />
            </div>
          )}

          {!selectedPet && (petSearch.trim() || petFocused) && (
            <div className="results-list">
              {petLoading && <div className="results-empty">Searching…</div>}
              {!petLoading && petResults.length === 0 && (
                <div className="results-empty">No pets found.</div>
              )}
              {petResults.map((pet) => (
                <button
                  type="button"
                  key={pet.id}
                  className="result-row"
                  onMouseDown={(e) => {
  e.preventDefault();
  selectPet(pet);
}}
                >
                  <span>
                    <strong>{pet.pet_name}</strong> · {pet.species}
                  </span>
                  <span className="muted">{pet.owner?.full_name || "No owner"}</span>
                </button>
              ))}
            </div>
          )}

          <div className="fee-row">
            <div>
              <label className="field-label toggle-label">
                <input
                  type="checkbox"
                  className="inline-checkbox"
                  checked={includeCheckupFee}
                  onChange={(e) => setIncludeCheckupFee(e.target.checked)}
                />
                Checkup Fee (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={checkupFee}
                disabled={!includeCheckupFee}
                className={!includeCheckupFee ? "fee-disabled" : ""}
                onChange={(e) => setCheckupFee(e.target.value)}
              />
              {!includeCheckupFee && (
                <span className="muted fee-off-note">
                  Off — walk-in for products only, no checkup charged.
                </span>
              )}
            </div>
            <div>
              <label className="field-label">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option>Cash</option>
                <option>GCash</option>
              </select>
            </div>
          </div>

          <label className="field-label toggle-label discount-toggle">
            <input
              type="checkbox"
              className="inline-checkbox"
              checked={applyDiscount}
              onChange={(e) => setApplyDiscount(e.target.checked)}
            />
            Apply PWD / Senior Citizen Discount (20%)
          </label>

          <label className="field-label">
            Add Tests / Medicines / Products from Inventory (optional)
          </label>

          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search inventory by item name or SKU"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onFocus={() => setItemFocused(true)}
              onBlur={() => setTimeout(() => setItemFocused(false), 150)}
            />
          </div>

          {(itemSearch.trim() || itemFocused) && (
            <div className="results-list">
              {itemLoading && <div className="results-empty">Searching…</div>}
              {!itemLoading && itemResults.length === 0 && (
                <div className="results-empty">No inventory items found.</div>
              )}
              {itemResults.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="result-row"
                  disabled={Number(item.quantity) <= 0}
                  onMouseDown={(e) => {
  e.preventDefault();
  addToCart(item);
}}
                >
                  <span>
                    <strong>{item.item_name}</strong> · {item.category}
                  </span>
                  <span className="muted">
                    {money(item.unit_price)} · {item.quantity} {item.unit} in stock
                  </span>
                </button>
              ))}
            </div>
          )}

          <label className="field-label">Cart</label>

          {cart.length === 0 ? (
            <div className="results-empty cart-empty">
              <ShoppingCart size={16} /> No tests or medicines added yet.
            </div>
          ) : (
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Line Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.inventory_item_id}>
                    <td>{line.item_name}</td>
                    <td>{line.item_type}</td>
                    <td>
                      <div className="qty-stepper">
                        <button
                          type="button"
                          onClick={() =>
                            updateCartLine(line.inventory_item_id, {
                              quantity: Math.max(1, Number(line.quantity) - 1),
                            })
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={line.available}
                          value={line.quantity}
                          onChange={(e) =>
                            updateCartLine(line.inventory_item_id, {
                              quantity: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateCartLine(line.inventory_item_id, {
                              quantity: Math.min(
                                line.available,
                                Number(line.quantity) + 1
                              ),
                            })
                          }
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>
                    <td>{money(line.unit_price)}</td>
                    <td>{money(Number(line.quantity) * Number(line.unit_price))}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeCartLine(line.inventory_item_id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <textarea
            className="notes-input"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="totals">
            <div>
              <span>Checkup Fee</span>
              <span>{includeCheckupFee ? money(checkupFee) : "Off"}</span>
            </div>
            <div>
              <span>Items Subtotal</span>
              <span>{money(itemsSubtotal)}</span>
            </div>
            {applyDiscount && (
              <div>
                <span>PWD/Senior Discount (20%)</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}
            <div className="grand-total">
              <span>Total</span>
              <span>{money(totalAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            className="checkout-btn"
            disabled={submitting}
            onClick={handleCheckout}
          >
            <Banknote size={16} />
            {submitting
              ? paymentMethod === "GCash"
                ? "Preparing GCash QR…"
                : "Processing…"
              : paymentMethod === "GCash"
              ? "Pay with GCash"
              : "Complete Transaction"}
          </button>
        </div>

        <div className="card pos-side">
          <h2>
            <Receipt size={18} /> Recent Transactions
          </h2>

          {recentLoading && <div className="results-empty">Loading…</div>}

          {!recentLoading && recent.length === 0 && (
            <div className="results-empty">No transactions yet.</div>
          )}

          <ul className="recent-list">
            {recent.map((tx) => (
              <li key={tx.id}>
                <span>{new Date(tx.created_at).toLocaleString()}</span>
                <strong>{money(tx.total_amount)}</strong>
                <div className="recent-row-bottom">
                  <span className={`status-pill status-${tx.payment_status.toLowerCase()}`}>
                    {tx.payment_status}
                  </span>
                  {(tx.payment_status === "Paid" || tx.payment_status === "Pending") && (
                    <button
                      type="button"
                      className="void-btn"
                      disabled={voidingId === tx.id}
                      onClick={() => handleVoidTransaction(tx)}
                    >
                      {voidingId === tx.id ? "Voiding…" : "Void"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {successReceipt && (
        <div className="receipt-overlay">
          <div className="receipt-card">
            <button
              type="button"
              className="icon-btn receipt-close"
              onClick={() => setSuccessReceipt(null)}
            >
              <X size={18} />
            </button>

            <h2>Transaction Complete</h2>
            <p className="muted">
              {successReceipt.petName} · {successReceipt.ownerName || "—"}
            </p>

            <div className="receipt-line">
              <span>Checkup Fee</span>
              <span>{money(successReceipt.checkupFee)}</span>
            </div>

            {successReceipt.items.map((line) => (
              <div className="receipt-line" key={line.inventory_item_id}>
                <span>
                  {line.item_name} × {line.quantity}
                </span>
                <span>{money(Number(line.quantity) * Number(line.unit_price))}</span>
              </div>
            ))}

            <div className="receipt-line receipt-total">
              <span>Total</span>
              <span>{money(successReceipt.total)}</span>
            </div>
          </div>
        </div>
      )}

      {gcashModal && (
        <div className="receipt-overlay">
          <div className="gcash-modal">
            <div className="gcash-modal-header">
              <span>GCash via PayMongo</span>
              {gcashModal.status !== "paid" && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={closeGcashModal}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {gcashModal.status === "waiting" && (
              <>
                <p className="muted gcash-instructions">
                  Ask the customer to scan this QR code with their GCash app.
                </p>
                <img
                  src={gcashModal.qrDataUrl}
                  alt="GCash payment QR code"
                  className="gcash-qr"
                />
                <div className="gcash-waiting">
                  <Loader2 size={16} className="spin" />
                  Waiting for payment · expires in{" "}
                  {Math.floor(gcashModal.secondsLeft / 60)}:
                  {String(gcashModal.secondsLeft % 60).padStart(2, "0")}
                </div>
                <button
                  type="button"
                  className="link-btn gcash-cancel"
                  onClick={closeGcashModal}
                >
                  Cancel payment
                </button>
              </>
            )}

            {gcashModal.status === "expired" && (
              <>
                <p className="gcash-status-text err">
                  This QR code expired before the customer paid.
                </p>
                <button type="button" className="checkout-btn" onClick={closeGcashModal}>
                  Close
                </button>
              </>
            )}

            {gcashModal.status === "cancelled" && (
              <>
                <p className="gcash-status-text err">
                  The GCash payment was not completed.
                </p>
                <button type="button" className="checkout-btn" onClick={closeGcashModal}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {voidConfirm && (
        <div className="receipt-overlay">
          <div className="void-confirm-card">
            <h2>Void this transaction?</h2>
            <p className="muted">
              {money(voidConfirm.total_amount)} ·{" "}
              {new Date(voidConfirm.created_at).toLocaleString()}
            </p>
            <p className="void-confirm-text">
              Its items will be added back to inventory. This cannot be undone.
            </p>
            <div className="void-confirm-actions">
              <button
                type="button"
                className="void-confirm-cancel"
                onClick={() => setVoidConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="void-confirm-ok"
                onClick={confirmVoidTransaction}
              >
                Void Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pos-grid{display:grid;grid-template-columns:2fr 1fr;gap:18px;align-items:start}
        .card{background:white;border-radius:18px;padding:22px;box-shadow:0 8px 24px rgba(47,117,150,.09)}
        .card h2{display:flex;align-items:center;gap:8px;margin:0 0 16px}
        .field-label{display:block;font-size:12px;font-weight:600;color:#6F7F88;text-transform:uppercase;letter-spacing:.4px;margin:16px 0 6px}
        .search-box{display:flex;align-items:center;gap:8px;border:1px solid #dbe7ec;border-radius:12px;padding:10px 12px;background:#f8fbfc}
        .search-box input{border:none;background:transparent;outline:none;width:100%;font-size:14px}
        .results-list{margin-top:8px;border:1px solid #eef3f5;border-radius:12px;overflow:hidden}
        .result-row{display:flex;justify-content:space-between;width:100%;padding:10px 12px;background:white;border:none;border-bottom:1px solid #f2f6f8;cursor:pointer;text-align:left;font-size:13px}
        .result-row:last-child{border-bottom:none}
        .result-row:hover{background:#f5fbfd}
        .result-row:disabled{opacity:.45;cursor:not-allowed}
        .results-empty{padding:10px 4px;color:#8fa0a8;font-size:13px;display:flex;align-items:center;gap:6px}
        .cart-empty{border:1px dashed #dbe7ec;border-radius:12px;justify-content:center}
        .muted{color:#8fa0a8;font-size:12px}
        .selected-pet{display:flex;justify-content:space-between;align-items:center;border:1px solid #dbe7ec;border-radius:12px;padding:12px;background:#f5fbfd}
        .selected-pet span{display:block;color:#6F7F88;font-size:12px}
        .link-btn{display:flex;align-items:center;gap:4px;background:none;border:none;color:#318fbe;cursor:pointer;font-size:13px}
        .fee-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .toggle-label{display:flex;align-items:center;gap:6px;cursor:pointer}
        .inline-checkbox{width:auto;accent-color:#318fbe;cursor:pointer}
        .fee-off-note{display:block;margin-top:4px}
        .discount-toggle{margin-top:14px;text-transform:none;font-size:13px;color:#1c2b33;letter-spacing:0}
        input:disabled{background:#f2f6f8;color:#9fb0b8;cursor:not-allowed}
        input.fee-disabled{background:#e9eef1!important;color:#9aa8b0!important;border-color:#dce4e8!important;cursor:not-allowed}
        input[type=number],input[type=text],select,textarea{width:100%;border:1px solid #dbe7ec;border-radius:10px;padding:8px 10px;font-size:14px}
        .notes-input{margin-top:16px;min-height:60px;resize:vertical}
        .cart-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
        .cart-table th{text-align:left;color:#6F7F88;font-size:11px;text-transform:uppercase;padding:6px}
        .cart-table td{padding:8px 6px;border-top:1px solid #f2f6f8}
        .qty-stepper{display:flex;align-items:center;gap:6px}
        .qty-stepper button{border:1px solid #dbe7ec;background:white;border-radius:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer}
        .qty-stepper input{width:48px;text-align:center;padding:4px}
        .icon-btn{border:none;background:none;color:#c0392b;cursor:pointer}
        .totals{margin-top:18px;border-top:1px solid #eef3f5;padding-top:12px}
        .totals div{display:flex;justify-content:space-between;font-size:13px;color:#6F7F88;padding:3px 0}
        .grand-total{font-size:16px!important;color:#318fbe!important;font-weight:700}
        .checkout-btn{margin-top:16px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#318fbe,#2c5c74);color:white;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer}
        .checkout-btn:disabled{opacity:.6;cursor:wait}
        .recent-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
        .recent-list li{display:flex;flex-direction:column;gap:2px;border-bottom:1px solid #f2f6f8;padding-bottom:8px;font-size:13px}
        .recent-row-bottom{display:flex;justify-content:space-between;align-items:center}
        .void-btn{border:1px solid #f0c4c4;background:white;color:#c0392b;border-radius:8px;font-size:11px;padding:2px 8px;cursor:pointer}
        .void-btn:disabled{opacity:.5;cursor:wait}
        .void-confirm-card{background:white;border-radius:18px;padding:26px;width:340px;text-align:center}
        .void-confirm-card h2{margin:0 0 4px;font-size:18px}
        .void-confirm-text{font-size:13px;color:#6F7F88;margin:12px 0 20px}
        .void-confirm-actions{display:flex;gap:10px}
        .void-confirm-cancel{flex:1;background:white;border:1px solid #dbe7ec;color:#6F7F88;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer}
        .void-confirm-ok{flex:1;background:#c0392b;border:none;color:white;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer}
        .status-pill{align-self:flex-start;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
        .status-paid{background:#e6f7ee;color:#1f9d55}
        .status-pending{background:#fff6e0;color:#b8860b}
        .status-refunded,.status-cancelled{background:#fbe9e9;color:#c0392b}
        .receipt-overlay{position:fixed;inset:0;background:rgba(20,40,50,.45);display:flex;align-items:center;justify-content:center;z-index:50}
        .gcash-modal{background:white;border-radius:18px;padding:24px;width:360px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
        .gcash-modal-header{width:100%;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#1c2b33}
        .gcash-instructions{margin:0}
        .gcash-qr{width:220px;height:220px;border:1px solid #eef3f5;border-radius:12px;padding:10px}
        .gcash-waiting{display:flex;align-items:center;gap:8px;font-size:13px;color:#318fbe;font-weight:600}
        .gcash-cancel{margin-top:4px;color:#8fa0a8}
        .gcash-status-text{font-size:14px;margin:8px 0}
        .gcash-status-text.err{color:#c0392b}
        .receipt-card{background:white;border-radius:18px;padding:26px;width:340px;position:relative}
        .receipt-close{position:absolute;top:14px;right:14px}
        .receipt-line{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px dashed #eef3f5}
        .receipt-total{font-weight:700;color:#318fbe;font-size:15px;border-bottom:none}
        @media (max-width: 900px){.pos-grid{grid-template-columns:1fr}.fee-row{grid-template-columns:1fr}}
      `}</style>
    </AppShell>
  );
}