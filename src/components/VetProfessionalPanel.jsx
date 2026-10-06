import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, GraduationCap, IdCard, Lock, Save } from "lucide-react";
import { getProfile } from "../services/profileService";
import { updateVeterinarianProfessionalInfo } from "../services/veterinarianService";
import VeterinarianVerificationPanel from "./VeterinarianVerificationPanel";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";

const FIELDS = ["specialization", "education", "years_experience", "certifications_training", "previous_practice", "professional_interests", "biography"];

const formFrom = (row) => Object.fromEntries(FIELDS.map((name) => [name, row?.[name] ?? ""]));

function validate(name, value) {
  if (name === "specialization") return String(value || "").trim() ? "" : "Specialization is required.";
  if (name === "years_experience" && value !== "" && value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
    return "Years of experience must be a valid non-negative number.";
  }
  return "";
}

// The vet-only part of the veterinarian's own profile page. It sits under the
// shared profile (UserProfileModule) and reuses its panel styles (pfPanel,
// pfForm, pfSubmit) so the page looks the same as the staff profile.
export default function VetProfessionalPanel({ profile }) {
  const [row, setRow] = useState(null);
  const [form, setForm] = useState(formFrom(null));
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const fieldRefs = useRef({}).current;
  const register = (name) => (el) => { fieldRefs[name] = el; };

  useEffect(() => {
    let active = true;
    getProfile(profile.id)
      .then((data) => { if (active) { setRow(data); setForm(formFrom(data)); } })
      .catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [profile.id]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((current) => ({ ...current, [name]: validate(name, value) }));
  }

  async function save(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    const errors = {};
    FIELDS.forEach((name) => { const error = validate(name, form[name]); if (error) errors[name] = error; });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setMessage({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(fieldRefs, errors);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateVeterinarianProfessionalInfo(profile.id, form, profile);
      setRow(updated);
      setForm(formFrom(updated));
      setMessage({ type: "success", text: "Professional information updated." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div className="error">{loadError}</div>;
  if (!row) return <p className="pfMuted">Loading professional information…</p>;

  const area = (name, label, placeholder) => (
    <label><span>{label} <em>(Optional)</em></span><textarea value={form[name]} onChange={(e) => field(name, e.target.value)} placeholder={placeholder} /></label>
  );

  return (
    <>
      {message.text && <div className={message.type}>{message.text}</div>}
      <section className="pfPanel">
        <header className="pfPanelHead"><GraduationCap size={18} /> Professional Information</header>
        <form className="pfForm" onSubmit={save} noValidate>
          <div className="pfPair">
            <label><span>Specialization<span className="required-mark"> *</span></span>
              <input ref={register("specialization")} className={invalidClass(fieldErrors, "specialization")} value={form.specialization} onChange={(e) => field("specialization", e.target.value)} placeholder="e.g. Small Animal Medicine" required />
              {fieldErrors.specialization && <span className="field-error-text">{fieldErrors.specialization}</span>}
            </label>
            <label><span>License number</span>
              <div className="pfLocked" title="Set by the clinic after your PRC license is verified">
                <IdCard size={16} /><span>{row.license_number || "Not on file yet"}</span>
                {row.license_number ? <b className="pfVerified"><BadgeCheck size={13} /> Verified</b> : <Lock size={15} />}
              </div>
            </label>
          </div>
          <div className="pfPair">
            {area("education", "Education", "Veterinary school, degree, year")}
            <label><span>Years of experience <em>(Optional)</em></span>
              <input ref={register("years_experience")} className={invalidClass(fieldErrors, "years_experience")} type="number" min="0" value={form.years_experience} onChange={(e) => field("years_experience", e.target.value)} />
              {fieldErrors.years_experience && <span className="field-error-text">{fieldErrors.years_experience}</span>}
            </label>
          </div>
          <div className="pfPair">
            {area("certifications_training", "Certifications and training")}
            {area("previous_practice", "Previous practice")}
          </div>
          {area("professional_interests", "Professional interests")}
          {area("biography", "Short biography")}
          <button className="pfSubmit" disabled={saving}><Save size={17} /> {saving ? "Saving…" : "Save Professional Information"}</button>
        </form>
      </section>

      <VeterinarianVerificationPanel vetId={profile.id} vetProfile={row} viewerProfile={profile} />

      <style>{`.pfVerified{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;background:#e5f4ea;color:#2f8f5b;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800}`}</style>
    </>
  );
}
