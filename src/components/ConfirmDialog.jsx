import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * PawCruz-styled replacement for window.confirm(). Visual language matches
 * the logout confirmation dialog in AppShell (blurred dim backdrop, rounded
 * card, icon badge, title/description, two-button footer).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Yes, Continue",
  cancelLabel = "Cancel",
  tone = "danger",
  icon,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const Icon = icon || AlertTriangle;

  return (
    <div
      className="pcConfirmOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <section
        className={`pcConfirmDialog ${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pc-confirm-title"
        aria-describedby="pc-confirm-description"
      >
        <span className="pcConfirmIcon" aria-hidden="true">
          <Icon size={28} strokeWidth={2.1} />
        </span>

        <h2 id="pc-confirm-title">{title}</h2>

        {description && <p id="pc-confirm-description">{description}</p>}

        <div className="pcConfirmActions">
          <button
            type="button"
            className="pcConfirmCancel"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className="pcConfirmAccept"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>

      <style>{`
        .pcConfirmOverlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(11, 35, 49, 0.58);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        .pcConfirmDialog {
          width: min(430px, 100%);
          padding: 30px;
          color: #18394c;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.98),
            rgba(235, 247, 252, 0.97)
          );
          border: 1px solid rgba(255, 255, 255, 0.92);
          border-radius: 24px;
          box-shadow: 0 24px 70px rgba(4, 31, 45, 0.34);
          text-align: center;
        }

        .pcConfirmIcon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          margin: 0 auto 17px;
          color: #237da4;
          background: #e1f3fa;
          border: 1px solid #bfe3f1;
          border-radius: 19px;
        }

        .pcConfirmDialog.danger .pcConfirmIcon {
          color: #c1454c;
          background: #fdeceb;
          border-color: #f7d3d1;
        }

        .pcConfirmDialog h2 {
          margin: 0;
          color: #17394b;
          font-size: 22px;
          line-height: 1.25;
        }

        .pcConfirmDialog p {
          margin: 10px auto 0;
          color: #637f8e;
          font-size: 14px;
          line-height: 1.55;
        }

        .pcConfirmActions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 24px;
        }

        .pcConfirmActions button {
          border: 0;
          border-radius: 12px;
          padding: 13px;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }

        .pcConfirmCancel {
          background: #eaf3f7;
          color: #2c5468;
        }

        .pcConfirmCancel:hover {
          background: #dcebf1;
        }

        .pcConfirmAccept {
          background: #318fbe;
          color: #fff;
        }

        .pcConfirmAccept:hover {
          background: #256f92;
        }

        .pcConfirmDialog.danger .pcConfirmAccept {
          background: #d9524b;
        }

        .pcConfirmDialog.danger .pcConfirmAccept:hover {
          background: #bb3e38;
        }

        .pcConfirmActions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 480px) {
          .pcConfirmActions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
