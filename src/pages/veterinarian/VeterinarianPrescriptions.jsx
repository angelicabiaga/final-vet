import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pill, RefreshCw, Search } from "lucide-react";

import AppShell from "../../components/AppShell";
import {
  getPrescriptionsForVeterinarian,
  subscribeToPrescriptions,
} from "../../services/billingService";
import { downloadPrescriptionNoticePdf } from "../../utils/invoicePdf";

function statusClass(status) {
  return String(status || "Not Purchased").toLowerCase().replace(/\s+/g, "-");
}

function StatusPill({ status }) {
  return <span className={`rx-status status-${statusClass(status)}`}>{status || "Not Purchased"}</span>;
}

const PAGE_SIZE = 10;

const styles = `
  .rx-module{width:100%;max-width:1180px;box-sizing:border-box;margin:0 auto}
  .rx-card{background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(47,117,150,.09)}
  .rx-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}
  .rx-heading h2{display:flex;align-items:center;gap:10px;margin:0;color:#213944;font-size:24px}
  .rx-heading p{margin:6px 0 0;color:#627985;font-size:15px}
  .rx-refresh{display:inline-flex;align-items:center;gap:7px;border:1px solid #c7e4ef;background:#effaff;color:#247fa8;border-radius:10px;padding:11px 13px;font-size:15px;font-weight:700;cursor:pointer}
  .rx-refresh:disabled{opacity:.6;cursor:wait}
  .rx-error{margin-top:15px;padding:13px 15px;border-radius:10px;background:#fff0f0;color:#a33c3c;font-size:15px}
  .rx-search{display:flex;align-items:center;gap:9px;border:1px solid #cfe4ed;background:#f7fbfd;border-radius:10px;padding:10px 14px;margin-top:18px;color:#7c8f99;max-width:360px}
  .rx-search input{border:0;background:transparent;outline:none;font-size:14.5px;color:#233842;width:100%}
  .rx-search svg{flex-shrink:0}
  .rx-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid #e5eef1}
  .rx-page-nav{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border:1px solid #cfe4ed;border-radius:50%;background:#fff;color:#2b6f8f;cursor:pointer}
  .rx-page-nav:hover:not(:disabled){background:#eaf6fb;border-color:#a9dff0}
  .rx-page-nav:disabled{cursor:not-allowed;opacity:.4}
  .rx-page-nums{display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:center}
  .rx-page-nums button{min-width:30px;min-height:30px;border:1px solid transparent;border-radius:8px;background:transparent;color:#536b78;font-weight:700;font-size:13px;cursor:pointer}
  .rx-page-nums button:hover{background:#eaf6fb}
  .rx-page-nums button.active{border-color:#318fbe;background:#318fbe;color:#fff}
  .rx-table-wrap{overflow-x:auto}
  .rx-table{width:100%;min-width:920px;border-collapse:collapse;margin-top:18px;font-size:15px}
  .rx-table th{padding:12px 13px;text-align:left;color:#536b78;font-size:12px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #dce9ed}
  .rx-table td{padding:14px 13px;color:#334f5d;border-bottom:1px solid #edf3f5;vertical-align:top}
  .rx-table tbody tr:last-child td{border-bottom:0}
  .rx-message{text-align:center;padding:35px;color:#71858f;font-size:15px}
  .rx-status{display:inline-block;padding:5px 10px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}
  .status-not-purchased{background:#fff6e0;color:#9a7000}
  .status-partially-purchased{background:#fff0da;color:#b0620a}
  .status-fully-purchased{background:#e6f7ee;color:#1f8550}
  .status-purchasing-elsewhere{background:#eef1f4;color:#5b6b76}
  .rx-download-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cfe4ed;background:#fff;color:#257fa9;border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
  .rx-download-btn:hover{background:#f2f9fc}
  .spin{animation:spin 1s linear infinite}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @media(max-width:650px){.rx-card{padding:18px}.rx-heading{flex-direction:column}}
`;

export default function VeterinarianPrescriptions({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError("");
    try {
      setRows(await getPrescriptionsForVeterinarian(profile.id));
    } catch (loadError) {
      setError(loadError.message || "Unable to load prescriptions.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const off = subscribeToPrescriptions(load);
    return () => off();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.owner?.full_name, row.pet?.pet_name, row.item_name]
      .some((field) => (field || "").toLowerCase().includes(q)));
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <AppShell profile={profile} title="Veterinarian Prescriptions">
      <div className="rx-module">
        <section className="rx-card">
          <div className="rx-heading">
            <div>
              <h2><Pill size={22} /> Veterinarian Prescription Fulfillment</h2>
              <p>Read-only view of whether the medicines you prescribed have been purchased. Staff manage the purchase itself from the Transactions page.</p>
            </div>
            <button type="button" className="rx-refresh" onClick={load} disabled={loading}>
              <RefreshCw size={18} className={loading ? "spin" : ""} /> Refresh
            </button>
          </div>

          {error && <div className="rx-error">{error}</div>}

          <div className="rx-search">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pet owner, pet, or medicine"
            />
          </div>

          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead><tr><th>Pet Owner</th><th>Pet</th><th>Medicine</th><th>Prescribed</th><th>Purchased</th><th>Remaining</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {loading && <tr><td className="rx-message" colSpan="8">Loading prescriptions…</td></tr>}
                {!loading && filteredRows.length === 0 && <tr><td className="rx-message" colSpan="8">{rows.length === 0 ? "No prescriptions recorded yet." : "No prescriptions match your search."}</td></tr>}
                {!loading && pagedRows.map((row) => <tr key={row.id}>
                  <td>{row.owner?.full_name || "—"}</td>
                  <td>{row.pet?.pet_name || "—"}</td>
                  <td>{row.item_name}</td>
                  <td>{row.prescribed_quantity}</td>
                  <td>{row.total_quantity_purchased}</td>
                  <td>{row.remainingQuantity}</td>
                  <td><StatusPill status={row.fulfillment_status} /></td>
                  <td>
                    <button
                      type="button"
                      className="rx-download-btn"
                      onClick={() => downloadPrescriptionNoticePdf(row, {
                        petName: row.pet?.pet_name,
                        ownerName: row.owner?.full_name,
                        veterinarianName: profile?.full_name ? `Dr. ${profile.full_name}` : "",
                      })}
                    >
                      <Download size={14} /> Download
                    </button>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>

          {!loading && totalPages > 1 && (
            <div className="rx-pagination">
              <button
                type="button"
                className="rx-page-nav"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={16} />
              </button>

              <div className="rx-page-nums">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={pageNumber === currentPage ? "active" : ""}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="rx-page-nav"
                aria-label="Next page"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        <style>{styles}</style>
      </div>
    </AppShell>
  );
}
