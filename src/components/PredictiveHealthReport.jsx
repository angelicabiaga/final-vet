import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  History,
  ListChecks,
  Minus,
  Stethoscope,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getPreviousMedicalRecordsForAi } from "../services/medicalRecordService";

// The exact section headings generatePredictiveHealthAnalysis's unchanged
// prompt instructs the model to use -- this only decides how the returned
// text is split into cards, never what the AI is asked to produce.
const SECTION_HEADINGS = [
  "CLINICAL RECORD SUMMARY",
  "OBSERVED HEALTH PATTERNS",
  "POTENTIAL HEALTH RISKS TO MONITOR",
  "FOLLOW-UP CONSIDERATIONS",
  "SUGGESTED CLINICAL ACTIONS",
];

function parseAiReport(text) {
  const sections = {};
  let current = null;
  let disclaimer = "";

  String(text || "")
    .split("\n")
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const upper = line.toUpperCase();

      if (SECTION_HEADINGS.includes(upper)) {
        current = upper;
        sections[current] = sections[current] || [];
        return;
      }

      if (line.toLowerCase().startsWith("ai predictive health analysis is based")) {
        disclaimer = line;
        current = null;
        return;
      }

      if (current) sections[current].push(line);
    });

  return { sections, disclaimer };
}

function toSentences(text) {
  if (!text) return [];
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Prefers the AI's own numbered lines when it produced them; otherwise
// falls back to splitting the paragraph into standalone sentences. Either
// way every item is re-numbered 1..N here, capped where the caller asks.
function toListItems(lines, max) {
  const numbered = lines
    .map((line) => line.match(/^(\d+)[.)]\s*(.+)$/))
    .filter(Boolean)
    .map((match) => match[2].trim());

  const items = numbered.length ? numbered : toSentences(lines.join(" "));
  return max ? items.slice(0, max) : items;
}

// Bolds a short lead-in phrase (the "risk name") and keeps the remainder --
// which, per the AI's own prompt, already names the recorded symptom or
// finding the risk was drawn from -- as the supporting detail.
function splitRiskName(sentence) {
  const cutMatch = sentence.match(/^(.{0,60}?)(?:[:–—-]|,)\s+(.*)$/);
  if (cutMatch && cutMatch[2]) {
    return { name: cutMatch[1].trim(), detail: cutMatch[2].trim() };
  }
  const words = sentence.split(" ");
  if (words.length > 7) {
    return { name: words.slice(0, 6).join(" "), detail: words.slice(6).join(" ") };
  }
  return { name: sentence, detail: "" };
}

const STOPWORDS = new Set(["the", "and", "with", "for", "was", "were", "has", "have", "had", "this", "that", "from", "into", "over", "still", "also", "been", "noted", "record", "records", "patient", "pet", "mild", "slight"]);

function keywordSet(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word))
  );
}

function sharesKeyword(a, b) {
  if (!a.size || !b.size) return false;
  for (const word of a) if (b.has(word)) return true;
  return false;
}

