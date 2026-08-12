import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginUser, getCurrentProfile } from "../../services/authService";
import PasswordInput from "../../components/PasswordInput";
import pawLogo from "../../assets/reference/paw.png";

export default function Login() {
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await loginUser(form.identifier, form.password);
      const profile = await getCurrentProfile(result.user.id);
      const rolePath = profile.role === "pet_owner" ? "pet-owner" : profile.role;
      navigate(location.state?.from?.pathname || `/${rolePath}/dashboard`, { replace: true });
    } catch (err) {
      setMessage(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your PawCruz account"
      showBackToHome
    >
      <form onSubmit={submit}>
        <label>
          Email or Username
          <input
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            required
          />
        </label>
        <label>
          Password
          <PasswordInput
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength="6"
          />
        </label>
        {message && <div className="error">{message}</div>}
        <button disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
        <div className="links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create account</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

export function AuthLayout({ title, subtitle, children, showBackToHome = false }) {
  return (
    <div className="auth">
      <div className="panel">
        {showBackToHome && (
          <Link className="auth-back-link" to="/">
            <ArrowLeft size={17} strokeWidth={2.4} aria-hidden="true" />
            Back to Home
          </Link>
        )}
        <div className="brand">
          <img src={pawLogo} alt="" aria-hidden="true" />
          <span>PawCruz</span>
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
      </div>
      <style>{`
        *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(135deg,#eaf8fd,#f9fdff);color:#20313B}.auth{min-height:100vh;display:grid;place-items:center;padding:20px}.panel{width:min(440px,100%);background:#fff;padding:34px;border-radius:24px;box-shadow:0 18px 50px rgba(45,119,153,.15)}.auth-back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:18px;color:#318fbe;font-size:13px;font-weight:700;text-decoration:none;transition:color .18s ease,transform .18s ease}.auth-back-link:hover{color:#255065;transform:translateX(-2px)}.auth-back-link:focus-visible{outline:3px solid rgba(67,143,181,.25);outline-offset:3px;border-radius:5px}.brand{color:#318fbe;font-weight:800;font-size:22px;display:flex;align-items:center;gap:9px}.brand img{width:28px;height:34px;object-fit:contain;flex-shrink:0}.panel h1{margin:22px 0 5px}.panel>p{color:#6F7F88;margin-top:0}form{display:grid;gap:15px;margin-top:24px}label{display:grid;gap:7px;font-weight:700;font-size:14px}input,select{padding:13px;border:1px solid #cfe5ee;border-radius:11px;font-size:15px;outline:none}input:focus{border-color:#4DA8DA;box-shadow:0 0 0 3px #e0f4fb}button{border:0;background:#4DA8DA;color:#fff;padding:14px;border-radius:12px;font-weight:800;cursor:pointer}button:disabled{opacity:.65}.error,.success{padding:11px;border-radius:10px;font-size:14px}.error{background:#fff0f0;color:#b94b4b}.success{background:#ebf8ef;color:#2f8050}.links{display:flex;justify-content:space-between;font-size:13px}.links a{color:#318fbe;text-decoration:none}
      `}</style>
    </div>
  );
}
