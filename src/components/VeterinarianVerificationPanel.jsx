import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  IdCard,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  getVerificationRecord,
  reviewVerification,
  submitVerification,
} from "../services/veterinarianVerificationService";
import { isValidPrcLicense, INVALID_PRC_LICENSE_MESSAGE } from "../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";

const STATUS_META = {
  Unverified: { label: "Unverified", tone: "muted", icon: AlertTriangle },
  "Pending Review": { label: "Pending Review", tone: "pending", icon: Clock3 },
  Verified: { label: "Verified", tone: "verified", icon: ShieldCheck },
  Rejected: { label: "Rejected", tone: "rejected", icon: XCircle },
  "Needs Resubmission": { label: "Needs Resubmission", tone: "pending", icon: RefreshCw },
};

export function VerificationStatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.Unverified;
  const Icon = meta.icon;
  return (
    <span className={`vvp-badge vvp-badge-${meta.tone}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

// Verification review + submission. Everyone who can see a veterinarian's
// full profile sees the status badge; only an Administrator can see the
// submitted license number and record a decision; only the veterinarian
// themselves can submit or resubmit. No photos of any kind (ID card, face
// scan) are collected -- PRC has no public verification API, so the
// license number the veterinarian types in is confirmed by an
// administrator's own judgment, not by any automated check.
export default function VeterinarianVerificationPanel({ vetId, vetProfile, viewerProfile }) {
  const isSelf = viewerProfile?.id === vetId;
  const isAdmin = viewerProfile?.role === "admin";

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [licenseNumber, setLicenseNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [decisionReason, setDecisionReason] = useState("");
  const [decisionFieldError, setDecisionFieldError] = useState("");
  const [deciding, setDeciding] = useState("");

  const decisionReasonRef = useRef(null);

  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({}).current;
  const registerFieldRef = (name) => (el) => { fieldRefs[name] = el; };

  async function load() {
    setLoading(true);
    try {
      const result = await getVerificationRecord(vetId);
      setRecord(result);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (vetId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vetId]);

  async function submit(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    const errors = {};
    if (!licenseNumber.trim()) errors.licenseNumber = "Enter your PRC license number.";
    else if (!isValidPrcLicense(licenseNumber)) errors.licenseNumber = INVALID_PRC_LICENSE_MESSAGE;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(fieldRefs, errors);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await submitVerification(vetId, vetProfile, { licenseNumber });
      setRecord(updated);
      setLicenseNumber("");
      setFieldErrors({});
      setMessage({ type: "success", text: "Submitted for review. An administrator will confirm your verification." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(decision) {
    setMessage({ type: "", text: "" });
    if (decision !== "Verified" && !decisionReason.trim()) {
      setDecisionFieldError("Enter a reason before rejecting or requesting resubmission.");
      decisionReasonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      decisionReasonRef.current?.focus();
      return;
    }
    setDecisionFieldError("");
    setDeciding(decision);
    try {
      const updated = await reviewVerification(vetId, { decision, reason: decisionReason }, viewerProfile);
      setRecord(updated);
      setDecisionReason("");
      setDecisionFieldError("");
      setMessage({ type: "success", text: `Verification set to ${decision}.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setDeciding("");
    }
  }

  if (loading) return <div className="vvp vvp-loading">Loading verification status...</div>;
  if (!record) return null;

  const status = record.status || "Unverified";
  const canSubmit = isSelf && ["Unverified", "Rejected", "Needs Resubmission"].includes(status);

  return (
    <section className="vvp-card">
      <h3><IdCard size={18} /> Verification Status <VerificationStatusBadge status={status} /></h3>

      {message.text && <div className={`vvp-notice ${message.type}`}>{message.text}</div>}

      {(status === "Rejected" || status === "Needs Resubmission") && record.rejection_reason && (
        <div className="vvp-notice warn">Administrator note: {record.rejection_reason}</div>
      )}

      {isSelf && status === "Pending Review" && (
        <p className="vvp-muted">Your PRC license number is submitted and awaiting administrator review.</p>
      )}

      {isSelf && status === "Verified" && (
        <p className="vvp-muted vvp-verified-text"><CheckCircle2 size={14} /> Your veterinarian account is verified.</p>
      )}

      {canSubmit && (
        <form onSubmit={submit} className="vvp-form" noValidate>
          <p className="vvp-instructions">
            Enter your PRC (Professional Regulation Commission) veterinary license number. An administrator will
            confirm it before your account shows as Verified.
          </p>

          <label ref={registerFieldRef("licenseNumber")} className={invalidClass(fieldErrors, "licenseNumber")}>
            PRC License Number<span className="required-mark"> *</span>
            <input
              value={licenseNumber}
              onChange={(e) => {
                setLicenseNumber(e.target.value);
                if (fieldErrors.licenseNumber) setFieldErrors((current) => ({ ...current, licenseNumber: "" }));
              }}
              placeholder="e.g. 0123456"
              required
            />
            {fieldErrors.licenseNumber && <span className="field-error-text">{fieldErrors.licenseNumber}</span>}
          </label>

          <button className="vvp-submit-btn" disabled={submitting}>
            <UploadCloud size={16} />
            {submitting ? "Submitting..." : "Submit for Verification"}
          </button>
        </form>
      )}

      {isAdmin && record.prc_license_number && (
        <p className="vvp-submitted-license">Submitted PRC License Number: <b>{record.prc_license_number}</b></p>
      )}

      {isAdmin && status === "Pending Review" && (
        <div className="vvp-decision">
          <label>Reason (required for Reject / Needs Resubmission)
            <textarea
              ref={decisionReasonRef}
              className={decisionFieldError ? "field-invalid" : ""}
              value={decisionReason}
              onChange={(e) => {
                setDecisionReason(e.target.value);
                if (decisionFieldError && e.target.value.trim()) setDecisionFieldError("");
              }}
            />
            {decisionFieldError && <span className="field-error-text">{decisionFieldError}</span>}
          </label>
          <div className="vvp-decision-actions">
            <button type="button" className="approve" onClick={() => decide("Verified")} disabled={!!deciding}>{deciding === "Verified" ? "Saving..." : "Approve - Verified"}</button>
            <button type="button" className="resubmit" onClick={() => decide("Needs Resubmission")} disabled={!!deciding}>{deciding === "Needs Resubmission" ? "Saving..." : "Needs Resubmission"}</button>
            <button type="button" className="reject" onClick={() => decide("Rejected")} disabled={!!deciding}>{deciding === "Rejected" ? "Saving..." : "Reject"}</button>
          </div>
        </div>
      )}

      <style>{`
        .vvp-card{background:#fff;border:1px solid #e6f0f4;border-radius:16px;padding:20px;box-shadow:0 7px 20px rgba(47,117,150,.06)}
        .vvp-card h3{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;color:#20313b;font-size:16px}
        .vvp-loading{padding:16px;color:#6f7f88}
        .vvp-muted{margin:0;color:#6f7f88;font-size:13px}
        .vvp-verified-text{display:flex;align-items:center;gap:6px;color:#2f8f5b;font-weight:700}
        .vvp-instructions{margin:0 0 4px;color:#6f7f88;font-size:12.5px;line-height:1.55}

        .vvp-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800}
        .vvp-badge-muted{background:#eef1f2;color:#657a84}
        .vvp-badge-pending{background:#fdf1dc;color:#a5680b}
        .vvp-badge-verified{background:#e5f4ea;color:#2f8f5b}
        .vvp-badge-rejected{background:#fbe6e4;color:#c0392b}

        .vvp-notice{padding:10px 13px;border-radius:10px;font-size:12.5px;margin-bottom:12px}
        .vvp-notice.error{background:#fff0f0;color:#a94444}
        .vvp-notice.success{background:#eaf8ef;color:#28794c}
        .vvp-notice.warn{background:#fff5d9;color:#9a7015}

        .vvp-form{display:grid;gap:12px;margin-top:8px}
        .vvp-form label{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:#334e5a}
        .vvp-form input{width:100%;border:1px solid #d8e8ef;border-radius:10px;padding:10px;font:inherit;box-sizing:border-box}

        .vvp-submit-btn{justify-self:start;display:flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:11px 16px;background:#4DA8DA;color:#fff;font-weight:700;cursor:pointer}
        .vvp-submit-btn:disabled{opacity:.65;cursor:not-allowed}

        .vvp-submitted-license{margin:14px 0 0;padding:12px 14px;background:#f4f9fb;border:1px solid #e1edf2;border-radius:10px;color:#334e5a;font-size:13px}
        .vvp-submitted-license b{color:#20313b}

        .vvp-decision{display:grid;gap:10px;margin-top:14px}
        .vvp-decision label{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:#334e5a}
        .vvp-decision textarea{border:1px solid #d8e8ef;border-radius:10px;padding:10px;font:inherit;min-height:60px}
        .vvp-decision-actions{display:flex;gap:8px;flex-wrap:wrap}
        .vvp-decision-actions button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;color:#fff}
        .vvp-decision-actions button.approve{background:#2f8f5b}
        .vvp-decision-actions button.resubmit{background:#a5680b}
        .vvp-decision-actions button.reject{background:#c0392b}
        .vvp-decision-actions button:disabled{opacity:.6;cursor:not-allowed}
      `}</style>
    </section>
  );
}
