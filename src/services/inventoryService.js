import { supabase } from "../config/supabaseClient";

const ITEM_FIELDS =
  "id,item_name,category,sku,description,quantity,unit,unit_price,reorder_level,expiry_date,supplier_name,batch_number,status,is_archived,created_by,created_at,updated_at";

const GROQ_API_KEY =
  process.env.REACT_APP_GROQ_API_KEY;

const GROQ_MODEL =
  "openai/gpt-oss-20b";

const GROQ_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

let lastInventoryReconcileAt = 0;

/**
 * Re-checks every active item's stock/expiry status against today's date and
 * sends Low Stock / Out of Stock / Near Expiry / Expired notifications to
 * Admin and Staff for anything that drifted (see
 * supabase/inventory_stock_notifications.sql). Throttled client-side so
 * repeated page loads in the same session don't hammer the database; safe
 * to call as often as needed since the underlying RPC only touches rows
 * whose stored status is actually stale.
 */
export async function reconcileInventoryStatus({
  force = false,
} = {}) {
  const now = Date.now();

  if (
    !force &&
    now - lastInventoryReconcileAt <
      RECONCILE_INTERVAL_MS
  ) {
    return null;
  }

  lastInventoryReconcileAt = now;

  const { data, error } = await supabase.rpc(
    "pawcruz_reconcile_inventory_status"
  );

  if (error) {
    console.warn(
      "Inventory status reconcile skipped:",
      error.message
    );

    return null;
  }

  return data;
}

function friendly(error, fallback) {
  console.error(fallback, error);

  if (
    error?.code === "PGRST205" ||
    error?.code === "42P01"
  ) {
    return new Error(
      "Inventory is not ready yet. Please complete the inventory database setup."
    );
  }

  if (error?.code === "23505") {
    return new Error(
      "The SKU or inventory record already exists."
    );
  }

  if (error?.code === "23514") {
    return new Error(
      "Please check the quantity, price, reorder level, or transaction values."
    );
  }

  // A `raise exception '...'` inside one of the pawcruz_* RPCs surfaces as
  // code P0001 with the raised text as the message -- use it directly
  // instead of the generic fallback, since it's already written to be
  // shown to the user (e.g. "Only deactivated items can be permanently
  // deleted.").
  if (error?.code === "P0001" && error.message) {
    return new Error(error.message);
  }

  return new Error(fallback);
}

