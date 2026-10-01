import React, { useEffect, useRef } from "react";
import { Download, Printer, X } from "lucide-react";

// One shared Print/Download Preview experience for every printable or
// downloadable document in the app (medical records, invoices/receipts,
// prescription pads, reports) -- nothing prints or downloads until the user
// reviews it here first. `src` shows a generated PDF (blob URL) in the
// browser's own PDF viewer; `html` renders a full standalone HTML document
// (e.g. a receipt or report) inside the iframe instead. Only one of the two
// is ever passed at a time.
// `onDownload`, when passed, shows a Download button that saves the exact
// same document being previewed. `showPrint` (default true) controls
// whether the Print button appears -- pass false for download-only flows;
// leave both onDownload and showPrint set to support a document that offers
// either action.
export default function PrintPreviewModal({ open, title = "Print Preview", src, html, onClose, onDownload, showPrint = true }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  return (
    <div className="print-preview-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="print-preview-panel">
        <div className="print-preview-header">
          <span className="print-preview-title">{title}</span>
          <button type="button" className="print-preview-close" onClick={onClose} aria-label="Close preview">
            <X size={18} />
          </button>
        </div>

        <div className="print-preview-body">
          <iframe
            ref={iframeRef}
            title={title}
            className="print-preview-frame"
            {...(src ? { src } : { srcDoc: html || "" })}
          />
        </div>

        <div className="print-preview-footer">
          <button type="button" className="print-preview-cancel" onClick={onClose}>
            Cancel
          </button>
          {onDownload && (
            <button type="button" className="print-preview-download" onClick={onDownload}>
              <Download size={16} /> Download
            </button>
          )}
          {showPrint && (
            <button type="button" className="print-preview-print" onClick={handlePrint}>
              <Printer size={16} /> Print
            </button>
          )}
        </div>
      </div>

      <style>{`
        .print-preview-overlay{position:fixed;inset:0;background:rgba(15,30,40,.55);display:flex;align-items:center;justify-content:center;z-index:3000;padding:24px}
        .print-preview-panel{width:min(900px,100%);height:min(90vh,1050px);background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(4,31,45,.35)}
        .print-preview-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e3edf1;background:#f7fbfd;flex:0 0 auto}
        .print-preview-title{font-weight:800;font-size:15px;color:#1c3a4a}
        .print-preview-close{border:0;background:transparent;color:#5c7382;cursor:pointer;padding:6px;border-radius:8px;display:flex}
        .print-preview-close:hover{background:#e9f2f5}
        .print-preview-body{flex:1;min-height:0;background:#e8eef1;padding:12px}
        .print-preview-frame{width:100%;height:100%;border:0;border-radius:8px;background:#fff}
        .print-preview-footer{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid #e3edf1;background:#fff;flex:0 0 auto}
        .print-preview-cancel{padding:10px 18px;border-radius:10px;border:1px solid #d7e2e7;background:#fff;color:#42576e;font-weight:700;cursor:pointer;font-size:13.5px}
        .print-preview-cancel:hover{background:#f2f6f8}
        .print-preview-download,.print-preview-print{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:10px;border:0;color:#fff;font-weight:800;cursor:pointer;font-size:13.5px}
        .print-preview-download{background:linear-gradient(115deg,#2f9e63,#1f6d47)}
        .print-preview-print{background:linear-gradient(115deg,#237da4,#174e69)}
        .print-preview-download:hover,.print-preview-print:hover{opacity:.92}
        @media (max-width:640px){.print-preview-panel{height:95vh;border-radius:10px}.print-preview-overlay{padding:10px}}
      `}</style>
    </div>
  );
}
