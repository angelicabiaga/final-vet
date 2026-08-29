import React, { forwardRef, useState } from "react";
import { X } from "lucide-react";
import {
  CONSENT_CHECKBOX_LINK_TEXT,
  CONSENT_CHECKBOX_PREFIX,
  CONSENT_CHECKBOX_SUFFIX,
  MARKETING_CONSENT_TEXT,
  PRIVACY_NOTICE_SECTIONS,
} from "../constants/privacyNotice";

// Scrolls to and focuses the consent container -- used when a form's
// submit is blocked because the required consent checkbox isn't checked.
// Exported so every form embedding <DataPrivacyConsent> can reuse it
// instead of re-deriving the same scroll/focus timing.
export function focusConsentBlock(ref) {
  const el = ref?.current;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => el.focus({ preventScroll: true }), 300);
}

function PrivacyNoticeModal({ onClose }) {
  return (
    <div className="pcModalBackdrop" onClick={onClose}>
      <div
        className="pcModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcModalTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="pcModalClose" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2 id="pcModalTitle">PawCruz Privacy Notice</h2>
        <div className="pcModalBody">
          {PRIVACY_NOTICE_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <button type="button" className="pcModalCloseBtn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Compact Data Privacy Consent block for new Pet Owner account creation
 * only (self-registration or staff walk-in registration). Not a card --
 * a required checkbox with an inline link to the full notice, plus a
 * separate optional marketing checkbox. `error`, when set, draws a red
 * border around the container and an inline message directly below the
 * required checkbox; `ref` lets the parent form scroll to and focus this
 * container when validation fails.
 */
const DataPrivacyConsent = forwardRef(function DataPrivacyConsent(
  { serviceConsent, onServiceConsentChange, marketingConsent, onMarketingConsentChange, error },
  ref
) {
  const [noticeOpen, setNoticeOpen] = useState(false);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`pcConsentBlock${error ? " pcConsentBlock--error" : ""}`}
    >
      <label className="pcConsentRow">
        <input
          type="checkbox"
          checked={serviceConsent}
          onChange={(event) => onServiceConsentChange(event.target.checked)}
        />
        <span>
          {CONSENT_CHECKBOX_PREFIX}
          <button type="button" className="pcConsentLink" onClick={() => setNoticeOpen(true)}>
            {CONSENT_CHECKBOX_LINK_TEXT}
          </button>
          {CONSENT_CHECKBOX_SUFFIX}
          <span className="pcRequiredMark"> *</span>
        </span>
      </label>

      {error && (
        <p className="pcConsentError" role="alert">
          {error}
        </p>
      )}

      <label className="pcConsentRow pcConsentRow--marketing">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(event) => onMarketingConsentChange(event.target.checked)}
        />
        <span>{MARKETING_CONSENT_TEXT}</span>
      </label>

      {noticeOpen && <PrivacyNoticeModal onClose={() => setNoticeOpen(false)} />}

      <style>{`
        .pcConsentBlock {
          display: grid;
          gap: 10px;
          padding: 6px;
          border: 2px solid transparent;
          border-radius: 10px;
        }

        .pcConsentBlock--error {
          border-color: #d9534f;
        }

        .pcConsentRow {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-weight: 400;
          text-transform: none;
          letter-spacing: normal;
          cursor: pointer;
        }

        .pcConsentRow input[type="checkbox"] {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          margin-top: 2px;
          accent-color: #4da8da;
          cursor: pointer;
        }

        .pcConsentRow > span {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
          color: #2c4553;
          font-size: 13.5px;
          font-weight: 500;
          line-height: 1.5;
        }

        .pcConsentLink {
          display: inline;
          padding: 0;
          border: 0;
          background: none;
          color: #237da4;
          font: inherit;
          font-weight: 700;
          text-decoration: underline;
          cursor: pointer;
        }

        .pcRequiredMark {
          color: #d9534f;
          font-weight: 700;
        }

        .pcConsentError {
          margin: 0;
          padding-left: 28px;
          color: #a51d2d;
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1.4;
        }

        .pcModalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 300;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(24, 50, 63, 0.62);
          backdrop-filter: blur(4px);
        }

        .pcModal {
          position: relative;
          width: min(600px, 100%);
          max-height: 84vh;
          overflow-y: auto;
          border-radius: 20px;
          padding: 30px 28px 26px;
          background: #fff;
          box-shadow: 0 24px 60px rgba(4, 31, 45, 0.3);
        }

        .pcModal h2 {
          margin: 0 0 16px;
          padding-right: 30px;
          color: #183747;
          font-size: 21px;
        }

        .pcModalBody section {
          margin-bottom: 16px;
        }

        .pcModalBody h3 {
          margin: 0 0 6px;
          color: #237da4;
          font-size: 14px;
        }

        .pcModalBody p {
          margin: 0;
          color: #445b66;
          font-size: 13.5px;
          line-height: 1.6;
        }

        .pcModalClose {
          position: absolute;
          top: 14px;
          right: 14px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 9px;
          padding: 7px;
          background: #edf5f8;
          color: #456472;
          cursor: pointer;
        }

        .pcModalCloseBtn {
          width: 100%;
          margin-top: 6px;
          padding: 11px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(115deg, #237da4, #174e69);
          color: #fff;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }

        @media (max-width: 520px) {
          .pcConsentRow > span {
            font-size: 12.5px;
          }
        }
      `}</style>
    </div>
  );
});

export default DataPrivacyConsent;
