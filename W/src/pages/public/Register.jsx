import React, { useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import pawLogo from "../../assets/reference/paw.png";
import PasswordInput from "../../components/PasswordInput";
import { registerPetOwner } from "../../services/authService";
import { AuthLayout } from "./Login";
import "./Register.css";

function RegistrationSuccess() {
  return (
    <div className="registration-success-page">
      <main
        className="registration-success-card"
        aria-labelledby="registration-success-title"
      >
        <div className="registration-success-brand">
          <img src={pawLogo} alt="" aria-hidden="true" />
          <span>PawCruz</span>
        </div>

        <div className="registration-success-icon" aria-hidden="true">
          <Check size={58} strokeWidth={2.4} />
        </div>

        <div role="status" aria-live="polite">
          <h1 id="registration-success-title">Registration Successful!</h1>
          <p>Your Pet Owner account has been created successfully.</p>
          <p className="registration-success-note">
            You may now sign in to PawCruz using your registered username and password.
          </p>
        </div>

        <Link className="registration-success-button" to="/login">
          Go to Login
        </Link>
      </main>
    </div>
  );
}

export default function Register() {
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMessage("");

    if (form.password !== form.confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await registerPetOwner(form);
      setRegistered(true);
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
    <AuthLayout
      title="Create pet-owner account"
      subtitle="Register to manage your pets and appointments."
    >
      <form onSubmit={submit}>
        <label>
          Full Name
          <input
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </label>
        <label>
          Username
          <input
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <PasswordInput
            minLength="6"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          Confirm Password
          <PasswordInput
            minLength="6"
            required
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
        {message && (
          <div className="error" role="alert">
            {message}
          </div>
        )}
        <button disabled={loading}>{loading ? "Creating..." : "Create Account"}</button>
        <div className="links">
          <span />
          <Link to="/login">Already registered?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
