import { supabase } from "../config/supabaseClient";
import { formatTime12h } from "../utils/timeFormat";

async function safe(table, select = "*") {
  const { data, error } = await supabase.from(table).select(select);
  if (error) {
    console.warn(`Report source ${table}:`, error);
    return [];
  }
  return data || [];
}

function number(value) {
  return Number(value || 0);
}

function round2(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

function inDateRange(value, from, to) {
  if (!value) return false;
  const date = new Date(value);
  return (!from || date >= from) && (!to || date <= to);
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date) {
  const value = startOfDay(date);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

function startOfMonth(date) {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
}

function startOfYear(date) {
  const value = startOfDay(date);
  value.setMonth(0, 1);
  return value;
}

// Picks a chart bucket size from the selected range so a one-year report
// doesn't try to plot 365 daily points.
function trendGranularity(from, to) {
  if (!from || !to) return "day";
  const days = Math.max(1, (to - from) / 86400000);
  if (days <= 45) return "day";
  if (days <= 210) return "week";
  return "month";
}

function periodInfo(value, granularity) {
  const date = new Date(value);
  if (granularity === "week") {
    const start = startOfWeek(date);
    return { key: start.toISOString().slice(0, 10), label: `Wk of ${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` };
  }
  if (granularity === "month") {
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString("en-PH", { month: "short", year: "numeric" }) };
  }
  return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) };
}

function aggregateSales(transactions, items) {
  // The live transactions table has no refunded_amount/refunded_quantity
  // columns: a refund fully retires a transaction to payment_status
  // "Refunded" rather than tracking a partial-refund amount alongside "Paid".
  const paid = transactions.filter((transaction) => transaction.payment_status === "Paid");
  const refunded = transactions.filter((transaction) => transaction.payment_status === "Refunded");
  const voided = transactions.filter((transaction) => ["Voided", "Cancelled"].includes(transaction.payment_status));
  const paidIds = new Set(paid.map((transaction) => transaction.id));
  const paidItems = items.filter((item) => paidIds.has(item.transaction_id));
  const grossSales = paid.reduce((sum, transaction) => sum + number(transaction.subtotal || transaction.total_amount), 0);
  const netSales = paid.reduce((sum, transaction) => sum + number(transaction.total_amount), 0);
  const refundTotal = refunded.reduce((sum, transaction) => sum + number(transaction.total_amount), 0);
  const discounts = paid.reduce((sum, transaction) => sum + number(transaction.discount_amount), 0);
  const totalTransactions = paid.length;
  const productRows = paidItems.filter((item) => !["Service", "Consultation"].includes(item.item_type));
  const serviceRows = paidItems.filter((item) => ["Service", "Consultation"].includes(item.item_type));
  const productSales = productRows.reduce((sum, item) => sum + number(item.line_total), 0);
  const serviceSales = serviceRows.reduce((sum, item) => sum + number(item.line_total), 0) + paid.reduce((sum, transaction) => sum + number(transaction.checkup_fee), 0);

  const paymentMethodMap = new Map();
  paid.forEach((transaction) => {
    const method = transaction.payment_method || "Unspecified";
    paymentMethodMap.set(method, (paymentMethodMap.get(method) || 0) + number(transaction.total_amount));
  });

  const productMap = new Map();
  productRows.forEach((item) => {
    const current = productMap.get(item.item_name) || { name: item.item_name, quantity: 0, sales: 0 };
    current.quantity += number(item.quantity);
    current.sales += number(item.line_total);
    productMap.set(item.item_name, current);
  });

  const serviceMap = new Map();
  paid.filter((transaction) => number(transaction.checkup_fee) > 0).forEach((transaction) => {
    const current = serviceMap.get("Checkup / consultation") || { name: "Checkup / consultation", quantity: 0, sales: 0 };
    current.quantity += 1;
    current.sales += number(transaction.checkup_fee);
    serviceMap.set("Checkup / consultation", current);
  });
  serviceRows.forEach((item) => {
    const current = serviceMap.get(item.item_name) || { name: item.item_name, quantity: 0, sales: 0 };
    current.quantity += number(item.quantity);
    current.sales += number(item.line_total);
    serviceMap.set(item.item_name, current);
  });

  const productSalesList = [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales);
  const serviceSalesList = [...serviceMap.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales);

  return {
    grossSales,
    netSales,
    totalTransactions,
    averageTransactionValue: totalTransactions ? netSales / totalTransactions : 0,
    discounts,
    refunds: refundTotal,
    voidedTransactions: voided.length,
    productSales,
    serviceSales,
    salesByPaymentMethod: [...paymentMethodMap.entries()].map(([name, value]) => ({ name, value })),
    productSalesList,
    serviceSalesList,
    bestSellingProducts: productSalesList.slice(0, 6),
    mostAvailedServices: serviceSalesList.slice(0, 6),
  };
}

