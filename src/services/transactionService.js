import { supabase } from "../config/supabaseClient";

const TRANSACTION_FIELDS =
  "id,or_number,pet_id,owner_id,medical_record_id,appointment_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,notes,status_reason,status_changed_by,status_changed_at,paymongo_source_id,paymongo_payment_id,paymongo_checkout_url,created_by,created_at,updated_at";

const TRANSACTION_ITEM_FIELDS =
  "id,transaction_id,inventory_item_id,item_type,item_name,quantity,unit_price,discount_amount,line_total,inventory_transaction_id,created_at";

const TRANSACTION_RELATIONS =
  "pet:pets!transactions_pet_id_fkey(id,pet_name),transaction_pets(pet:pets!transaction_pets_pet_id_fkey(id,pet_name,species)),owner:profiles!transactions_owner_id_fkey(id,full_name),staff:profiles!transactions_staff_id_fkey(id,full_name),transaction_items(" + TRANSACTION_ITEM_FIELDS + "),transaction_audit_log(id,action,previous_status,new_status,reason,performed_by,created_at,staff:profiles!transaction_audit_log_performed_by_fkey(full_name))";

function friendly(error, fallback) {
  console.error(fallback, error);

  if (
    error?.code === "PGRST205" ||
    error?.code === "42P01"
  ) {
    return new Error(
      "Transactions are not ready yet. Please complete the transactions database setup."
    );
  }

  if (error?.code === "23514") {
    return new Error(
      "Please check the checkup fee, quantities, or prices entered."
    );
  }

  if (
    error?.message?.includes(
      "Insufficient stock"
    )
  ) {
    return new Error(
      error.message
    );
  }

  const detail = error?.message || error?.details || error?.hint;
  return new Error(detail ? `${fallback} ${detail}` : fallback);
}

