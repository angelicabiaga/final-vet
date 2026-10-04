import React, { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Camera,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  Heart,
  IdCard,
  KeyRound,
  Lock,
  LockKeyhole,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Save,
  Stethoscope,
  UserCircle,
  UserRound,
  X,
} from "lucide-react";
import {
  confirmPasswordChange,
  getProfile,
  requestPasswordChange,
  uploadProfileAvatar,
} from "../services/profileService";
import { updateVeterinarianProfile } from "../services/veterinarianService";
import { getVerificationRecord } from "../services/veterinarianVerificationService";
import VeterinarianVerificationPanel, { VerificationStatusBadge } from "./VeterinarianVerificationPanel";
import PasswordChecklist from "./PasswordChecklist";
import OtpModal from "./OtpModal";
import {
  isValidPhMobile,
  INVALID_PH_MOBILE_MESSAGE,
  validateImageFile,
  validatePassword,
  validatePasswordsMatch,
  sanitizePhoneInput,
} from "../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";
import { stripDrTitle, withDrTitle } from "../utils/vetName";

function validateVetProfileField(name, value) {
  switch (name) {
    case "firstName":
      return String(value || "").trim() ? "" : "First name is required.";
    case "lastName":
      return String(value || "").trim() ? "" : "Last name is required.";
    case "username":
      return String(value || "").trim() ? "" : "Username is required.";
    case "email": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Email is required.";
      return /^\S+@\S+\.\S+$/.test(trimmed) ? "" : "Please enter a valid email address.";
    }
    case "phone": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Contact number is required.";
      return isValidPhMobile(trimmed) ? "" : INVALID_PH_MOBILE_MESSAGE;
    }
    case "address":
      return String(value || "").trim() ? "" : "Address is required.";
    case "specialization":
      return String(value || "").trim() ? "" : "Specialization is required.";
    default:
      return "";
  }
}

function validateVetPasswordField(name, passwords) {
  switch (name) {
    case "current":
      return String(passwords.current || "") ? "" : "Current password is required.";
    case "next": {
      if (!String(passwords.next || "")) return "New password is required.";
      try { validatePassword(passwords.next); return ""; } catch (error) { return error.message; }
    }
    case "confirm": {
      if (!String(passwords.confirm || "")) return "Please confirm your new password.";
      try { validatePasswordsMatch(passwords.next, passwords.confirm); return ""; } catch (error) { return error.message; }
    }
    default:
      return "";
  }
}

// "Dr." is a title, not a first name: keep it out of the name fields and put
// it back on save only when the profile already stored it.
const titleOf = (fullName) => (stripDrTitle(fullName) !== String(fullName || "").trim() ? "Dr." : "");

