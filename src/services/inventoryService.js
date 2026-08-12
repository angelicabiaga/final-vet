import { supabase } from "../config/supabaseClient";

const ITEM_FIELDS =
  "id,item_name,category,sku,description,quantity,unit,unit_price,reorder_level,expiry_date,supplier_name,batch_number,status,is_archived,created_by,created_at,updated_at";

const GROQ_API_KEY =
  process.env.REACT_APP_GROQ_API_KEY;

const GROQ_MODEL =
  "openai/gpt-oss-20b";

const GROQ_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";

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

  if (!includeArchived) {
    query = query.eq(
      "is_archived",
      false
    );
  }

  if (category) {
    query = query.eq(
      "category",
      category
    );
  }

  if (status) {
    query = query.eq(
      "status",
      status
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

  const today = new Date();
  today.setHours(
    0,
    0,
    0,
    0
  );

  const nearExpiry =
    new Date(today);

  nearExpiry.setDate(
    nearExpiry.getDate() + 30
  );

  const totalItems =
    rows.length;

  const totalUnits =
    rows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.quantity || 0
        ),
      0
    );

  const lowStock =
    rows.filter(
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

  const outOfStock =
    rows.filter(
      (row) =>
        Number(
          row.quantity || 0
        ) <= 0
    ).length;

  const expiringSoon =
    rows.filter((row) => {
      if (!row.expiry_date) {
        return false;
      }

      const expiry =
        normalizeDate(
          row.expiry_date
        );

      if (!expiry) {
        return false;
      }

      return (
        expiry >= today &&
        expiry <= nearExpiry
      );
    }).length;

  return {
    totalItems,
    totalUnits,
    lowStock,
    outOfStock,
    expiringSoon,
  };
}

export async function saveInventoryItem(
  values,
  profile
) {
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
    reorder_level: Number(
      values.reorder_level || 0
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
    !payload.unit ||
    !payload.expiry_date
  ) {
    throw new Error(
      "Item name, category, item code, unit, and expiry date are required."
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

  if (values.id) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "inventory_items"
      )
      .update(payload)
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

  const initialQuantity =
    Number(
      values.quantity || 0
    );

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

export async function recordInventoryTransaction(
  values,
  profile
) {
  const quantity =
    Number(values.quantity);

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

export async function getInventoryTransactions(
  itemId = "",
  limit = 100
) {
  let query = supabase
    .from(
      "inventory_transactions"
    )
    .select(
      "id,item_id,transaction_type,quantity,quantity_before,quantity_after,reason,notes,reference_type,reference_id,created_by,created_at"
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

  return rows.map(
    (row) => ({
      ...row,
      item:
        itemMap.get(
          row.item_id
        ) || null,
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

          max_tokens: 1400,
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