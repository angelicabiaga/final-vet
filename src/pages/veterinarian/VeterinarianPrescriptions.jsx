import React, { useCallback, useEffect, useState } from "react";
import { Pill, RefreshCw } from "lucide-react";

import AppShell from "../../components/AppShell";
import {
  getPrescriptionsForVeterinarian,
  subscribeToPrescriptions,
} from "../../services/billingService";

function statusClass(status) {
  return String(status || "Not Purchased").toLowerCase().replace(/\s+/g, "-");
}

function StatusPill({ status }) {
  return <span className={`rx-status status-${statusClass(status)}`}>{status || "Not Purchased"}</span>;
}

const styles = `
  .rx-module{width:100%;max-width:1180px;box-sizing:border-box;margin:0 auto}
  .rx-card{background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(47,117,150,.09)}
  .rx-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}
  .rx-heading h2{display:flex;align-items:center;gap:10px;margin:0;color:#213944;font-size:24px}
  .rx-heading p{margin:6px 0 0;color:#627985;font-size:15px}
  .rx-refresh{display:inline-flex;align-items:center;gap:7px;border:1px solid #c7e4ef;background:#effaff;color:#247fa8;border-radius:10px;padding:11px 13px;font-size:15px;font-weight:700;cursor:pointer}
  .rx-refresh:disabled{opacity:.6;cursor:wait}
  .rx-error{margin-top:15px;padding:13px 15px;border-radius:10px;background:#fff0f0;color:#a33c3c;font-size:15px}
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
  .spin{animation:spin 1s linear infinite}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @media(max-width:650px){.rx-card{padding:18px}.rx-heading{flex-direction:column}}
`;

export default function VeterinarianPrescriptions({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <AppShell profile={profile} title="Prescriptions">
      <div className="rx-module">
        <section className="rx-card">
          <div className="rx-heading">
            <div>
              <h2><Pill size={22} /> Prescription Fulfillment</h2>
              <p>Read-only view of whether the medicines you prescribed have been purchased. Staff manage the purchase itself from the Transactions page.</p>
            </div>
            <button type="button" className="rx-refresh" onClick={load} disabled={loading}>
              <RefreshCw size={18} className={loading ? "spin" : ""} /> Refresh
            </button>
          </div>

          {error && <div className="rx-error">{error}</div>}

          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead><tr><th>Pet Owner</th><th>Pet</th><th>Medicine</th><th>Prescribed</th><th>Purchased</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>
                {loading && <tr><td className="rx-message" colSpan="7">Loading prescriptions…</td></tr>}
                {!loading && rows.length === 0 && <tr><td className="rx-message" colSpan="7">No prescriptions recorded yet.</td></tr>}
                {!loading && rows.map((row) => <tr key={row.id}>
                  <td>{row.owner?.full_name || "—"}</td>
                  <td>{row.pet?.pet_name || "—"}</td>
                  <td>{row.item_name}</td>
                  <td>{row.prescribed_quantity}</td>
                  <td>{row.total_quantity_purchased}</td>
                  <td>{row.remainingQuantity}</td>
                  <td><StatusPill status={row.fulfillment_status} /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
        <style>{styles}</style>
      </div>
    </AppShell>
  );
}