function splitFullName(fullName) {
  const parts = stripDrTitle(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function joinFullName({ firstName, middleName, lastName }, title = "") {
  const name = [firstName, middleName, lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
  return name && title ? `${title} ${name}` : name;
}

const EMPTY_FORM = {
  firstName: "", middleName: "", lastName: "", username: "", email: "", phone: "", address: "", avatar_url: "",
  specialization: "", education: "", years_experience: "", certifications_training: "",
  previous_practice: "", professional_interests: "", biography: "",
};

// The edit form's values from the saved profile.
function formFromProfile(row) {
  return {
    ...splitFullName(row?.full_name),
    username: row?.username || "",
    email: row?.email || "",
    phone: row?.phone || "",
    address: row?.address || "",
    avatar_url: row?.avatar_url || "",
    specialization: row?.specialization || "",
    education: row?.education || "",
    years_experience: row?.years_experience ?? "",
    certifications_training: row?.certifications_training || "",
    previous_practice: row?.previous_practice || "",
    professional_interests: row?.professional_interests || "",
    biography: row?.biography || "",
  };
}

// Full Veterinarian profile: read-only for Admin/Staff viewing someone
// else's record, self-editable for the veterinarian viewing their own.
// License number is never editable here for anyone -- correcting it is a
// separate, explicitly authorized admin action. Reused both embedded in
// the Veterinarians directory modal and on the veterinarian's own profile
// page, so it never renders its own AppShell or modal chrome.
export default function VeterinarianProfileDetail({ vetId, viewerProfile }) {
  const isSelf = viewerProfile?.id === vetId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({}).current;
  const registerFieldRef = (name) => (el) => { fieldRefs[name] = el; };
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const passwordFieldRefs = useRef({}).current;
  const registerPasswordFieldRef = (name) => (el) => { passwordFieldRefs[name] = el; };
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [otpModal, setOtpModal] = useState({ open: false, email: "", purpose: "", title: "" });
  const forcePasswordChange = isSelf && !!viewerProfile?.must_change_password;
  // "view" | "edit" | "password" (edit and password are only for the vet themselves).
  const [mode, setMode] = useState(forcePasswordChange ? "password" : "view");

  const [verificationStatus, setVerificationStatus] = useState("Unverified");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const profileRow = await getProfile(vetId);
        if (!active) return;
        setData({ profile: profileRow });
        setForm(formFromProfile(profileRow));
        try {
          const verification = await getVerificationRecord(vetId);
          if (active) setVerificationStatus(verification.status || "Unverified");
        } catch {
          // Non-fatal -- the rest of the profile still renders normally.
        }
      } catch (error) {
        if (active) setLoadError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (vetId) load();
    return () => { active = false; };
  }, [vetId]);

  function openMode(next) {
    setMessage({ type: "", text: "" });
    setFieldErrors({});
    setPasswordFieldErrors({});
    setForm(formFromProfile(data?.profile));
    setPasswords({ current: "", next: "", confirm: "" });
    setShow({ current: false, next: false, confirm: false });
    setMode(next);
  }


  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (
      current[name] ? { ...current, [name]: validateVetProfileField(name, value) } : current
    ));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    const errors = {};
    ["firstName", "lastName", "phone", "address", "specialization"].forEach((name) => {
      const errorMessage = validateVetProfileField(name, form[name]);
      if (errorMessage) errors[name] = errorMessage;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted fields before saving." });
      focusFirstInvalidField(fieldRefs, errors);
      return;
    }
    setSaving(true);
    try {
      // Username and email can't be changed here; always send the saved ones.
      const saved = data?.profile || {};
      const updated = await updateVeterinarianProfile(vetId, { ...form, username: saved.username ?? form.username, email: saved.email ?? form.email, full_name: joinFullName(form, titleOf(saved.full_name)) }, viewerProfile);
      setData((current) => ({ ...current, profile: { ...current.profile, ...updated } }));
      setMode("view");
      setMessage({ type: "success", text: "Profile updated successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  // Same as the other profiles: choosing a photo saves it right away.
  async function pickAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage({ type: "", text: "" });
    try {
      validateImageFile(file);
    } catch (error) {
      return setMessage({ type: "error", text: error.message });
    }
    setUploading(true);
    try {
      const avatar_url = await uploadProfileAvatar(vetId, file);
      // Only the photo changes; unsaved edits in the form stay unsaved.
      const saved = formFromProfile(data?.profile);
      const updated = await updateVeterinarianProfile(vetId, { ...saved, full_name: joinFullName(saved, titleOf(data?.profile?.full_name)), avatar_url }, viewerProfile);
      setData((current) => ({ ...current, profile: { ...current.profile, ...updated } }));
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url || "" }));
      setMessage({ type: "success", text: "Profile photo updated." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    const errors = {};
    ["current", "next", "confirm"].forEach((name) => {
      const errorMessage = validateVetPasswordField(name, passwords);
      if (errorMessage) errors[name] = errorMessage;
    });
    setPasswordFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted fields before saving." });
      focusFirstInvalidField(passwordFieldRefs, errors);
      return;
    }
    setSaving(true);
    try {
      const result = await requestPasswordChange(vetId, passwords.current, passwords.next);
      setOtpModal({ open: true, email: result.email, purpose: "change_password", title: "Verify Password Change" });
      setMessage({ type: "success", text: "OTP sent to your registered email." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function verifyOtp(code) {
    await confirmPasswordChange(code);
    setPasswords({ current: "", next: "", confirm: "" });
    setPasswordFieldErrors({});
    setMode("view");
    setMessage({ type: "success", text: "Password changed successfully." });
    setOtpModal({ open: false, email: "", purpose: "", title: "" });
  }

  function passwordField(name, value) {
    setPasswords((current) => {
      const next = { ...current, [name]: value };
      if (passwordFieldErrors[name] || (name === "next" && passwordFieldErrors.confirm)) {
        setPasswordFieldErrors((currentErrors) => {
          const nextErrors = { ...currentErrors, [name]: validateVetPasswordField(name, next) };
          if (name === "next" && currentErrors.confirm) {
            nextErrors.confirm = validateVetPasswordField("confirm", next);
          }
          return nextErrors;
        });
      }
      return next;
    });
  }

  // Called as a function, not rendered as <PasswordField/>: a component
  // declared inside this one would be recreated on every keystroke,
  // remounting the input and losing focus after each letter.
  const renderPasswordField = (name, label) => (
    <label><span>{label}<span className="required-mark"> *</span></span><div className={`vpd-passwordBox${passwordFieldErrors[name] ? " field-invalid" : ""}`}>
      <input ref={registerPasswordFieldRef(name)} type={show[name] ? "text" : "password"} value={passwords[name]} onChange={(e) => passwordField(name, e.target.value)} required />
      <button type="button" onClick={() => setShow((s) => ({ ...s, [name]: !s[name] }))}>{show[name] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
    {passwordFieldErrors[name] && <span className="field-error-text">{passwordFieldErrors[name]}</span>}
    </label>
  );

  if (loading) return <div className="vpd vpd-loading">Loading veterinarian profile...</div>;
  if (loadError) return <div className="vpd vpd-error-block">{loadError}</div>;
  if (!data) return null;

  const { profile: vet } = data;
  const photoUrl = vet.avatar_url || "";
  const contact = [
    { icon: UserRound, label: "Full name", value: vet.full_name },
    { icon: AtSign, label: "Username", value: vet.username ? `@${vet.username}` : "" },
    { icon: Mail, label: "Email", value: vet.email },
    { icon: Phone, label: "Contact number", value: vet.phone },
    { icon: MapPin, label: "Address", value: vet.address },
    { icon: Stethoscope, label: "Specialization", value: vet.specialization },
  ];
  const background = [
    { icon: GraduationCap, label: "Education", value: vet.education },
    { icon: Clock3, label: "Years of experience", value: vet.years_experience !== null && vet.years_experience !== undefined && vet.years_experience !== "" ? `${vet.years_experience} year${Number(vet.years_experience) === 1 ? "" : "s"}` : "" },
    { icon: Award, label: "Certifications and training", value: vet.certifications_training },
    { icon: Briefcase, label: "Previous practice", value: vet.previous_practice },
    { icon: Heart, label: "Professional interests", value: vet.professional_interests },
    { icon: BookOpen, label: "Short biography", value: vet.biography },
  ];
  const detailRows = rows => rows.map(({ icon: Icon, label, value }) => (
    <div key={label} className="vpd-row">
      <dt><Icon size={17} /> {label}</dt>
      <dd className={value ? "" : "vpd-empty"}>{value || "Not set"}</dd>
    </div>
  ));

  return (
    <div className="vpd">
      {message.text && <div className={`vpd-notice ${message.type}`}>{message.text}</div>}
      {forcePasswordChange && <div className="vpd-notice warn">You're using a temporary password. Please set a new password to continue.</div>}

      <section className="vpd-card">
        <div className="vpd-banner" aria-hidden="true" />
        <div className="vpd-identity">
          <div className="vpd-avatar">
            <div className="vpd-avatarImg">{photoUrl ? <img src={photoUrl} alt="Profile" /> : <UserCircle size={64} />}</div>
            {isSelf && (
              <label className="vpd-camera" title={vet.avatar_url ? "Change photo" : "Upload photo"}>
                <Camera size={15} />
                <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={pickAvatar} disabled={uploading} />
              </label>
            )}
          </div>
          <h2>{withDrTitle(vet.full_name, "Veterinarian")}</h2>
          {vet.username && <p className="vpd-handle">@{vet.username}</p>}
          <div className="vpd-tags">
            <span className="vpd-role">Veterinarian</span>
            <VerificationStatusBadge status={verificationStatus} />
          </div>
          {vet.specialization && <p className="vpd-spec"><Stethoscope size={15} /> {vet.specialization}</p>}
          {isSelf && mode === "view" && (
            <div className="vpd-actions">
              <button type="button" className="vpd-btn vpd-primary" onClick={() => openMode("edit")}><PencilLine size={17} /> Edit profile</button>
              <button type="button" className="vpd-btn vpd-ghost" onClick={() => openMode("password")}><KeyRound size={17} /> Change password</button>
            </div>
          )}
        </div>

        <div className="vpd-body">
          {mode === "view" || !isSelf ? (
            <>
              <dl className="vpd-details">
                {detailRows(contact)}
                <div className="vpd-row">
                  <dt><IdCard size={17} /> License number</dt>
                  <dd className={vet.license_number ? "" : "vpd-empty"}>
                    {vet.license_number || "Not on file"}
                    {vet.license_number && <span className="vpd-fixed-badge"><BadgeCheck size={12} /> Verified</span>}
                  </dd>
                </div>
              </dl>
              <h4 className="vpd-subheading"><GraduationCap size={16} /> Background in Veterinary Medicine</h4>
              <dl className="vpd-details">{detailRows(background)}</dl>
            </>
          ) : mode === "edit" ? (
            <form onSubmit={saveDetails} className="vpd-form" noValidate>
              <h3><PencilLine size={19} /> Edit profile</h3>
              <div className="vpd-pair">
                <label><span>First name<span className="required-mark"> *</span></span><input ref={registerFieldRef("firstName")} className={invalidClass(fieldErrors, "firstName")} value={form.firstName} onChange={(e) => field("firstName", e.target.value)} required />{fieldErrors.firstName && <span className="field-error-text">{fieldErrors.firstName}</span>}</label>
                <label><span>Last name<span className="required-mark"> *</span></span><input ref={registerFieldRef("lastName")} className={invalidClass(fieldErrors, "lastName")} value={form.lastName} onChange={(e) => field("lastName", e.target.value)} required />{fieldErrors.lastName && <span className="field-error-text">{fieldErrors.lastName}</span>}</label>
              </div>
              <label><span>Middle name<span className="optional-mark"> (Optional)</span></span><input value={form.middleName} onChange={(e) => field("middleName", e.target.value)} /></label>
              <div className="vpd-pair">
                <label><span>Username</span><div className="vpd-locked" title="Username can't be changed"><AtSign size={16} /><span>{form.username || "—"}</span><Lock size={15} /></div></label>
                <label><span>Email</span><div className="vpd-locked" title="Email can't be changed"><Mail size={16} /><span>{form.email || "—"}</span><Lock size={15} /></div></label>
              </div>
              <div className="vpd-pair">
                <label><span>Contact number<span className="required-mark"> *</span></span>
                  <input ref={registerFieldRef("phone")} className={invalidClass(fieldErrors, "phone")} type="tel" inputMode="numeric" maxLength={11} value={form.phone} onChange={(e) => field("phone", sanitizePhoneInput(e.target.value))} placeholder="09XXXXXXXXX" required />
                  {fieldErrors.phone && <span className="field-error-text">{fieldErrors.phone}</span>}
                </label>
                <label><span>Specialization<span className="required-mark"> *</span></span>
                  <input ref={registerFieldRef("specialization")} className={invalidClass(fieldErrors, "specialization")} value={form.specialization} onChange={(e) => field("specialization", e.target.value)} placeholder="e.g. Small Animal Medicine" required />
                  {fieldErrors.specialization && <span className="field-error-text">{fieldErrors.specialization}</span>}
                </label>
              </div>
              <label><span>Address<span className="required-mark"> *</span></span>
                <textarea ref={registerFieldRef("address")} className={invalidClass(fieldErrors, "address")} value={form.address} onChange={(e) => field("address", e.target.value)} required />
                {fieldErrors.address && <span className="field-error-text">{fieldErrors.address}</span>}
              </label>

              <h4 className="vpd-subheading"><GraduationCap size={16} /> Background in Veterinary Medicine</h4>
              <label><span>Education<span className="optional-mark"> (Optional)</span></span><textarea value={form.education} onChange={(e) => field("education", e.target.value)} placeholder="Veterinary school, degree, year" /></label>
              <label><span>Years of Veterinary Experience<span className="optional-mark"> (Optional)</span></span><input type="number" min="0" value={form.years_experience} onChange={(e) => field("years_experience", e.target.value)} /></label>
              <label><span>Certifications and Professional Training<span className="optional-mark"> (Optional)</span></span><textarea value={form.certifications_training} onChange={(e) => field("certifications_training", e.target.value)} /></label>
              <label><span>Previous Veterinary Practice<span className="optional-mark"> (Optional)</span></span><textarea value={form.previous_practice} onChange={(e) => field("previous_practice", e.target.value)} /></label>
              <label><span>Professional Interests<span className="optional-mark"> (Optional)</span></span><textarea value={form.professional_interests} onChange={(e) => field("professional_interests", e.target.value)} /></label>
              <label><span>Short Biography<span className="optional-mark"> (Optional)</span></span><textarea value={form.biography} onChange={(e) => field("biography", e.target.value)} /></label>
              <p className="vpd-hint">Username, email and license number can't be changed here.</p>
              <div className="vpd-form-actions">
                <button type="button" className="vpd-btn vpd-ghost" onClick={() => openMode("view")} disabled={saving}><X size={17} /> Cancel</button>
                <button className="vpd-btn vpd-primary" disabled={saving}><Save size={17} /> {saving ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={savePassword} className={`vpd-form${forcePasswordChange ? " vpd-highlight" : ""}`} noValidate>
              <h3><LockKeyhole size={19} /> Change password</h3>
              {renderPasswordField("current", "Current password")}
              {renderPasswordField("next", "New password")}
              <PasswordChecklist password={passwords.next} />
              {renderPasswordField("confirm", "Confirm new password")}
              <p className="vpd-hint">We'll email you a code to confirm the change.</p>
              <div className="vpd-form-actions">
                {!forcePasswordChange && <button type="button" className="vpd-btn vpd-ghost" onClick={() => openMode("view")} disabled={saving}><X size={17} /> Cancel</button>}
                <button className="vpd-btn vpd-primary" disabled={saving}><LockKeyhole size={17} /> {saving ? "Sending code…" : "Update password"}</button>
              </div>
            </form>
          )}
        </div>
      </section>

      <VeterinarianVerificationPanel vetId={vetId} vetProfile={vet} viewerProfile={viewerProfile} />

      <OtpModal
        open={otpModal.open}
        email={otpModal.email}
        purpose={otpModal.purpose}
        title={otpModal.title}
        onVerify={verifyOtp}
        onClose={() => setOtpModal({ open: false, email: "", purpose: "", title: "" })}
      />

      <style>{`
        .vpd{max-width:760px;width:100%;margin:0 auto;display:grid;gap:14px}
        .vpd-loading,.vpd-error-block{padding:30px;text-align:center;color:#6f7f88}
        .vpd-error-block{color:#a94444}
        .vpd-notice{padding:11px 14px;border-radius:11px;font-size:13px}
        .vpd-notice.error{background:#fff0f0;color:#a94444}
        .vpd-notice.success{background:#eaf8ef;color:#28794c}
        .vpd-notice.warn{background:#fff5d9;color:#9a7015;font-weight:700}

        .vpd-card{background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(47,117,150,.1);overflow:hidden}
        .vpd-banner{height:120px;background:linear-gradient(120deg,#1e5a8c 0%,#2c6ba3 35%,#4DA8DA 75%,#78c4ca 100%);position:relative}
        .vpd-banner::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 30%,rgba(255,255,255,.18) 0 60px,transparent 61px),radial-gradient(circle at 85% 70%,rgba(255,255,255,.12) 0 90px,transparent 91px)}
        .vpd-identity{display:grid;justify-items:center;text-align:center;padding:0 24px 22px;margin-top:-58px;position:relative}
        .vpd-avatar{position:relative;width:116px;height:116px;margin-bottom:12px}
        .vpd-avatarImg{width:100%;height:100%;border-radius:50%;overflow:hidden;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;border:5px solid #fff;box-shadow:0 8px 22px rgba(20,73,94,.2)}
        .vpd-avatarImg img{width:100%;height:100%;object-fit:cover;display:block}
        .vpd-camera{position:absolute;right:4px;bottom:6px;width:34px;height:34px;border-radius:50%;background:#2c6ba3;color:#fff;display:grid;place-items:center;cursor:pointer;border:3px solid #fff;box-shadow:0 3px 8px rgba(20,73,94,.25);transition:transform .15s ease}
        .vpd-camera:hover{transform:scale(1.08)}
        .vpd-camera input{display:none}
        .vpd-identity h2{margin:0;font-size:24px;color:#1d3a4a;overflow-wrap:anywhere}
        .vpd-handle{margin:4px 0 0;color:#6F7F88;font-weight:600}
        .vpd-tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px}
        .vpd-role{background:#e7f6fc;color:#267fa9;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800}
        .vpd-spec{display:flex;align-items:center;gap:6px;margin:10px 0 0;color:#2c6ba3;font-weight:700;font-size:13.5px}
        .vpd-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:18px}
        .vpd-btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:11px 18px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;border:1px solid transparent;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
        .vpd-btn:disabled{opacity:.6;cursor:not-allowed}
        .vpd-primary{background:#2c6ba3;color:#fff;box-shadow:0 6px 16px rgba(44,107,163,.25)}
        .vpd-primary:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 10px 20px rgba(44,107,163,.32)}
        .vpd-ghost{background:#fff;color:#2c6ba3;border-color:#cfe4ed}
        .vpd-ghost:not(:disabled):hover{background:#f1f9fd}

        .vpd-body{border-top:1px solid #edf3f6;padding:22px 28px 26px}
        .vpd-details{margin:0;display:grid;gap:2px}
        .vpd-row{display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:start;padding:12px 4px;border-bottom:1px solid #f0f5f7}
        .vpd-row:last-child{border-bottom:0}
        .vpd-row dt{display:flex;align-items:center;gap:9px;color:#6F7F88;font-size:13px;font-weight:700}
        .vpd-row dt svg{color:#4DA8DA;flex-shrink:0}
        .vpd-row dd{margin:0;color:#1d3a4a;font-weight:600;overflow-wrap:anywhere;white-space:pre-line;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .vpd-row dd.vpd-empty{color:#a3b3ba;font-weight:500;font-style:italic}
        .vpd-fixed-badge{display:inline-flex;align-items:center;gap:4px;background:#e5f4ea;color:#2f8f5b;padding:4px 9px;border-radius:999px;font-size:10.5px;font-weight:800;font-style:normal;white-space:nowrap}
        .vpd-subheading{display:flex;align-items:center;gap:7px;margin:18px 0 4px;color:#17445a;font-size:13px;text-transform:uppercase;letter-spacing:.3px}

        .vpd-form{display:grid;gap:13px}
        .vpd-form h3{display:flex;align-items:center;gap:8px;margin:0 0 4px;color:#1d3a4a}
        .vpd-form label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a}
        .vpd-form input,.vpd-form textarea{width:100%;border:1px solid #d8e8ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fbfeff;box-sizing:border-box}
        .vpd-form input:focus,.vpd-form textarea:focus{outline:none;border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
        .vpd-form textarea{min-height:78px;resize:vertical}
        .vpd-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .vpd-locked{display:flex;align-items:center;gap:8px;min-height:44px;border:1px dashed #d3e2e8;border-radius:11px;padding:10px 12px;background:#f4f7f8;color:#5f7380;font-weight:600;cursor:not-allowed}
        .vpd-locked span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vpd-locked svg{flex-shrink:0;color:#9aa9b0}
        .vpd-hint{margin:0;font-size:12.5px;color:#6F7F88}
        .vpd-form-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px}
        .vpd-highlight{outline:2px solid #f0c869;outline-offset:8px;border-radius:12px}
        .vpd-passwordBox{display:flex;border:1px solid #d8e8ef;border-radius:11px;overflow:hidden;background:#fbfeff}
        .vpd-passwordBox:focus-within{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
        .vpd-passwordBox input{border:0!important;box-shadow:none!important;background:transparent}
        .vpd-passwordBox button{border:0;background:transparent;color:#54707d;padding:0 13px;cursor:pointer}

        @media(max-width:640px){.vpd-body{padding:18px 16px 20px}.vpd-row{grid-template-columns:1fr;gap:4px}.vpd-pair{grid-template-columns:1fr}.vpd-form-actions{justify-content:stretch}.vpd-form-actions .vpd-btn{flex:1;justify-content:center}}
      `}</style>
    </div>
  );
}
