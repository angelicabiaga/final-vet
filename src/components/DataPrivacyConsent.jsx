import React, { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  // Lock page scroll while open and close on Escape.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portal to <body> so the parent form's transforms/styles can't clip or
  // restyle the dialog.
  return createPortal(
    <div className="pcModalBackdrop" onClick={onClose}>
      <div
        className="pcModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcModalTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pcModalHeader">
          <h2 id="pcModalTitle" className="pcModalTitle">PawCruz Privacy Notice</h2>
          <button type="button" className="pcModalClose" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="pcModalBody">
          {PRIVACY_NOTICE_SECTIONS.map((section) => (
            <section key={section.heading} className="pcModalSection">
              <h3 className="pcModalHeading">{section.heading}</h3>
              <p className="pcModalText">{section.body}</p>
            </section>
          ))}
        </div>
        <div className="pcModalFooter">
          <button type="button" className="pcModalCloseBtn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
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
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px 16px;
          background: rgba(24, 50, 63, 0.62);
          backdrop-filter: blur(4px);
        }

        .pcModal {
          display: flex;
          flex-direction: column;
          width: min(600px, 100%);
          max-height: min(85vh, 760px);
          max-height: min(85dvh, 760px);
          overflow: hidden;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 24px 60px rgba(4, 31, 45, 0.3);
          text-align: left;
        }

        .pcModalHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
          padding: 20px 24px 14px;
          border-bottom: 1px solid #e6eff3;
        }

        .pcModal .pcModalTitle {
          margin: 0;
          color: #183747;
          font-size: 20px;
          font-weight: 800;
          line-height: 1.3;
        }

        .pcModalBody {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 24px 8px;
        }

        .pcModal .pcModalSection {
          margin: 0 0 16px;
        }

        .pcModal .pcModalHeading {
          margin: 0 0 6px;
          color: #237da4;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
        }

        .pcModal .pcModalText {
          margin: 0;
          color: #445b66;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.6;
        }

        .pcModalClose {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          padding: 0;
          border: 0;
          border-radius: 9px;
          background: #edf5f8;
          color: #456472;
          cursor: pointer;
        }

        .pcModalClose:hover {
          background: #dcebf1;
        }

        .pcModalFooter {
          flex-shrink: 0;
          padding: 12px 24px 20px;
          border-top: 1px solid #e6eff3;
        }

        .pcModalCloseBtn {
          width: 100%;
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

          .pcModalHeader,
          .pcModalBody,
          .pcModalFooter {
            padding-left: 18px;
            padding-right: 18px;
          }

          .pcModal .pcModalTitle {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
});

export default DataPrivacyConsent;
