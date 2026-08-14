import React, { useState } from "react";
import {
  Check,
  MapPin,
  Phone,
  UserPlus,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import pawLogo from "../../assets/reference/paw.png";
import dogCatBackground from "../../assets/reference/dog_cat.jpg";
import PasswordInput from "../../components/PasswordInput";
import { registerPetOwner } from "../../services/authService";

const registerStyles = `
  .register-page,
  .register-page * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    min-height: 100%;
    margin: 0;
  }

  body {
    margin: 0;
  }

  html:has(.register-page),
  body:has(.register-page),
  #root:has(.register-page) {
    width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden !important;
  }

  .register-page {
    width: 100%;
    height: auto;
    min-height: 0;

    display: grid;
    grid-template-rows: 92px minmax(0, 1fr) 70px;

    color: #18394c;
    background-color: #dceef4;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;

    font-family: Arial, Helvetica, sans-serif;
    position: fixed;
    inset: 0;
    max-height: 100vh;
    max-height: 100dvh;
    overflow: hidden;
  }

  /* Header */
  .register-header {
    width: min(1600px, calc(100% - clamp(30px, 8vw, 310px)));
    min-height: 78px;

    display: flex;
    align-items: center;

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
    z-index: 5;
  }

  .register-brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;

    color: #ffffff;
    text-decoration: none;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .register-logo {
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

  .register-logo img {
    width: 31px;
    height: 37px;
    object-fit: contain;
  }

  .register-brand-copy {
    display: grid;
    gap: 2px;
    line-height: 1;
  }

  .register-brand-copy strong {
    font-size: 28px;
    letter-spacing: -0.5px;
  }

  .register-brand-copy small {
    color: #d8f0fa;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .register-header-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .register-header-nav a {
    min-height: 42px;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 10px 18px;
    border-radius: 12px;

    font-weight: 800;
    text-decoration: none;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease;
  }

  .register-header-nav a:hover {
    transform: translateY(-2px);
  }

  .register-home-link {
    color: #f1fbff;
    border: 1px solid rgba(255, 255, 255, 0.65);
    background: rgba(255, 255, 255, 0.08);
  }

  .register-login-link {
    color: #17455c;
    background: rgba(248, 252, 254, 0.96);
    box-shadow: 0 7px 18px rgba(4, 31, 45, 0.2);
  }

  /* Registration content */
  .register-main {
    min-height: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    padding: clamp(12px, 2.2vh, 24px) 20px;
    overflow: hidden;

    /* No dark overlay over the background image. */
    background: transparent;
  }

  .register-card {
    width: min(820px, 100%);
    max-height: 100%;
    position: relative;
    overflow: hidden;

    padding: 42px clamp(28px, 4vw, 44px) 24px;

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

  .register-card::before {
    content: "";
    position: absolute;
    top: 18px;
    left: 50%;

    width: 82px;
    height: 6px;

    border-radius: 999px;
    background: linear-gradient(90deg, #4ba9d6, #23627e);
    transform: translateX(-50%);
  }

  .register-heading {
    margin-bottom: 14px;
    text-align: center;
  }

  .register-heading-icon {
    width: 48px;
    height: 48px;

    display: grid;
    place-items: center;

    margin: 0 auto 7px;

    color: #267fa9;
    background: #e5f5fb;
    border: 1px solid #c5e8f5;
    border-radius: 15px;
  }

  .register-heading h1 {
    margin: 0 0 4px;

    color: #183747;
    font-size: clamp(24px, 3vw, 30px);
    line-height: 1.15;
    letter-spacing: -0.8px;
  }

  .register-heading p {
    margin: 0;
    color: #627d8d;
    font-size: 13px;
    line-height: 1.35;
  }

  .register-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px 16px;
  }

  .register-error,
  .register-submit-button,
  .register-form-links {
    grid-column: 1 / -1;
  }

  .register-field {
    display: grid;
    gap: 5px;

    color: #244c60;
    font-size: 13px;
    font-weight: 800;
  }

  .register-field input {
    width: 100%;
    min-height: 43px;

    padding: 8px 13px;

    color: #183747;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #bfd9e4;
    border-radius: 12px;
    outline: none;

    font-family: inherit;
    font-size: 14px;

    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      background-color 160ms ease;
  }

  .register-field input::placeholder {
    color: #94a9b3;
  }

  .register-field input:hover {
    border-color: #87bdd3;
  }

  .register-field input:focus {
    background: #ffffff;
    border-color: #318bb3;
    box-shadow: 0 0 0 4px rgba(49, 139, 179, 0.13);
  }

  /*
    Supports PasswordInput components that use a wrapper
    around the actual input and eye button.
  */
  .register-field > div {
    width: 100%;
  }

  .register-field > div input {
    width: 100%;
  }

  .register-error {
    padding: 11px 13px;

    color: #a51d2d;
    background: #fff0f2;
    border: 1px solid #f4b7bf;
    border-radius: 10px;

    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
  }

  .register-submit-button {
    width: 100%;
    min-height: 44px;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    margin-top: 0;
    padding: 9px 22px;

    color: #ffffff;
    background: linear-gradient(115deg, #237da4, #174e69);
    border: 1px solid rgba(29, 95, 125, 0.36);
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(18, 74, 101, 0.24);

    cursor: pointer;
    font-family: inherit;
    font-size: 15px;
    font-weight: 800;

    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      opacity 160ms ease;
  }

  .register-submit-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 13px 27px rgba(18, 74, 101, 0.3);
  }

  .register-submit-button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .register-form-links {
    display: flex;
    justify-content: center;
    margin-top: 1px;
  }

  .register-form-links a {
    color: #237da4;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
  }

  .register-form-links a:hover {
    text-decoration: underline;
  }

  /* Bottom contact bar */
  .register-contact-bar {
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

  .register-contact-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
  }

  .register-contact-item svg {
    flex: 0 0 auto;
    color: #70c7ee;
  }

  .register-phone-numbers {
    gap: 8px;
    white-space: nowrap;
  }

  .register-phone-numbers a {
    color: #ffffff;
    text-decoration: none;
  }

  .register-phone-numbers a:hover {
    text-decoration: underline;
  }

  /* Registration success */
  .registration-success-main {
    min-height: 0;

    display: grid;
    place-items: center;

    padding: clamp(24px, 5vh, 52px) 20px;
    background: transparent;
    overflow: hidden;
  }

  .registration-success-card {
    width: min(500px, 100%);
    position: relative;
    overflow: hidden;

    display: flex;
    flex-direction: column;
    align-items: center;

    padding: 58px 46px 46px;

    border: 1px solid rgba(255, 255, 255, 0.92);
    border-radius: 28px;
    background: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.97),
      rgba(235, 247, 252, 0.94)
    );
    box-shadow: 0 24px 60px rgba(4, 31, 45, 0.27);

    text-align: center;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);

    animation: registration-card-in 0.48s
      cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  .registration-success-card::before {
    content: "";
    position: absolute;
    top: 27px;
    left: 50%;

    width: 82px;
    height: 6px;

    border-radius: 999px;
    background: linear-gradient(90deg, #4ba9d6, #23627e);
    transform: translateX(-50%);
  }

  .registration-success-brand {
    display: flex;
    align-items: center;
    gap: 9px;

    color: #255065;
    font-size: 23px;
    font-weight: 800;
  }

  .registration-success-brand img {
    width: 31px;
    height: 37px;
    object-fit: contain;
  }

  .registration-success-icon {
    width: 112px;
    height: 112px;

    display: grid;
    place-items: center;

    margin: 34px 0 28px;

    color: #16a97c;
    background: #effcf7;
    border: 4px solid #20b989;
    border-radius: 50%;
    box-shadow: 0 10px 25px rgba(32, 185, 137, 0.16);

    animation: registration-check-in 0.58s 0.18s
      cubic-bezier(0.2, 1.35, 0.45, 1) both;
  }

  .registration-success-icon svg path {
    stroke-dasharray: 70;
    stroke-dashoffset: 70;
    animation: registration-check-draw 0.45s 0.55s ease-out forwards;
  }

  .registration-success-card h1 {
    margin: 0 0 14px;

    color: #183345;
    font-size: clamp(26px, 6vw, 34px);
    line-height: 1.2;
    letter-spacing: -0.5px;
  }

  .registration-success-card p {
    max-width: 390px;
    margin: 0;

    color: #4f6875;
    font-size: 15px;
    line-height: 1.7;
  }

  .registration-success-card .registration-success-note {
    margin-top: 8px;
    color: #71828b;
    font-size: 14px;
  }

  .registration-success-button {
    width: 100%;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    margin-top: 30px;
    padding: 14px 22px;

    color: #ffffff;
    background: linear-gradient(115deg, #237da4, #174e69);
    border-radius: 12px;
    box-shadow: 0 9px 20px rgba(37, 80, 101, 0.2);

    font-size: 15px;
    font-weight: 800;
    text-decoration: none;

    transition:
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .registration-success-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(37, 80, 101, 0.25);
  }

  @keyframes registration-card-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes registration-check-in {
    from {
      opacity: 0;
      transform: scale(0.55) rotate(-8deg);
    }

    to {
      opacity: 1;
      transform: scale(1) rotate(0);
    }
  }

  @keyframes registration-check-draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (max-width: 760px) {
    .register-page {
      grid-template-rows: 76px minmax(0, 1fr) 72px;
      background-position: 58% center;
    }

    .register-header {
      width: calc(100% - 20px);
      min-height: 66px;
      margin-top: 10px;
      padding: 0 16px;
      border-radius: 18px;
    }

    .register-brand {
      position: static;
      margin-right: auto;
      transform: none;
    }

    .register-logo {
      width: 42px;
      height: 42px;
      border-radius: 13px;
    }

    .register-logo img {
      width: 25px;
      height: 30px;
    }

    .register-brand-copy strong {
      font-size: 22px;
    }

    .register-brand-copy small {
      display: none;
    }

    .register-header-nav {
      gap: 7px;
    }

    .register-header-nav a {
      min-height: 38px;
      padding: 8px 11px;
      font-size: 13px;
    }

    .register-main,
    .registration-success-main {
      padding: 8px 14px;
    }

    .register-card {
      padding: 34px 16px 16px;
      border-radius: 20px;
    }

    .register-card::before,
    .registration-success-card::before {
      top: 14px;
      width: 62px;
      height: 4px;
    }

    .register-heading {
      margin-bottom: 8px;
    }

    .register-heading-icon {
      width: 40px;
      height: 40px;
      margin-bottom: 5px;
      border-radius: 13px;
    }

    .register-heading-icon svg {
      width: 22px;
      height: 22px;
    }

    .register-heading h1 {
      margin-bottom: 2px;
      font-size: 21px;
    }

    .register-heading p {
      font-size: 11px;
    }

    .register-form {
      gap: 8px 9px;
    }

    .register-field {
      gap: 3px;
      font-size: 11px;
    }

    .register-field input {
      min-height: 38px;
      padding: 6px 9px;
      font-size: 12px;
      border-radius: 9px;
    }

    .register-submit-button {
      min-height: 39px;
      padding: 7px 16px;
      font-size: 13px;
    }

    .register-form-links a {
      font-size: 11px;
    }

    .register-contact-bar {
      min-height: 72px;
      padding: 10px 16px;
      gap: 7px 18px;
      font-size: 12px;
    }

    .registration-success-card {
      padding: 50px 24px 30px;
      border-radius: 22px;
    }

    .registration-success-icon {
      width: 96px;
      height: 96px;
      margin: 28px 0 24px;
    }

    .registration-success-icon svg {
      width: 50px;
      height: 50px;
    }
  }

  @media (max-width: 520px) {
    .register-home-link {
      display: none !important;
    }

    .register-contact-bar {
      flex-direction: column;
      justify-content: center;
    }

    .register-contact-item {
      text-align: center;
    }

    .register-heading p {
      display: none;
    }
  }

  @media (max-height: 700px) and (min-width: 761px) {
    .register-page {
      grid-template-rows: 76px minmax(0, 1fr) 62px;
    }

    .register-header {
      min-height: 68px;
      margin-top: 8px;
    }

    .register-main,
    .registration-success-main {
      padding-top: 8px;
      padding-bottom: 8px;
    }

    .register-card {
      padding-top: 36px;
      padding-bottom: 16px;
    }

    .register-heading {
      margin-bottom: 9px;
    }

    .register-contact-bar {
      min-height: 62px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .registration-success-card,
    .registration-success-icon,
    .registration-success-icon svg path {
      animation: none;
    }

    .registration-success-icon svg path {
      stroke-dashoffset: 0;
    }

    .registration-success-button {
      transition: none;
    }
  }
`;

function RegisterHeader() {
  return (
    <header className="register-header">
      <Link className="register-brand" to="/" aria-label="PawCruz home">
        <span className="register-logo">
          <img src={pawLogo} alt="" aria-hidden="true" />
        </span>

        <span className="register-brand-copy">
          <strong>PawCruz</strong>
          <small>Cruz Veterinary Clinic</small>
        </span>
      </Link>

      <nav className="register-header-nav" aria-label="Account navigation">
        <Link className="register-home-link" to="/">
          Home
        </Link>

        <Link className="register-login-link" to="/login">
          Login
        </Link>
      </nav>
    </header>
  );
}

function RegisterFooter() {
  return (
    <footer className="register-contact-bar">
      <div className="register-contact-item">
        <MapPin size={21} aria-hidden="true" />

        <span>
          2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City
        </span>
      </div>

      <div className="register-contact-item register-phone-numbers">
        <Phone size={20} aria-hidden="true" />
        <a href="tel:0938537649">0938537649</a>
        <span aria-hidden="true">|</span>
        <a href="tel:0917165379">0917165379</a>
      </div>
    </footer>
  );
}

function RegistrationSuccess() {
  return (
    <>
      <style>{registerStyles}</style>

      <div
        className="register-page"
        style={{ backgroundImage: `url(${dogCatBackground})` }}
      >
        <RegisterHeader />

        <main
          className="registration-success-main"
          aria-labelledby="registration-success-title"
        >
          <section className="registration-success-card">
            <div className="registration-success-brand">
              <img src={pawLogo} alt="" aria-hidden="true" />
              <span>PawCruz</span>
            </div>

            <div className="registration-success-icon" aria-hidden="true">
              <Check size={58} strokeWidth={2.4} />
            </div>

            <div role="status" aria-live="polite">
              <h1 id="registration-success-title">
                Registration Successful!
              </h1>

              <p>
                Your Pet Owner account has been created successfully.
              </p>

              <p className="registration-success-note">
                You may now sign in to PawCruz using your registered
                username and password.
              </p>
            </div>

            <Link className="registration-success-button" to="/login">
              Go to Login
            </Link>
          </section>
        </main>

        <RegisterFooter />
      </div>
    </>
  );
}

export default function Register() {
  const [form, setForm] = useState({
    firstName: "",
    middleName: '',
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

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

  const registered = Boolean(location.state?.registered);

  function updateField(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));

    if (message) {
      setMessage("");
    }
  }

  async function submit(e) {
    e.preventDefault();
    setMessage("");

    if (form.password !== form.confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const completeName = [
        form.firstName.trim(),
        form.middleName.trim(),
        form.lastName.trim(),
      ]
        .filter(Boolean)
        .join(' ');

      const result = await registerPetOwner({
        ...form,
        fullName: completeName,
      });

      navigate("/otp?purpose=register", {
        state: {
          email: result.email,
        },
      });
    } catch (err) {
      setMessage(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return <RegistrationSuccess />;
  }

  return (
    <>
      <style>{registerStyles}</style>

      <div
        className="register-page"
        style={{ backgroundImage: `url(${dogCatBackground})` }}
      >
        <RegisterHeader />

        <main className="register-main">
          <section
            className="register-card"
            aria-labelledby="register-title"
          >
            <div className="register-heading">
              <div className="register-heading-icon" aria-hidden="true">
                <UserPlus size={30} strokeWidth={2.2} />
              </div>

              <h1 id="register-title">Create Pet Owner Account</h1>

              <p>
                Register to manage your pets, appointments, and clinic
                updates.
              </p>
            </div>

            <form className="register-form" onSubmit={submit} noValidate>
              <label className="register-field">
                <span>First Name</span>

                <input
                  type="text"
                  name="firstName"
                  placeholder="Enter your first name"
                  autoComplete="given-name"
                  required
                  value={form.firstName}
                  onChange={(e) =>
                    updateField("firstName", e.target.value)
                  }
                />
              </label>

              <label className="register-field">
                <span>Last Name</span>

                <input
                  type="text"
                  name="lastName"
                  placeholder="Enter your last name"
                  autoComplete="family-name"
                  required
                  value={form.lastName}
                  onChange={(e) =>
                    updateField("lastName", e.target.value)
                  }
                />
              </label>

              <label className='register-field'>
                <span>
                  Middle Name <small>(Optional)</small>
                </span>

                <input
                  type='text'
                  name='middleName'
                  placeholder='Enter your middle name'
                  autoComplete='additional-name'
                  value={form.middleName}
                  onChange={(e) =>
                    updateField('middleName', e.target.value)
                  }
                />
              </label>

              <label className="register-field">
                <span>Username</span>

                <input
                  type="text"
                  name="username"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  value={form.username}
                  onChange={(e) =>
                    updateField("username", e.target.value)
                  }
                />
              </label>

              <label className="register-field">
                <span>Email Address</span>

                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email address"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    updateField("email", e.target.value)
                  }
                />
              </label>

              <label className="register-field">
                <span>Password</span>

                <PasswordInput
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={form.password}
                  onChange={(e) =>
                    updateField("password", e.target.value)
                  }
                />
              </label>

              <label className="register-field">
                <span>Confirm Password</span>

                <PasswordInput
                  name="confirmPassword"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={form.confirm}
                  onChange={(e) =>
                    updateField("confirm", e.target.value)
                  }
                />
              </label>

              {message && (
                <div
                  className="register-error"
                  role="alert"
                  aria-live="assertive"
                >
                  {message}
                </div>
              )}

              <button
                className="register-submit-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>

              <div className="register-form-links">
                <Link to="/login">
                  Already registered? Sign in
                </Link>
              </div>
            </form>
          </section>
        </main>

        <RegisterFooter />
      </div>
    </>
  );
}