function cleanAiResponse(text) {
  if (!text) {
    return "";
  }

  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDate(date) {
  if (!date) {
    return null;
  }

  const parsed = new Date(date);

  if (
    Number.isNaN(parsed.getTime())
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);

  return parsed;
}

function calculateDaysBetween(
  start,
  end
) {
  if (!start || !end) {
    return null;
  }

  const difference =
    end.getTime() -
    start.getTime();

  return Math.ceil(
    difference /
      (1000 * 60 * 60 * 24)
  );
}

/**
 * Same priority order as the SQL function pawcruz_inventory_status --
 * expiry outranks stock level. Computed here (not trusted from the DB
 * `status` column) because that column is only ever as fresh as the last
 * trigger fire, and this app has had stretches where that trigger wasn't
 * actually installed -- filtering/display would otherwise silently miss
 * items whose stored status never caught up with reality.
 */
export function computeLiveItemStatus(
  quantity,
  reorderLevel,
  expiryDate
) {
  if (expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${expiryDate}T00:00:00`);
    if (!Number.isNaN(expiry.getTime())) {
      if (expiry < today) return "Expired";
      const nearExpiry = new Date(today);
      nearExpiry.setDate(nearExpiry.getDate() + 30);
      if (expiry <= nearExpiry) return "Near Expiry";
    }
  }

  const qty = Number(quantity || 0);
  if (qty <= 0) return "Out of Stock";
  if (qty <= Number(reorderLevel || 0)) return "Low Stock";
  return "In Stock";
}

export async function getInventoryItems({
  search = "",
  category = "",
  status = "",
  includeArchived = false,
} = {}) {
  let query = supabase
    .from("inventory_items")
    .select(ITEM_FIELDS)
    .order("item_name");

  query = query.eq(
    "is_archived",
    !!includeArchived
  );

  if (category) {
    query = query.eq(
      "category",
      category
    );
  }

  if (search.trim()) {
    const value = search
      .trim()
      .replace(/,/g, " ");

    query = query.or(
      `item_name.ilike.%${value}%,sku.ilike.%${value}%,supplier_name.ilike.%${value}%,batch_number.ilike.%${value}%`
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw friendly(
      error,
      "Unable to load inventory items."
    );
  }

  const rows = (data || []).map((row) => ({
    ...row,
    status: computeLiveItemStatus(
      row.quantity,
      row.reorder_level,
      row.expiry_date
    ),
  }));

  return status
    ? rows.filter((row) => row.status === status)
    : rows;
}

export async function getInventoryItemsByIds(ids = []) {
  const uniqueIds = [
    ...new Set(
      (ids || []).filter(Boolean)
    ),
  ];

  if (!uniqueIds.length) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("inventory_items")
    .select(ITEM_FIELDS)
    .in("id", uniqueIds);

  if (error) {
    throw friendly(
      error,
      "Unable to load the selected inventory items."
    );
  }

  return data || [];
}

export async function getInventorySummary() {
  const {
    data,
    error,
  } = await supabase
    .from("inventory_items")
    .select(
      "quantity,reorder_level,status,expiry_date,is_archived"
    );

  if (error) {
    throw friendly(
      error,
      "Unable to load inventory summary."
    );
  }

  const rows = (
    data || []
  ).filter(
    (row) => !row.is_archived
  );

  const totalItems =
    rows.length;

  const totalUnits =
    Math.round(
      rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.quantity || 0
          ),
        0
      ) * 100
    ) / 100;

  // Same expiry-first priority as computeLiveItemStatus/the DB function,
  // so these counts always match what clicking a card actually filters to.
  const liveStatuses = rows.map((row) =>
    computeLiveItemStatus(
      row.quantity,
      row.reorder_level,
      row.expiry_date
    )
  );

  const lowStock =
    liveStatuses.filter(
      (status) => status === "Low Stock"
    ).length;

  const outOfStock =
    liveStatuses.filter(
      (status) => status === "Out of Stock"
    ).length;

  const expiringSoon =
    liveStatuses.filter(
      (status) => status === "Near Expiry"
    ).length;

  return {
    totalItems,
    totalUnits,
    lowStock,
    outOfStock,
    expiringSoon,
  };
}

/**
 * How many of each item's batches are currently in stock (Active) vs
 * depleted (Depleted), keyed by item_id -- shown next to the item's status
 * badge in the list so "In Stock" isn't just one word for what might be
 * several separate lots.
 */
export async function getInventoryBatchCounts() {
  const {
    data,
    error,
  } = await supabase
    .from("inventory_batches")
    .select("item_id,status,expiry_date,is_active")
    .neq("is_active", false);

  if (error) {
    throw friendly(
      error,
      "Unable to load batch counts."
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nearExpiryCutoff = new Date(today);
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + 30);

  const counts = {};

  for (const row of data || []) {
    if (!counts[row.item_id]) {
      counts[row.item_id] = {
        inStock: 0,
        outOfStock: 0,
        expired: 0,
        nearExpiry: 0,
      };
    }

    const bucket = counts[row.item_id];

    // Same priority as batchDisplayStatus: expired outranks everything,
    // then depleted, then near-expiry.
    if (row.status === "Expired") {
      bucket.expired += 1;
    } else if (row.status === "Depleted") {
      bucket.outOfStock += 1;
    } else if (
      row.expiry_date &&
      new Date(`${row.expiry_date}T00:00:00`) <= nearExpiryCutoff
    ) {
      bucket.nearExpiry += 1;
    } else {
      bucket.inStock += 1;
    }
  }

  return counts;
}

export async function saveInventoryItem(
  values,
  profile
) {
  // Editing an existing item is intentionally restricted to renaming it --
  // category, unit, price, expiry, supplier, and batch number are either
  // structural identifiers or values now tracked per-batch, so changing them
  // through this form (instead of Stock / Batch Records) would silently
  // desync inventory_items from the batches and transactions that reference
  // it.
  if (values.id) {
    const itemName = values.item_name?.trim();

    if (!itemName) {
      throw new Error(
        "Item name is required."
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "inventory_items"
      )
      .update({
        item_name: itemName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", values.id)
      .select(ITEM_FIELDS)
      .single();

    if (error) {
      throw friendly(
        error,
        "Unable to update inventory item."
      );
    }

    return data;
  }

  const payload = {
    item_name:
      values.item_name?.trim(),
    category:
      values.category?.trim(),
    sku: values.sku
      ?.trim()
      .toUpperCase(),
    description:
      values.description?.trim() ||
      null,
    unit:
      values.unit?.trim(),
    unit_price: Number(
      values.unit_price || 0
    ),
    reorder_level: Math.floor(
      Number(values.reorder_level || 0)
    ),
    expiry_date:
      values.expiry_date ||
      null,
    supplier_name:
      values.supplier_name?.trim() ||
      null,
    batch_number:
      values.batch_number?.trim() ||
      null,
    updated_at:
      new Date().toISOString(),
  };

  if (
    !payload.item_name ||
    !payload.category ||
    !payload.sku ||
    !payload.unit
  ) {
    throw new Error(
      "Item name, category, item code, and unit are required."
    );
  }

  if (
    !Number.isFinite(
      payload.unit_price
    ) ||
    payload.unit_price < 0
  ) {
    throw new Error(
      "Unit price must be zero or greater."
    );
  }

  if (
    !Number.isFinite(
      payload.reorder_level
    ) ||
    payload.reorder_level < 0
  ) {
    throw new Error(
      "Reorder level must be zero or greater."
    );
  }

  const initialQuantity =
    Math.floor(Number(
      values.quantity || 0
    ));

  if (
    !Number.isFinite(
      initialQuantity
    ) ||
    initialQuantity < 0
  ) {
    throw new Error(
      "Initial quantity must be zero or greater."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("inventory_items")
    .insert({
      ...payload,
      quantity: 0,
      created_by:
        profile?.id || null,
    })
    .select(ITEM_FIELDS)
    .single();

  if (error) {
    throw friendly(
      error,
      "Unable to create inventory item."
    );
  }

  if (initialQuantity > 0) {
    try {
      await recordInventoryTransaction(
        {
          itemId: data.id,
          transactionType:
            "Stock In",
          quantity:
            initialQuantity,
          reason:
            "Initial stock",
          notes:
            "Opening inventory quantity",
          batchNumber:
            payload.batch_number,
          expiryDate:
            payload.expiry_date,
        },
        profile
      );
    } catch (transactionError) {
      console.error(
        "Unable to create initial inventory transaction.",
        transactionError
      );

      throw new Error(
        "The inventory item was created, but the initial stock quantity could not be recorded."
      );
    }
  }

  return data;
}

const BATCH_CREATING_TYPES = [
  "Stock In",
  "Adjustment Add",
];

export async function recordInventoryTransaction(
  values,
  profile
) {
  const quantity =
    Math.floor(Number(values.quantity));

  if (
    !values.itemId ||
    !values.transactionType ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      "Select an item and enter a valid quantity greater than zero."
    );
  }

  const createsBatch =
    BATCH_CREATING_TYPES.includes(
      values.transactionType
    );

  if (
    createsBatch &&
    !values.expiryDate
  ) {
    throw new Error(
      "Expiry date is required for stock received into inventory."
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "pawcruz_record_inventory_transaction",
    {
      p_item_id:
        values.itemId,
      p_transaction_type:
        values.transactionType,
      p_quantity:
        quantity,
      p_reason:
        values.reason?.trim() ||
        null,
      p_notes:
        values.notes?.trim() ||
        null,
      p_reference_type:
        values.referenceType ||
        null,
      p_reference_id:
        values.referenceId ||
        null,
      p_created_by:
        profile?.id ||
        null,
      p_batch_number: createsBatch
        ? values.batchNumber?.trim() || null
        : null,
      p_date_received: createsBatch
        ? values.dateReceived || null
        : null,
      p_expiry_date: createsBatch
        ? values.expiryDate || null
        : null,
    }
  );

  if (error) {
    throw friendly(
      error,
      "Unable to record the stock transaction."
    );
  }

  return data;
}

/**
 * Writes staff-entered per-unit Unique Unit IDs (and, when they diverge
 * from the batch, per-unit expiry/date-received) onto the unit rows that
 * pawcruz_generate_units_for_batch already auto-created for the batch this
 * transaction just made. There's no way to pass these in at insert time --
 * the trigger fires as a side effect of the batch insert inside the RPC --
 * so this is a required follow-up call, matched by unit creation order
 * (unit_no) against the order unitEntries was filled in.
 */
export async function attachInventoryUnitCodes(transactionId, unitEntries) {
  if (!transactionId || !unitEntries?.length) return;

  const {
    data: txRow,
    error: txError,
  } = await supabase
    .from("inventory_transactions")
    .select("batch_id")
    .eq("id", transactionId)
    .single();

  if (txError || !txRow?.batch_id) {
    throw friendly(
      txError,
      "Stock was recorded, but the batch could not be found to attach unit IDs."
    );
  }

  const {
    data: unitRows,
    error: unitsError,
  } = await supabase
    .from("inventory_units")
    .select("id")
    .eq("batch_id", txRow.batch_id)
    .order("unit_no", { ascending: true });

  if (unitsError) {
    throw friendly(
      unitsError,
      "Stock was recorded, but the unit records could not be loaded to attach unit IDs."
    );
  }

  if ((unitRows || []).length !== unitEntries.length) {
    throw new Error(
      "Stock was recorded, but the number of unit records didn't match the number of unit IDs entered."
    );
  }

  for (let i = 0; i < unitRows.length; i++) {
    const entry = unitEntries[i];

    const { error } = await supabase
      .from("inventory_units")
      .update({
        unit_code: entry.unitCode?.trim() || null,
        expiry_date: entry.expiryDate || null,
        date_received: entry.dateReceived || null,
      })
      .eq("id", unitRows[i].id);

    if (error) {
      throw friendly(
        error,
        `Stock was recorded, but unit ID "${entry.unitCode}" could not be saved (it may already be in use).`
      );
    }
  }
}

/**
 * Edits a batch's identifying details (batch number / dates) without
 * touching quantity_remaining -- quantity changes only ever happen through
 * a logged inventory_transaction (Stock In / Adjustment / usage), never a
 * silent edit, so the audit trail stays trustworthy.
 */
export async function updateInventoryBatch(batchId, values) {
  if (!batchId) throw new Error("A batch is required.");

  const { error } = await supabase
    .from("inventory_batches")
    .update({
      batch_number: values.batchNumber?.trim() || null,
      date_received: values.dateReceived || null,
      expiry_date: values.expiryDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) {
    throw friendly(error, "Unable to update this batch.");
  }
}

/**
 * Manually takes a whole batch out of (or back into) POS/FEFO rotation --
 * separate from its auto-computed Active/Expired/Depleted lifecycle
 * status. Deactivated batches are skipped by pawcruz_record_inventory_transaction
 * entirely, even if they still have stock and haven't expired.
 */
export async function setBatchActive(batchId, isActive) {
  if (!batchId) throw new Error("A batch is required.");

  const { error } = await supabase
    .from("inventory_batches")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) {
    throw friendly(error, "Unable to update this batch's active status.");
  }
}

/**
 * Merges a duplicate inventory_items row into the real/surviving one --
 * moves its batches (and their history) over via the FIFO-aware RPC, then
 * archives the duplicate. See supabase/INVENTORY_MERGE_DUPLICATES.sql.
 */
export async function mergeInventoryItems(sourceItemId, targetItemId, profile) {
  if (!sourceItemId || !targetItemId) {
    throw new Error("Both a duplicate item and a target item are required.");
  }

  const { error } = await supabase.rpc("pawcruz_merge_inventory_items", {
    p_source_item_id: sourceItemId,
    p_target_item_id: targetItemId,
    p_actor_id: profile?.id || null,
  });

  if (error) {
    throw friendly(error, "Unable to merge these items.");
  }
}

/**
 * Every batch record for one inventory item, oldest-received first -- the
 * same order pawcruz_record_inventory_transaction deducts from, so this is
 * literally "which batch gets used next" read top to bottom.
 */
export async function getInventoryBatches(itemId) {
  if (!itemId) return [];

  const {
    data,
    error,
  } = await supabase
    .from("inventory_batches")
    .select(
      "id,item_id,batch_number,quantity_received,quantity_remaining,date_received,expiry_date,status,is_active,created_at"
    )
    .eq("item_id", itemId)
    .order("date_received", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw friendly(
      error,
      "Unable to load batch records for this item."
    );
  }

  return data || [];
}

/**
 * Every individual unit record belonging to one batch, oldest-created
 * first -- the same order pawcruz_record_inventory_transaction consumes
 * them in when a sale/usage is recorded against that batch.
 */
export async function getInventoryUnits(batchId) {
  if (!batchId) return [];

  const {
    data,
    error,
  } = await supabase
    .from("inventory_units")
    .select(
      "id,unit_no,item_id,batch_id,status,transaction_id,used_at,created_at"
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true })
    .order("unit_no", { ascending: true });

  if (error) {
    throw friendly(
      error,
      "Unable to load unit records for this batch."
    );
  }

  return data || [];
}

export async function getInventoryTransactions(
  itemId = "",
  limit = 100
) {
  let query = supabase
    .from(
      "inventory_transactions"
    )
    .select(
      "id,item_id,batch_id,transaction_type,quantity,quantity_before,quantity_after,reason,notes,reference_type,reference_id,reference_number,created_by,created_at"
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(limit);

  if (itemId) {
    query = query.eq(
      "item_id",
      itemId
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw friendly(
      error,
      "Unable to load inventory transaction history."
    );
  }

  const rows =
    data || [];

  const itemIds = [
    ...new Set(
      rows
        .map(
          (row) => row.item_id
        )
        .filter(Boolean)
    ),
  ];

  let items = [];

  if (itemIds.length) {
    const result =
      await supabase
        .from(
          "inventory_items"
        )
        .select(
          "id,item_name,sku,unit"
        )
        .in("id", itemIds);

    if (!result.error) {
      items =
        result.data || [];
    }
  }

  const itemMap =
    new Map(
      items.map((item) => [
        item.id,
        item,
      ])
    );

  const batchIds = [
    ...new Set(rows.map((row) => row.batch_id).filter(Boolean)),
  ];

  let batches = [];

  if (batchIds.length) {
    const result = await supabase
      .from("inventory_batches")
      .select("id,batch_number")
      .in("id", batchIds);

    if (!result.error) {
      batches = result.data || [];
    }
  }

  const batchMap = new Map(
    batches.map((batch) => [batch.id, batch])
  );

  return rows.map(
    (row) => ({
      ...row,
      item:
        itemMap.get(
          row.item_id
        ) || null,
      batch: batchMap.get(row.batch_id) || null,
    })
  );
}

export async function setInventoryArchived(
  itemId,
  archived
) {
  const {
    error,
  } = await supabase
    .from("inventory_items")
    .update({
      is_archived:
        archived,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw friendly(
      error,
      archived
        ? "Unable to archive the item."
        : "Unable to restore the item."
    );
  }
}

export async function getInventoryCategories() {
  const {
    data,
    error,
  } = await supabase
    .from("inventory_items")
    .select("category")
    .eq(
      "is_archived",
      false
    );

  if (error) {
    throw friendly(
      error,
      "Unable to load inventory categories."
    );
  }

  return [
    ...new Set(
      (data || [])
        .map(
          (row) =>
            row.category
        )
        .filter(Boolean)
    ),
  ].sort();
}

export async function getInventoryForecasts(
  items
) {
  const since90 =
    new Date();

  since90.setDate(
    since90.getDate() - 90
  );

  const since30 =
    new Date();

  since30.setDate(
    since30.getDate() - 30
  );

  const {
    data,
    error,
  } = await supabase
    .from(
      "inventory_transactions"
    )
    .select(
      "item_id,transaction_type,quantity,created_at"
    )
    .gte(
      "created_at",
      since90.toISOString()
    )
    .in(
      "transaction_type",
      [
        "Stock Out",
        "Medicine Usage",
        "Expired",
        "Damaged",
      ]
    );

  if (error) {
    throw friendly(
      error,
      "Unable to calculate inventory forecasts."
    );
  }

  const usage90 =
    new Map();

  const usage30 =
    new Map();

  (data || []).forEach(
    (row) => {
      const quantity =
        Number(
          row.quantity || 0
        );

      usage90.set(
        row.item_id,
        (usage90.get(
          row.item_id
        ) || 0) + quantity
      );

      const transactionDate =
        new Date(
          row.created_at
        );

      if (
        transactionDate >=
        since30
      ) {
        usage30.set(
          row.item_id,
          (usage30.get(
            row.item_id
          ) || 0) + quantity
        );
      }
    }
  );

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const result = (
    items || []
  ).map((item) => {
    const currentQuantity =
      Number(
        item.quantity || 0
      );

    const reorderLevel =
      Number(
        item.reorder_level ||
          0
      );

    const used90 =
      usage90.get(
        item.id
      ) || 0;

    const used30 =
      usage30.get(
        item.id
      ) || 0;

    const previous60Usage =
      Math.max(
        0,
        used90 - used30
      );

    const previous30Average =
      previous60Usage /
      2;

    const estimated30 =
      Math.ceil(
        used90 / 3
      );

    let usageTrend =
      "Stable";

    if (
      previous30Average ===
        0 &&
      used30 > 0
    ) {
      usageTrend =
        "Increasing";
    } else if (
      previous30Average >
        0 &&
      used30 >
        previous30Average *
          1.2
    ) {
      usageTrend =
        "Increasing";
    } else if (
      previous30Average >
        0 &&
      used30 <
        previous30Average *
          0.8
    ) {
      usageTrend =
        "Decreasing";
    }

    const averageDailyUsage =
      used90 > 0
        ? used90 / 90
        : 0;

    const daysOfStock =
      averageDailyUsage >
      0
        ? Math.floor(
            currentQuantity /
              averageDailyUsage
          )
        : null;

    const recommended =
      Math.max(
        0,
        Math.ceil(
          estimated30 +
            reorderLevel -
            currentQuantity
        )
      );

    let stockRisk =
      "Normal";

    if (
      currentQuantity <= 0
    ) {
      stockRisk =
        "Critical";
    } else if (
      currentQuantity <=
      reorderLevel
    ) {
      stockRisk =
        "High";
    } else if (
      daysOfStock !== null &&
      daysOfStock <= 14
    ) {
      stockRisk =
        "High";
    } else if (
      daysOfStock !== null &&
      daysOfStock <= 30
    ) {
      stockRisk =
        "Moderate";
    }

    let expiryRisk =
      "None";

    let daysUntilExpiry =
      null;

    if (item.expiry_date) {
      const expiryDate =
        normalizeDate(
          item.expiry_date
        );

      if (expiryDate) {
        daysUntilExpiry =
          calculateDaysBetween(
            today,
            expiryDate
          );

        if (
          daysUntilExpiry < 0
        ) {
          expiryRisk =
            "Expired";
        } else if (
          daysUntilExpiry <=
          30
        ) {
          expiryRisk =
            "Expiring Soon";
        }
      }
    }

    return {
      ...item,
      used90,
      used30,
      previous30Average:
        Number(
          previous30Average.toFixed(
            2
          )
        ),
      estimated30,
      averageDailyUsage:
        Number(
          averageDailyUsage.toFixed(
            2
          )
        ),
      daysOfStock,
      recommended,
      usageTrend,
      stockRisk,
      expiryRisk,
      daysUntilExpiry,
    };
  });

  const riskPriority = {
    Critical: 4,
    High: 3,
    Moderate: 2,
    Normal: 1,
  };

  return result.sort(
    (a, b) => {
      const riskDifference =
        (riskPriority[
          b.stockRisk
        ] || 0) -
        (riskPriority[
          a.stockRisk
        ] || 0);

      if (
        riskDifference !== 0
      ) {
        return riskDifference;
      }

      return (
        Number(
          b.recommended || 0
        ) -
        Number(
          a.recommended || 0
        )
      );
    }
  );
}

export async function summarizeForecastWithGroq(
  forecasts
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "Groq API key is not configured. Set REACT_APP_GROQ_API_KEY in your .env file and restart npm start."
    );
  }

  if (
    !forecasts ||
    forecasts.length === 0
  ) {
    return cleanAiResponse(
      `INVENTORY CONDITION

There is currently no inventory forecast data available.

USAGE AND DEMAND ANALYSIS

The system does not yet have enough recorded inventory usage information to analyze medicine consumption or supply demand.

RESTOCK PRIORITIES

No restock priority can be determined from the available data.

EXPIRY AND STOCK RISK

Inventory expiry and stock risks cannot be fully evaluated until inventory records and transaction history are available.

RECOMMENDED ACTIONS

Record Stock Out and Medicine Usage transactions consistently so PawCruz can analyze usage patterns and generate more reliable inventory demand estimates.

AI inventory analysis is based on available inventory and transaction records and is intended to support, not replace, clinic staff inventory decisions.`
    );
  }

  const riskPriority = {
    Critical: 4,
    High: 3,
    Moderate: 2,
    Normal: 1,
  };

  const sortedItems = [
    ...forecasts,
  ].sort((a, b) => {
    const riskDifference =
      (riskPriority[
        b.stockRisk
      ] || 0) -
      (riskPriority[
        a.stockRisk
      ] || 0);

    if (
      riskDifference !== 0
    ) {
      return riskDifference;
    }

    return (
      Number(
        b.recommended || 0
      ) -
      Number(
        a.recommended || 0
      )
    );
  });

  const topItems =
    sortedItems.slice(
      0,
      20
    );

  const itemAnalysis =
    topItems
      .map((row) => {
        const stockCoverage =
          row.daysOfStock ===
          null
            ? "No reliable stock coverage estimate because there is no recorded usage"
            : `${row.daysOfStock} estimated days of stock remaining`;

        const expiryInformation =
          row.expiry_date
            ? `${row.expiry_date}; status ${row.expiryRisk}${
                row.daysUntilExpiry !==
                null
                  ? `; ${row.daysUntilExpiry} days until expiry`
                  : ""
              }`
            : "No expiry date recorded";

        return [
          `Item: ${row.item_name}`,
          `SKU: ${row.sku}`,
          `Category: ${row.category}`,
          `Current stock: ${row.quantity} ${row.unit}`,
          `Reorder level: ${row.reorder_level} ${row.unit}`,
          `Used in last 90 days: ${row.used90} ${row.unit}`,
          `Used in latest 30 days: ${row.used30} ${row.unit}`,
          `Estimated next 30-day demand: ${row.estimated30} ${row.unit}`,
          `Average daily usage: ${row.averageDailyUsage} ${row.unit}`,
          `Usage trend: ${row.usageTrend}`,
          `Stock coverage: ${stockCoverage}`,
          `Stock risk: ${row.stockRisk}`,
          `Suggested restock: ${row.recommended} ${row.unit}`,
          `Expiry information: ${expiryInformation}`,
        ].join(" | ");
      })
      .join("\n");

  const totalItems =
    forecasts.length;

  const outOfStockItems =
    forecasts.filter(
      (row) =>
        Number(
          row.quantity || 0
        ) <= 0
    ).length;

  const lowStockItems =
    forecasts.filter(
      (row) =>
        Number(
          row.quantity || 0
        ) > 0 &&
        Number(
          row.quantity || 0
        ) <=
          Number(
            row.reorder_level ||
              0
          )
    ).length;

  const criticalItems =
    forecasts.filter(
      (row) =>
        row.stockRisk ===
        "Critical"
    ).length;

  const highRiskItems =
    forecasts.filter(
      (row) =>
        row.stockRisk ===
        "High"
    ).length;

  const moderateRiskItems =
    forecasts.filter(
      (row) =>
        row.stockRisk ===
        "Moderate"
    ).length;

  const normalItems =
    forecasts.filter(
      (row) =>
        row.stockRisk ===
        "Normal"
    ).length;

  const itemsNeedingRestock =
    forecasts.filter(
      (row) =>
        Number(
          row.recommended || 0
        ) > 0
    ).length;

  const totalRecommendedUnits =
    forecasts.reduce(
      (sum, row) =>
        sum +
        Number(
          row.recommended || 0
        ),
      0
    );

  const increasingDemandItems =
    forecasts.filter(
      (row) =>
        row.usageTrend ===
        "Increasing"
    ).length;

  const decreasingDemandItems =
    forecasts.filter(
      (row) =>
        row.usageTrend ===
        "Decreasing"
    ).length;

  const stableDemandItems =
    forecasts.filter(
      (row) =>
        row.usageTrend ===
        "Stable"
    ).length;

  const expiringSoonItems =
    forecasts.filter(
      (row) =>
        row.expiryRisk ===
        "Expiring Soon"
    ).length;

  const expiredItems =
    forecasts.filter(
      (row) =>
        row.expiryRisk ===
        "Expired"
    ).length;

  const totalUsage90 =
    forecasts.reduce(
      (sum, row) =>
        sum +
        Number(
          row.used90 || 0
        ),
      0
    );

  const totalUsage30 =
    forecasts.reduce(
      (sum, row) =>
        sum +
        Number(
          row.used30 || 0
        ),
      0
    );

  const totalEstimatedDemand =
    forecasts.reduce(
      (sum, row) =>
        sum +
        Number(
          row.estimated30 || 0
        ),
      0
    );

  const prompt = `
You are the AI Inventory Analyst of PawCruz Veterinary Clinic.

Analyze the clinic inventory using only the data supplied below.

Your response must perform actual inventory analysis. Do not simply repeat or summarize the table.

The analysis must examine:

Current inventory condition
Medicine and supply usage
Recent consumption trends
Estimated future demand
Low-stock risk
Out-of-stock risk
Estimated stock coverage
Restocking priorities
Expiration risk
Practical inventory actions

STRICT RULES

Use only the information provided below.

Never create or invent quantities, percentages, dates, transaction records, causes, diseases, seasonal explanations, appointment volumes, or medical reasons.

Historical usage and estimated demand must be clearly distinguished.

Estimated demand is based only on inventory transaction history and must not be described as guaranteed future consumption.

Do not claim that increasing medicine usage is caused by a disease, season, patient volume, or another factor unless that factor is explicitly present in the provided data.

Give higher priority to Critical and High stock-risk items.

Mention increasing usage only when the supplied Usage Trend states Increasing.

Mention decreasing usage only when the supplied Usage Trend states Decreasing.

Mention expiration concerns only when supported by the supplied expiry information.

Do not recommend unnecessary restocking when an item has sufficient current stock.

When there is little or no recorded usage, explain that there is not enough historical information for a strong demand estimate.

Use clear professional English suitable for administrators and clinic staff.

Do not use markdown.

Do not use asterisks.

Do not use hashtags.

Do not use markdown bullet symbols.

Do not use markdown tables.

Do not wrap headings in special characters.

SYSTEM INVENTORY INFORMATION

Total items analyzed: ${totalItems}

Stock condition:
Out of stock items: ${outOfStockItems}
Low stock items: ${lowStockItems}
Critical risk items: ${criticalItems}
High risk items: ${highRiskItems}
Moderate risk items: ${moderateRiskItems}
Normal risk items: ${normalItems}

Restocking:
Items requiring suggested restock: ${itemsNeedingRestock}
Total suggested restock units: ${totalRecommendedUnits}

Historical usage:
Total recorded usage or stock reduction during the last 90 days: ${totalUsage90}
Total recorded usage or stock reduction during the latest 30 days: ${totalUsage30}

Estimated demand:
Estimated combined demand for the next 30 days: ${totalEstimatedDemand}

Usage trends:
Items with increasing usage: ${increasingDemandItems}
Items with stable usage: ${stableDemandItems}
Items with decreasing usage: ${decreasingDemandItems}

Expiration:
Items expiring within 30 days: ${expiringSoonItems}
Expired items: ${expiredItems}

DETAILED INVENTORY INFORMATION

${itemAnalysis}

Write the response using exactly these section headings:

INVENTORY CONDITION

Explain the overall current inventory situation.

Identify important stock shortages or risks.

Mention the number of Critical, High, low-stock, or out-of-stock items when meaningful.

Do not repeat every statistic without analysis.

USAGE AND DEMAND ANALYSIS

Analyze recorded inventory consumption.

Compare recent 30-day usage with earlier usage patterns using the supplied Usage Trend.

Identify important items showing Increasing, Stable, or Decreasing consumption.

Explain that the next 30-day demand is an estimate based on transaction history.

Do not describe the estimate as guaranteed.

RESTOCK PRIORITIES

Identify the most important items requiring restocking.

For each important item, briefly explain why it should be prioritized using relevant information such as current stock, reorder level, recorded usage, estimated demand, stock coverage, stock risk, and usage trend.

Include the suggested restock quantity when provided.

Do not include items that do not require restocking unless there is an important inventory risk.

EXPIRY AND STOCK RISK

Identify items that are expired or expiring soon.

Explain whether staff should prioritize using, checking, or avoiding excessive restocking of near-expiry stock.

If no expiration concerns are present, state that briefly.

RECOMMENDED ACTIONS

Provide 3 to 5 specific and practical actions based only on the inventory data.

Actions may include urgent restocking, monitoring increasing consumption, reviewing low stock coverage, rotating near-expiry supplies, checking transaction records, or maintaining sufficient stock.

Do not provide generic recommendations unrelated to the data.

Finish with this exact sentence:

AI inventory analysis is based on available inventory and transaction records and is intended to support, not replace, clinic staff inventory decisions.
`;

  let response;

  try {
    response = await fetch(
      GROQ_ENDPOINT,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",

              content:
                "You are an inventory analyst for PawCruz Veterinary Clinic. Analyze current stock, inventory consumption, demand trends, stock coverage, expiration risk, and restocking priorities using only the provided database information. Never fabricate numbers or causes. Never use asterisks or markdown formatting.",
            },

            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.2,

          // openai/gpt-oss-20b is a reasoning model: part of max_tokens is
          // spent on an invisible internal "reasoning" pass before it writes
          // the actual answer into `content`. 1400 was tight enough that the
          // model could burn its whole budget reasoning and leave nothing
          // for content, coming back empty -- confirmed live, reasoning-token
          // usage for the same prompt ranged from ~380 to ~1100 tokens across
          // runs. Sized generously so that never happens.
          max_tokens: 4000,
        }),
      }
    );
  } catch (networkError) {
    console.error(
      "Groq inventory analysis network error",
      networkError
    );

    throw new Error(
      "Could not reach the AI inventory analysis service. Check your connection and try again."
    );
  }

  if (!response.ok) {
    const errorText =
      await response
        .text()
        .catch(() => "");

    console.error(
      "Groq inventory analysis error",
      response.status,
      errorText
    );

    if (
      response.status === 401
    ) {
      throw new Error(
        "The Groq API key is invalid or missing. Check REACT_APP_GROQ_API_KEY."
      );
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        "The Groq API request is not authorized. Check the API key and account permissions."
      );
    }

    if (
      response.status === 404
    ) {
      throw new Error(
        "The configured Groq model is unavailable. Check the GROQ_MODEL value."
      );
    }

    if (
      response.status === 429
    ) {
      throw new Error(
        "The AI inventory analysis service has reached its request limit. Please wait a moment and try again."
      );
    }

    if (
      response.status >= 500
    ) {
      throw new Error(
        "The AI inventory analysis service is temporarily unavailable. Please try again later."
      );
    }

    throw new Error(
      "Unable to generate the AI inventory analysis right now. Please try again."
    );
  }

  const data =
    await response.json();

  const text =
    data?.choices?.[0]
      ?.message?.content?.trim();

  if (!text) {
    throw new Error(
      "The AI inventory analysis came back empty. Please try again."
    );
  }

  return cleanAiResponse(
    text
  );
}

export function exportInventoryCsv(
  items
) {
  const headers = [
    "SKU",
    "Item Name",
    "Category",
    "Quantity",
    "Unit",
    "Unit Price",
    "Reorder Level",
    "Expiry Date",
    "Supplier",
    "Batch",
    "Status",
  ];

  const rows = (
    items || []
  ).map((item) => [
    item.sku,
    item.item_name,
    item.category,
    item.quantity,
    item.unit,
    item.unit_price,
    item.reorder_level,
    item.expiry_date || "",
    item.supplier_name ||
      "",
    item.batch_number || "",
    item.status,
  ]);

  const csv = [
    headers,
    ...rows,
  ]
    .map((row) =>
      row
        .map(
          (value) =>
            `"${String(
              value ?? ""
            ).replace(
              /"/g,
              '""'
            )}"`
        )
        .join(",")
    )
    .join("\n");

  const blob =
    new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;

  anchor.download =
    `pawcruz-inventory-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  document.body.removeChild(
    anchor
  );

  URL.revokeObjectURL(url);
}

const IMPORT_REQUIRED_FIELDS = [
  "item_name",
  "category",
  "sku",
  "unit",
  "expiry_date",
];

const IMPORT_COLUMN_ALIASES = {
  item_name: ["itemname", "name", "productname"],
  category: ["category", "productcategory"],
  sku: ["sku", "itemcode", "code"],
  description: ["description", "notes"],
  unit: ["unit", "unitofmeasure", "uom"],
  quantity: [
    "quantity",
    "qty",
    "currentstockquantity",
    "stock",
    "initialquantity",
  ],
  unit_price: ["unitprice", "price"],
  reorder_level: [
    "reorderlevel",
    "reorderpoint",
  ],
  expiry_date: ["expirydate", "expiry"],
  supplier_name: ["supplier", "suppliername"],
  batch_number: ["batch", "batchnumber"],
};

function normalizeHeaderCell(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeImportDate(value) {
  const trimmed = String(
    value || ""
  ).trim();

  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return parsed.toISOString().slice(0, 10);
}

// Minimal CSV reader: handles quoted fields (with embedded commas/quotes)
// and both \n and \r\n line endings without pulling in a parsing library.
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // Skip; a following \n (if any) closes the row.
    } else {
      field += char;
    }
  }

  if (field.length || row.length) pushRow();

  return rows.filter((cells) =>
    cells.some((cell) => String(cell || "").trim() !== "")
  );
}

/**
 * Parses a staff-uploaded inventory CSV into row objects shaped exactly like
 * the Add Item form's values, so each row can be handed to saveInventoryItem
 * unchanged and get the same validation as a manual entry.
 */
export function parseInventoryImportCsv(text) {
  const rows = parseCsvText(text);

  if (!rows.length) {
    return {
      items: [],
      errors: ["The file is empty."],
    };
  }

  const header = rows[0].map(normalizeHeaderCell);
  const columnIndex = {};

  Object.entries(IMPORT_COLUMN_ALIASES).forEach(([field, aliases]) => {
    const index = header.findIndex((cell) => aliases.includes(cell));
    if (index !== -1) columnIndex[field] = index;
  });

  const missingColumns = IMPORT_REQUIRED_FIELDS.filter(
    (field) => columnIndex[field] === undefined
  );

  if (missingColumns.length) {
    return {
      items: [],
      errors: [
        `The file is missing required column(s): ${missingColumns.join(
          ", "
        )}. Download the template to see the expected headers.`,
      ],
    };
  }

  const cell = (dataRow, field) =>
    columnIndex[field] !== undefined
      ? String(dataRow[columnIndex[field]] ?? "").trim()
      : "";

  const items = rows.slice(1).map((dataRow, index) => ({
    _row: index + 2,
    item_name: cell(dataRow, "item_name"),
    category: cell(dataRow, "category"),
    sku: cell(dataRow, "sku"),
    description: cell(dataRow, "description"),
    unit: cell(dataRow, "unit"),
    quantity: cell(dataRow, "quantity") || "0",
    unit_price: cell(dataRow, "unit_price") || "0",
    reorder_level: cell(dataRow, "reorder_level") || "0",
    expiry_date: normalizeImportDate(cell(dataRow, "expiry_date")),
    supplier_name: cell(dataRow, "supplier_name"),
    batch_number: cell(dataRow, "batch_number"),
  }));

  return { items, errors: [] };
}

export function downloadInventoryImportTemplate() {
  const headers = [
    "Item Name",
    "SKU",
    "Category",
    "Unit",
    "Quantity",
    "Unit Price",
    "Reorder Level",
    "Expiry Date",
    "Supplier",
    "Batch",
    "Description",
  ];

  const example = [
    "Amoxicillin 250mg",
    "AMX-250",
    "Antibiotics",
    "box",
    "50",
    "8.50",
    "10",
    "2026-12-31",
    "VetSupply Co.",
    "B-2026-01",
    "For canine and feline use",
  ];

  const csv = [headers, example]
    .map((row) =>
      row
        .map(
          (value) =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        )
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "pawcruz-inventory-import-template.csv";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}