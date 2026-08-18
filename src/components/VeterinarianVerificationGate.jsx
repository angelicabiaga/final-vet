import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { getVerificationRecord } from "../services/veterinarianVerificationService";

// Wraps a clinical veterinarian route (appointments, patients, queue,
// medical records). Non-veterinarian roles never reach this component at
// all -- it's only ever mounted inside a veterinarian-only RoleRoute -- so
// it does nothing for Admin/Staff/Pet Owner. Existing veterinarians who
// already had a license number on file were grandfathered to "Verified"
// by the migration, so this only actually blocks accounts that have never
// completed the new verification flow.
export default function VeterinarianVerificationGate({ profile, children }) {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    getVerificationRecord(profile.id)
      .then((record) => { if (active) setStatus(record.status || "Unverified"); })
      .catch(() => { if (active) setStatus("Verified"); }); // fail open on a lookup error -- never lock a vet out because of a transient network/table issue
    return () => { active = false; };
  }, [profile.id]);

  if (status === "loading" || status === "Verified") return children;

  return (
    <div className="vvg-block">
      <ShieldAlert size={40} />
      <h2>Verification Required</h2>
      <p>
        This feature is available once your veterinarian account is verified by an administrator.
        Current status: <strong>{status}</strong>.
      </p>
      <Link to="/veterinarian/profile" className="vvg-link">Go to My Profile to Submit Verification</Link>
      <style>{`
        .vvg-block{display:grid;justify-items:center;gap:10px;text-align:center;padding:60px 24px;color:#536b78;background:#fff;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.07)}
        .vvg-block svg{color:#e0a13a}
        .vvg-block h2{margin:4px 0 0;color:#20313b}
        .vvg-block p{margin:0;max-width:420px;line-height:1.55}
        .vvg-link{margin-top:8px;display:inline-block;background:#4DA8DA;color:#fff;padding:11px 18px;border-radius:11px;font-weight:700;text-decoration:none}
      `}</style>
    </div>
  );
}
