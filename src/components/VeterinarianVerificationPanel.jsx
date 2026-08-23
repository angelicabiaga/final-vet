import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  IdCard,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  getSignedVerificationUrls,
  getVerificationRecord,
  reviewVerification,
  submitVerification,
  uploadVerificationImage,
} from "../services/veterinarianVerificationService";
import { extractPrcIdText, parsePrcFields } from "../services/prcOcrService";

const STATUS_META = {
  Unverified: { label: "Unverified", tone: "muted", icon: AlertTriangle },
  "Pending Review": { label: "Pending Review", tone: "pending", icon: Clock3 },
  Verified: { label: "Verified", tone: "verified", icon: ShieldCheck },
  Rejected: { label: "Rejected", tone: "rejected", icon: XCircle },
  "Needs Resubmission": { label: "Needs Resubmission", tone: "pending", icon: RefreshCw },
};

export function VerificationStatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.Unverified;
  const Icon = meta.icon;
  return (
    <span className={`vvp-badge vvp-badge-${meta.tone}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

// Verification review + submission. Everyone who can see a veterinarian's
// full profile sees the status badge; only an Administrator can see the
// documents and record a decision; only the veterinarian themselves can
// submit or resubmit. The license number, name, and profession are never
// typed by anyone -- they come only from OCR run on the uploaded PRC ID,
// right here in the browser. There is no automated liveness or
// face-matching step, and no automated pass/fail on the OCR reading
// either -- every submission is a plain "Pending Review" until an
// administrator makes the call by eye, and they can only accept or ask
// for a clearer resubmission, never hand-edit what was read.
export default function VeterinarianVerificationPanel({ vetId, vetProfile, viewerProfile }) {
  const isSelf = viewerProfile?.id === vetId;
  const isAdmin = viewerProfile?.role === "admin";

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [correctedFields, setCorrectedFields] = useState(null);
  const [consent, setConsent] = useState(false);
  const [consentGivenAt, setConsentGivenAt] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [faceScanPreview, setFaceScanPreview] = useState("");
  const [faceScanFile, setFaceScanFile] = useState(null);
  const [uploading, setUploading] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [reviewUrls, setReviewUrls] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const result = await getVerificationRecord(vetId);
      setRecord(result);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (vetId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vetId]);

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  async function pickIdFront(event) {
    const file = event.target.files?.[0] || null;
    setIdFrontFile(file);
    setOcrResult(null);
    setCorrectedFields(null);
    setMessage({ type: "", text: "" });
    if (!file) return;

    setOcrRunning(true);
    try {
      const { text, confidence } = await extractPrcIdText(file);
      const parsed = parsePrcFields(text);
      setOcrResult({ ...parsed, confidence });
      setCorrectedFields({
        nameCandidate: parsed.nameCandidate,
        profession: parsed.profession,
        registrationDate: parsed.registrationDate,
        expirationDate: parsed.expirationDate,
      });
    } catch (error) {
      setMessage({ type: "error", text: "Unable to read this ID photo. Try a clearer, well-lit photo." });
    } finally {
      setOcrRunning(false);
    }
  }

  function correctField(name, value) {
    setCorrectedFields((current) => ({ ...current, [name]: value }));
  }

  async function startCamera() {
    setMessage({ type: "", text: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (error) {
      setMessage({ type: "error", text: "Unable to access the camera. Check your browser's camera permission." });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `face-scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFaceScanFile(file);
      setFaceScanPreview(URL.createObjectURL(blob));
      stopCamera();
    }, "image/jpeg", 0.9);
  }

  function retakePhoto() {
    if (faceScanPreview) URL.revokeObjectURL(faceScanPreview);
    setFaceScanPreview("");
    setFaceScanFile(null);
  }

  async function submit(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    if (!idFrontFile || !idBackFile) return setMessage({ type: "error", text: "Upload both the front and back of your PRC ID." });
    if (ocrRunning) return setMessage({ type: "error", text: "Still reading your ID -- please wait a moment." });
    if (!ocrResult?.licenseNumber) return setMessage({ type: "error", text: "A license number could not be read from the front photo. Upload a clearer photo -- it cannot be typed in manually." });
    if (!consent || !consentGivenAt) return setMessage({ type: "error", text: "Face-scan consent is required before submitting." });
    if (!faceScanFile) return setMessage({ type: "error", text: "Capture a live face scan before submitting." });

    setSubmitting(true);
    try {
      setUploading("id-front");
      const idFrontPath = await uploadVerificationImage(vetId, idFrontFile, "id-front");
      setUploading("id-back");
      const idBackPath = await uploadVerificationImage(vetId, idBackFile, "id-back");
      setUploading("face-scan");
      const faceScanPath = await uploadVerificationImage(vetId, faceScanFile, "face-scan");
      setUploading("");

      const updated = await submitVerification(vetId, vetProfile, {
        idFrontPath,
        idBackPath,
        faceScanPath,
        consentGivenAt,
        ocrConfidence: ocrResult.confidence,
        extracted: {
          licenseNumber: ocrResult.licenseNumber,
          rawText: ocrResult.rawText,
          ...correctedFields,
        },
      });
      setRecord(updated);
      setIdFrontFile(null);
      setIdBackFile(null);
      setOcrResult(null);
      setCorrectedFields(null);
      setConsent(false);
      setConsentGivenAt("");
      retakePhoto();
      setMessage({ type: "success", text: "Submitted for review. An administrator will confirm your verification." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading("");
      setSubmitting(false);
    }
  }

  async function loadReviewDocuments() {
    setReviewLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const urls = await getSignedVerificationUrls(record, viewerProfile);
      setReviewUrls(urls);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setReviewLoading(false);
    }
  }

  async function decide(decision) {
    setMessage({ type: "", text: "" });
    if (decision !== "Verified" && !decisionReason.trim()) {
      return setMessage({ type: "error", text: "Enter a reason before rejecting or requesting resubmission." });
    }
    setDeciding(decision);
    try {
      const updated = await reviewVerification(vetId, { decision, reason: decisionReason }, viewerProfile);
      setRecord(updated);
      setReviewUrls(null);
      setDecisionReason("");
      setMessage({ type: "success", text: `Verification set to ${decision}.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setDeciding("");
    }
  }

  if (loading) return <div className="vvp vvp-loading">Loading verification status...</div>;
  if (!record) return null;

  const status = record.status || "Unverified";
  const canSubmit = isSelf && ["Unverified", "Rejected", "Needs Resubmission"].includes(status);

  return (
    <section className="vvp-card">
      <h3><IdCard size={18} /> Verification Status <VerificationStatusBadge status={status} /></h3>

      {message.text && <div className={`vvp-notice ${message.type}`}>{message.text}</div>}

      {(status === "Rejected" || status === "Needs Resubmission") && record.rejection_reason && (
        <div className="vvp-notice warn">Administrator note: {record.rejection_reason}</div>
      )}

      {isSelf && status === "Pending Review" && (
        <p className="vvp-muted">Your PRC ID and face scan are submitted and awaiting administrator review.</p>
      )}

      {isSelf && status === "Verified" && (
        <p className="vvp-muted vvp-verified-text"><CheckCircle2 size={14} /> Your veterinarian account is verified.</p>
      )}

      {canSubmit && (
        <form onSubmit={submit} className="vvp-form">
          <p className="vvp-instructions">
            Upload clear photos of the front and back of your PRC Professional Identification Card, then complete a
            live face scan. Your details are read automatically from the front photo -- if a personal detail was
            misread you can correct it below, but the license number can never be typed or edited by anyone.
          </p>

          <div className="vvp-pair">
            <label>PRC ID (Front)<input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={pickIdFront} />{idFrontFile && <span className="vvp-file-name">{idFrontFile.name}</span>}</label>
            <label>PRC ID (Back)<input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={(e) => setIdBackFile(e.target.files?.[0] || null)} />{idBackFile && <span className="vvp-file-name">{idBackFile.name}</span>}</label>
          </div>

          {ocrRunning && <p className="vvp-ocr-status"><ScanLine size={14} className="vvp-scan-spin" /> Reading your ID...</p>}

          {!ocrRunning && ocrResult && correctedFields && (
            <div className="vvp-ocr-result">
              <span className="vvp-label"><ScanLine size={12} /> Extracted from your ID</span>

              <label>Veterinary License Number (read-only, cannot be edited)
                <input value={ocrResult.licenseNumber || "Unable to Detect"} readOnly disabled />
              </label>
              {!ocrResult.licenseNumber && (
                <p className="vvp-ocr-warn">No license number could be read. Upload a clearer, well-lit, non-glare photo of the front of the card -- this field can't be typed in.</p>
              )}

              <p className="vvp-ocr-correct-hint">You may correct the fields below if any were misread:</p>
              <div className="vvp-pair">
                <label>Full Name<span className="required-mark"> *</span>
                  <input value={correctedFields.nameCandidate} onChange={(e) => correctField("nameCandidate", e.target.value)} placeholder="Unable to Detect" required />
                </label>
                <label>Profession<span className="required-mark"> *</span>
                  <input value={correctedFields.profession} onChange={(e) => correctField("profession", e.target.value)} placeholder="Unable to Detect" required />
                </label>
              </div>
              <div className="vvp-pair">
                <label>Registration Date<span className="required-mark"> *</span>
                  <input type="date" value={correctedFields.registrationDate} onChange={(e) => correctField("registrationDate", e.target.value)} required />
                  {!correctedFields.registrationDate && <span className="vvp-fieldError">Unable to Detect -- enter it manually</span>}
                </label>
                <label>Expiration Date<span className="required-mark"> *</span>
                  <input type="date" value={correctedFields.expirationDate} onChange={(e) => correctField("expirationDate", e.target.value)} required />
                  {!correctedFields.expirationDate && <span className="vvp-fieldError">Unable to Detect -- enter it manually</span>}
                </label>
              </div>
            </div>
          )}

          <div className="vvp-consent">
            <label className="vvp-consent-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setConsentGivenAt(e.target.checked ? new Date().toISOString() : "");
                }}
              />
              I consent to a live camera capture of my face, used only to support identity verification of my
              veterinarian account. This is not an uploaded photo -- it must be captured live.
            </label>
          </div>

          <div className="vvp-face-scan">
            {faceScanPreview ? (
              <div className="vvp-face-result">
                <img src={faceScanPreview} alt="Captured face scan" />
                <button type="button" onClick={retakePhoto}>Retake</button>
              </div>
            ) : cameraActive ? (
              <div className="vvp-face-camera">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="vvp-face-camera-actions">
                  <button type="button" onClick={capturePhoto}><Camera size={15} /> Capture</button>
                  <button type="button" className="ghost" onClick={stopCamera}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="vvp-start-camera" onClick={startCamera} disabled={!consent}>
                <Camera size={16} /> Start Live Face Scan
              </button>
            )}
          </div>

          <button className="vvp-submit-btn" disabled={submitting}>
            <UploadCloud size={16} />
            {submitting ? (uploading ? `Uploading ${uploading.replace("-", " ")}...` : "Submitting...") : "Submit for Verification"}
          </button>
        </form>
      )}

      {isAdmin && (
        <div className="vvp-review">
          {!reviewUrls ? (
            (record.id_front_path || record.face_scan_path) && (
              <button type="button" className="vvp-load-docs" onClick={loadReviewDocuments} disabled={reviewLoading}>
                {reviewLoading ? "Loading documents..." : "Load Submitted Documents"}
              </button>
            )
          ) : (
            <>
              <div className="vvp-doc-grid">
                {reviewUrls.idFront && <div><span className="vvp-label">PRC ID - Front</span><img src={reviewUrls.idFront} alt="PRC ID front" /></div>}
                {reviewUrls.idBack && <div><span className="vvp-label">PRC ID - Back</span><img src={reviewUrls.idBack} alt="PRC ID back" /></div>}
                {reviewUrls.faceScan && <div><span className="vvp-label">Live Face Scan</span><img src={reviewUrls.faceScan} alt="Live face scan" /></div>}
              </div>
              <dl className="vvp-prc-details">
                <div><dt>Name (veterinarian-confirmed)</dt><dd>{record.prc_name_on_card || "—"}</dd></div>
                <div><dt>Profession (veterinarian-confirmed)</dt><dd>{record.prc_profession || "—"}</dd></div>
                <div><dt>License Number (read-only, from ID)</dt><dd>{record.prc_license_number || "—"}</dd></div>
                <div><dt>Registration Date</dt><dd>{record.prc_registration_date || "—"}</dd></div>
                <div><dt>Expiration Date</dt><dd>{record.prc_expiration_date || "—"}</dd></div>
              </dl>
              {record.ocr_raw_text && (
                <details className="vvp-raw-text">
                  <summary>Full text read from the ID (for cross-checking)</summary>
                  <pre>{record.ocr_raw_text}</pre>
                </details>
              )}
            </>
          )}

          {status === "Pending Review" && (
            <div className="vvp-decision">
              <label>Reason (required for Reject / Needs Resubmission)<textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} /></label>
              <div className="vvp-decision-actions">
                <button type="button" className="approve" onClick={() => decide("Verified")} disabled={!!deciding}>{deciding === "Verified" ? "Saving..." : "Approve - Verified"}</button>
                <button type="button" className="resubmit" onClick={() => decide("Needs Resubmission")} disabled={!!deciding}>{deciding === "Needs Resubmission" ? "Saving..." : "Needs Resubmission"}</button>
                <button type="button" className="reject" onClick={() => decide("Rejected")} disabled={!!deciding}>{deciding === "Rejected" ? "Saving..." : "Reject"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .vvp-card{background:#fff;border:1px solid #e6f0f4;border-radius:16px;padding:20px;box-shadow:0 7px 20px rgba(47,117,150,.06)}
        .vvp-card h3{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;color:#20313b;font-size:16px}
        .vvp-loading{padding:16px;color:#6f7f88}
        .vvp-muted{margin:0;color:#6f7f88;font-size:13px}
        .vvp-verified-text{display:flex;align-items:center;gap:6px;color:#2f8f5b;font-weight:700}
        .vvp-instructions{margin:0 0 4px;color:#6f7f88;font-size:12.5px;line-height:1.55}

        .vvp-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800}
        .vvp-badge-muted{background:#eef1f2;color:#657a84}
        .vvp-badge-pending{background:#fdf1dc;color:#a5680b}
        .vvp-badge-verified{background:#e5f4ea;color:#2f8f5b}
        .vvp-badge-rejected{background:#fbe6e4;color:#c0392b}

        .vvp-notice{padding:10px 13px;border-radius:10px;font-size:12.5px;margin-bottom:12px}
        .vvp-notice.error{background:#fff0f0;color:#a94444}
        .vvp-notice.success{background:#eaf8ef;color:#28794c}
        .vvp-notice.warn{background:#fff5d9;color:#9a7015}

        .vvp-form{display:grid;gap:12px;margin-top:8px}
        .vvp-form label{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:#334e5a}
        .vvp-form input,.vvp-form textarea{width:100%;border:1px solid #d8e8ef;border-radius:10px;padding:10px;font:inherit;box-sizing:border-box}
        .vvp-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .vvp-file-name{font-weight:400;color:#6f7f88;font-size:11.5px}

        .vvp-ocr-status{display:flex;align-items:center;gap:7px;margin:0;color:#267fa9;font-size:12.5px;font-weight:700}
        .vvp-scan-spin{animation:vvpSpin 1.1s linear infinite}
        @keyframes vvpSpin{to{transform:rotate(360deg)}}

        .vvp-ocr-result{background:#f4f9fb;border:1px solid #e1edf2;border-radius:10px;padding:12px;display:grid;gap:10px}
        .vvp-ocr-result input[readonly]{background:#eef1f2;color:#657a84;cursor:not-allowed}
        .vvp-ocr-warn{margin:0;color:#a5680b;font-size:12px;font-weight:600}
        .vvp-ocr-correct-hint{margin:2px 0 0;color:#6f7f88;font-size:11.5px;font-weight:600}
        .vvp-fieldError{color:#a5680b;font-size:11px;font-weight:600}

        .vvp-consent{background:#f4f9fb;border:1px solid #e1edf2;border-radius:10px;padding:12px}
        .vvp-consent-check{display:flex!important;flex-direction:row;align-items:flex-start;gap:9px;font-weight:600!important;font-size:12.5px!important;color:#334e5a;cursor:pointer}
        .vvp-consent-check input{width:auto;margin-top:2px}

        .vvp-face-scan{display:flex;justify-content:center}
        .vvp-start-camera{display:inline-flex;align-items:center;gap:7px;border:1px dashed #a9dff0;background:#f4fbfd;color:#267fa9;border-radius:12px;padding:14px 20px;font-weight:700;cursor:pointer}
        .vvp-start-camera:disabled{opacity:.5;cursor:not-allowed}
        .vvp-face-camera{display:grid;gap:8px;justify-items:center}
        .vvp-face-camera video{width:280px;max-width:100%;border-radius:14px;background:#000;transform:scaleX(-1)}
        .vvp-face-camera-actions{display:flex;gap:8px}
        .vvp-face-camera-actions button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;background:#4DA8DA;color:#fff}
        .vvp-face-camera-actions button.ghost{background:#eef4f6;color:#536b78}
        .vvp-face-result{display:grid;gap:8px;justify-items:center}
        .vvp-face-result img{width:200px;border-radius:14px;transform:scaleX(-1)}
        .vvp-face-result button{border:1px solid #cfe4ed;background:#fff;color:#257fa9;border-radius:9px;padding:8px 13px;font-weight:700;cursor:pointer}

        .vvp-submit-btn{justify-self:start;display:flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:11px 16px;background:#4DA8DA;color:#fff;font-weight:700;cursor:pointer}
        .vvp-submit-btn:disabled{opacity:.65;cursor:not-allowed}

        .vvp-review{margin-top:14px;display:grid;gap:14px}
        .vvp-load-docs{justify-self:start;border:1px solid #cfe4ed;background:#fff;color:#257fa9;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer}
        .vvp-doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
        .vvp-doc-grid img{width:100%;border-radius:10px;border:1px solid #eaf1f4}
        .vvp-label{display:flex;align-items:center;gap:5px;margin-bottom:5px;color:#6f7f88;font-size:11px;font-weight:700;text-transform:uppercase}
        .vvp-prc-details{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
        .vvp-prc-details dt{color:#8a9aa2;font-size:11px;text-transform:uppercase}
        .vvp-prc-details dd{margin:2px 0 0;color:#334e5a;font-weight:700;font-size:13px;overflow-wrap:anywhere}
        .vvp-raw-text{font-size:12px;color:#536b78}
        .vvp-raw-text summary{cursor:pointer;font-weight:700}
        .vvp-raw-text pre{margin:8px 0 0;padding:10px;background:#f7fbfd;border:1px solid #eaf1f4;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11.5px}

        .vvp-decision{display:grid;gap:10px}
        .vvp-decision label{display:grid;gap:6px;font-size:12.5px;font-weight:700;color:#334e5a}
        .vvp-decision textarea{border:1px solid #d8e8ef;border-radius:10px;padding:10px;font:inherit;min-height:60px}
        .vvp-decision-actions{display:flex;gap:8px;flex-wrap:wrap}
        .vvp-decision-actions button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;color:#fff}
        .vvp-decision-actions button.approve{background:#2f8f5b}
        .vvp-decision-actions button.resubmit{background:#a5680b}
        .vvp-decision-actions button.reject{background:#c0392b}
        .vvp-decision-actions button:disabled{opacity:.6;cursor:not-allowed}

        @media(max-width:640px){.vvp-pair{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
