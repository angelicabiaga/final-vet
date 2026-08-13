import { supabase } from "../config/supabaseClient";

const TRANSACTION_FIELDS =
  "id,or_number,pet_id,owner_id,medical_record_id,appointment_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,notes,paymongo_source_id,paymongo_payment_id,paymongo_checkout_url,created_by,created_at,updated_at";

const TRANSACTION_ITEM_FIELDS =
  "id,transaction_id,inventory_item_id,item_type,item_name,quantity,unit_price,line_total,inventory_transaction_id,created_at";

const PAYMENT_METHODS = [
  "Cash",
  "GCash",
  "Maya",
  "Credit Card",
  "Debit Card",
  "Split Payment",
];

function friendly(error, fallback) {
  console.error(fallback, error);

  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return new Error(
      "Transactions are not ready yet. Apply supabase/pos_transaction_history_module.sql first."
    );
  }

  if (error?.message?.includes("Insufficient stock")) {
    return new Error(error.message);
  }

  return new Error(error?.message || fallback);
}

function normalizeCartItem(item) {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);
  const inventoryItemId = item.inventory_item_id || item.inventoryItemId || null;
  const itemType = item.item_type || item.itemType || "Product";
  const deductInventory = item.deduct_inventory ?? item.deductInventory ?? Boolean(inventoryItemId);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(
      `Enter a valid quantity for ${item.item_name || item.itemName || "the selected item"}.`
    );
  }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(
      `Enter a valid price for ${item.item_name || item.itemName || "the selected item"}.`
    );
  }

  if (deductInventory && !inventoryItemId) {
    throw new Error(
      `${item.item_name || item.itemName || "The selected item"} must be linked to inventory before it can be sold.`
    );
  }

  return {
    inventory_item_id: inventoryItemId,
    item_type: itemType,
    item_name: String(item.item_name || item.itemName || "").trim(),
    quantity,
    unit_price: unitPrice,
    deduct_inventory: Boolean(deductInventory),
  };
}

