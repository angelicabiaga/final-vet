import React, { useEffect, useMemo, useState } from "react";
import { Phone, Search, Stethoscope, UserCircle, X } from "lucide-react";
import { getVeterinarianDirectory } from "../services/veterinarianService";
import VeterinarianProfileDetail from "./VeterinarianProfileDetail";

// Card-grid directory for Admin/Staff. Reuses the existing veterinarian,
// account, and schedule data as-is (getVeterinarianDirectory only reads);
// no new accounts, profiles, or schedules are created here. Clicking a
// card opens the same VeterinarianProfileDetail used on a veterinarian's
// own profile page, in view-only mode for these roles.
export default function VeterinariansModule({ profile }) {
  const [vets, setVets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVetId, setSelectedVetId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setVets(await getVeterinarianDirectory());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedVetId) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [selectedVetId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vets;
    return vets.filter((vet) =>
      [vet.full_name, vet.specialization, vet.license_number, vet.phone].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [vets, search]);

  return (
    <div className="vets-module">
      <div className="vets-toolbar">
        <div>
          <h2><Stethoscope size={22} /> Veterinarians</h2>
          <p>{vets.length} veterinarian{vets.length === 1 ? "" : "s"} on record</p>
        </div>
        <label className="vets-search">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, specialization, or license number..." />
        </label>
      </div>

      {error && <div className="vets-alert">{error}</div>}

      {loading ? (
        <div className="vets-empty">Loading veterinarians...</div>
      ) : filtered.length === 0 ? (
        <div className="vets-empty">No veterinarians found.</div>
      ) : (
        <div className="vets-grid">
          {filtered.map((vet) => (
            <button type="button" className="vet-card" key={vet.id} onClick={() => setSelectedVetId(vet.id)}>
              <div className="vet-card-photo">
                {vet.avatar_url ? <img src={vet.avatar_url} alt="" /> : <UserCircle size={54} />}
              </div>
              <h3>{vet.full_name}</h3>
              <div className="vet-card-license">
                {vet.license_number || "License not on file"}
                <span className="vet-card-fixed">Fixed</span>
              </div>
              <p className="vet-card-spec">{vet.specialization || "Specialization not recorded"}</p>
              <p className="vet-card-phone"><Phone size={13} /> {vet.phone || "Not recorded"}</p>
              <span className="vet-card-view">View Profile</span>
            </button>
          ))}
        </div>
      )}

      {selectedVetId && (
        <div className="vets-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedVetId(null); }}>
          <div className="vets-modal-card">
            <div className="vets-modal-head">
              <h2>Veterinarian Profile</h2>
              <button type="button" onClick={() => setSelectedVetId(null)}><X size={18} /></button>
            </div>
            <div className="vets-modal-body">
              <VeterinarianProfileDetail vetId={selectedVetId} viewerProfile={profile} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .vets-module{display:grid;gap:18px}
        .vets-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
        .vets-toolbar h2{display:flex;align-items:center;gap:9px;margin:0;color:#20313b}
        .vets-toolbar p{margin:5px 0 0;color:#6f7f88;font-size:13px}
        .vets-search{display:flex;align-items:center;gap:9px;border:1px solid #d9e9ef;border-radius:11px;padding:10px 14px;background:#fff;min-width:280px;color:#8a9aa2}
        .vets-search input{border:0;outline:0;flex:1;font:inherit;color:#213944}

        .vets-alert{padding:12px 14px;border-radius:11px;background:#fff0f0;color:#a94444}
        .vets-empty{padding:40px;text-align:center;color:#71858f;background:#fff;border-radius:16px}

        .vets-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
        .vet-card{text-align:left;border:1px solid #e6f0f4;border-radius:16px;padding:18px;background:#fff;box-shadow:0 7px 20px rgba(47,117,150,.07);cursor:pointer;display:grid;gap:6px;font:inherit}
        .vet-card:hover{border-color:#a9dff0;transform:translateY(-2px);transition:transform .15s ease,border-color .15s ease}
        .vet-card-photo{width:64px;height:64px;border-radius:50%;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;overflow:hidden;margin-bottom:4px}
        .vet-card-photo img{width:100%;height:100%;object-fit:cover}
        .vet-card h3{margin:0;color:#20313b;font-size:16px}
        .vet-card-license{display:flex;align-items:center;gap:7px;color:#536b78;font-size:12px;font-weight:700}
        .vet-card-fixed{background:#e5f4ea;color:#2f8f5b;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800}
        .vet-card-spec{margin:0;color:#318fbe;font-size:12.5px;font-weight:700}
        .vet-card-phone{display:flex;align-items:center;gap:6px;margin:0;color:#6f7f88;font-size:12.5px}
        .vet-card-view{justify-self:start;margin-top:4px;color:#267fa9;font-weight:800;font-size:12.5px}

        .vets-modal-backdrop{position:fixed;inset:0;background:rgba(24,50,63,.55);z-index:100;display:grid;place-items:center;padding:20px}
        .vets-modal-card{background:#f7fbfd;border-radius:19px;width:min(900px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 22px 55px rgba(22,56,72,.24)}
        .vets-modal-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:#fff;border-bottom:1px solid #e6f0f4}
        .vets-modal-head h2{margin:0;color:#20313b;font-size:17px}
        .vets-modal-head button{border:0;background:#edf5f8;color:#456472;border-radius:9px;padding:7px;cursor:pointer}
        .vets-modal-body{overflow-y:auto;min-height:0;padding:20px 22px}

        @media(max-width:640px){.vets-search{min-width:0;width:100%}}
      `}</style>
    </div>
  );
}
