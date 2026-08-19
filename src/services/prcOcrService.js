import { createWorker } from "tesseract.js";

// Runs entirely in the browser (a Web Worker + WASM, via tesseract.js) --
// there is no separate private server in this app to run OCR on, so
// "backend processing" here means the app's own service layer, exactly
// like every other data operation in this codebase. Nothing extracted
// here is ever logged; only the parsed fields are stored, in the same
// private, RLS-scoped table the rest of verification already uses.
export async function extractPrcIdText(file) {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text || "", confidence: Number(data.confidence) || 0 };
  } finally {
    await worker.terminate();
  }
}

const LABELLED_LICENSE = /(?:license\s*no\.?|lic\.?\s*no\.?|reg(?:istration)?\s*no\.?|prc\s*no\.?)[:\s]*([A-Za-z0-9-]{4,12})/i;
const BARE_LICENSE = /\b\d{5,7}\b/;
const PROFESSION_HINT = /(veterinarian|veterinary medicine|doctor of veterinary medicine|d\.?\s?v\.?\s?m\.?)/i;
const IGNORED_LINE = /republic|philippines|professional regulation|regulation commission|identification card/i;
const NAME_LINE = /^[A-Z.,\s'-]{6,40}$/;

const DATE_TOKEN = "([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4})";
const REG_DATE_LABEL = new RegExp(`(?:date\\s*(?:of)?\\s*registration|registration\\s*date|date\\s*issued|issued)[:\\s]*${DATE_TOKEN}`, "i");
const EXP_DATE_LABEL = new RegExp(`(?:valid\\s*until|expiry\\s*date|expiration\\s*date|expires?)[:\\s]*${DATE_TOKEN}`, "i");

// Only commits to a date reading when the format is unambiguous (a real
// ISO date, or a D/M/Y vs M/D/Y split where one side can't possibly be a
// month). A genuinely ambiguous date -- e.g. 03/04/2026 -- is left blank
// rather than guessed; the veterinarian fills it in themselves.
function toIsoDate(raw) {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const split = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (split) {
    const [, a, b, y] = split;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) return `${y}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    if (second > 12 && first <= 12) return `${y}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
  }
  return "";
}

// Best-effort field parsing from raw OCR text. PRC IDs are not one fixed,
// OCR-friendly template, so this looks for common label patterns and
// leaves a field blank ("Unable to Detect" in the UI) rather than
// guessing when nothing confident is found. The license number is the
// one field nobody -- not even the veterinarian -- can fill in by hand;
// every other field extracted here can be corrected before submitting.
export function parsePrcFields(rawText) {
  const text = String(rawText || "");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  const labelledLicense = text.match(LABELLED_LICENSE);
  const bareLicense = text.match(BARE_LICENSE);
  const licenseNumber = (labelledLicense?.[1] || bareLicense?.[0] || "").toUpperCase();

  const profession = PROFESSION_HINT.test(text) ? "Veterinarian" : "";
  const nameCandidate = lines.find((line) => NAME_LINE.test(line) && !IGNORED_LINE.test(line)) || "";

  const registrationDate = toIsoDate(text.match(REG_DATE_LABEL)?.[1] || "");
  const expirationDate = toIsoDate(text.match(EXP_DATE_LABEL)?.[1] || "");

  return { licenseNumber, profession, nameCandidate, registrationDate, expirationDate, rawText: text };
}