async function runTransactionListQuery({ paymentStatus, paymentMethod, dateFrom, dateTo, limit }, select) {
  let query = supabase
    .from("transactions")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (paymentStatus) query = query.eq("payment_status", paymentStatus);
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999`);
  return query;
}

function normalizeCartItem(item) {
  const quantity =
    Number(item.quantity);

  const unitPrice =
    Number(item.unit_price ?? item.unitPrice ?? 0);

  if (
    !item.inventory_item_id &&
    !item.inventoryItemId
  ) {
    throw new Error(
      "Each cart item must reference an inventory item."
    );
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      `Enter a valid quantity for ${item.item_name || item.itemName || "the selected item"}.`
    );
  }

  if (
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    throw new Error(
      `Enter a valid price for ${item.item_name || item.itemName || "the selected item"}.`
    );
  }

  return {
    inventory_item_id:
      item.inventory_item_id ||
      item.inventoryItemId,
    item_type:
      item.item_type ||
      item.itemType ||
      "Product",
    item_name:
      item.item_name ||
      item.itemName ||
      "",
    quantity,
    unit_price: unitPrice,
  };
}

/**
 * Runs the full POS checkout in one call: creates the transaction header,
 * inserts each cart line, and deducts inventory stock for every item via
 * pawcruz_record_inventory_transaction (same audit trail as manual stock edits).
 *
 * values = {
 *   petId, ownerId, checkupFee,
 *   items: [{ inventoryItemId, itemType, itemName, quantity, unitPrice }, ...],
 *   medicalRecordId, appointmentId, paymentMethod, paymentStatus, notes
 * }
 */
export async function checkoutTransaction(
  values,
  profile
) {
  const checkupFee =
    Number(values.checkupFee ?? 0);

  if (
    !values.petId ||
    !values.ownerId
  ) {
    throw new Error(
      "Select a pet and owner before completing the transaction."
    );
  }

  if (
    !Number.isFinite(checkupFee) ||
    checkupFee < 0
  ) {
    throw new Error(
      "Enter a valid checkup fee."
    );
  }

  const items = Array.isArray(values.items)
    ? values.items.map(normalizeCartItem)
    : [];

  const {
    data,
    error,
  } = await supabase.rpc(
    "pawcruz_checkout_transaction",
    {
      p_pet_id:
        values.petId,
      p_owner_id:
        values.ownerId,
      p_checkup_fee:
        checkupFee,
      p_items:
        items,
      p_medical_record_id:
        values.medicalRecordId ||
        null,
      p_appointment_id:
        values.appointmentId ||
        null,
      p_staff_id:
        profile?.id ||
        null,
      p_payment_method:
        values.paymentMethod ||
        "Cash",
      p_payment_status:
        values.paymentStatus ||
        "Paid",
      p_notes:
        values.notes?.trim() ||
        null,
      p_created_by:
        profile?.id ||
        null,
      p_discount_amount: Number(values.discountAmount || 0),
      p_amount_paid: values.amountPaid == null ? null : Number(values.amountPaid),
    }
  );

  if (error) {
    throw friendly(
      error,
      "Unable to complete the transaction."
    );
  }

  const petIds = [...new Set((values.petIds || [values.petId]).filter(Boolean))];
  const { error: petLinkError } = await supabase.from("transaction_pets").insert(
    petIds.map((petId) => ({ transaction_id: data, pet_id: petId }))
  );
  if (petLinkError) {
    throw friendly(petLinkError, "Transaction completed, but its pet list could not be saved.");
  }

  return data;
}

/**
 * Creates a PayMongo GCash source for an already-created transaction (payment_status
 * "Pending") and returns the hosted checkout URL to redirect the customer to.
 * The Supabase Edge Function holds the PayMongo secret key server-side.
 */
export async function initiateGcashPayment(
  transactionId,
  amount
) {
  const successUrl = `${window.location.origin}/staff/transactions/gcash-return?tx=${transactionId}&result=success`;
  const failedUrl = `${window.location.origin}/staff/transactions/gcash-return?tx=${transactionId}&result=failed`;

  const {
    data,
    error,
  } = await supabase.functions.invoke(
    "create-gcash-source",
    {
      body: {
        transactionId,
        amount,
        successUrl,
        failedUrl,
        description: `PawCruz checkup & inventory charges`,
      },
    }
  );

  if (error) {
    throw friendly(
      error,
      "Unable to start the GCash payment."
    );
  }

  if (data?.error) {
    throw new Error(
      data.error
    );
  }

  return data;
}

/**
 * Polls a transaction's payment_status. Intended for the GCash return page,
 * since the actual "Paid" confirmation comes from the PayMongo webhook, not
 * the redirect itself (the redirect can't be trusted on its own).
 */
export async function pollTransactionStatus(
  transactionId,
  {
    intervalMs = 2000,
    timeoutMs = 60000,
  } = {}
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const transaction = await getTransactionById(
      transactionId
    );

    if (
      transaction.payment_status === "Paid" ||
      transaction.payment_status === "Cancelled"
    ) {
      return transaction;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, intervalMs)
    );
  }

  return getTransactionById(transactionId);
}

export async function getTransactionById(
  transactionId
) {
  const {
    data,
    error,
  } = await supabase
    .from("transactions")
    .select(
      `${TRANSACTION_FIELDS},${TRANSACTION_RELATIONS}`
    )
    .eq("id", transactionId)
    .single();

  if (error) {
    throw friendly(
      error,
      "Unable to load the transaction."
    );
  }

  return data;
}

export async function getTransactionsByPet(
  petId,
  limit = 50
) {
  const {
    data,
    error,
  } = await supabase
    .from("transactions")
    .select(
      `${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`
    )
    .eq("pet_id", petId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw friendly(
      error,
      "Unable to load transactions for this pet."
    );
  }

  return data || [];
}

export async function getTransactions({
  search = "",
  paymentStatus = "",
  paymentMethod = "",
  dateFrom = "",
  dateTo = "",
  limit = 100,
} = {}) {
  const options = { paymentStatus, paymentMethod, dateFrom, dateTo, limit };
  let { data, error } = await runTransactionListQuery(
    options,
    `${TRANSACTION_FIELDS},${TRANSACTION_RELATIONS}`
  );

  // PostgREST can briefly retain stale relationship metadata after a migration.
  // The history list remains usable while its schema cache catches up.
  if (error?.code === "PGRST200" || error?.code === "PGRST201") {
    ({ data, error } = await runTransactionListQuery(
      options,
      `${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`
    ));
  }

  if (error) {
    throw friendly(
      error,
      "Unable to load transactions."
    );
  }

  const rows = data || [];
  if (!search.trim()) return rows;
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => [row.or_number, row.id, row.owner?.full_name, row.pet?.pet_name, row.staff?.full_name,
    ...(row.transaction_pets || []).map((link) => link.pet?.pet_name)]
    .some((value) => String(value || "").toLowerCase().includes(needle)));
}

export async function updatePaymentStatus(
  transactionId,
  paymentStatus
) {
  const {
    data,
    error,
  } = await supabase
    .from("transactions")
    .update({ payment_status: paymentStatus })
    .eq("id", transactionId)
    .select(TRANSACTION_FIELDS)
    .single();

  if (error) {
    throw friendly(
      error,
      "Unable to update the payment status."
    );
  }

  return data;
}

export async function changeTransactionStatus(transactionId, status, reason, profile) {
  if (!reason?.trim()) throw new Error("A void or refund reason is required.");
  const { data, error } = await supabase.rpc("pawcruz_change_transaction_status", {
    p_transaction_id: transactionId,
    p_new_status: status,
    p_reason: reason.trim(),
    p_staff_id: profile?.id || null,
  });
  if (error) throw friendly(error, `Unable to ${status.toLowerCase()} the transaction.`);
  return data;
}
