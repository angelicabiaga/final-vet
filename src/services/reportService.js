import { supabase } from "../config/supabaseClient";

async function safe(table, select = "*") {
  const { data, error } = await supabase.from(table).select(select);
  if (error) { console.warn(`Report source ${table}:`, error); return []; }
  return data || [];
}

export async function loadReports(filters = {}) {
  const [appointments, queues, pets, medical, inventory, inventoryTransactions, users, sales] = await Promise.all([
    safe("appointments"), safe("queue_entries"), safe("pets"), safe("medical_records"), safe("inventory_items"), safe("inventory_transactions"), safe("profiles"),
    safe("transactions", "id,or_number,created_at,payment_status,payment_method,subtotal,discount_amount,total_amount,transaction_items(item_name,item_type,quantity,line_total)")
  ]);
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null;
  const inRange = (value) => { if (!value) return true; const d = new Date(value); return (!from || d >= from) && (!to || d <= to); };
  const filteredAppointments = appointments.filter(a => inRange(a.appointment_date) && (!filters.status || a.status === filters.status) && (!filters.veterinarianId || a.veterinarian_id === filters.veterinarianId));
  const filteredQueues = queues.filter(q => inRange(q.created_at) && (!filters.veterinarianId || q.veterinarian_id === filters.veterinarianId));
  const filteredMedical = medical.filter(m => inRange(m.consultation_date || m.created_at) && (!filters.veterinarianId || m.veterinarian_id === filters.veterinarianId));
  const statusCounts = filteredAppointments.reduce((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a;},{});
  const sourceCounts = filteredAppointments.reduce((a,x)=>{const k=x.appointment_source||"Online";a[k]=(a[k]||0)+1;return a;},{});
  const speciesCounts = pets.reduce((a,x)=>{const k=x.species||"Unknown";a[k]=(a[k]||0)+1;return a;},{});
  const avg = (arr, fn) => arr.length ? arr.reduce((s,x)=>s+(fn(x)||0),0)/arr.length : 0;
  const waitMinutes = filteredQueues.filter(q=>q.called_at&&q.checked_in_at).map(q=>(new Date(q.called_at)-new Date(q.checked_in_at))/60000);
  const consultationMinutes = filteredQueues.filter(q=>q.consultation_end&&q.consultation_start).map(q=>(new Date(q.consultation_end)-new Date(q.consultation_start))/60000);
  const filteredSales = sales.filter(s => inRange(s.created_at));
  const paidSales = filteredSales.filter(s => s.payment_status === "Paid");
  const reversedSales = filteredSales.filter(s => ["Refunded", "Voided"].includes(s.payment_status));
  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const grossSales = sum(paidSales, "total_amount");
  const reversedAmount = sum(reversedSales, "total_amount");
  const paymentSales = paidSales.reduce((acc, row) => { acc[row.payment_method] = (acc[row.payment_method] || 0) + Number(row.total_amount || 0); return acc; }, {});
  const itemSales = paidSales.flatMap(s => s.transaction_items || []).reduce((acc, item) => {
    const key = `${item.item_type}:${item.item_name}`;
    if (!acc[key]) acc[key] = { name: item.item_name, type: item.item_type, quantity: 0, revenue: 0 };
    acc[key].quantity += Number(item.quantity || 0); acc[key].revenue += Number(item.line_total || 0); return acc;
  }, {});
  const ranked = Object.values(itemSales).sort((a,b) => b.quantity - a.quantity);
  const serviceTypes = ["Service", "Test"];
  return {
    appointments: filteredAppointments, queues: filteredQueues, medical: filteredMedical, inventory, transactions: inventoryTransactions, users, pets,
    sales: filteredSales, paymentSales: Object.entries(paymentSales).map(([name,value])=>({name,value})),
    bestProducts: ranked.filter(x=>!serviceTypes.includes(x.type)).slice(0,10),
    topServices: ranked.filter(x=>serviceTypes.includes(x.type)).slice(0,10),
    metrics: {
      appointmentTotal: filteredAppointments.length,
      online: sourceCounts.Online || 0,
      walkIn: sourceCounts["Walk-In"] || 0,
      queueTotal: filteredQueues.length,
      averageWait: Math.round(avg(waitMinutes, x=>x)),
      averageConsultation: Math.round(avg(consultationMinutes, x=>x)),
      petRegistrations: pets.filter(p=>inRange(p.created_at)).length,
      medicalActivity: filteredMedical.length,
      lowStock: inventory.filter(i=>["Low Stock","Out of Stock"].includes(i.status)).length,
      expiring: inventory.filter(i=>["Near Expiry","Expired"].includes(i.status)).length,
      users: users.length,
      grossSales, netSales: grossSales - reversedAmount, transactionCount: paidSales.length,
      averageTransaction: paidSales.length ? grossSales / paidSales.length : 0,
      discountsGiven: sum(paidSales, "discount_amount"), refundsVoids: reversedAmount,
      productSales: paidSales.flatMap(x=>x.transaction_items||[]).filter(x=>!serviceTypes.includes(x.item_type)).reduce((s,x)=>s+Number(x.line_total||0),0),
      serviceSales: paidSales.flatMap(x=>x.transaction_items||[]).filter(x=>serviceTypes.includes(x.item_type)).reduce((s,x)=>s+Number(x.line_total||0),0) + paidSales.reduce((s,x)=>s+Math.max(0,Number(x.total_amount||0)-(x.transaction_items||[]).reduce((a,i)=>a+Number(i.line_total||0),0)),0)
    }, statusCounts, sourceCounts, speciesCounts
  };
}

export function exportCsv(filename, rows) {
  if (!rows.length) return false;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(","), ...rows.map(r=>cols.map(c=>`"${String(r[c] ?? "").replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); return true;
}