async function decorateTransactions(rows) {
  const transactionRows = rows || [];
  if (!transactionRows.length) return [];

  const petIds = [...new Set(transactionRows.map((row) => row.pet_id).filter(Boolean))];
  const profileIds = [
    ...new Set(
      transactionRows
        .flatMap((row) => [row.owner_id, row.staff_id, row.created_by, row.voided_by, row.refunded_by])
        .filter(Boolean)
    ),
  ];

  const [petsResult, profilesResult] = await Promise.all([
    petIds.length
      ? supabase.from("pets").select("id,pet_name,species,owner_id").in("id", petIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id,full_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (petsResult.error || profilesResult.error) {
    throw friendly(petsResult.error || profilesResult.error, "Unable to load transaction contacts.");
  }

  const petsById = new Map((petsResult.data || []).map((pet) => [pet.id, pet]));
  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  return transactionRows.map((transaction) => ({
    ...transaction,
    pet: petsById.get(transaction.pet_id) || null,
    owner: profilesById.get(transaction.owner_id) || null,
    cashier: profilesById.get(transaction.staff_id || transaction.created_by) || null,
    voidedBy: profilesById.get(transaction.voided_by) || null,
    refundedBy: profilesById.get(transaction.refunded_by) || null,
  }));
}

/**
 * Creates a POS transaction and its audit/inventory records in one database
 * operation. Pending GCash transactions are only deducted when the confirmed
 * PayMongo webhook settles them as Paid.
 */
export async function checkoutTransaction(values, profile) {
  const checkupFee = Number(values.checkupFee ?? 0);
  const discountAmount = Number(values.discountAmount ?? 0);
  const paymentMethod = values.paymentMethod || "Cash";
  const paymentStatus = values.paymentStatus || "Paid";
  const amountPaid = Number(values.amountPaid ?? 0);
  const changeAmount = Number(values.changeAmount ?? 0);

  if (!values.petId || !values.ownerId) {
    throw new Error("Select a pet and owner before completing the transaction.");
  }

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error("Select a supported payment method.");
  }

  if (!Number.isFinite(checkupFee) || checkupFee < 0) {
    throw new Error("Enter a valid checkup fee.");
  }

  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    throw new Error("Enter a valid discount amount.");
  }

  if (!Number.isFinite(amountPaid) || amountPaid < 0 || !Number.isFinite(changeAmount) || changeAmount < 0) {
    throw new Error("Enter valid payment and change amounts.");
  }

  const items = Array.isArray(values.items) ? values.items.map(normalizeCartItem) : [];
  const { data, error } = await supabase.rpc("pawcruz_checkout_pos_transaction", {
    p_pet_id: values.petId,
    p_owner_id: values.ownerId,
    p_checkup_fee: checkupFee,
    p_items: items,
    p_medical_record_id: values.medicalRecordId || null,
    p_appointment_id: values.appointmentId || null,
    p_staff_id: profile?.id || null,
    p_payment_method: paymentMethod,
    p_payment_status: paymentStatus,
    p_discount_amount: discountAmount,
    p_amount_paid: amountPaid,
    p_change_amount: changeAmount,
    p_split_payment_details: values.splitPaymentDetails || null,
    p_notes: values.notes?.trim() || null,
    p_created_by: profile?.id || null,
  });

  if (error) throw friendly(error, "Unable to complete the transaction.");
  return data;
}

export async function initiateGcashPayment(transactionId, amount) {
  const successUrl = `${window.location.origin}/staff/transactions/gcash-return?tx=${transactionId}&result=success`;
  const failedUrl = `${window.location.origin}/staff/transactions/gcash-return?tx=${transactionId}&result=failed`;
  const { data, error } = await supabase.functions.invoke("create-gcash-source", {
    body: {
      transactionId,
      amount,
      successUrl,
      failedUrl,
      description: "PawCruz checkup & inventory charges",
    },
  });

  if (error) throw friendly(error, "Unable to start the GCash payment.");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getTransactionById(transactionId) {
  const { data, error } = await supabase
    .from("transactions")
    .select(`${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`)
    .eq("id", transactionId)
    .single();

  if (error) throw friendly(error, "Unable to load the transaction.");
  const [transaction] = await decorateTransactions([data]);
  return transaction;
}

export async function getTransactionAuditTrail(transactionId) {
  const { data, error } = await supabase
    .from("transaction_audit_logs")
    .select("id,transaction_id,action,previous_status,next_status,reason,details,performed_by,created_at")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });

  // Older clinic databases keep their audit entries in a differently named
  // table. History and receipt details still work when that optional trail is
  // unavailable.
  if (error?.code === "42P01" || error?.code === "PGRST205") return [];
  if (error) throw friendly(error, "Unable to load the transaction audit trail.");

  const actorIds = [...new Set((data || []).map((entry) => entry.performed_by).filter(Boolean))];
  if (!actorIds.length) return data || [];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name")
    .in("id", actorIds);
  if (profileError) throw friendly(profileError, "Unable to load audit staff.");
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return (data || []).map((entry) => ({ ...entry, performer: profilesById.get(entry.performed_by) || null }));
}

export async function getTransactions({
  from = "",
  to = "",
  paymentMethod = "",
  paymentStatus = "",
  limit = 100,
} = {}) {
  let query = supabase
    .from("transactions")
    .select(`${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999`);
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  if (paymentStatus) query = query.eq("payment_status", paymentStatus);

  const { data, error } = await query;
  if (error) throw friendly(error, "Unable to load payment history.");
  return decorateTransactions(data || []);
}

export async function reverseTransaction({ transactionId, action, reason, itemIds = null }, profile) {
  if (!transactionId || !["Void", "Refund"].includes(action) || !reason?.trim()) {
    throw new Error("A transaction action and reason are required.");
  }

  const { data, error } = await supabase.rpc("pawcruz_reverse_pos_transaction", {
    p_transaction_id: transactionId,
    p_action: action,
    p_reason: reason.trim(),
    p_actor_id: profile?.id || null,
    p_item_ids: itemIds,
  });

  if (error) throw friendly(error, `Unable to ${action.toLowerCase()} this transaction.`);
  return data;
}

export async function pollTransactionStatus(transactionId, { intervalMs = 2000, timeoutMs = 60000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const transaction = await getTransactionById(transactionId);
    if (["Paid", "Cancelled", "Voided", "Refunded"].includes(transaction.payment_status)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return getTransactionById(transactionId);
}
