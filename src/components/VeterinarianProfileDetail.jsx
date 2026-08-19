import React, { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Camera,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Save,
  Stethoscope,
  UserCircle,
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
} from "../utils/validators";

function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function joinFullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

const EMPTY_FORM = {
  firstName: "", middleName: "", lastName: "", username: "", email: "", phone: "", address: "", avatar_url: "",
  specialization: "", education: "", years_experience: "", certifications_training: "",
  previous_practice: "", professional_interests: "", biography: "",
};

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
  const [errors, setErrors] = useState({ phone: "", address: "", specialization: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [otpModal, setOtpModal] = useState({ open: false, email: "", purpose: "", title: "" });
  const passwordSectionRef = useRef(null);
  const forcePasswordChange = isSelf && !!viewerProfile?.must_change_password;

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
        setForm({
          ...splitFullName(profileRow.full_name),
          username: profileRow.username || "",
          email: profileRow.email || "",
          phone: profileRow.phone || "",
          address: profileRow.address || "",
          avatar_url: profileRow.avatar_url || "",
          specialization: profileRow.specialization || "",
          education: profileRow.education || "",
          years_experience: profileRow.years_experience ?? "",
          certifications_training: profileRow.certifications_training || "",
          previous_practice: profileRow.previous_practice || "",
          professional_interests: profileRow.professional_interests || "",
          biography: profileRow.biography || "",
        });
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

  useEffect(() => {
    if (forcePasswordChange) passwordSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [forcePasswordChange]);

  useEffect(() => () => { if (avatarDraft?.previewUrl) URL.revokeObjectURL(avatarDraft.previewUrl); }, [avatarDraft]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: "" } : current));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    const trimmedPhone = form.phone.trim();
    const nextErrors = { phone: "", address: "", specialization: "" };
    if (!trimmedPhone) nextErrors.phone = "Contact number is required.";
    else if (!isValidPhMobile(trimmedPhone)) nextErrors.phone = INVALID_PH_MOBILE_MESSAGE;
    if (!form.address.trim()) nextErrors.address = "Address is required.";
    if (!form.specialization.trim()) nextErrors.specialization = "Specialization is required.";
    if (nextErrors.phone || nextErrors.address || nextErrors.specialization) {
      setErrors(nextErrors);
      return setMessage({ type: "error", text: "Please fix the highlighted fields before saving." });
    }
    setErrors(nextErrors);
    setSaving(true);
    try {
      const updated = await updateVeterinarianProfile(vetId, { ...form, full_name: joinFullName(form) }, viewerProfile);
      setData((current) => ({ ...current, profile: updated }));
      setForm((current) => ({ ...current, ...splitFullName(updated.full_name), avatar_url: updated.avatar_url || "" }));
      setMessage({ type: "success", text: "Profile updated successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  function pickAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage({ type: "", text: "" });
    try {
      validateImageFile(file);
    } catch (error) {
      return setMessage({ type: "error", text: error.message });
    }
    setAvatarDraft((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function cancelAvatarDraft() {
    if (avatarDraft?.previewUrl) URL.revokeObjectURL(avatarDraft.previewUrl);
    setAvatarDraft(null);
  }

  async function saveAvatarDraft() {
    if (!avatarDraft?.file) return;
    setMessage({ type: "", text: "" });
    setUploading(true);
    try {
      const avatar_url = await uploadProfileAvatar(vetId, avatarDraft.file);
      const updated = await updateVeterinarianProfile(vetId, { ...form, full_name: joinFullName(form), avatar_url }, viewerProfile);
      setData((current) => ({ ...current, profile: updated }));
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url || "" }));
      cancelAvatarDraft();
      setMessage({ type: "success", text: "Profile photo updated." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setMessage({ type: "", text: "" });
    setUploading(true);
    try {
      const updated = await updateVeterinarianProfile(vetId, { ...form, full_name: joinFullName(form), avatar_url: null }, viewerProfile);
      setData((current) => ({ ...current, profile: updated }));
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url || "" }));
      setMessage({ type: "success", text: "Profile photo removed." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      validatePassword(passwords.next);
      validatePasswordsMatch(passwords.next, passwords.confirm);
    } catch (error) {
      return setMessage({ type: "error", text: error.message });
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
    setMessage({ type: "success", text: "Password changed successfully." });
    setOtpModal({ open: false, email: "", purpose: "", title: "" });
  }

  const PasswordField = ({ name, label }) => (
    <label>{label}<div className="vpd-passwordBox">
      <input type={show[name] ? "text" : "password"} value={passwords[name]} onChange={(e) => setPasswords((p) => ({ ...p, [name]: e.target.value }))} required />
      <button type="button" onClick={() => setShow((s) => ({ ...s, [name]: !s[name] }))}>{show[name] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div></label>
  );

  if (loading) return <div className="vpd vpd-loading">Loading veterinarian profile...</div>;
  if (loadError) return <div className="vpd vpd-error-block">{loadError}</div>;
  if (!data) return null;

  const { profile: vet } = data;
  const photoUrl = avatarDraft?.previewUrl || form.avatar_url;

  return (
    <div className="vpd">
      {message.text && <div className={`vpd-notice ${message.type}`}>{message.text}</div>}
      {forcePasswordChange && <div className="vpd-notice warn">You're using a temporary password. Please set a new password below to continue.</div>}

      <section className="vpd-hero">
        <div className="vpd-avatar">
          {photoUrl ? <img src={photoUrl} alt="Profile" /> : <UserCircle size={88} />}
          {isSelf && (
            <label className="vpd-camera" title={form.avatar_url ? "Change photo" : "Upload photo"}>
              <Camera size={16} />
              <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={pickAvatar} />
            </label>
          )}
        </div>
        <div className="vpd-hero-info">
          <h2>{vet.full_name}</h2>
          <div className="vpd-hero-tags">
            <p className="vpd-role-tag">Veterinarian</p>
            <VerificationStatusBadge status={verificationStatus} />
          </div>
          {isSelf && <p className="vpd-hint">JPG, JPEG, PNG, or WEBP. Max 25 MB.</p>}
          {isSelf && avatarDraft && (
            <div className="vpd-avatar-actions">
              <button type="button" onClick={saveAvatarDraft} disabled={uploading}>{uploading ? "Saving..." : "Save Photo"}</button>
              <button type="button" className="ghost" onClick={cancelAvatarDraft} disabled={uploading}>Cancel</button>
            </div>
          )}
          {isSelf && !avatarDraft && form.avatar_url && (
            <div className="vpd-avatar-actions">
              <button type="button" className="ghost danger" onClick={removePhoto} disabled={uploading}>{uploading ? "Removing..." : "Remove Photo"}</button>
            </div>
          )}
        </div>
      </section>

      <section className="vpd-card">
        <h3><Stethoscope size={18} /> Professional Information</h3>

        <div className="vpd-field-row">
          <span className="vpd-label">Veterinary License Number</span>
          <div className="vpd-license-row">
            <input value={vet.license_number || "Not on file"} readOnly disabled />
            {vet.license_number && <span className="vpd-fixed-badge"><BadgeCheck size={12} /> Verified</span>}
          </div>
          <p className="vpd-license-locked-note">
            {vet.license_number
              ? "Read automatically from the approved PRC ID scan. It can never be typed or edited by anyone."
              : "Not on file until the PRC ID and face verification below are submitted and approved by an administrator."}
          </p>
        </div>

        {isSelf ? (
          <form onSubmit={saveDetails} className="vpd-form">
            <div className="vpd-pair">
              <label><span>First name<span className="vpd-required">*</span></span><input value={form.firstName} onChange={(e) => field("firstName", e.target.value)} required /></label>
              <label><span>Last name<span className="vpd-required">*</span></span><input value={form.lastName} onChange={(e) => field("lastName", e.target.value)} required /></label>
            </div>
            <label><span>Middle name <small>(Optional)</small></span><input value={form.middleName} onChange={(e) => field("middleName", e.target.value)} /></label>
            <div className="vpd-pair">
              <label><span>Username<span className="vpd-required">*</span></span><input value={form.username} onChange={(e) => field("username", e.target.value)} required /></label>
              <label><span>Email<span className="vpd-required">*</span></span><input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} required /></label>
            </div>
            <div className="vpd-pair">
              <label><span>Contact number<span className="vpd-required">*</span></span>
                <input value={form.phone} onChange={(e) => field("phone", e.target.value)} placeholder="09XXXXXXXXX or +639XXXXXXXXX" aria-invalid={!!errors.phone} required />
                {errors.phone && <span className="vpd-fieldError">{errors.phone}</span>}
              </label>
              <label><span>Specialization<span className="vpd-required">*</span></span>
                <input value={form.specialization} onChange={(e) => field("specialization", e.target.value)} placeholder="e.g. Small Animal Medicine" aria-invalid={!!errors.specialization} required />
                {errors.specialization && <span className="vpd-fieldError">{errors.specialization}</span>}
              </label>
            </div>
            <label><span>Address<span className="vpd-required">*</span></span>
              <textarea value={form.address} onChange={(e) => field("address", e.target.value)} aria-invalid={!!errors.address} required />
              {errors.address && <span className="vpd-fieldError">{errors.address}</span>}
            </label>

            <h4 className="vpd-subheading"><GraduationCap size={16} /> Background in Veterinary Medicine</h4>
            <label>Education<textarea value={form.education} onChange={(e) => field("education", e.target.value)} placeholder="Veterinary school, degree, year" /></label>
            <label>Years of Veterinary Experience<input type="number" min="0" value={form.years_experience} onChange={(e) => field("years_experience", e.target.value)} /></label>
            <label>Certifications and Professional Training<textarea value={form.certifications_training} onChange={(e) => field("certifications_training", e.target.value)} /></label>
            <label>Previous Veterinary Practice<textarea value={form.previous_practice} onChange={(e) => field("previous_practice", e.target.value)} /></label>
            <label>Professional Interests<textarea value={form.professional_interests} onChange={(e) => field("professional_interests", e.target.value)} /></label>
            <label>Short Biography<textarea value={form.biography} onChange={(e) => field("biography", e.target.value)} /></label>

            <button className="vpd-save-btn" disabled={saving}><Save size={17} />{saving ? "Saving..." : "Save Profile"}</button>
          </form>
        ) : (
          <div className="vpd-readonly">
            <div className="vpd-field-row"><span className="vpd-label"><Mail size={13} /> Email</span><p>{vet.email || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label"><Phone size={13} /> Contact Number</span><p>{vet.phone || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label"><MapPin size={13} /> Address</span><p>{vet.address || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Specialization</span><p>{vet.specialization || "Not recorded"}</p></div>

            <h4 className="vpd-subheading"><GraduationCap size={16} /> Background in Veterinary Medicine</h4>
            <div className="vpd-field-row"><span className="vpd-label">Education</span><p>{vet.education || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Years of Veterinary Experience</span><p>{vet.years_experience ?? "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Certifications and Professional Training</span><p>{vet.certifications_training || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Previous Veterinary Practice</span><p>{vet.previous_practice || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Professional Interests</span><p>{vet.professional_interests || "Not recorded"}</p></div>
            <div className="vpd-field-row"><span className="vpd-label">Short Biography</span><p>{vet.biography || "Not recorded"}</p></div>
          </div>
        )}
      </section>

      <VeterinarianVerificationPanel vetId={vetId} vetProfile={vet} viewerProfile={viewerProfile} />

      {isSelf && (
        <section className={`vpd-card${forcePasswordChange ? " highlight" : ""}`} ref={passwordSectionRef}>
          <h3><LockKeyhole size={20} /> Change Password</h3>
          <form onSubmit={savePassword} className="vpd-form">
            <PasswordField name="current" label="Current password" />
            <PasswordField name="next" label="New password" />
            <PasswordChecklist password={passwords.next} />
            <PasswordField name="confirm" label="Confirm new password" />
            <button className="vpd-save-btn" disabled={saving}><LockKeyhole size={17} />{saving ? "Saving..." : "Change Password"}</button>
          </form>
        </section>
      )}

      <OtpModal
        open={otpModal.open}
        email={otpModal.email}
        purpose={otpModal.purpose}
        title={otpModal.title}
        onVerify={verifyOtp}
        onClose={() => setOtpModal({ open: false, email: "", purpose: "", title: "" })}
      />

      <style>{`
        .vpd{display:grid;gap:16px}
        .vpd-loading,.vpd-error-block{padding:30px;text-align:center;color:#6f7f88}
        .vpd-error-block{color:#a94444}

        .vpd-notice{padding:11px 14px;border-radius:11px;font-size:13px}
        .vpd-notice.error{background:#fff0f0;color:#a94444}
        .vpd-notice.success{background:#eaf8ef;color:#28794c}
        .vpd-notice.warn{background:#fff5d9;color:#9a7015;font-weight:700}

        .vpd-hero{display:flex;align-items:center;gap:18px}
        .vpd-avatar{width:96px;height:96px;border-radius:50%;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;position:relative;flex-shrink:0}
        .vpd-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}
        .vpd-camera{position:absolute;right:0;bottom:2px;background:#4DA8DA;color:#fff;width:30px;height:30px;border-radius:50%;display:grid!important;place-items:center;cursor:pointer}
        .vpd-camera input{display:none}
        .vpd-hero-info h2{margin:0 0 4px;color:#20313b}
        .vpd-hero-tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px}
        .vpd-role-tag{margin:0;display:inline-block;background:#e7f6fc;color:#267fa9;padding:5px 10px;border-radius:999px;font-size:11.5px;font-weight:700}
        .vpd-hint{margin:0;color:#8a9aa2;font-size:11.5px}
        .vpd-avatar-actions{display:flex;gap:8px;margin-top:8px}
        .vpd-avatar-actions button{border:0;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;background:#4DA8DA;color:#fff}
        .vpd-avatar-actions button.ghost{background:#eef4f6;color:#536b78}
        .vpd-avatar-actions button.ghost.danger{background:#fdeceb;color:#c1454c}
        .vpd-avatar-actions button:disabled{opacity:.6;cursor:not-allowed}

        .vpd-card{background:#fff;border:1px solid #e6f0f4;border-radius:16px;padding:20px;box-shadow:0 7px 20px rgba(47,117,150,.06)}
        .vpd-card.highlight{outline:2px solid #f0c869;outline-offset:2px}
        .vpd-card h3{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:#20313b;font-size:16px}
        .vpd-subheading{display:flex;align-items:center;gap:7px;margin:18px 0 4px;color:#17445a;font-size:13px;text-transform:uppercase;letter-spacing:.3px}

        .vpd-field-row{display:grid;gap:4px;margin-bottom:13px}
        .vpd-label{display:flex;align-items:center;gap:6px;color:#6f7f88;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.2px}
        .vpd-field-row p{margin:0;color:#334e5a;line-height:1.5;overflow-wrap:anywhere;white-space:pre-line}
        .vpd-readonly{display:grid;gap:2px}

        .vpd-license-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .vpd-license-row input{flex:1;min-width:160px;border:1px solid #e1e9ec;border-radius:9px;padding:10px;background:#f4f6f7;color:#536b78;font:inherit}
        .vpd-fixed-badge{display:inline-flex;align-items:center;gap:4px;background:#e5f4ea;color:#2f8f5b;padding:4px 9px;border-radius:999px;font-size:10.5px;font-weight:800;white-space:nowrap}
        .vpd-license-locked-note{margin:6px 0 0;color:#8a9aa2;font-size:11.5px}

        .vpd-form{display:grid;gap:13px}
        .vpd-form label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a}
        .vpd-required{color:#d14b4b;margin-left:3px;font-weight:800}
        .vpd-fieldError{color:#d14b4b;font-size:11.5px;font-weight:600}
        .vpd-form input,.vpd-form textarea{width:100%;border:1px solid #d8e8ef;border-radius:10px;padding:11px;font:inherit;box-sizing:border-box}
        .vpd-form input[aria-invalid="true"],.vpd-form textarea[aria-invalid="true"]{border-color:#e2a3a3}
        .vpd-form textarea{min-height:78px;resize:vertical}
        .vpd-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .vpd-save-btn{justify-self:start;border:0;border-radius:10px;padding:11px 15px;background:#4DA8DA;color:#fff;display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:700}
        .vpd-save-btn:disabled{opacity:.65;cursor:not-allowed}

        .vpd-passwordBox{display:flex;border:1px solid #d8e8ef;border-radius:10px;overflow:hidden}
        .vpd-passwordBox input{border:0}
        .vpd-passwordBox button{border:0;background:#fff;color:#54707d;padding:0 12px;cursor:pointer}

        @media(max-width:900px){.vpd-pair{grid-template-columns:1fr}.vpd-hero{align-items:flex-start}}
      `}</style>
    </div>
  );
}
