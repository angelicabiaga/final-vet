import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginUser, resolveLoginDestination } from "../../services/authService";
import PasswordInput from "../../components/PasswordInput";
import pawLogo from "../../assets/reference/paw.png";

import { MapPin, Phone } from 'lucide-react';
import dogCatBackground from '../../assets/reference/dog_cat.jpg';

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

      if (!result.requiresOtp) {
        // Trusted device: credentials were enough, no OTP needed this time.
        navigate(
          resolveLoginDestination(result.profile, location.state?.from?.pathname),
          { replace: true },
        );
        return;
      }

      navigate(`/otp?purpose=login`, {
        state: { from: location.state?.from?.pathname || null, email: result.email },
      });
    } catch (err) {
      setMessage(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout
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
    </LoginLayout>
  );
}

export function LoginLayout({ title, subtitle, children, showBackToHome = false }) {
  React.useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <>
      <style>{`
        .login-screen,
        .login-screen * {
          box-sizing: border-box;
        }

        html:has(.login-screen),
        body:has(.login-screen),
        #root:has(.login-screen) {
          width: 100%;
          height: 100%;
          max-height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden !important;
        }

        .login-screen {
          width: 100%;
          height: auto;
          min-height: 0;
          max-height: 100vh;
          max-height: 100dvh;
          position: fixed;
          inset: 0;
          overflow: hidden;

          display: grid;
          grid-template-rows: 92px minmax(0, 1fr) 70px;

          color: #18394c;
          background-color: #dceef4;
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;
          font-family: Arial, Helvetica, sans-serif;
        }

        .login-screen-header {
          width: min(1600px, calc(100% - clamp(30px, 8vw, 310px)));
          min-height: 78px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 14px auto 0;
          padding: 0 clamp(20px, 3vw, 36px);

          border: 1px solid rgba(185, 225, 240, 0.45);
          border-radius: 24px;
          background: linear-gradient(
            115deg,
            rgba(20, 61, 78, 0.72),
            rgba(31, 76, 92, 0.68)
          );
          box-shadow:
            0 10px 30px rgba(3, 24, 37, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          position: relative;
          z-index: 2;
        }

        .login-screen-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: #ffffff;
          text-decoration: none;
        }

        .login-screen-logo {
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.75);
          border-radius: 17px;
          background: rgba(248, 253, 255, 0.94);
          box-shadow: 0 8px 20px rgba(5, 34, 48, 0.18);
        }

        .login-screen-logo img {
          width: 31px;
          height: 37px;
          object-fit: contain;
        }

        .login-screen-brand-copy {
          display: grid;
          gap: 2px;
          line-height: 1;
        }

        .login-screen-brand-copy strong {
          font-size: 28px;
          letter-spacing: -0.5px;
        }

        .login-screen-brand-copy small {
          color: #d8f0fa;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .login-screen-main {
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(12px, 2.2vh, 24px) 20px;
          overflow: hidden;
        }

        .login-screen-card {
          width: min(550px, 100%);
          max-height: 100%;
          position: relative;
          overflow: hidden;
          padding: 42px clamp(30px, 4vw, 44px) 28px;

          border: 1px solid rgba(255, 255, 255, 0.92);
          border-radius: 28px;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.97),
            rgba(235, 247, 252, 0.94)
          );
          box-shadow: 0 24px 60px rgba(4, 31, 45, 0.27);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .login-screen-card::before {
          content: '';
          width: 82px;
          height: 6px;
          position: absolute;
          top: 18px;
          left: 50%;
          border-radius: 999px;
          background: linear-gradient(90deg, #4ba9d6, #23627e);
          transform: translateX(-50%);
        }

        .login-screen-back {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: max-content;
          margin: 0 auto 13px;
          color: #2588b5;
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
        }

        .login-screen-back:hover {
          color: #174e69;
          transform: translateX(-2px);
        }

        .login-screen-heading {
          margin-bottom: 20px;
          text-align: center;
        }

        .login-screen-heading h1 {
          margin: 0 0 5px;
          color: #183747;
          font-size: clamp(28px, 3vw, 36px);
          line-height: 1.15;
          letter-spacing: -0.8px;
        }

        .login-screen-heading p {
          margin: 0;
          color: #627d8d;
          font-size: 15px;
        }

        .login-screen-card form {
          display: grid;
          gap: 14px;
          margin: 0;
        }

        .login-screen-card label {
          display: grid;
          gap: 6px;
          color: #244c60;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .login-screen-card input,
        .login-screen-card select {
          width: 100%;
          min-height: 48px;
          padding: 10px 14px;
          color: #183747;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #bfd9e4;
          border-radius: 12px;
          outline: none;
          font-family: inherit;
          font-size: 15px;
          text-transform: none;
          letter-spacing: normal;
        }

        .login-screen-card input:focus {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77, 168, 218, 0.17);
        }

        .login-screen-card button {
          min-height: 48px;
          padding: 10px 18px;
          color: #ffffff;
          background: linear-gradient(115deg, #237da4, #174e69);
          border: 0;
          border-radius: 12px;
          box-shadow: 0 9px 20px rgba(37, 80, 101, 0.22);
          font-family: inherit;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .login-screen-card button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .login-screen-card .error,
        .login-screen-card .success {
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 13px;
        }

        .login-screen-card .error {
          color: #a93743;
          background: #fff0f2;
          border: 1px solid #f4cbd0;
        }

        .login-screen-card .success {
          color: #2f8050;
          background: #ebf8ef;
        }

        .login-screen-card .links {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 13px;
        }

        .login-screen-card .links a {
          color: #2588b5;
          font-weight: 800;
          text-decoration: none;
        }

        .login-screen-contact {
          width: 100%;
          min-height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px clamp(30px, 5vw, 64px);
          padding: 12px 5%;
          margin: 0;

          color: #f5fbfe;
          background: linear-gradient(
            100deg,
            rgba(8, 31, 43, 0.92),
            rgba(9, 48, 54, 0.9)
          );
          border-top: 1px solid rgba(111, 198, 235, 0.35);
          box-shadow: 0 -8px 26px rgba(3, 24, 35, 0.16);
          font-size: 16px;
          font-weight: 700;
          align-self: end;
        }

        .login-screen-contact-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .login-screen-contact-item svg {
          flex: 0 0 auto;
          color: #70c7ee;
        }

        .login-screen-contact-item a {
          color: #ffffff;
          text-decoration: none;
        }

        @media (max-width: 760px) {
          .login-screen {
            grid-template-rows: 76px minmax(0, 1fr) 72px;
            background-position: 58% center;
          }

          .login-screen-header {
            width: calc(100% - 20px);
            min-height: 66px;
            margin-top: 10px;
            padding: 0 16px;
            border-radius: 18px;
          }

          .login-screen-logo {
            width: 42px;
            height: 42px;
            border-radius: 13px;
          }

          .login-screen-logo img {
            width: 25px;
            height: 30px;
          }

          .login-screen-brand-copy strong {
            font-size: 22px;
          }

          .login-screen-brand-copy small {
            display: none;
          }

          .login-screen-main {
            padding: 8px 14px;
          }

          .login-screen-card {
            width: min(480px, 100%);
            padding: 34px 18px 18px;
            border-radius: 20px;
          }

          .login-screen-card::before {
            top: 14px;
            width: 62px;
            height: 4px;
          }

          .login-screen-back {
            margin-bottom: 8px;
            font-size: 12px;
          }

          .login-screen-heading {
            margin-bottom: 12px;
          }

          .login-screen-heading h1 {
            font-size: 25px;
          }

          .login-screen-heading p {
            font-size: 12px;
          }

          .login-screen-card form {
            gap: 9px;
          }

          .login-screen-card label {
            gap: 4px;
            font-size: 11px;
          }

          .login-screen-card input,
          .login-screen-card select,
          .login-screen-card button {
            min-height: 40px;
            padding: 7px 10px;
            font-size: 13px;
          }

          .login-screen-card .links {
            font-size: 11px;
          }

          .login-screen-contact {
            min-height: 72px;
            padding: 10px 16px;
            gap: 7px 18px;
            font-size: 12px;
          }
        }

        @media (max-width: 520px) {
          .login-screen-contact {
            flex-direction: column;
            justify-content: center;
          }

          .login-screen-contact-item {
            text-align: center;
          }
        }

        @media (max-height: 700px) and (min-width: 761px) {
          .login-screen {
            grid-template-rows: 76px minmax(0, 1fr) 62px;
          }

          .login-screen-header {
            min-height: 68px;
            margin-top: 8px;
          }

          .login-screen-main {
            padding-top: 8px;
            padding-bottom: 8px;
          }

          .login-screen-card {
            padding-top: 36px;
            padding-bottom: 18px;
          }

          .login-screen-heading {
            margin-bottom: 12px;
          }

          .login-screen-contact {
            min-height: 62px;
          }
        }
      `}</style>

      <div
        className='login-screen'
        style={{ backgroundImage: `url(${dogCatBackground})` }}
      >
        <header className='login-screen-header'>
          <Link
            className='login-screen-brand'
            to='/'
            aria-label='PawCruz home'
          >
            <span className='login-screen-logo'>
              <img src={pawLogo} alt='' aria-hidden='true' />
            </span>

            <span className='login-screen-brand-copy'>
              <strong>PawCruz</strong>
              <small>Cruz Veterinary Clinic</small>
            </span>
          </Link>
        </header>

        <main className='login-screen-main'>
          <section className='login-screen-card'>
            {showBackToHome && (
              <Link className='login-screen-back' to='/'>
                <ArrowLeft
                  size={17}
                  strokeWidth={2.4}
                  aria-hidden='true'
                />
                Back to Home
              </Link>
            )}

            <div className='login-screen-heading'>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>

            {children}
          </section>
        </main>

        <footer className='login-screen-contact'>
          <div className='login-screen-contact-item'>
            <MapPin size={21} aria-hidden='true' />
            <span>
              2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City
            </span>
          </div>

          <div className='login-screen-contact-item'>
            <Phone size={20} aria-hidden='true' />
            <a href='tel:0938537649'>0938537649</a>
            <span aria-hidden='true'>|</span>
            <a href='tel:0917165379'>0917165379</a>
          </div>
        </footer>
      </div>
    </>
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
