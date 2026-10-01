import { useCallback, useRef, useState } from "react";

// Shared state for one PrintPreviewModal instance. showPdf tracks the blob
// URL it was given so it can revoke it on close (PDFs only -- HTML previews
// have nothing to revoke).
// `options.onDownload` shows a Download button in the modal that saves the
// same document being previewed; `options.showPrint` (default true) can be
// set to false to hide the Print button for download-only flows.
export default function usePrintPreview() {
  const [preview, setPreview] = useState(null);
  const blobUrlRef = useRef(null);

  const showPdf = useCallback((url, title, options = {}) => {
    blobUrlRef.current = url;
    setPreview({ src: url, title, onDownload: options.onDownload, showPrint: options.showPrint !== false });
  }, []);

  const showHtml = useCallback((html, title, options = {}) => {
    blobUrlRef.current = null;
    setPreview({ html, title, onDownload: options.onDownload, showPrint: options.showPrint !== false });
  }, []);

  const close = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPreview(null);
  }, []);

  return { preview, showPdf, showHtml, close };
}