function buildSalesTrend(transactions, granularity) {
  const map = new Map();
  transactions.filter((transaction) => transaction.payment_status === "Paid").forEach((transaction) => {
    if (!transaction.created_at) return;
    const { key, label } = periodInfo(transaction.created_at, granularity);
    const current = map.get(key) || { period: key, label, grossSales: 0, netSales: 0 };
    current.grossSales += number(transaction.subtotal || transaction.total_amount);
    current.netSales += number(transaction.total_amount);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function buildAppointmentTrend(appointments, granularity) {
  const map = new Map();
  appointments.forEach((appointment) => {
    if (!appointment.appointment_date) return;
    const { key, label } = periodInfo(appointment.appointment_date, granularity);
    const current = map.get(key) || { period: key, label, total: 0, completed: 0, cancelled: 0 };
    current.total += 1;
    if (appointment.status === "Completed") current.completed += 1;
    if (appointment.status === "Cancelled") current.cancelled += 1;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function buildVeterinarianBreakdown(appointments, users) {
  const nameMap = new Map(users.map((user) => [user.id, user.full_name || user.username || "Unassigned"]));
  const map = new Map();
  appointments.forEach((appointment) => {
    const id = appointment.veterinarian_id || "unassigned";
    const current = map.get(id) || { veterinarianId: id, name: nameMap.get(appointment.veterinarian_id) || "Unassigned", total: 0, completed: 0, cancelled: 0, confirmed: 0 };
    current.total += 1;
    if (appointment.status === "Completed") current.completed += 1;
    else if (appointment.status === "Cancelled") current.cancelled += 1;
    else current.confirmed += 1;
    map.set(id, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function buildBusiestHours(queues) {
  const counts = new Array(24).fill(0);
  queues.forEach((queue) => {
    if (!queue.arrived_at) return;
    counts[new Date(queue.arrived_at).getHours()] += 1;
  });
  return counts.map((count, hour) => ({ hour: formatTime12h(`${String(hour).padStart(2, "0")}:00`), count }));
}

function buildBusiestDays(queues) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0);
  queues.forEach((queue) => {
    if (!queue.arrived_at) return;
    counts[new Date(queue.arrived_at).getDay()] += 1;
  });
  return counts.map((count, index) => ({ day: labels[index], count }));
}

function peakLabel(rows, valueKey, labelKey) {
  if (!rows.length) return "No data yet";
  const peak = rows.reduce((best, row) => (row[valueKey] > best[valueKey] ? row : best), rows[0]);
  return peak[valueKey] > 0 ? `${peak[labelKey]} (${peak[valueKey]} visits)` : "No data yet";
}

function buildStockMovementTrend(movements, granularity) {
  const map = new Map();
  movements.forEach((movement) => {
    if (!movement.created_at) return;
    const { key, label } = periodInfo(movement.created_at, granularity);
    const current = map.get(key) || { period: key, label, stockIn: 0, stockOut: 0 };
    if (movement.transaction_type === "Stock In") current.stockIn += number(movement.quantity);
    else if (movement.transaction_type === "Stock Out") current.stockOut += number(movement.quantity);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function buildInventoryReport(inventory, movements) {
  const rows = inventory.filter((item) => !item.is_archived);
  const itemNameMap = new Map(inventory.map((item) => [item.id, item.item_name]));
  const namedMovements = movements
    .map((movement) => ({ ...movement, itemName: itemNameMap.get(movement.item_id) || "Unknown item" }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    totalItems: rows.length,
    totalUnits: round2(rows.reduce((sum, item) => sum + number(item.quantity), 0)),
    inStock: rows.filter((item) => item.status === "In Stock").length,
    lowStock: rows.filter((item) => item.status === "Low Stock").length,
    outOfStock: rows.filter((item) => item.status === "Out of Stock").length,
    nearExpiry: rows.filter((item) => item.status === "Near Expiry").length,
    expired: rows.filter((item) => item.status === "Expired").length,
    stockInUnits: round2(namedMovements.filter((movement) => movement.transaction_type === "Stock In").reduce((sum, movement) => sum + number(movement.quantity), 0)),
    stockOutUnits: round2(namedMovements.filter((movement) => movement.transaction_type === "Stock Out").reduce((sum, movement) => sum + number(movement.quantity), 0)),
    movements: namedMovements,
  };
}

export async function loadReports(filters = {}) {
  const [appointments, queues, inventory, inventoryMovements, transactions, transactionItems, users] = await Promise.all([
    safe("appointments", "id,pet_id,owner_id,veterinarian_id,appointment_date,start_time,status,appointment_source,visit_reason,created_at"),
    safe("queue_entries", "id,queue_date,pet_id,owner_id,veterinarian_id,source,status,arrived_at,called_at,consultation_started_at,consultation_ended_at,created_at"),
    safe("inventory_items", "id,item_name,category,quantity,unit,reorder_level,expiry_date,status,is_archived,updated_at"),
    safe("inventory_transactions", "id,item_id,transaction_type,quantity,quantity_before,quantity_after,reason,reference_type,created_at"),
    safe("transactions", "id,or_number,pet_id,owner_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,created_at"),
    safe("transaction_items", "id,transaction_id,item_type,item_name,quantity,unit_price,line_total"),
    safe("profiles", "id,full_name,username,role"),
  ]);

  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;
  const granularity = trendGranularity(from, to);

  const filteredAppointments = appointments.filter((appointment) => inDateRange(appointment.appointment_date, from, to) && (!filters.status || appointment.status === filters.status) && (!filters.veterinarianId || appointment.veterinarian_id === filters.veterinarianId));
  const filteredQueues = queues.filter((queue) => inDateRange(queue.arrived_at || queue.created_at, from, to) && (!filters.veterinarianId || queue.veterinarian_id === filters.veterinarianId));
  const filteredTransactions = transactions.filter((transaction) => inDateRange(transaction.created_at, from, to));
  const filteredTransactionIds = new Set(filteredTransactions.map((transaction) => transaction.id));
  const filteredTransactionItems = transactionItems.filter((item) => filteredTransactionIds.has(item.transaction_id));
  const filteredMovements = inventoryMovements.filter((movement) => inDateRange(movement.created_at, from, to));

  const now = new Date();
  const periodSales = {
    daily: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfDay(now), now)), transactionItems),
    monthly: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfMonth(now), now)), transactionItems),
    yearly: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfYear(now), now)), transactionItems),
  };

  const statusCounts = filteredAppointments.reduce((counts, appointment) => ({ ...counts, [appointment.status]: (counts[appointment.status] || 0) + 1 }), {});
  const sales = aggregateSales(filteredTransactions, filteredTransactionItems);
  const inventoryReport = buildInventoryReport(inventory, filteredMovements);

  const waiting = filteredQueues.filter((queue) => queue.status === "Waiting").length;
  const serving = filteredQueues.filter((queue) => queue.status === "Serving").length;
  const patientsServed = filteredQueues.filter((queue) => queue.status === "Completed").length;

  // Wait time = check-in (arrived_at) to consultation start; the queue module
  // never writes called_at, so that column is intentionally not used here.
  const waitMinutes = filteredQueues
    .filter((queue) => queue.arrived_at && queue.consultation_started_at)
    .map((queue) => Math.max(0, (new Date(queue.consultation_started_at) - new Date(queue.arrived_at)) / 60000));
  const consultationMinutes = filteredQueues
    .filter((queue) => queue.consultation_started_at && queue.consultation_ended_at)
    .map((queue) => Math.max(0, (new Date(queue.consultation_ended_at) - new Date(queue.consultation_started_at)) / 60000));
  const average = (rows) => (rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0);
  const busiestHours = buildBusiestHours(filteredQueues);
  const busiestDays = buildBusiestDays(filteredQueues);

  const queueReport = {
    total: filteredQueues.length,
    waiting,
    serving,
    patientsServed,
    averageWaitMinutes: Math.round(average(waitMinutes)),
    averageConsultationMinutes: Math.round(average(consultationMinutes)),
    busiestHours,
    busiestDays,
    busiestHourLabel: peakLabel(busiestHours, "count", "hour"),
    busiestDayLabel: peakLabel(busiestDays, "count", "day"),
  };

  const appointmentReport = {
    total: filteredAppointments.length,
    completed: statusCounts.Completed || 0,
    cancelled: statusCounts.Cancelled || 0,
    confirmed: statusCounts.Confirmed || 0,
    statusCounts,
    trend: buildAppointmentTrend(filteredAppointments, granularity),
    byVeterinarian: buildVeterinarianBreakdown(filteredAppointments, users),
  };

  return {
    filters: { from: filters.from || null, to: filters.to || null },
    granularity,
    appointments: filteredAppointments,
    queues: filteredQueues,
    inventory: inventory.filter((item) => !item.is_archived),
    transactions: filteredTransactions,
    transactionItems: filteredTransactionItems,
    users,
    sales: { ...sales, periods: periodSales, trend: buildSalesTrend(filteredTransactions, granularity) },
    inventoryReport: { ...inventoryReport, movementTrend: buildStockMovementTrend(filteredMovements, granularity) },
    appointmentReport,
    queueReport,
    kpis: {
      totalSales: sales.netSales,
      transactions: sales.totalTransactions,
      appointments: filteredAppointments.length,
      patientsServed,
      lowStock: inventoryReport.lowStock + inventoryReport.outOfStock,
    },
  };
}

export function exportCsv(filename, rows) {
  if (!rows.length) return false;
  const columns = Object.keys(rows[0]);
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
