import React, { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  Gauge,
  ListChecks,
  Pin,
  Sparkles,
} from "lucide-react";
import {
  formatConsultationDate,
  keywordSet,
  parseAiReport,
  sharesKeyword,
  splitRiskName,
  toListItems,
  toSentences,
} from "../utils/predictiveHealthParsing";

// Pure presentation: all fetching (the unchanged generatePredictiveHealthAnalysis
// call and the previous-records lookup) happens once in PetManagementModule so
// the risk badge next to the tab and this panel's content always agree and
// never trigger a second AI request.
export default function AnimalPatientAIHealth({
  latestRecord,
  previousRecords,
  aiText,
  loading,
  error,
  riskScore,
  riskLevel,
}) {
  const { sections, disclaimer } = useMemo(() => parseAiReport(aiText), [aiText]);

  const timeline = useMemo(() => {
    if (!latestRecord) return [];
    const previous = [...(previousRecords || [])].sort((a, b) => new Date(a.consultation_date || 0) - new Date(b.consultation_date || 0));
    const combined = [...previous, { ...latestRecord, isCurrent: true }];
    return combined.map((entry, index) => {
      const priorEntries = combined.slice(0, index);
      const ownKeywords = keywordSet(`${entry.symptoms || ""} ${entry.diagnosis || ""}`);
      const recurring = priorEntries.some((prior) => sharesKeyword(ownKeywords, keywordSet(`${prior.symptoms || ""} ${prior.diagnosis || ""}`)));
      return {
        ...entry,
        patternBadge: !ownKeywords.size ? null : recurring ? "Recurring" : "New",
      };
    });
  }, [previousRecords, latestRecord]);

  const upcomingActions = useMemo(() => {
    const combined = latestRecord ? [...(previousRecords || []), latestRecord] : [];
    return combined
      .filter((entry) => entry.follow_up_date)
      .map((entry) => ({ date: entry.follow_up_date, label: entry.treatment_plan || entry.diagnosis || "Follow-up visit" }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
  }, [previousRecords, latestRecord]);

  const consultationCount = (previousRecords?.length || 0) + (latestRecord ? 1 : 0);
  const overviewLines = toSentences((sections["CLINICAL RECORD SUMMARY"] || []).join(" ")).slice(0, 2);
  const patternLines = toSentences((sections["OBSERVED HEALTH PATTERNS"] || []).join(" "));
  const riskSentences = toListItems(sections["POTENTIAL HEALTH RISKS TO MONITOR"] || [], 5);
  const followUpLines = toSentences((sections["FOLLOW-UP CONSIDERATIONS"] || []).join(" "));
  const actionItems = toListItems(sections["SUGGESTED CLINICAL ACTIONS"] || [], 5);
  const recommendedActions = [...followUpLines, ...actionItems];

  if (!latestRecord) {
    return (
      <div className="aph-empty">
        <BrainCircuit size={30} />
        <p>AI Predictive Health will be available once this pet has at least one finalized consultation.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="aph-empty">
        <div className="aph-spinner" />
        <p>Analyzing this pet's complete consultation history…</p>
      </div>
    );
  }

  if (error) {
    return <div className="aph-error">{error}</div>;
  }

  return (
    <div className="aph">
      <div className="aph-summary-row">
        <div className="aph-summary-card">
          <span className="aph-summary-label"><Gauge size={13} /> Health Risk Score</span>
          <div className="aph-score-row">
            <strong className={`aph-score aph-score-${riskLevel?.toLowerCase()}`}>{riskScore}</strong>
            <span className="aph-score-max">/100</span>
          </div>
          <div className="aph-score-bar"><div className={`aph-score-fill aph-score-fill-${riskLevel?.toLowerCase()}`} style={{ width: `${riskScore}%` }} /></div>
          <span className={`aph-badge aph-badge-${riskLevel?.toLowerCase()}`}>{riskLevel} Risk</span>
        </div>

        <div className="aph-summary-card">
          <span className="aph-summary-label">Based On</span>
          <strong className="aph-based-count">{consultationCount}</strong>
          <span className="aph-based-label">consultation{consultationCount === 1 ? "" : "s"} on record</span>
          <span className="aph-based-last">Last visit: {formatConsultationDate(latestRecord.consultation_date)}</span>
        </div>

        <div className="aph-summary-card aph-actions-card">
          <span className="aph-summary-label">Upcoming Actions</span>
          {upcomingActions.length ? (
            <ul className="aph-pins">
              {upcomingActions.map((action, index) => (
                <li key={index}><Pin size={12} /> {action.label} — {formatConsultationDate(action.date)}</li>
              ))}
            </ul>
          ) : <p className="aph-no-pins">No upcoming follow-ups on record.</p>}
        </div>
      </div>

      {overviewLines.length > 0 && (
        <div className="aph-callout">
          <Sparkles size={16} />
          <div>
            <span className="aph-callout-label">AI Health Summary</span>
            <p>{overviewLines.join(" ")}</p>
          </div>
        </div>
      )}

      <section className="aph-card">
        <h3><Activity size={16} /> Observed Health Patterns</h3>
        <p className="aph-card-subtitle">AI-identified trends across consultation history</p>
        <div className="aph-pattern-list">
          {timeline.map((entry) => (
            <div key={entry.id || "current"} className="aph-pattern-row">
              <div className="aph-pattern-date">
                <CalendarClock size={12} /> {formatConsultationDate(entry.consultation_date)}
                {entry.patternBadge && <span className={`aph-mini-badge aph-mini-badge-${entry.patternBadge === "Recurring" ? "recurring" : "new"}`}>{entry.patternBadge}</span>}
              </div>
              <div className="aph-pattern-body">
                <p>{entry.diagnosis || entry.chief_complaint || "No diagnosis recorded"}{entry.isCurrent ? " (current visit)" : ""}</p>
                {entry.symptoms && (
                  <div className="aph-chip-row">
                    {String(entry.symptoms).split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((chip, chipIndex) => (
                      <span key={chipIndex} className="aph-chip">{chip}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {!patternLines.length && <p className="aph-muted">No additional pattern narrative was returned.</p>}
        {patternLines.length > 0 && (
          <ul className="aph-bullets">
            {patternLines.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        )}
      </section>

      <div className="aph-two-col">
        <section className="aph-card aph-risk-card">
          <h3><AlertTriangle size={16} /> Potential Health Risks to Monitor</h3>
          {riskSentences.length ? (
            <ol className="aph-risk-list">
              {riskSentences.map((sentence, index) => {
                const { name, detail } = splitRiskName(sentence);
                return <li key={index}><strong>{name}</strong>{detail && ` — ${detail}`}</li>;
              })}
            </ol>
          ) : <p className="aph-muted">No specific risks were flagged from the available records.</p>}
        </section>

        <section className="aph-card aph-actions-list-card">
          <h3><ListChecks size={16} /> Recommended Actions</h3>
          {recommendedActions.length ? (
            <ul className="aph-checklist">
              {recommendedActions.slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          ) : <p className="aph-muted">No recommended actions were returned.</p>}
        </section>
      </div>

      <p className="aph-disclaimer">
        {disclaimer || "AI predictive health analysis is decision support only and does not replace a veterinarian's professional diagnosis."}
      </p>

      <style>{`
        .aph{display:grid;gap:16px}
        .aph-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:50px 20px;color:#7a8d96;text-align:center}
        .aph-empty svg{color:#a9cdda}
        .aph-empty p{margin:0;font-size:13.5px;max-width:360px}
        .aph-spinner{width:30px;height:30px;border:4px solid #dceef5;border-top-color:#4da8da;border-radius:50%;animation:aphSpin .8s linear infinite}
        @keyframes aphSpin{to{transform:rotate(360deg)}}
        .aph-error{padding:16px 18px;border-radius:12px;background:#fff0f0;color:#a94444;font-size:13.5px}
        .aph-summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .aph-summary-card{background:#fbfdfe;border:1px solid #e1edf2;border-radius:14px;padding:16px 18px;display:grid;gap:5px;align-content:start}
        .aph-summary-label{display:flex;align-items:center;gap:6px;color:#7a8d96;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
        .aph-score-row{display:flex;align-items:baseline;gap:4px}
        .aph-score{font-size:30px;font-weight:800;color:#213944}
        .aph-score-low{color:#2f8f5b}
        .aph-score-moderate{color:#b3790b}
        .aph-score-high{color:#c0392b}
        .aph-score-max{color:#a4b4bb;font-size:13px;font-weight:700}
        .aph-score-bar{height:6px;border-radius:999px;background:#eef3f5;overflow:hidden;margin:2px 0}
        .aph-score-fill{height:100%;border-radius:999px}
        .aph-score-fill-low{background:#2f8f5b}
        .aph-score-fill-moderate{background:#d99a1f}
        .aph-score-fill-high{background:#c0392b}
        .aph-badge{justify-self:start;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800}
        .aph-badge-low{background:#e5f4ea;color:#2f8f5b}
        .aph-badge-moderate{background:#fdf1dc;color:#a5680b}
        .aph-badge-high{background:#fbe6e4;color:#c0392b}
        .aph-based-count{font-size:26px;font-weight:800;color:#213944}
        .aph-based-label{color:#5a747e;font-size:12.5px}
        .aph-based-last{color:#7a8d96;font-size:11.5px;margin-top:4px}
        .aph-actions-card{background:#f0f9f2;border-color:#d9ecdd}
        .aph-actions-card .aph-summary-label{color:#2f8f5b}
        .aph-pins{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:6px}
        .aph-pins li{display:flex;align-items:flex-start;gap:6px;color:#2f6b45;font-size:12px;font-weight:600;line-height:1.4}
        .aph-no-pins{margin:2px 0 0;color:#5a8a67;font-size:12px}
        .aph-callout{display:flex;gap:12px;padding:16px 18px;border-radius:14px;background:#f2f9fc;border:1px solid #d8ebf3}
        .aph-callout svg{color:#318fbe;flex-shrink:0;margin-top:2px}
        .aph-callout-label{display:block;margin-bottom:4px;color:#17445a;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
        .aph-callout p{margin:0;color:#324a54;font-size:13.5px;line-height:1.55}
        .aph-card{background:#fbfdfe;border:1px solid #e1edf2;border-radius:14px;padding:18px 20px}
        .aph-card h3{display:flex;align-items:center;gap:8px;margin:0 0 3px;color:#17445a;font-size:15px}
        .aph-card-subtitle{margin:0 0 14px;color:#7a8d96;font-size:12px}
        .aph-muted{margin:0;color:#7a8d96;font-size:13px}
        .aph-pattern-list{display:grid;gap:0}
        .aph-pattern-row{display:grid;grid-template-columns:130px 1fr;gap:14px;padding:12px 0;border-bottom:1px solid #eef3f5}
        .aph-pattern-row:last-child{border-bottom:0}
        .aph-pattern-date{display:flex;flex-direction:column;align-items:flex-start;gap:5px;color:#4c6470;font-size:12px;font-weight:700}
        .aph-pattern-date svg{flex-shrink:0}
        .aph-pattern-body p{margin:0 0 6px;color:#213944;font-size:13.5px;font-weight:600}
        .aph-mini-badge{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase}
        .aph-mini-badge-recurring{background:#fff3e0;color:#a5680b}
        .aph-mini-badge-new{background:#eef6ff;color:#3563c2}
        .aph-chip-row{display:flex;flex-wrap:wrap;gap:6px}
        .aph-chip{background:#fff3e0;color:#8a5a00;border-radius:999px;padding:3px 9px;font-size:11.5px;font-weight:600}
        .aph-bullets{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:7px}
        .aph-bullets li{position:relative;padding-left:15px;color:#324a54;font-size:13px;line-height:1.5}
        .aph-bullets li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:50%;background:#4da8da}
        .aph-two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .aph-risk-card{background:#fffaf2;border-color:#f3e3c6}
        .aph-risk-list{margin:0;padding-left:18px;display:grid;gap:9px}
        .aph-risk-list li{color:#4a3c22;font-size:13px;line-height:1.5}
        .aph-risk-list li strong{color:#8a5a00}
        .aph-checklist{margin:0;padding:0;list-style:none;display:grid;gap:8px}
        .aph-checklist li{position:relative;padding-left:23px;color:#324a54;font-size:13px;line-height:1.5}
        .aph-checklist li::before{content:"✓";position:absolute;left:0;top:0;width:16px;height:16px;border-radius:5px;background:#e5f4ea;color:#2f8f5b;font-size:10px;font-weight:800;display:grid;place-items:center}
        .aph-disclaimer{margin:0;padding:12px 15px;border-radius:10px;background:#f5f7f8;color:#5a747e;font-size:11.5px;font-style:italic;line-height:1.5}
        @media(max-width:760px){.aph-summary-row,.aph-two-col{grid-template-columns:1fr}.aph-pattern-row{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
