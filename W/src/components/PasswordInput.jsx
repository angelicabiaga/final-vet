import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ value, onChange, placeholder, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input type={visible ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} {...props} />
      <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)} aria-label={visible ? "Hide password" : "Show password"}>
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
      <style>{`.password-field{position:relative}.password-field input{width:100%;padding-right:45px}.password-toggle{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;padding:0!important;border:0!important;background:transparent!important;color:#607985!important;display:grid;place-items:center;border-radius:8px!important}.password-toggle:hover{background:#e9f7fc!important;color:#318fbe!important}`}</style>
    </div>
  );
}