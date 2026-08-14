import React, { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarCheck, Download, Printer, Receipt, RefreshCw, Stethoscope, TriangleAlert, Wallet } from "lucide-react";

import AppShell from "../../components/AppShell";
import { supabase } from "../../config/supabaseClient";
import { exportCsv, loadReports } from "../../services/reportService";
import pawLogo from "../../assets/reference/paw.png";

const PALETTE = ["#4DA8DA", "#4CAF78", "#F4B942", "#e16e64", "#8E7CC3", "#34B3A4"];

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function count(value) {
  return Number(value || 0).toLocaleString("en-PH");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function maxOf(rows, key) {
  return (rows || []).reduce((max, row) => Math.max(max, Number(row[key]) || 0), 1);
}

// Print-only horizontal bar row (label + proportional bar + value). Avoids
// re-rendering recharts SVGs for print, which paginate unreliably.
function PrintBar({ label, value, max, format }) {
  const numeric = Number(value) || 0;
  const pct = max > 0 ? Math.max(numeric > 0 ? 3 : 0, Math.round((numeric / max) * 100)) : 0;
  return (
    <div className="pbar-row">
      <span className="pbar-label">{label}</span>
      <span className="pbar-track"><span className="pbar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="pbar-value">{format ? format(numeric) : count(numeric)}</span>
    </div>
  );
}

export default function ReportsAnalytics({ profile }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ from: firstDay, to: today, status: "", veterinarianId: "" });
  const [data, setData] = useState(null);
  const [veterinarians, setVeterinarians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await loadReports(filters)); }
    catch (loadError) { setError(loadError.message || "Unable to load reports."); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase.from("profiles").select("id,full_name,role").eq("role", "veterinarian").then(({ data: rows }) => setVeterinarians(rows || []));
  }, []);

  function applyPreset(preset) {
    const now = new Date();
    let from = now;
    if (preset === "week") from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    if (preset === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (preset === "year") from = new Date(now.getFullYear(), 0, 1);
    setFilters((current) => ({ ...current, from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }));
  }

  const sales = data?.sales || {};
  const inventory = data?.inventoryReport || {};
  const appointmentReport = data?.appointmentReport || {};
  const queueReport = data?.queueReport || {};
  const kpis = data?.kpis || {};

  const appointmentStatus = Object.entries(appointmentReport.statusCounts || {}).map(([name, value]) => ({ name, value }));
  const inventoryStatus = [
    { name: "In Stock", value: inventory.inStock || 0 },
    { name: "Low Stock", value: inventory.lowStock || 0 },
    { name: "Out of Stock", value: inventory.outOfStock || 0 },
    { name: "Near Expiry", value: inventory.nearExpiry || 0 },
  ].filter((row) => row.value > 0);
  const queueStatus = [
    { name: "Waiting", value: queueReport.waiting || 0 },
    { name: "Serving", value: queueReport.serving || 0 },
    { name: "Served", value: queueReport.patientsServed || 0 },
  ].filter((row) => row.value > 0);

  function exportSales() {
    const rows = (data?.transactions || []).map((transaction) => ({
      or_number: transaction.or_number,
      date_time: transaction.created_at,
      payment_method: transaction.payment_method,
      payment_status: transaction.payment_status,
      subtotal: transaction.subtotal,
      discount_amount: transaction.discount_amount,
      total_amount: transaction.total_amount,
      amount_paid: transaction.amount_paid,
      change_amount: transaction.change_amount,
    }));
    exportCsv(`pawcruz-pos-sales-${filters.from}-${filters.to}.csv`, rows);
  }

  function exportInventorySnapshot() {
    const rows = (data?.inventory || []).map((item) => ({
      item_name: item.item_name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      reorder_level: item.reorder_level,
      status: item.status,
      expiry_date: item.expiry_date,
    }));
    exportCsv(`pawcruz-inventory-snapshot-${today}.csv`, rows);
  }

  function exportStockMovements() {
    const rows = (inventory.movements || []).map((movement) => ({
      date_time: movement.created_at,
      item_name: movement.itemName,
      type: movement.transaction_type,
      quantity: movement.quantity,
      quantity_before: movement.quantity_before,
      quantity_after: movement.quantity_after,
      reason: movement.reason,
    }));
    exportCsv(`pawcruz-stock-movements-${filters.from}-${filters.to}.csv`, rows);
  }

  function exportAppointments() {
    const rows = (data?.appointments || []).map((appointment) => ({
      appointment_date: appointment.appointment_date,
      start_time: appointment.start_time,
      status: appointment.status,
      source: appointment.appointment_source,
      visit_reason: appointment.visit_reason,
      veterinarian_id: appointment.veterinarian_id,
    }));
    exportCsv(`pawcruz-appointments-${filters.from}-${filters.to}.csv`, rows);
  }

  function exportQueueLog() {
    const rows = (data?.queues || []).map((queue) => ({
      queue_date: queue.queue_date,
      status: queue.status,
      source: queue.source,
      arrived_at: queue.arrived_at,
      consultation_started_at: queue.consultation_started_at,
      consultation_ended_at: queue.consultation_ended_at,
    }));
    exportCsv(`pawcruz-queue-log-${filters.from}-${filters.to}.csv`, rows);
  }

  const kpiCards = [
    { icon: <Wallet size={18} />, label: "Total Sales", value: money(kpis.totalSales) },
    { icon: <Receipt size={18} />, label: "Transactions", value: count(kpis.transactions) },
    { icon: <CalendarCheck size={18} />, label: "Appointments", value: count(kpis.appointments) },
    { icon: <Stethoscope size={18} />, label: "Patients Served", value: count(kpis.patientsServed) },
    { icon: <TriangleAlert size={18} />, label: "Low Stock", value: count(kpis.lowStock) },
  ];

  // ---- Print-only report data (screen data reorganized for a printable
  // clinic report; no new sources, everything comes from `data` above) ----
  const generatedAt = new Date().toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const inventoryItems = data?.inventory || [];
  const lowStockOnly = inventoryItems.filter((item) => item.status === "Low Stock");
  const outOfStockOnly = inventoryItems.filter((item) => item.status === "Out of Stock");
  const nearExpiryOnly = inventoryItems.filter((item) => item.status === "Near Expiry" || item.status === "Expired");
  const topProducts = (sales.productSalesList || []).slice(0, 10);
  const topServices = (sales.serviceSalesList || []).slice(0, 10);
  const productsSold = (sales.productSalesList || []).slice(0, 10);

  return <AppShell profile={profile} title="Reports & Analytics"><div className="reports">
    <div className="screen-only">
    <div className="head">
      <div><h2>Reports & Analytics</h2><p>Automatically generated, read-only summaries from POS, Inventory, Appointments, and Queue records.</p></div>
      <div><button className="soft" onClick={load}><RefreshCw size={16} /> Refresh</button><button className="soft" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
    </div>

    {error && <div className="error">{error}</div>}

    <div className="filters">
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
      <label>Veterinarian<select value={filters.veterinarianId} onChange={(event) => setFilters((current) => ({ ...current, veterinarianId: event.target.value }))}><option value="">All veterinarians</option>{veterinarians.map((veterinarian) => <option key={veterinarian.id} value={veterinarian.id}>{veterinarian.full_name}</option>)}</select></label>
      <label>Appointment status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{["Confirmed", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <div className="presets">
        <button className="chip" onClick={() => applyPreset("today")}>Today</button>
        <button className="chip" onClick={() => applyPreset("week")}>This week</button>
        <button className="chip" onClick={() => applyPreset("month")}>This month</button>
        <button className="chip" onClick={() => applyPreset("year")}>This year</button>
      </div>
      <button onClick={load}>Apply</button>
    </div>

    {loading ? <div className="card">Loading analytics…</div> : <>
      <section className="kpi-row">{kpiCards.map((kpi) => <article key={kpi.label} className="kpi"><span className="kpi-icon">{kpi.icon}</span><div><b>{kpi.value}</b><span>{kpi.label}</span></div></article>)}</section>

      <section className="panel">
        <div className="panel-head"><div><h3>Sales</h3><span>Only Paid POS transactions contribute to revenue. Source: POS Transaction History.</span></div><button className="soft" onClick={exportSales}><Download size={16} /> Export POS Sales</button></div>
        <div className="stat-grid">{[
          ["Gross sales", money(sales.grossSales), "Paid POS revenue"],
          ["Net sales", money(sales.netSales), "After recorded item refunds"],
          ["Transactions", count(sales.totalTransactions), "Paid POS sales"],
          ["Average transaction", money(sales.averageTransactionValue), "Net sales per paid sale"],
          ["Discounts given", money(sales.discounts), "Recorded POS discounts"],
          ["Refunds", money(sales.refunds), "Full and item refunds"],
          ["Voids / cancelled", count(sales.voidedTransactions), "Excluded from sales"],
          ["Product sales", money(sales.productSales), "Inventory-linked items"],
          ["Service sales", money(sales.serviceSales), "Checkups and services"],
        ].map(([label, value, detail]) => <article key={label}><b>{value}</b><span>{label}</span><small>{detail}</small></article>)}</div>

        <div className="period-row">{[["Daily", sales.periods?.daily?.netSales], ["Monthly", sales.periods?.monthly?.netSales], ["Yearly", sales.periods?.yearly?.netSales]].map(([label, value]) => <article key={label}><span>{label} sales</span><b>{money(value)}</b></article>)}</div>

        <div className="charts">
          <section><h4>Sales Trend</h4><ResponsiveContainer width="100%" height={260}><LineChart data={sales.trend || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Legend /><Line type="monotone" dataKey="grossSales" name="Gross" stroke={PALETTE[0]} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="netSales" name="Net" stroke={PALETTE[1]} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></section>
          <section><h4>Sales by Payment Method</h4><ResponsiveContainer width="100%" height={260}><BarChart data={sales.salesByPaymentMethod || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Bar dataKey="value" fill={PALETTE[0]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
          <section><h4>Best-Selling Products</h4><ResponsiveContainer width="100%" height={260}><BarChart data={sales.bestSellingProducts || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="quantity" fill={PALETTE[1]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
          <section><h4>Most Availed Services</h4><ResponsiveContainer width="100%" height={260}><BarChart data={sales.mostAvailedServices || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="quantity" fill={PALETTE[2]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Inventory</h3><span>Live stock snapshot plus stock movements recorded in the selected date range.</span></div><div className="panel-actions"><button className="soft" onClick={exportInventorySnapshot}><Download size={16} /> Export Inventory</button><button className="soft" onClick={exportStockMovements}><Download size={16} /> Export Stock Movements</button></div></div>
        <div className="stat-grid">{[
          ["Inventory items", count(inventory.totalItems), "Active, non-archived items"],
          ["Total stock units", count(inventory.totalUnits), "Sum of on-hand quantity"],
          ["In stock", count(inventory.inStock), "Healthy stock level"],
          ["Low stock", count(inventory.lowStock), "At or below reorder level"],
          ["Out of stock", count(inventory.outOfStock), "Needs immediate restock"],
          ["Near expiry", count(inventory.nearExpiry), "Expiring within 30 days"],
          ["Stock in (range)", count(inventory.stockInUnits), "Restocks and returns"],
          ["Stock out (range)", count(inventory.stockOutUnits), "POS sales and usage"],
        ].map(([label, value, detail]) => <article key={label}><b>{value}</b><span>{label}</span><small>{detail}</small></article>)}</div>

        <div className="charts">
          <section><h4>Inventory Status Breakdown</h4><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={inventoryStatus} dataKey="value" nameKey="name" outerRadius={92} label>{inventoryStatus.map((entry, index) => <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></section>
          <section><h4>Stock Movements</h4><ResponsiveContainer width="100%" height={260}><BarChart data={inventory.movementTrend || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="stockIn" name="Stock In" fill={PALETTE[1]} radius={[7, 7, 0, 0]} /><Bar dataKey="stockOut" name="Stock Out" fill={PALETTE[3]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
        </div>

        <div className="table-card">
          <h4>Products Sold</h4>
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty sold</th><th>Sales</th></tr></thead><tbody>{(sales.productSalesList || []).length ? sales.productSalesList.map((row) => <tr key={row.name}><td>{row.name}</td><td>{count(row.quantity)}</td><td>{money(row.sales)}</td></tr>) : <tr><td colSpan={3}>No product sales in this range.</td></tr>}</tbody></table></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Appointments</h3><span>Totals, trend, and veterinarian workload for the selected range.</span></div><button className="soft" onClick={exportAppointments}><Download size={16} /> Export Appointments</button></div>
        <div className="stat-grid">{[
          ["Total appointments", count(appointmentReport.total), "Within selected range"],
          ["Completed", count(appointmentReport.completed), "Finished visits"],
          ["Cancelled", count(appointmentReport.cancelled), "Cancelled bookings"],
          ["Confirmed / upcoming", count(appointmentReport.confirmed), "Not yet completed"],
        ].map(([label, value, detail]) => <article key={label}><b>{value}</b><span>{label}</span><small>{detail}</small></article>)}</div>

        <div className="charts">
          <section><h4>Appointment Status</h4><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={appointmentStatus} dataKey="value" nameKey="name" outerRadius={92} label>{appointmentStatus.map((entry, index) => <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></section>
          <section><h4>Appointment Trend</h4><ResponsiveContainer width="100%" height={260}><LineChart data={appointmentReport.trend || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="total" name="Total" stroke={PALETTE[0]} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="completed" name="Completed" stroke={PALETTE[1]} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="cancelled" name="Cancelled" stroke={PALETTE[3]} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></section>
          <section className="wide"><h4>Appointments per Veterinarian</h4><ResponsiveContainer width="100%" height={280}><BarChart data={appointmentReport.byVeterinarian || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={70} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="completed" name="Completed" stackId="a" fill={PALETTE[1]} /><Bar dataKey="confirmed" name="Confirmed" stackId="a" fill={PALETTE[0]} /><Bar dataKey="cancelled" name="Cancelled" stackId="a" fill={PALETTE[3]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Queue</h3><span>Busiest hour: {queueReport.busiestHourLabel} · Busiest day: {queueReport.busiestDayLabel}</span></div><button className="soft" onClick={exportQueueLog}><Download size={16} /> Export Queue Log</button></div>
        <div className="stat-grid">{[
          ["Queue entries", count(queueReport.total), "Checked-in visits"],
          ["Patients served", count(queueReport.patientsServed), "Completed visits"],
          ["Currently waiting", count(queueReport.waiting), "Snapshot in range"],
          ["Currently serving", count(queueReport.serving), "Snapshot in range"],
          ["Average wait time", `${count(queueReport.averageWaitMinutes)} min`, "Check-in to consultation start"],
          ["Average consultation", `${count(queueReport.averageConsultationMinutes)} min`, "Consultation duration"],
        ].map(([label, value, detail]) => <article key={label}><b>{value}</b><span>{label}</span><small>{detail}</small></article>)}</div>

        <div className="charts">
          <section><h4>Queue Status Breakdown</h4><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={queueStatus} dataKey="value" nameKey="name" outerRadius={92} label>{queueStatus.map((entry, index) => <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></section>
          <section><h4>Busiest Days</h4><ResponsiveContainer width="100%" height={260}><BarChart data={queueReport.busiestDays || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill={PALETTE[2]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
          <section className="wide"><h4>Busiest Hours</h4><ResponsiveContainer width="100%" height={260}><BarChart data={queueReport.busiestHours || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" interval={2} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill={PALETTE[0]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section>
        </div>
      </section>
    </>}
    </div>

    {!loading && (
    <div className="print-report">
      <div className="print-header">
        <img className="print-logo" src={pawLogo} alt="PawCruz" />
        <div className="print-header-main">
          <strong>PawCruz Veterinary Clinic</strong>
          <span>Reports &amp; Analytics</span>
        </div>
        <div className="print-header-meta">
          <div><b>Period:</b> {formatDate(filters.from)} &ndash; {formatDate(filters.to)}</div>
          <div><b>Generated:</b> {generatedAt}</div>
        </div>
      </div>

      <div className="print-footer">
        <span className="brand">PawCruz Veterinary Clinic</span>
        <span>System Generated Report</span>
      </div>

      <div className="print-body">
        <section className="print-section">
          <h2 className="print-section-title">Executive Summary</h2>
          <div className="print-kpi-grid">
            {[
              ["Total Sales", money(sales.grossSales)],
              ["Net Sales", money(sales.netSales)],
              ["Total Transactions", count(sales.totalTransactions)],
              ["Total Appointments", count(appointmentReport.total)],
              ["Patients Served", count(queueReport.patientsServed)],
              ["Low Stock Items", count(kpis.lowStock)],
            ].map(([label, value]) => (
              <div className="print-kpi" key={label}><b>{value}</b><span>{label}</span></div>
            ))}
          </div>
        </section>

        <section className="print-section">
          <h2 className="print-section-title">Sales &amp; Revenue</h2>
          <table className="ptable kv">
            <tbody>
              <tr><th>Gross Sales</th><td>{money(sales.grossSales)}</td><th>Net Sales</th><td>{money(sales.netSales)}</td></tr>
              <tr><th>Transactions</th><td>{count(sales.totalTransactions)}</td><th>Average Transaction</th><td>{money(sales.averageTransactionValue)}</td></tr>
              <tr><th>Discounts Given</th><td>{money(sales.discounts)}</td><th>Refunds</th><td>{money(sales.refunds)}</td></tr>
              <tr><th>Voided / Cancelled</th><td>{count(sales.voidedTransactions)}</td><th>Product vs. Service Sales</th><td>{money(sales.productSales)} / {money(sales.serviceSales)}</td></tr>
            </tbody>
          </table>

          <div className="print-subgrid">
            <div>
              <h3 className="print-subtitle">Product vs. Service Sales</h3>
              <PrintBar label="Product Sales" value={sales.productSales} max={Math.max(sales.productSales || 0, sales.serviceSales || 0, 1)} format={money} />
              <PrintBar label="Service Sales" value={sales.serviceSales} max={Math.max(sales.productSales || 0, sales.serviceSales || 0, 1)} format={money} />
            </div>
            <div>
              <h3 className="print-subtitle">Payment Method Breakdown</h3>
              {(sales.salesByPaymentMethod || []).length
                ? sales.salesByPaymentMethod.map((row) => <PrintBar key={row.name} label={row.name} value={row.value} max={maxOf(sales.salesByPaymentMethod, "value")} format={money} />)
                : <p className="print-empty">No payment activity in this range.</p>}
            </div>
          </div>

          <h3 className="print-subtitle">Sales Trend</h3>
          {(sales.trend || []).length
            ? sales.trend.map((row) => <PrintBar key={row.period} label={row.label} value={row.netSales} max={maxOf(sales.trend, "netSales")} format={money} />)
            : <p className="print-empty">No sales recorded in this range.</p>}
        </section>

        <section className="print-section">
          <h2 className="print-section-title">Inventory</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi"><b>{count(inventory.totalItems)}</b><span>Items</span></div>
            <div className="print-kpi"><b>{count(inventory.totalUnits)}</b><span>Total Units</span></div>
            <div className="print-kpi"><b>{count(inventory.lowStock)}</b><span>Low Stock</span></div>
            <div className="print-kpi"><b>{count(inventory.outOfStock)}</b><span>Out of Stock</span></div>
            <div className="print-kpi"><b>{count(inventory.nearExpiry)}</b><span>Near Expiry</span></div>
            <div className="print-kpi"><b>{count(inventory.stockInUnits)} / {count(inventory.stockOutUnits)}</b><span>Stock In / Out</span></div>
          </div>

          <h3 className="print-subtitle">Low Stock Items</h3>
          <table className="ptable">
            <thead><tr><th>Item</th><th>Category</th><th>On Hand</th><th>Reorder Level</th></tr></thead>
            <tbody>
              {lowStockOnly.length ? lowStockOnly.map((item) => (
                <tr key={item.id}><td>{item.item_name}</td><td>{item.category}</td><td>{count(item.quantity)} {item.unit}</td><td>{count(item.reorder_level)}</td></tr>
              )) : <tr><td colSpan={4}>No low-stock items.</td></tr>}
            </tbody>
          </table>

          <h3 className="print-subtitle">Out of Stock Items</h3>
          <table className="ptable">
            <thead><tr><th>Item</th><th>Category</th><th>Reorder Level</th></tr></thead>
            <tbody>
              {outOfStockOnly.length ? outOfStockOnly.map((item) => (
                <tr key={item.id}><td>{item.item_name}</td><td>{item.category}</td><td>{count(item.reorder_level)}</td></tr>
              )) : <tr><td colSpan={3}>No out-of-stock items.</td></tr>}
            </tbody>
          </table>

          <h3 className="print-subtitle">Near-Expiry &amp; Expired Items</h3>
          <table className="ptable">
            <thead><tr><th>Item</th><th>Category</th><th>Expiry Date</th><th>Status</th><th>On Hand</th></tr></thead>
            <tbody>
              {nearExpiryOnly.length ? nearExpiryOnly.map((item) => (
                <tr key={item.id}><td>{item.item_name}</td><td>{item.category}</td><td>{formatDate(item.expiry_date)}</td><td>{item.status}</td><td>{count(item.quantity)} {item.unit}</td></tr>
              )) : <tr><td colSpan={5}>No near-expiry or expired items.</td></tr>}
            </tbody>
          </table>

          <h3 className="print-subtitle">Stock Movement Summary</h3>
          <PrintBar label="Stock In" value={inventory.stockInUnits} max={Math.max(inventory.stockInUnits || 0, inventory.stockOutUnits || 0, 1)} format={count} />
          <PrintBar label="Stock Out" value={inventory.stockOutUnits} max={Math.max(inventory.stockInUnits || 0, inventory.stockOutUnits || 0, 1)} format={count} />

          <h3 className="print-subtitle">Products Sold</h3>
          <table className="ptable">
            <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              {productsSold.length ? productsSold.map((row) => (
                <tr key={row.name}><td>{row.name}</td><td>{count(row.quantity)}</td><td>{money(row.sales)}</td></tr>
              )) : <tr><td colSpan={3}>No product sales in this range.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2 className="print-section-title">Appointments</h2>
          <div className="print-kpi-grid four">
            <div className="print-kpi"><b>{count(appointmentReport.total)}</b><span>Total</span></div>
            <div className="print-kpi"><b>{count(appointmentReport.completed)}</b><span>Completed</span></div>
            <div className="print-kpi"><b>{count(appointmentReport.cancelled)}</b><span>Cancelled</span></div>
            <div className="print-kpi"><b>{count(appointmentReport.confirmed)}</b><span>Confirmed</span></div>
          </div>

          <h3 className="print-subtitle">Appointments per Veterinarian</h3>
          <table className="ptable">
            <thead><tr><th>Veterinarian</th><th>Total</th><th>Completed</th><th>Cancelled</th><th>Confirmed</th></tr></thead>
            <tbody>
              {(appointmentReport.byVeterinarian || []).length ? appointmentReport.byVeterinarian.map((row) => (
                <tr key={row.veterinarianId}><td>{row.name}</td><td>{count(row.total)}</td><td>{count(row.completed)}</td><td>{count(row.cancelled)}</td><td>{count(row.confirmed)}</td></tr>
              )) : <tr><td colSpan={5}>No appointments in this range.</td></tr>}
            </tbody>
          </table>

          <h3 className="print-subtitle">Appointment Trend</h3>
          {(appointmentReport.trend || []).length
            ? appointmentReport.trend.map((row) => <PrintBar key={row.period} label={row.label} value={row.total} max={maxOf(appointmentReport.trend, "total")} />)
            : <p className="print-empty">No appointment activity in this range.</p>}
        </section>

        <section className="print-section">
          <h2 className="print-section-title">Queue</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi"><b>{count(queueReport.total)}</b><span>Queue Entries</span></div>
            <div className="print-kpi"><b>{count(queueReport.patientsServed)}</b><span>Patients Served</span></div>
            <div className="print-kpi"><b>{count(queueReport.waiting)}</b><span>Waiting</span></div>
            <div className="print-kpi"><b>{count(queueReport.serving)}</b><span>Serving</span></div>
            <div className="print-kpi"><b>{count(queueReport.averageWaitMinutes)} min</b><span>Avg. Wait</span></div>
            <div className="print-kpi"><b>{count(queueReport.averageConsultationMinutes)} min</b><span>Avg. Service</span></div>
          </div>
          <p className="print-note">Busiest hour: {queueReport.busiestHourLabel} &middot; Busiest day: {queueReport.busiestDayLabel}</p>
        </section>

        <section className="print-section">
          <h2 className="print-section-title">Top Products &amp; Services</h2>
          <div className="print-subgrid">
            <div>
              <h3 className="print-subtitle">Best-Selling Products</h3>
              <table className="ptable">
                <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {topProducts.length ? topProducts.map((row) => (
                    <tr key={row.name}><td>{row.name}</td><td>{count(row.quantity)}</td><td>{money(row.sales)}</td></tr>
                  )) : <tr><td colSpan={3}>No products sold in this range.</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="print-subtitle">Most Availed Services</h3>
              <table className="ptable">
                <thead><tr><th>Service</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {topServices.length ? topServices.map((row) => (
                    <tr key={row.name}><td>{row.name}</td><td>{count(row.quantity)}</td><td>{money(row.sales)}</td></tr>
                  )) : <tr><td colSpan={3}>No services availed in this range.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
    )}

    <style>{`
      .reports{
        --gap-sm:12px;--gap-md:16px;--gap-lg:24px;
        --pad-card:18px;--radius-card:16px;--control-h:42px;
        display:grid;gap:var(--gap-lg);
      }

      /* Everything visible on screen lives in here (print gets its own
         separate block below), so the section rhythm has to be set here,
         not on .reports -- .reports only ever has this one visible child. */
      .screen-only{display:grid;gap:var(--gap-lg)}

      .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
      .head h2{margin:0;font-size:21px;color:#24566d}
      .head p{color:#6F7F88;margin:6px 0 0;max-width:600px;line-height:1.5}
      .head>div:last-child{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

      button{border:0;background:#4DA8DA;color:#fff;height:var(--control-h);padding:0 16px;border-radius:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;box-sizing:border-box}
      .soft{background:#eaf7fb;color:#237fab}
      .chip{background:#f2fafd;color:#24678b;height:var(--control-h);padding:0 14px;font-size:12.5px;font-weight:700;white-space:nowrap}

      .filters,.charts section,.panel,.card,.table-card{background:#fff;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.07)}
      .filters{display:flex;gap:var(--gap-md);padding:20px;align-items:end;flex-wrap:wrap}
      .filters label{display:grid;gap:6px;flex:1 1 160px;min-width:150px;color:#536b78;font-size:13px;font-weight:700}
      .filters input,.filters select{height:var(--control-h);padding:0 12px;border:1px solid #d9e9ef;border-radius:9px;font-size:13.5px;box-sizing:border-box;color:#243342}
      .presets{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}

      .error{background:#fff0f0;color:#a94444;padding:14px 16px;border-radius:10px}

      .kpi-row{display:flex;flex-wrap:wrap;gap:var(--gap-md)}
      .kpi{box-sizing:border-box;flex:1 1 210px;max-width:280px;min-height:84px;background:#fff;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.07);padding:var(--pad-card) 20px;display:flex;gap:14px;align-items:center}
      .kpi-icon{background:#eaf7fb;color:#237fab;border-radius:10px;padding:10px;display:flex;flex-shrink:0}
      .kpi b{font-size:21px;color:#24566d;display:block;line-height:1.2;white-space:nowrap}
      .kpi span{color:#6F7F88;font-size:12.5px;font-weight:700;white-space:nowrap}

      .panel{padding:24px;display:grid;gap:20px}
      .panel-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
      .panel-head h3{margin:0;color:#24566d;font-size:17px}
      .panel-head span{color:#6F7F88;font-size:13px;line-height:1.5}
      .panel-actions{display:flex;gap:10px;flex-wrap:wrap}

      .stat-grid{display:flex;flex-wrap:wrap;gap:var(--gap-md)}
      .stat-grid article{box-sizing:border-box;flex:1 1 200px;max-width:270px;min-height:110px;display:flex;flex-direction:column;border:1px solid #e2eff4;border-radius:var(--radius-card);padding:var(--pad-card);background:#fcfeff}
      .stat-grid b{font-size:19px;color:#318fbe;display:block;line-height:1.25}
      .stat-grid span{color:#365461;font-weight:700;display:block;margin:7px 0 3px;font-size:13px}
      .stat-grid small{color:#7a909b;font-size:12px;line-height:1.4}

      .period-row{display:flex;flex-wrap:wrap;gap:var(--gap-md)}
      .period-row article{box-sizing:border-box;flex:1 1 200px;max-width:270px;min-height:78px;background:#f2fafd;border-radius:12px;padding:var(--pad-card);display:grid;gap:6px;align-content:center}
      .period-row span{color:#607985;font-size:13.5px;font-weight:600}
      .period-row b{color:#24678b;font-size:19px}

      .charts{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap-md)}
      .charts section{padding:20px}
      .charts section.wide{grid-column:1 / -1}
      .charts h4{margin:0 0 12px;color:#24566d;font-size:14px}

      .table-card{padding:20px}
      .table-card h4{margin:0 0 12px;color:#24566d;font-size:14px}
      .table-wrap{max-height:280px;overflow:auto}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{text-align:left;padding:10px;border-bottom:1px solid #eef4f7;white-space:nowrap}
      th{color:#536b78;position:sticky;top:0;background:#fff}

      @media(max-width:1000px){
        .charts{grid-template-columns:1fr}
      }
      @media(max-width:700px){
        .head,.filters{flex-direction:column;align-items:stretch}
        .head>div:last-child{flex-wrap:wrap}
        .panel{padding:18px}
        .panel-head{align-items:flex-start;flex-direction:column}
        .kpi,.stat-grid article,.period-row article{flex-basis:100%;max-width:none}
      }

      .print-report{display:none}

      @media print{
        @page{size:A4;margin:10mm 12mm}
        html,body{background:#fff}
        .sidebar,.sidebarOverlay,header,.nb,.screen-only{display:none!important}
        main{margin:0!important}
        .content{padding:0!important}
        .reports{display:block!important;gap:0}
        .print-report{display:block!important;color:#243342;font-size:10.5px;line-height:1.45;font-family:'Segoe UI',Arial,sans-serif}

        .print-body{
          padding-top:22mm;padding-bottom:13mm;
          -webkit-box-decoration-break:clone;box-decoration-break:clone;
        }

        .print-header{
          position:fixed;top:0;left:12mm;right:12mm;height:19mm;
          display:flex;align-items:center;gap:12px;
          border-bottom:2px solid #4DA8DA;padding-bottom:7px;background:#fff;
        }
        .print-logo{width:34px;height:34px;object-fit:contain}
        .print-header-main{display:flex;flex-direction:column;line-height:1.3}
        .print-header-main strong{font-size:15px;color:#153447;font-weight:800}
        .print-header-main span{font-size:11px;color:#2c86b3;font-weight:700;letter-spacing:.02em}
        .print-header-meta{margin-left:auto;text-align:right;font-size:9px;color:#66808d;line-height:1.6}
        .print-header-meta b{color:#2c5a72}

        .print-footer{
          position:fixed;bottom:0;left:12mm;right:12mm;height:10mm;
          border-top:1px solid #d9e9ef;padding-top:6px;
          display:flex;justify-content:space-between;align-items:center;
          font-size:8.5px;color:#7c92a0;background:#fff;
        }
        .print-footer .brand{font-weight:700;color:#3a7793}

        .print-section{break-inside:avoid-page;page-break-inside:avoid;margin-bottom:14px}
        .print-section-title{
          break-after:avoid;page-break-after:avoid;
          font-size:11.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
          color:#fff;background:#1f4b63;padding:6px 10px;border-radius:4px;margin:0 0 8px;
        }
        .print-subtitle{break-after:avoid;page-break-after:avoid;font-size:10.5px;font-weight:800;color:#1f4b63;margin:9px 0 5px;padding-bottom:3px;border-bottom:1px solid #dcecf2}

        .print-kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-bottom:4px}
        .print-kpi-grid.four{grid-template-columns:repeat(4,1fr)}
        .print-kpi{border:1px solid #d9eaf1;border-radius:5px;padding:7px 8px;background:#f7fcfe;break-inside:avoid}
        .print-kpi b{display:block;font-size:12.5px;color:#1f6d94;font-weight:800}
        .print-kpi span{display:block;font-size:7.7px;color:#5c7482;font-weight:700;text-transform:uppercase;letter-spacing:.02em;margin-top:2px}

        table.ptable{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:3px}
        table.ptable th,table.ptable td{text-align:left;padding:4px 7px;border-bottom:1px solid #e7eff2}
        table.ptable thead th{background:#eaf5fa;color:#2c5a72;font-weight:800;font-size:8.5px;text-transform:uppercase;letter-spacing:.02em}
        table.ptable tbody tr:nth-child(even){background:#f8fbfd}
        table.ptable tbody tr{break-inside:avoid;page-break-inside:avoid}
        table.ptable.kv th{width:26%;background:#f2f8fb;color:#4c6774;font-weight:700}

        .print-subgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:4px}

        .pbar-row{display:flex;align-items:center;gap:7px;margin:3px 0;break-inside:avoid}
        .pbar-label{width:34%;font-size:9px;color:#3d5561;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pbar-track{flex:1;height:7px;background:#eef4f7;border-radius:4px;overflow:hidden}
        .pbar-fill{height:100%;background:linear-gradient(90deg,#4DA8DA,#2c86b3);border-radius:4px}
        .pbar-value{width:22%;text-align:right;font-size:9px;color:#1f4b63;font-weight:800}

        .print-note,.print-empty{font-size:8.5px;color:#8398a4;margin:4px 0;font-style:italic}
      }
    `}</style>
  </div></AppShell>;
}
