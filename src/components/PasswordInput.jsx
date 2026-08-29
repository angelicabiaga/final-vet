import React, { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const PasswordInput = forwardRef(function PasswordInput({ value, onChange, placeholder, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input ref={ref} type={visible ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} {...props} />
      <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)} aria-label={visible ? "Hide password" : "Show password"}>
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
      <style>{`.password-field{position:relative}.password-field input{width:100%;padding-right:45px}.password-toggle{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;padding:0!important;border:0!important;background:transparent!important;color:#607985!important;display:grid;place-items:center;border-radius:8px!important}.password-toggle:hover{background:#e9f7fc!important;color:#318fbe!important}`}</style>
      <style>{`
        .password-toggle,
        .password-toggle:hover,
        .password-toggle:focus,
        .password-toggle:focus-visible,
        .password-toggle:active {
          color: #607985 !important;
          background: transparent !important;
          box-shadow: none !important;
          transform: translateY(-50%) !important;
          transition: none !important;
          animation: none !important;
        }

        .password-toggle svg,
        .password-toggle:hover svg,
        .password-toggle:focus svg,
        .password-toggle:active svg {
          transform: none !important;
          transition: none !important;
          animation: none !important;
        }
      `}</style>
    </div>
  );
});

export default PasswordInput;
