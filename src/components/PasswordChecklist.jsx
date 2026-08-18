import React from "react";
import { Check, X } from "lucide-react";
import { getPasswordRuleStatus } from "../utils/validators";

export default function PasswordChecklist({ password }) {
  const rules = getPasswordRuleStatus(password);

  return (
    <ul className="password-checklist">
      {rules.map((rule) => (
        <li key={rule.key} className={rule.met ? "met" : ""}>
          {rule.met ? <Check size={13} /> : <X size={13} />}
          {rule.label}
        </li>
      ))}
      <style>{`
        .password-checklist{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:5px}
        .password-checklist li{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#94a3ac;transition:color .15s ease}
        .password-checklist li svg{flex-shrink:0}
        .password-checklist li.met{color:#2f8f5b}
      `}</style>
    </ul>
  );
}
