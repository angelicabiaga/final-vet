import React, { useState } from "react";
import { ArrowLeft, ArrowRight, UserRound, UserRoundX } from "lucide-react";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";

export default function WalkInRegistration({ profile }) {
  const [mode, setMode] = useState(null); // null | "guest" | "owner"

  return (
    <AppShell profile={profile} title="Create Appointment / Walk-In">
      {!mode && <ModeSelect onSelect={setMode} />}

      {mode && (
        <div className="walkin-flow">
          <button type="button" className="walkin-back" onClick={() => setMode(null)}>
            <ArrowLeft size={16} /> Back to options
          </button>
          <AppointmentForm profile={profile} mode="staff" guestOwner={mode === "guest"} />
        </div>
      )}

      <style>{styles}</style>
    </AppShell>
  );
}

function ModeSelect({ onSelect }) {
  return (
    <div className="walkin-select">
      <div className="walkin-select-intro">
        <h2>How is this appointment being created?</h2>
        <p>Choose whether this is a guest with no account, or an existing pet owner.</p>
      </div>
      <div className="walkin-select-grid">
        <button type="button" className="walkin-option-card" onClick={() => onSelect("guest")}>
          <span className="walkin-option-icon guest"><UserRoundX size={26} /></span>
          <h3>Guest <span>(No Account)</span></h3>
          <p>Register a walk-in visitor who doesn&apos;t have a pet owner account yet.</p>
          <span className="walkin-option-go">Continue <ArrowRight size={16} /></span>
        </button>

        <button type="button" className="walkin-option-card" onClick={() => onSelect("owner")}>
          <span className="walkin-option-icon owner"><UserRound size={26} /></span>
          <h3>Pet Owner</h3>
          <p>Create the appointment for an existing, registered pet owner and their pet.</p>
          <span className="walkin-option-go">Continue <ArrowRight size={16} /></span>
        </button>
      </div>
    </div>
  );
}

const styles = `
.walkin-select{max-width:900px}
.walkin-select-intro{margin-bottom:22px}
.walkin-select-intro h2{margin:0 0 6px;color:#20313B;font-size:22px}
.walkin-select-intro p{margin:0;color:#6F7F88}
.walkin-select-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.walkin-option-card{text-align:left;cursor:pointer;background:#fff;border:1px solid #e3eef3;border-radius:20px;padding:26px;box-shadow:0 10px 30px rgba(55,126,158,.08);display:grid;gap:10px;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.walkin-option-card:hover{transform:translateY(-3px);border-color:#a9dff0;box-shadow:0 16px 34px rgba(55,126,158,.16)}
.walkin-option-card:focus-visible{outline:3px solid rgba(77,168,218,.35);outline-offset:2px}
.walkin-option-icon{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;color:#fff}
.walkin-option-icon.guest{background:linear-gradient(145deg,#8aa6b3,#5f7c8a)}
.walkin-option-icon.owner{background:linear-gradient(145deg,#42a6cc,#69c4d9)}
.walkin-option-card h3{margin:0;color:#20313B;font-size:18px}
.walkin-option-card h3 span{color:#8496a0;font-weight:600;font-size:14px}
.walkin-option-card p{margin:0;color:#6F7F88;font-size:14px;line-height:1.5}
.walkin-option-go{margin-top:4px;display:inline-flex;align-items:center;gap:6px;color:#318fbe;font-weight:800;font-size:14px}
.walkin-back{display:inline-flex;align-items:center;gap:7px;margin-bottom:16px;border:0;background:none;padding:0;color:#318fbe;font-weight:700;font-size:14px;cursor:pointer}
.walkin-back:hover{text-decoration:underline}
@media(max-width:640px){.walkin-select-grid{grid-template-columns:1fr}}
`;
