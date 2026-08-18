// Shared parsing/derivation helpers for summarizeForecastWithGroq's plain-text
// output and the real forecast rows from getInventoryForecasts. Nothing here
// calls the AI or changes its prompt -- these only reformat the unchanged
// returned text and unchanged computed fields for display in
// InventoryForecastReport.

import { toSentences } from "./predictiveHealthParsing";

// The exact section headings the unchanged prompt instructs the model to
// use -- this only decides how the returned text is split into cards.
export const FORECAST_SECTION_HEADINGS = [
  "INVENTORY CONDITION",
  "USAGE AND DEMAND ANALYSIS",
  "RESTOCK PRIORITIES",
  "EXPIRY AND STOCK RISK",
  "RECOMMENDED ACTIONS",
];

export function parseForecastReport(text) {
  const sections = {};
  let current = null;
  let disclaimer = "";

  String(text || "")
    .split("\n")
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const upper = line.toUpperCase();

      if (FORECAST_SECTION_HEADINGS.includes(upper)) {
        current = upper;
        sections[current] = sections[current] || [];
        return;
      }

      if (line.toLowerCase().startsWith("ai inventory analysis is based")) {
        disclaimer = line;
        current = null;
        return;
      }

      if (current) sections[current].push(line);
    });

  return { sections, disclaimer };
}

// Finds the first AI-written sentence (from the unchanged narrative) that
// names this item, so "Items at Risk" can show the model's own reasoning
// next to the item instead of a generic label.
export function findItemMention(itemName, text) {
  if (!itemName || !text) return "";
  const needle = itemName.toLowerCase();
  const sentence = toSentences(text).find((line) => line.toLowerCase().includes(needle));
  return sentence || "";
}

// Local, rules-based signal only -- never AI-generated. Flags an item as
// holding materially more stock than it needs: either far more than six
// months of runway at the recorded usage rate, or -- when there is no
// recorded usage at all -- a quantity well beyond a healthy multiple of
// the reorder level.
function isOverstocked(row) {
  const quantity = Number(row.quantity || 0);
  const reorderLevel = Number(row.reorder_level || 0);

  if (row.daysOfStock !== null && row.daysOfStock !== undefined) {
    return row.daysOfStock > 180;
  }

  return reorderLevel > 0 && quantity > reorderLevel * 4;
}

// Maps each item's already-computed stockRisk/expiryRisk/quantity fields to
// the exact badge vocabulary requested for the UI (Low Stock, Out of Stock,
// Overstock, Near Expiry, Expired). Purely a display mapping over real,
// unchanged fields -- computes nothing new about risk severity itself.
export function classifyStockBadges(row) {
  const badges = [];
  const quantity = Number(row.quantity || 0);
  const reorderLevel = Number(row.reorder_level || 0);

  if (quantity <= 0) {
    badges.push({ code: "out-of-stock", label: "Out of Stock" });
  } else if (quantity <= reorderLevel || row.stockRisk === "High" || row.stockRisk === "Critical") {
    badges.push({ code: "low-stock", label: "Low Stock" });
  } else if (isOverstocked(row)) {
    badges.push({ code: "overstock", label: "Overstock" });
  }

  if (row.expiryRisk === "Expired") {
    badges.push({ code: "expired", label: "Expired" });
  } else if (row.expiryRisk === "Expiring Soon") {
    badges.push({ code: "near-expiry", label: "Near Expiry" });
  }

  return badges;
}

// Projects a stock-out date from today + daysOfStock. Never invents a date
// when there isn't enough usage history to support one.
export function estimateStockOutDate(row) {
  const quantity = Number(row.quantity || 0);

  if (quantity <= 0) {
    return { label: "Already out of stock", date: null };
  }

  if (row.daysOfStock === null || row.daysOfStock === undefined) {
    return { label: "Not enough usage data to estimate", date: null };
  }

  const date = new Date();
  date.setDate(date.getDate() + row.daysOfStock);

  return {
    label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    date,
  };
}

export function defaultRiskReason(row, badges) {
  const codes = badges.map((badge) => badge.code);
  const parts = [];

  if (codes.includes("out-of-stock")) {
    parts.push(`Currently at ${row.quantity} ${row.unit}, at or below the reorder level of ${row.reorder_level} ${row.unit}.`);
  } else if (codes.includes("low-stock")) {
    parts.push(
      row.daysOfStock !== null && row.daysOfStock !== undefined
        ? `About ${row.daysOfStock} day(s) of stock remaining at the recorded usage rate.`
        : `${row.quantity} ${row.unit} on hand, at or below the reorder level of ${row.reorder_level} ${row.unit}.`
    );
  }

  if (codes.includes("overstock")) {
    parts.push(
      row.daysOfStock !== null && row.daysOfStock !== undefined
        ? `Current stock covers roughly ${row.daysOfStock} days at the recorded usage rate, well beyond typical coverage.`
        : `${row.quantity} ${row.unit} on hand with no recorded usage against a reorder level of ${row.reorder_level} ${row.unit}.`
    );
  }

  if (codes.includes("expired")) {
    parts.push(`Marked expired${row.expiry_date ? ` on ${row.expiry_date}` : ""}.`);
  } else if (codes.includes("near-expiry")) {
    parts.push(`Expires in ${row.daysUntilExpiry} day(s)${row.expiry_date ? ` (${row.expiry_date})` : ""}.`);
  }

  return parts.join(" ");
}

export function computeForecastOverview(forecasts) {
  const rows = forecasts || [];

  return {
    totalItems: rows.length,
    outOfStock: rows.filter((row) => Number(row.quantity || 0) <= 0).length,
    lowStock: rows.filter(
      (row) => Number(row.quantity || 0) > 0 && Number(row.quantity || 0) <= Number(row.reorder_level || 0)
    ).length,
    expiringSoon: rows.filter((row) => row.expiryRisk === "Expiring Soon").length,
    expired: rows.filter((row) => row.expiryRisk === "Expired").length,
    totalRecommended: rows.reduce((sum, row) => sum + Number(row.recommended || 0), 0),
  };
}
