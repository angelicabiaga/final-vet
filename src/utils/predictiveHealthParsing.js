// Shared parsing helpers for generatePredictiveHealthAnalysis's plain-text
// output. Nothing here calls the AI or changes its prompt -- these only
// reformat the unchanged returned text (and real medical-record data) for
// display in PredictiveHealthReport (per-record modal) and
// AnimalPatientAIHealth (per-pet profile tab).

// The exact section headings the unchanged prompt instructs the model to
// use -- this only decides how the returned text is split into cards.
export const SECTION_HEADINGS = [
  "CLINICAL RECORD SUMMARY",
  "OBSERVED HEALTH PATTERNS",
  "POTENTIAL HEALTH RISKS TO MONITOR",
  "FOLLOW-UP CONSIDERATIONS",
  "SUGGESTED CLINICAL ACTIONS",
];

export function parseAiReport(text) {
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

export function toSentences(text) {
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
// way every item is re-numbered 1..N by the caller, capped where asked.
export function toListItems(lines, max) {
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
export function splitRiskName(sentence) {
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

export function keywordSet(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word))
  );
}

export function sharesKeyword(a, b) {
  if (!a.size || !b.size) return false;
  for (const word of a) if (b.has(word)) return true;
  return false;
}

export function formatConsultationDate(value) {
  if (!value) return "Undated visit";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// A transparent, locally-computed indicator only -- never an AI-generated
// score (the AI function/prompt is unchanged and never asked for one).
// Combines three concrete, explainable signals: how many risks the AI's
// own (unmodified) "Potential Health Risks" section named, how many
// recorded symptoms/diagnoses recur across visits, and whether a
// follow-up is due soon or overdue.
export function computeRiskLevel({ riskCount = 0, recurringCount = 0, followUpSoon = false, followUpOverdue = false }) {
  let score = 12 + riskCount * 16 + recurringCount * 9;
  if (followUpOverdue) score += 18;
  else if (followUpSoon) score += 8;
  score = Math.max(4, Math.min(96, Math.round(score)));

  const level = score >= 60 ? "High" : score >= 30 ? "Moderate" : "Low";
  return { score, level };
}

// Section headings for generateConsultationHealthInsight's unchanged
// prompt (a single-consultation analysis, separate from the pet-level
// SECTION_HEADINGS/parseAiReport above). Parsing only, never the prompt.
export const CONSULTATION_SECTION_HEADINGS = [
  "CONSULTATION RISK LEVEL",
  "RECORDED HEALTH FINDINGS",
  "POTENTIAL HEALTH RISKS TO MONITOR",
  "WARNING SIGNS",
  "RECOMMENDED MONITORING AND FOLLOW-UP",
  "COMPARISON WITH PREVIOUS CONSULTATIONS",
];

export function parseConsultationInsight(text) {
  const sections = {};
  let current = null;
  let disclaimer = "";

  String(text || "")
    .split("\n")
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const upper = line.toUpperCase();

      if (CONSULTATION_SECTION_HEADINGS.includes(upper)) {
        current = upper;
        sections[current] = sections[current] || [];
        return;
      }

      if (line.toLowerCase().startsWith("this ai health insight is based only on this consultation")) {
        disclaimer = line;
        current = null;
        return;
      }

      if (current) sections[current].push(line);
    });

  const riskText = (sections["CONSULTATION RISK LEVEL"] || []).join(" ").toLowerCase();
  const riskLevel = riskText.includes("high") ? "High" : riskText.includes("moderate") ? "Moderate" : riskText.includes("low") ? "Low" : null;

  return { sections, disclaimer, riskLevel };
}

export function daysUntil(dateValue) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
