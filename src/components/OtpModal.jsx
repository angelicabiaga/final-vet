import React, { useEffect, useRef, useState } from "react";
import { MailCheck, X } from "lucide-react";
import { resendAuthOtp } from "../services/authService";

export default function OtpModal({ open, email, purpose, title, onVerify, onClose }) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const codeRef = useRef(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  // Guards the automatic verify: never two requests at once, and the same
  // wrong code isn't re-sent until the user changes it.
  const submittingRef = useRef(false);
  const lastAutoCodeRef = useRef("");

  // Start clean every time the modal opens or closes.
  useEffect(() => {
    setCode("");
    setCodeError("");
    setMessage("");
    lastAutoCodeRef.current = "";
  }, [open]);

  // Auto-verify as soon as the 6th digit is entered (typed or pasted).
  useEffect(() => {
    if (!open) return;
    if (!/^\d{6}$/.test(code)) {
      lastAutoCodeRef.current = "";
      return;
    }
    if (code === lastAutoCodeRef.current) return;
    lastAutoCodeRef.current = code;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  if (!open) return null;

  function updateCode(value) {
    setCode(value);
    if (codeError && /^\d{6}$/.test(value)) setCodeError("");
  }

  async function verify(e) {
    e?.preventDefault();
    if (submittingRef.current) return;
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit OTP.");
      codeRef.current?.focus();
      return;
    }
    setCodeError("");
    submittingRef.current = true;
    setLoading(true); setMessage("");
    try { await onVerify(code); setCode(""); }
    catch (err) { setMessage(err.message || "Invalid OTP."); setTimeout(() => codeRef.current?.focus(), 0); }
    finally { submittingRef.current = false; setLoading(false); }
  }

  async function resend() {
    setLoading(true); setMessage(""); setCodeError("");
    try { await resendAuthOtp(purpose); setCode(""); setMessage("A new OTP was sent."); }
    catch (err) { setMessage(err.message || "Unable to resend OTP."); }
    finally { setLoading(false); }
  }

  const isGoodNews = /sent/i.test(message);
  const activeIndex = Math.min(code.length, 5);

  return <div className="otpOverlay" role="dialog" aria-modal="true" aria-labelledby="otp-modal-title">
    <div className="otpCard">
      <button type="button" className="otpClose" onClick={onClose} disabled={loading} aria-label="Close"><X size={18} /></button>
      <div className="otpBadge" aria-hidden="true"><MailCheck size={28} /></div>
      <h3 id="otp-modal-title">{title || "OTP Verification"}</h3>
      <p className="otpLead">Enter the 6-digit code we sent to <b>{email}</b>.</p>

      <form onSubmit={verify} noValidate>
        {/* One real input (handles typing, paste and phone autofill) drawn as six boxes. */}
        <div className={`otpBoxes${codeError ? " invalid" : ""}`} onClick={() => codeRef.current?.focus()}>
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className={`otpBox${code[index] ? " filled" : ""}${focused && index === activeIndex && !loading ? " active" : ""}`}
              aria-hidden="true"
            >
              {code[index] || ""}
            </span>
          ))}
          <input
            ref={codeRef}
            className="otpHiddenInput"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength="6"
            value={code}
            disabled={loading}
            aria-label="6-digit verification code"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => updateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
        <p className="otpExpiry">The code expires in 10 minutes.</p>

        {codeError && <span className="otpMsg bad">{codeError}</span>}
        {message && <div className={`otpMsg ${isGoodNews ? "good" : "bad"}`} aria-live="polite">{message}</div>}

        <button className="otpVerify" disabled={loading || code.length < 6}>{loading ? "Verifying…" : "Verify Code"}</button>
        <div className="otpFooter">
          <span>Didn't get the code? <button type="button" className="otpLink" onClick={resend} disabled={loading}>Resend</button></span>
          <button type="button" className="otpCancel" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </form>
    </div>
    <style>{`
      .otpOverlay{position:fixed;inset:0;background:rgba(22,45,56,.5);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px;z-index:9999}
      .otpCard{position:relative;width:min(430px,100%);box-sizing:border-box;background:#fff;border-radius:22px;padding:30px 28px 24px;box-shadow:0 24px 60px rgba(17,48,63,.28);text-align:center;animation:otpIn .18s ease-out}
      @keyframes otpIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
      .otpClose{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:10px;background:#eef6f9;color:#456472;display:grid;place-items:center;cursor:pointer}
      .otpClose:hover:not(:disabled){background:#e2f0f6}
      .otpBadge{width:62px;height:62px;margin:0 auto 14px;border-radius:18px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#4DA8DA,#2c6ba3);box-shadow:0 10px 22px rgba(44,107,163,.3)}
      .otpCard h3{margin:0 0 8px;color:#1d3a4a;font-size:21px}
      .otpLead{margin:0 0 20px;color:#5f7884;font-size:14.5px;line-height:1.5}
      .otpLead b{color:#1d3a4a}
      .otpCard form{display:grid;gap:12px}
      .otpBoxes{position:relative;display:grid;grid-template-columns:repeat(6,1fr);gap:9px;cursor:text}
      .otpBox{height:56px;display:grid;place-items:center;border:1.5px solid #d6e7ee;border-radius:13px;background:#f7fbfd;color:#1d3a4a;font-size:24px;font-weight:800;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
      .otpBox.filled{background:#fff;border-color:#9fcbe0}
      .otpBox.active{border-color:#4DA8DA;background:#fff;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
      .otpBoxes.invalid .otpBox{border-color:#e7a1a1}
      .otpHiddenInput{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;font-size:16px;cursor:text}
      .otpExpiry{margin:0;color:#8197a2;font-size:12.5px}
      .otpMsg{display:block;padding:10px 12px;border-radius:11px;font-size:13px;font-weight:600}
      .otpMsg.good{background:#eef8fc;color:#2c6b8a;border:1px solid #d6ebf5}
      .otpMsg.bad{background:#fff2f3;color:#ad3540;border:1px solid #f2cdd1}
      .otpVerify{height:48px;border:0;border-radius:999px;background:linear-gradient(115deg,#4DA8DA,#2c6ba3);color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px rgba(44,107,163,.25)}
      .otpVerify:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
      .otpFooter{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:2px;color:#6f8792;font-size:13.5px}
      .otpLink{border:0;background:none;padding:0;color:#2c7fb8;font:inherit;font-weight:800;cursor:pointer}
      .otpLink:hover:not(:disabled){text-decoration:underline}
      .otpCancel{border:1px solid #d6e7ee;border-radius:999px;background:#fff;color:#456472;padding:8px 18px;font:inherit;font-weight:700;cursor:pointer}
      .otpCancel:hover:not(:disabled){background:#f0f8fc}
      .otpLink:disabled,.otpCancel:disabled,.otpClose:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:420px){.otpCard{padding:26px 18px 20px}.otpBox{height:48px;font-size:20px}.otpBoxes{gap:6px}}
    `}</style>
  </div>;
}
