import { supabase } from "../config/supabaseClient";

const TRANSACTION_FIELDS =
  "id,pet_id,owner_id,medical_record_id,appointment_id,staff_id,checkup_fee,items_subtotal,total_amount,payment_method,payment_status,notes,paymongo_source_id,paymongo_payment_id,paymongo_checkout_url,created_by,created_at,updated_at";

const TRANSACTION_ITEM_FIELDS =
  "id,transaction_id,inventory_item_id,item_type,item_name,quantity,unit_price,line_total,inventory_transaction_id,created_at";

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

  return new Error(fallback);
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
    }
  );

  if (error) {
    throw friendly(
      error,
      "Unable to complete the transaction."
    );
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
      `${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`
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
  limit = 100,
} = {}) {
  let query = supabase
    .from("transactions")
    .select(
      `${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (paymentStatus) {
    query = query.eq(
      "payment_status",
      paymentStatus
    );
  }

  if (search.trim()) {
    query = query.eq(
      "id",
      search.trim()
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw friendly(
      error,
      "Unable to load transactions."
    );
  }

  return data || [];
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