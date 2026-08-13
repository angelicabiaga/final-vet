import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Download, Printer, RefreshCw } from "lucide-react";

import AppShell from "../../components/AppShell";
import { supabase } from "../../config/supabaseClient";
import { exportCsv, loadReports } from "../../services/reportService";

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
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

  const sales = data?.sales || {};
  const methods = sales.salesByPaymentMethod || [];
  const products = sales.bestSellingProducts || [];
  const services = sales.mostAvailedServices || [];
  const appointmentStatus = useMemo(() => Object.entries(data?.statusCounts || {}).map(([name, value]) => ({ name, value })), [data]);
  const exportRows = (data?.transactions || []).map((transaction) => ({
    or_number: transaction.or_number,
    date_time: transaction.created_at,
    payment_method: transaction.payment_method,
    payment_status: transaction.payment_status,
    subtotal: transaction.subtotal,
    discount_amount: transaction.discount_amount,
    total_amount: transaction.total_amount,
    amount_paid: transaction.amount_paid,
    change_amount: transaction.change_amount,
    refunded_amount: transaction.refunded_amount,
  }));

  return <AppShell profile={profile} title="Reports & Analytics"><div className="reports">
    <div className="head"><div><h2>Reports & Analytics</h2><p>Sales metrics are generated from actual completed POS payment transactions.</p></div><div><button className="soft" onClick={load}><RefreshCw size={16} /> Refresh</button><button className="soft" onClick={() => window.print()}><Printer size={16} /> Print</button><button onClick={() => exportCsv(`pawcruz-pos-sales-${filters.from}-${filters.to}.csv`, exportRows)}><Download size={16} /> Export POS Sales</button></div></div>
    {error && <div className="error">{error}</div>}
    <div className="filters"><label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label><label>Veterinarian<select value={filters.veterinarianId} onChange={(event) => setFilters((current) => ({ ...current, veterinarianId: event.target.value }))}><option value="">All veterinarians</option>{veterinarians.map((veterinarian) => <option key={veterinarian.id} value={veterinarian.id}>{veterinarian.full_name}</option>)}</select></label><label>Appointment status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{["Confirmed", "Completed", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label><button onClick={load}>Apply</button></div>
    {loading ? <div className="card">Loading analytics…</div> : <>
      <section className="sales-section"><div className="section-title"><h3>POS Sales Summary</h3><span>Only Paid / Completed POS transactions contribute to revenue.</span></div><div className="sales-cards">{[
        ["Gross sales", money(sales.grossSales), "Paid POS revenue"], ["Net sales", money(sales.netSales), "After recorded item refunds"], ["Transactions", sales.totalTransactions || 0, "Paid / completed sales"], ["Average transaction", money(sales.averageTransactionValue), "Net sales per completed sale"], ["Discounts given", money(sales.discounts), "Recorded POS discounts"], ["Refunds", money(sales.refunds), "Full and item refunds"], ["Voids / cancelled", sales.voidedTransactions || 0, "Excluded from sales"], ["Product sales", money(sales.productSales), "Inventory-linked items"], ["Service sales", money(sales.serviceSales), "Checkups and services"],
      ].map(([label, value, detail]) => <article key={label}><b>{value}</b><span>{label}</span><small>{detail}</small></article>)}</div></section>
      <section className="period-section"><h3>Revenue by Period</h3><div>{[["Today", sales.periods?.daily?.netSales], ["This week", sales.periods?.weekly?.netSales], ["This month", sales.periods?.monthly?.netSales], ["This year", sales.periods?.yearly?.netSales]].map(([label, value]) => <article key={label}><span>{label}</span><b>{money(value)}</b></article>)}</div></section>
      <div className="charts"><section><h3>Sales by Payment Method</h3><ResponsiveContainer width="100%" height={285}><BarChart data={methods}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Bar dataKey="value" fill="#4DA8DA" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section><section><h3>Best-Selling Products</h3><ResponsiveContainer width="100%" height={285}><BarChart data={products}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="quantity" fill="#4CAF78" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section><section><h3>Most Availed Services</h3><ResponsiveContainer width="100%" height={285}><BarChart data={services}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="quantity" fill="#F4B942" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></section><section><h3>Appointment Status</h3><ResponsiveContainer width="100%" height={285}><PieChart><Pie data={appointmentStatus} dataKey="value" nameKey="name" outerRadius={92} label>{appointmentStatus.map((_, index) => <Cell key={index} fill={["#4DA8DA", "#F4B942", "#4CAF78", "#e16e64"][index % 4]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></section></div>
    </>}
    <style>{`.reports{display:grid;gap:18px}.head{display:flex;justify-content:space-between;gap:20px}.head h2{margin:0}.head p{color:#6F7F88}.head>div:last-child{display:flex;gap:8px;align-items:flex-start}button{border:0;background:#4DA8DA;color:#fff;padding:10px 14px;border-radius:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}.soft{background:#eaf7fb;color:#237fab}.filters,.charts section,.sales-section,.period-section,.card{background:#fff;border-radius:16px;box-shadow:0 7px 22px rgba(47,117,150,.08)}.filters{display:flex;gap:12px;padding:16px;align-items:end}.filters label{display:grid;gap:5px;flex:1;color:#536b78;font-size:13px;font-weight:700}.filters input,.filters select{padding:10px;border:1px solid #d9e9ef;border-radius:9px}.sales-section,.period-section{padding:20px}.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:16px}.section-title h3,.period-section h3{margin:0;color:#24566d}.section-title span{color:#6F7F88;font-size:14px}.sales-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:15px}.sales-cards article{border:1px solid #e2eff4;border-radius:13px;padding:16px;background:#fcfeff}.sales-cards b{font-size:22px;color:#318fbe;display:block}.sales-cards span{color:#365461;font-weight:700;display:block;margin:6px 0 3px}.sales-cards small{color:#7a909b}.period-section>div{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:13px}.period-section article{background:#f2fafd;border-radius:12px;padding:16px;display:grid;gap:5px}.period-section span{color:#607985;font-size:14px}.period-section b{color:#24678b;font-size:21px}.charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.charts section{padding:18px}.charts h3{margin-top:0;color:#24566d}.error{background:#fff0f0;color:#a94444;padding:12px;border-radius:10px}@media(max-width:1000px){.sales-cards{grid-template-columns:repeat(2,1fr)}.period-section>div{grid-template-columns:repeat(2,1fr)}.charts{grid-template-columns:1fr}}@media(max-width:700px){.head,.filters{flex-direction:column}.head>div:last-child{flex-wrap:wrap}.sales-cards,.period-section>div{grid-template-columns:1fr}.section-title{align-items:flex-start;flex-direction:column}}@media print{.sidebar,header,.filters,.head button{display:none!important}main{margin:0}.content{padding:0}}`}</style>
  </div></AppShell>;
}
