import React, { useState } from "react";
import { resendAuthOtp } from "../services/authService";

export default function OtpModal({ open, email, purpose, title, onVerify, onClose }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  async function verify(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setMessage("Enter the 6-digit OTP.");
    setLoading(true); setMessage("");
    try { await onVerify(code); setCode(""); }
    catch (err) { setMessage(err.message || "Invalid OTP."); }
    finally { setLoading(false); }
  }

  async function resend() {
    setLoading(true); setMessage("");
    try { await resendAuthOtp(purpose); setCode(""); setMessage("A new OTP was sent."); }
    catch (err) { setMessage(err.message || "Unable to resend OTP."); }
    finally { setLoading(false); }
  }

  return <div className="otpOverlay" role="dialog" aria-modal="true">
    <div className="otpCard">
      <h3>{title || "OTP Verification"}</h3>
      <p>Enter the 6-digit code sent to <b>{email}</b>. It expires in 10 minutes.</p>
      <form onSubmit={verify}>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" />
        {message && <div className={message.includes("sent") ? "success" : "error"}>{message}</div>}
        <div className="otpActions"><button disabled={loading}>{loading?"Please wait...":"Verify OTP"}</button><button type="button" className="secondary" onClick={resend} disabled={loading}>Resend OTP</button><button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancel</button></div>
      </form>
    </div>
    <style>{`.otpOverlay{position:fixed;inset:0;background:rgba(22,45,56,.45);display:grid;place-items:center;padding:20px;z-index:9999}.otpCard{width:min(440px,100%);background:#fff;border-radius:20px;padding:26px;box-shadow:0 20px 55px rgba(0,0,0,.2)}.otpCard h3{margin:0 0 8px}.otpCard p{color:#6F7F88;line-height:1.5}.otpCard form{display:grid;gap:14px}.otpCard input{text-align:center;font-size:28px;letter-spacing:8px;padding:14px;border:1px solid #cfe5ee;border-radius:12px}.otpActions{display:flex;flex-wrap:wrap;gap:9px}.otpActions button{border:0;border-radius:10px;padding:11px 14px;background:#4DA8DA;color:#fff;font-weight:700;cursor:pointer}.otpActions .secondary{background:#e7f6fc;color:#267fa9}`}</style>
  </div>;
}
