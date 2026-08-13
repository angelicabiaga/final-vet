import { supabase } from "../config/supabaseClient";

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

function aggregateSales(transactions, items) {
  const paid = transactions.filter((transaction) => ["Paid", "Completed"].includes(transaction.payment_status));
  const refunded = transactions.filter((transaction) => transaction.payment_status === "Refunded");
  const voided = transactions.filter((transaction) => ["Voided", "Cancelled"].includes(transaction.payment_status));
  const paidIds = new Set(paid.map((transaction) => transaction.id));
  const paidItems = items.filter((item) => paidIds.has(item.transaction_id));
  const grossSales = paid.reduce((sum, transaction) => sum + number(transaction.total_amount), 0);
  const partialRefunds = paid.reduce((sum, transaction) => sum + number(transaction.refunded_amount), 0);
  const refundTotal = refunded.reduce((sum, transaction) => sum + number(transaction.refunded_amount || transaction.total_amount), 0) + partialRefunds;
  const discounts = paid.reduce((sum, transaction) => sum + number(transaction.discount_amount), 0);
  const netSales = Math.max(0, grossSales - partialRefunds);
  const totalTransactions = paid.length;
  const productRows = paidItems.filter((item) => !["Service", "Consultation"].includes(item.item_type));
  const serviceRows = paidItems.filter((item) => ["Service", "Consultation"].includes(item.item_type));
  const productSales = productRows.reduce((sum, item) => sum + number(item.line_total), 0);
  const serviceSales = serviceRows.reduce((sum, item) => sum + number(item.line_total), 0) + paid.reduce((sum, transaction) => sum + number(transaction.checkup_fee), 0);

  const paymentMethodMap = new Map();
  paid.forEach((transaction) => {
    const method = transaction.payment_method || "Unspecified";
    paymentMethodMap.set(method, (paymentMethodMap.get(method) || 0) + number(transaction.total_amount) - number(transaction.refunded_amount));
  });

  const productMap = new Map();
  productRows.forEach((item) => {
    const current = productMap.get(item.item_name) || { name: item.item_name, quantity: 0, sales: 0 };
    current.quantity += Math.max(0, number(item.quantity) - number(item.refunded_quantity));
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
    current.quantity += Math.max(0, number(item.quantity) - number(item.refunded_quantity));
    current.sales += number(item.line_total);
    serviceMap.set(item.item_name, current);
  });

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
    bestSellingProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales).slice(0, 5),
    mostAvailedServices: [...serviceMap.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales).slice(0, 5),
  };
}

export async function loadReports(filters = {}) {
  const [appointments, queues, pets, medical, inventory, transactions, transactionItems, users] = await Promise.all([
    safe("appointments"),
    safe("queue_entries"),
    safe("pets"),
    safe("medical_records"),
    safe("inventory_items"),
    safe("transactions", "id,or_number,pet_id,owner_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,refunded_amount,created_at"),
    safe("transaction_items", "id,transaction_id,item_type,item_name,quantity,unit_price,line_total,refunded_quantity,deduct_inventory"),
    safe("profiles"),
  ]);

  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;
  const filteredAppointments = appointments.filter((appointment) => inDateRange(appointment.appointment_date, from, to) && (!filters.status || appointment.status === filters.status) && (!filters.veterinarianId || appointment.veterinarian_id === filters.veterinarianId));
  const filteredQueues = queues.filter((queue) => inDateRange(queue.created_at, from, to) && (!filters.veterinarianId || queue.veterinarian_id === filters.veterinarianId));
  const filteredMedical = medical.filter((record) => inDateRange(record.consultation_date || record.created_at, from, to) && (!filters.veterinarianId || record.veterinarian_id === filters.veterinarianId));
  const filteredTransactions = transactions.filter((transaction) => inDateRange(transaction.created_at, from, to));
  const filteredTransactionIds = new Set(filteredTransactions.map((transaction) => transaction.id));
  const filteredTransactionItems = transactionItems.filter((item) => filteredTransactionIds.has(item.transaction_id));
  const now = new Date();
  const periodSales = {
    daily: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfDay(now), now)), transactionItems),
    weekly: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfWeek(now), now)), transactionItems),
    monthly: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfMonth(now), now)), transactionItems),
    yearly: aggregateSales(transactions.filter((transaction) => inDateRange(transaction.created_at, startOfYear(now), now)), transactionItems),
  };
  const statusCounts = filteredAppointments.reduce((counts, appointment) => ({ ...counts, [appointment.status]: (counts[appointment.status] || 0) + 1 }), {});
  const sourceCounts = filteredAppointments.reduce((counts, appointment) => { const source = appointment.appointment_source || "Online"; return { ...counts, [source]: (counts[source] || 0) + 1 }; }, {});
  const speciesCounts = pets.reduce((counts, pet) => { const species = pet.species || "Unknown"; return { ...counts, [species]: (counts[species] || 0) + 1 }; }, {});
  const average = (rows, transform) => rows.length ? rows.reduce((sum, row) => sum + (transform(row) || 0), 0) / rows.length : 0;
  const waitMinutes = filteredQueues.filter((queue) => queue.called_at && queue.checked_in_at).map((queue) => (new Date(queue.called_at) - new Date(queue.checked_in_at)) / 60000);
  const consultationMinutes = filteredQueues.filter((queue) => queue.consultation_end && queue.consultation_start).map((queue) => (new Date(queue.consultation_end) - new Date(queue.consultation_start)) / 60000);
  const sales = aggregateSales(filteredTransactions, filteredTransactionItems);

  return {
    appointments: filteredAppointments,
    queues: filteredQueues,
    medical: filteredMedical,
    inventory,
    transactions: filteredTransactions,
    transactionItems: filteredTransactionItems,
    users,
    pets,
    sales: { ...sales, periods: periodSales },
    metrics: {
      appointmentTotal: filteredAppointments.length,
      online: sourceCounts.Online || 0,
      walkIn: sourceCounts["Walk-In"] || 0,
      queueTotal: filteredQueues.length,
      averageWait: Math.round(average(waitMinutes, (value) => value)),
      averageConsultation: Math.round(average(consultationMinutes, (value) => value)),
      petRegistrations: pets.filter((pet) => inDateRange(pet.created_at, from, to)).length,
      medicalActivity: filteredMedical.length,
      lowStock: inventory.filter((item) => ["Low Stock", "Out of Stock"].includes(item.status)).length,
      expiring: inventory.filter((item) => ["Near Expiry", "Expired"].includes(item.status)).length,
      users: users.length,
    },
    statusCounts,
    sourceCounts,
    speciesCounts,
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
