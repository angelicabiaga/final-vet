import React, { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import {
  parseConsultationInsight,
  splitRiskName,
  toListItems,
  toSentences,
} from "../utils/predictiveHealthParsing";

// Pure presentation for one consultation's AI Health Insight. All fetching
// (generateConsultationHealthInsight) happens in PetManagementModule, which
// owns the cache keyed by record id -- this only renders whatever state it
// is handed, and never calls the AI itself.
export default function ConsultationHealthInsight({
  isFinalized,
  insightText,
  loading,
  error,
  onRetry,
}) {
  const { sections, disclaimer } = useMemo(
    () => (insightText ? parseConsultationInsight(insightText) : { sections: {}, disclaimer: "" }),
    [insightText]
  );

  if (!isFinalized) {
    return (
      <div className="chi-locked">
        <Clock size={14} />
        AI insight available after finalization.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="chi-loading">
        <div className="chi-spinner" />
        Generating AI health insight for this consultation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="chi-error">
        <span>{error}</span>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
    );
  }

  if (!insightText) return null;

  const findings = toSentences((sections["RECORDED HEALTH FINDINGS"] || []).join(" "));
  const risks = toListItems(sections["POTENTIAL HEALTH RISKS TO MONITOR"] || []);
  const warnings = toSentences((sections["WARNING SIGNS"] || []).join(" "));
  const monitoring = toListItems(sections["RECOMMENDED MONITORING AND FOLLOW-UP"] || []);
  const comparison = toSentences((sections["COMPARISON WITH PREVIOUS CONSULTATIONS"] || []).join(" "));

  return (
    <div className="chi">
      <div className="chi-section">
        <span className="chi-label"><Stethoscope size={12} /> Recorded Health Findings</span>
        {findings.length ? (
          <ul className="chi-bullets">
            {findings.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="chi-muted">Nothing beyond what's already shown above was recorded.</p>}
      </div>

      <div className="chi-section">
        <span className="chi-label"><AlertTriangle size={12} /> Potential Health Risks to Monitor</span>
        {risks.length ? (
          <ul className="chi-risk-list">
            {risks.map((sentence, index) => {
              const { name, detail } = splitRiskName(sentence);
              return <li key={index}><strong>{name}</strong>{detail && ` — ${detail}`}</li>;
            })}
          </ul>
        ) : <p className="chi-muted">No specific risks were flagged from this consultation.</p>}
      </div>

      <div className="chi-section">
        <span className="chi-label"><ShieldAlert size={12} /> Warning Signs</span>
        {warnings.length ? (
          <ul className="chi-bullets">
            {warnings.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="chi-muted">No specific warning signs were identified.</p>}
      </div>

      <div className="chi-section">
        <span className="chi-label"><ListChecks size={12} /> Recommended Monitoring and Follow-up</span>
        {monitoring.length ? (
          <ul className="chi-checklist">
            {monitoring.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="chi-muted">No follow-up steps were returned.</p>}
      </div>

      <div className="chi-section chi-section-full">
        <span className="chi-label"><Sparkles size={12} /> Comparison with Previous Consultations</span>
        {comparison.length ? (
          <ul className="chi-bullets">
            {comparison.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="chi-muted">No previous finalized consultations to compare.</p>}
      </div>

      <p className="chi-disclaimer">
        {disclaimer || "This AI health insight is decision support only and does not replace a veterinarian's professional diagnosis."}
      </p>

      <style>{`
        /* grid-column:1/-1 makes every root state (loaded, locked, loading,
           error) claim the full row regardless of which grid it lands in --
           the parent .consultation-details grid included -- so this panel
           never gets squeezed into a single narrow column. */
        .chi,.chi-locked,.chi-loading,.chi-error{grid-column:1/-1}

        .chi{
          display:grid;
          grid-template-columns:repeat(2,minmax(240px,1fr));
          gap:18px 22px;
          width:100%;
          margin-top:12px;
          padding:18px 20px;
          border-radius:12px;
          background:#fbfdfe;
          border:1px solid #e1edf2;
          box-sizing:border-box;
          animation:chiReveal .18s ease-out;
        }

        .chi-section{display:grid;align-content:start;gap:8px;min-width:0}
        .chi-section-full{grid-column:1/-1}

        .chi-label{display:flex;align-items:center;gap:6px;color:#17445a;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}
        .chi-muted{margin:0;color:#93a4ac;font-size:12px;line-height:1.5}

        .chi-bullets{margin:0;padding:0;list-style:none;display:grid;gap:7px}
        .chi-bullets li{position:relative;padding-left:15px;color:#324a54;font-size:12.5px;line-height:1.6;overflow-wrap:anywhere}
        .chi-bullets li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:50%;background:#4da8da;flex-shrink:0}

        .chi-checklist{margin:0;padding:0;list-style:none;display:grid;gap:7px}
        .chi-checklist li{position:relative;padding-left:22px;color:#324a54;font-size:12.5px;line-height:1.6;overflow-wrap:anywhere}
        .chi-checklist li::before{content:"✓";position:absolute;left:0;top:1px;width:14px;height:14px;border-radius:4px;background:#e5f4ea;color:#2f8f5b;font-size:9px;font-weight:800;display:grid;place-items:center}

        .chi-risk-list{margin:0;padding-left:16px;display:grid;gap:7px}
        .chi-risk-list li{color:#4a3c22;font-size:12.5px;line-height:1.6;overflow-wrap:anywhere}
        .chi-risk-list li strong{color:#8a5a00}

        .chi-disclaimer{grid-column:1/-1;margin:2px 0 0;padding:10px 12px;border-radius:8px;background:#f5f7f8;color:#5a747e;font-size:11px;font-style:italic;line-height:1.55}

        .chi-locked{display:flex;align-items:center;gap:7px;margin-top:12px;padding:11px 14px;border-radius:10px;background:#f2f5f6;color:#7a8d96;font-size:12.5px;font-weight:600;animation:chiReveal .18s ease-out}
        .chi-loading{display:flex;align-items:center;gap:10px;margin-top:12px;padding:14px;border-radius:10px;background:#fbfdfe;border:1px solid #e1edf2;color:#375864;font-size:12.5px;animation:chiReveal .18s ease-out}
        .chi-spinner{width:16px;height:16px;border:3px solid #dceef5;border-top-color:#4da8da;border-radius:50%;animation:chiSpin .8s linear infinite;flex-shrink:0}
        @keyframes chiSpin{to{transform:rotate(360deg)}}
        @keyframes chiReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){.chi,.chi-locked,.chi-loading{animation:none}}

        .chi-error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:11px 14px;border-radius:10px;background:#fff0f0;color:#a94444;font-size:12.5px;animation:chiReveal .18s ease-out}
        .chi-error span{line-height:1.5}
        .chi-error button{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;border:0;border-radius:7px;padding:6px 9px;background:#fff;color:#a94444;font-weight:700;font-size:11.5px;cursor:pointer}

        @media (max-width:640px){
          .chi{grid-template-columns:1fr;gap:16px;padding:15px 16px}
        }
      `}</style>
    </div>
  );
}