function formatDate(value) {
  if (!value) return "Undated visit";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function VitalTrend({ label, current, previous, unit }) {
  if (current === null || current === undefined || current === "") return null;
  const currentNum = Number(current);
  if (!Number.isFinite(currentNum)) return null;
  const previousNum = previous === null || previous === undefined || previous === "" ? null : Number(previous);
  const hasPrevious = previousNum !== null && Number.isFinite(previousNum);
  const delta = hasPrevious ? currentNum - previousNum : 0;
  const Icon = !hasPrevious ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = !hasPrevious ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <span className={`phr-vital phr-vital-${tone}`}>
      <Icon size={12} />
      {label} {currentNum}{unit}
      {hasPrevious && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit})` : ""}
    </span>
  );
}

export default function PredictiveHealthReport({ record, aiText }) {
  const [previousRecords, setPreviousRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    setPreviousRecords([]);
    if (!record?.pet_id) { setHistoryLoading(false); return undefined; }

    getPreviousMedicalRecordsForAi(record.pet_id, record.id)
      .then((rows) => { if (active) setPreviousRecords(rows); })
      .catch(() => { if (active) setPreviousRecords([]); })
      .finally(() => { if (active) setHistoryLoading(false); });

    return () => { active = false; };
  }, [record?.pet_id, record?.id]);

  const { sections, disclaimer } = useMemo(() => parseAiReport(aiText), [aiText]);

  // Oldest to newest so the timeline reads left-to-right/top-to-bottom the
  // way a clinical history naturally progresses, with the consultation the
  // report was generated for pinned at the end as "Current visit".
  const timeline = useMemo(() => {
    const previous = [...previousRecords].sort((a, b) => new Date(a.consultation_date || 0) - new Date(b.consultation_date || 0));
    const combined = record ? [...previous, { ...record, isCurrent: true }] : previous;
    return combined.map((entry, index) => {
      const priorTexts = combined.slice(0, index);
      const ownKeywords = keywordSet(`${entry.symptoms || ""} ${entry.diagnosis || ""}`);
      const recurring = priorTexts.some((prior) => sharesKeyword(ownKeywords, keywordSet(`${prior.symptoms || ""} ${prior.diagnosis || ""}`)));
      return {
        ...entry,
        previousEntry: index > 0 ? combined[index - 1] : null,
        patternBadge: !ownKeywords.size ? null : recurring ? "Recurring" : "Newly observed",
      };
    });
  }, [previousRecords, record]);

  const symptomLog = useMemo(
    () => timeline
      .filter((entry) => entry.symptoms)
      .map((entry) => ({
        date: entry.consultation_date,
        isCurrent: !!entry.isCurrent,
        chips: String(entry.symptoms).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      })),
    [timeline]
  );

  const overviewLines = toSentences((sections["CLINICAL RECORD SUMMARY"] || []).join(" ")).slice(0, 5);
  const patternLines = toSentences((sections["OBSERVED HEALTH PATTERNS"] || []).join(" "));
  const riskSentences = toListItems(sections["POTENTIAL HEALTH RISKS TO MONITOR"] || [], 5);
  const followUpLines = toSentences((sections["FOLLOW-UP CONSIDERATIONS"] || []).join(" "));
  const actionItems = toListItems(sections["SUGGESTED CLINICAL ACTIONS"] || [], 5);

  return (
    <div className="phr">
      <section className="phr-card">
        <h3><ClipboardList size={16} /> Health Overview</h3>
        {overviewLines.length ? (
          <ul className="phr-bullets">
            {overviewLines.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="phr-muted">No clinical summary was returned.</p>}
      </section>

      <section className="phr-card">
        <h3><History size={16} /> Previous Consultations</h3>
        <p className="phr-basis">
          {historyLoading
            ? "Loading this pet's previous finalized records…"
            : previousRecords.length
              ? `Based on this consultation plus ${previousRecords.length} previous finalized record${previousRecords.length === 1 ? "" : "s"} for this pet, shown chronologically below.`
              : "No previous finalized records were available for this pet -- this analysis is based only on the current consultation."}
        </p>

        {!historyLoading && timeline.length > 0 && (
          <ol className="phr-timeline">
            {timeline.map((entry) => (
              <li key={entry.id || "current"} className={entry.isCurrent ? "current" : ""}>
                <div className="phr-timeline-dot" />
                <div className="phr-timeline-body">
                  <div className="phr-timeline-head">
                    <span className="phr-timeline-date"><CalendarClock size={13} /> {formatDate(entry.consultation_date)}</span>
                    {entry.isCurrent && <span className="phr-badge phr-badge-current">Current visit</span>}
                    {entry.patternBadge && <span className={`phr-badge phr-badge-${entry.patternBadge === "Recurring" ? "recurring" : "new"}`}>{entry.patternBadge}</span>}
                    {!entry.isCurrent && <span className="phr-badge phr-badge-basis">Used in AI analysis</span>}
                  </div>
                  <p className="phr-timeline-diagnosis">{entry.diagnosis || entry.chief_complaint || "No diagnosis recorded"}</p>
                  {entry.symptoms && <p className="phr-timeline-summary">Symptoms: {entry.symptoms}</p>}
                  {(entry.weight || entry.temperature) && (
                    <div className="phr-vitals">
                      <VitalTrend label="Weight" current={entry.weight} previous={entry.previousEntry?.weight} unit="kg" />
                      <VitalTrend label="Temp" current={entry.temperature} previous={entry.previousEntry?.temperature} unit="°C" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="phr-card">
        <h3><Activity size={16} /> Observed Health Patterns</h3>
        {patternLines.length ? (
          <ul className="phr-bullets">
            {patternLines.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        ) : <p className="phr-muted">No pattern comparison was returned.</p>}
      </section>

      <section className="phr-card">
        <h3><Stethoscope size={16} /> Recorded Symptoms</h3>
        {symptomLog.length ? (
          <div className="phr-symptom-log">
            {symptomLog.map((entry, index) => (
              <div key={index} className="phr-symptom-row">
                <span className="phr-symptom-date">{formatDate(entry.date)}{entry.isCurrent ? " (current)" : ""}</span>
                <div className="phr-chip-row">
                  {entry.chips.map((chip, chipIndex) => <span key={chipIndex} className="phr-chip">{chip}</span>)}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="phr-muted">No symptoms have been recorded for this pet yet.</p>}
      </section>

      <section className="phr-card phr-risk-card">
        <h3><AlertTriangle size={16} /> Potential Health Risks to Monitor</h3>
        {riskSentences.length ? (
          <ol className="phr-risk-list">
            {riskSentences.map((sentence, index) => {
              const { name, detail } = splitRiskName(sentence);
              return (
                <li key={index}>
                  <strong>{name}</strong>{detail && <span>{` — ${detail}`}</span>}
                </li>
              );
            })}
          </ol>
        ) : <p className="phr-muted">No specific risks were flagged from the available records.</p>}
      </section>

      <section className="phr-card">
        <h3><ListChecks size={16} /> Recommended Next Steps</h3>
        {followUpLines.length > 0 && (
          <div className="phr-substep">
            <span className="phr-substep-label">Follow-up considerations</span>
            <ul className="phr-bullets">
              {followUpLines.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          </div>
        )}
        {actionItems.length > 0 && (
          <div className="phr-substep">
            <span className="phr-substep-label">Suggested actions</span>
            <ul className="phr-checklist">
              {actionItems.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
        )}
        {!followUpLines.length && !actionItems.length && <p className="phr-muted">No next steps were returned.</p>}
      </section>

      {disclaimer && <p className="phr-disclaimer">{disclaimer}</p>}

      <style>{`
        .phr{display:grid;gap:16px;margin:20px 24px}
        .phr-card{background:#fbfdfe;border:1px solid #e1edf2;border-radius:14px;padding:18px 20px}
        .phr-card h3{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#17445a;font-size:15px}
        .phr-muted{margin:0;color:#7a8d96;font-size:13px}
        .phr-bullets{margin:0;padding:0;list-style:none;display:grid;gap:8px}
        .phr-bullets li{position:relative;padding-left:16px;color:#324a54;font-size:13.5px;line-height:1.55}
        .phr-bullets li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:#4da8da}
        .phr-checklist{margin:0;padding:0;list-style:none;display:grid;gap:8px}
        .phr-checklist li{position:relative;padding-left:24px;color:#324a54;font-size:13.5px;line-height:1.55}
        .phr-checklist li::before{content:"✓";position:absolute;left:0;top:0;width:17px;height:17px;border-radius:5px;background:#e5f4ea;color:#2f8f5b;font-size:11px;font-weight:800;display:grid;place-items:center}
        .phr-basis{margin:0 0 14px;color:#5a747e;font-size:12.5px;font-style:italic}
        .phr-timeline{list-style:none;margin:0;padding:0;display:grid;gap:0}
        .phr-timeline>li{display:flex;gap:12px;padding-bottom:16px;position:relative}
        .phr-timeline>li:not(:last-child)::after{content:"";position:absolute;left:4px;top:14px;bottom:0;width:2px;background:#dceaf0}
        .phr-timeline-dot{width:10px;height:10px;border-radius:50%;background:#9fc2cf;margin-top:4px;flex-shrink:0}
        .phr-timeline>li.current .phr-timeline-dot{background:#318fbe;box-shadow:0 0 0 3px #d9eef7}
        .phr-timeline-body{flex:1;min-width:0}
        .phr-timeline-head{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-bottom:4px}
        .phr-timeline-date{display:inline-flex;align-items:center;gap:5px;color:#4c6470;font-size:12px;font-weight:700}
        .phr-timeline-diagnosis{margin:2px 0;color:#213944;font-size:14px;font-weight:700}
        .phr-timeline-summary{margin:2px 0;color:#5a747e;font-size:12.5px;line-height:1.5}
        .phr-vitals{display:flex;flex-wrap:wrap;gap:8px;margin-top:5px}
        .phr-vital{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#f0f5f7;color:#4c6470}
        .phr-vital-up{background:#fdeeee;color:#b3453d}
        .phr-vital-down{background:#eaf6ee;color:#2f8f5b}
        .phr-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}
        .phr-badge-current{background:#e9f6fb;color:#267fa9}
        .phr-badge-recurring{background:#fff3e0;color:#a5680b}
        .phr-badge-new{background:#eef6ff;color:#3563c2}
        .phr-badge-basis{background:#f1f5f6;color:#657a83}
        .phr-symptom-log{display:grid;gap:10px}
        .phr-symptom-row{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
        .phr-symptom-date{flex:0 0 auto;min-width:110px;color:#4c6470;font-size:12px;font-weight:700}
        .phr-chip-row{display:flex;flex-wrap:wrap;gap:6px}
        .phr-chip{background:#eef6fb;color:#2c6a86;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600}
        .phr-risk-card{background:#fffaf2;border-color:#f3e3c6}
        .phr-risk-list{margin:0;padding-left:20px;display:grid;gap:10px}
        .phr-risk-list li{color:#4a3c22;font-size:13.5px;line-height:1.55}
        .phr-risk-list li strong{color:#8a5a00}
        .phr-substep{margin-bottom:14px}
        .phr-substep:last-child{margin-bottom:0}
        .phr-substep-label{display:block;margin-bottom:8px;color:#657a83;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
        .phr-disclaimer{margin:4px 24px 20px;padding:12px 15px;border-radius:10px;background:#f5f7f8;color:#5a747e;font-size:12px;font-style:italic;line-height:1.5}
        @media(max-width:640px){.phr{margin:16px}.phr-symptom-date{min-width:0}}
      `}</style>
    </div>
  );
}
