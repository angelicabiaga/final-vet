import jsPDF from "jspdf";
import { formatDateTime12h, formatDateLong } from "./timeFormat";
import pawLogo from "../assets/reference/paw.png";

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function formatDateTime(value) {
  return value ? formatDateTime12h(value) : "—";
}

function remainingInvoiceBalance(transaction) {
  return Math.max(0, Number(transaction?.total_amount || 0) - Number(transaction?.amount_paid || 0));
}

function invoiceLineItems(transaction) {
  const serviceRows = Number(transaction.checkup_fee || 0) > 0
    ? [{ id: "checkup", item_name: "Checkup / consultation service", quantity: 1, unit_price: transaction.checkup_fee, line_total: transaction.checkup_fee }]
    : [];
  return [...serviceRows, ...(transaction.transaction_items || [])];
}

/**
 * Client-generated invoice PDF -- no server round-trip. Same figures the
 * printed staff invoice shows (no Subtotal line; a Remaining Balance line
 * only when there's still money owed). Shared by every screen that needs a
 * "Download Invoice" action (staff POS, pet owner's pet records).
 */
export function downloadInvoicePdf(transaction) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const centerX = 105;
  let y = 22;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(37, 80, 101);
  pdf.text("PawCruz Veterinary Clinic", centerX, y, { align: "center" });

  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Official POS Invoice", centerX, y, { align: "center" });

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 49, 58);
  pdf.text(transaction.or_number || transaction.id, centerX, y, { align: "center" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(97, 118, 129);
  pdf.text(formatDateTime(transaction.created_at), centerX, y, { align: "center" });

  y += 10;
  pdf.setDrawColor(214, 228, 235);
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFontSize(11);
  const infoRow = (label, value) => {
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, 20, y);
    pdf.setTextColor(30, 49, 58);
    pdf.setFont("helvetica", "bold");
    pdf.text(String(value ?? "—"), 190, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
  };
  infoRow("Pet owner", transaction.owner?.full_name || "—");
  infoRow("Pet", transaction.pet?.pet_name || "—");
  infoRow("Cashier", transaction.cashier?.full_name || "—");

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  invoiceLineItems(transaction).forEach((item) => {
    pdf.setTextColor(30, 49, 58);
    pdf.text(`${item.item_name} × ${item.quantity}`, 20, y);
    pdf.text(money(item.line_total), 190, y, { align: "right" });
    y += 7;
  });

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  infoRow("Total", money(transaction.total_amount));
  pdf.setFont("helvetica", "normal");
  infoRow("Amount paid", money(transaction.amount_paid));
  infoRow("Change", money(transaction.change_amount));

  const balance = remainingInvoiceBalance(transaction);
  if (balance > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(176, 98, 10);
    pdf.text("Remaining Balance", 20, y);
    pdf.text(money(balance), 190, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
  }

  infoRow("Method", transaction.payment_method);
  infoRow("Status", transaction.payment_status);

  pdf.save(`Invoice-${transaction.or_number || transaction.id}.pdf`);
}

/**
 * Client-generated notice for a single prescribed medicine that hasn't been
 * (fully) billed on any invoice -- either still outstanding at the clinic or
 * marked as being purchased elsewhere. Gives the pet owner and the
 * veterinarian a copy of the same fulfillment record staff sees, so the "buy
 * elsewhere" declaration isn't only visible inside the POS.
 */
export function downloadPrescriptionNoticePdf(prescription, meta = {}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const centerX = 105;
  let y = 22;

  const prescribed = Number(prescription.prescribed_quantity || 0);
  const purchased = Number(prescription.total_quantity_purchased || 0);
  const remaining = Math.max(0, prescribed - purchased);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(37, 80, 101);
  pdf.text("PawCruz Veterinary Clinic", centerX, y, { align: "center" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 135, 143);
  pdf.text("2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City", centerX, y, { align: "center" });

  y += 6;
  pdf.setFontSize(11);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Veterinarian Prescription / Purchase Notice", centerX, y, { align: "center" });

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 49, 58);
  pdf.text(prescription.item_name || "—", centerX, y, { align: "center" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(97, 118, 129);
  pdf.text(formatDateTime(prescription.updated_at || prescription.created_at), centerX, y, { align: "center" });

  y += 10;
  pdf.setDrawColor(214, 228, 235);
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  // Fixed label column measured from the two longest labels this function
  // ever prints, so no label can run into the value column -- and the
  // value wraps (growing the row's own height) instead of overlapping the
  // label or running past the page margin.
  const labelColWidth = Math.max(
    pdf.getTextWidth("Veterinarian Contact Number"),
    pdf.getTextWidth("Veterinary License Number")
  ) + 6;
  const valueColX = 20 + labelColWidth;
  const valueColWidth = 190 - valueColX;
  const rowLineHeight = 5.4;
  const infoRow = (label, value) => {
    // Label inherits whatever font is already set -- unchanged from before,
    // this is how "Remaining quantity" below renders its label in bold.
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, 20, y);
    pdf.setTextColor(30, 49, 58);
    pdf.setFont("helvetica", "bold");
    const lines = pdf.splitTextToSize(String(value ?? "—"), valueColWidth);
    pdf.text(lines, valueColX, y);
    pdf.setFont("helvetica", "normal");
    y += Math.max(1, lines.length) * rowLineHeight + 1.6;
  };
  infoRow("Pet owner", meta.ownerName || "—");
  infoRow("Pet", meta.petName || "—");
  infoRow("Prescribing Veterinarian", meta.veterinarianName || "—");
  infoRow("Veterinarian Contact Number", meta.veterinarianPhone || "N/A");
  infoRow("Veterinary License Number", meta.veterinarianLicense || "N/A");

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  infoRow("Prescribed quantity", prescribed);
  infoRow("Purchased quantity", purchased);
  pdf.setFont("helvetica", "bold");
  infoRow("Remaining quantity", remaining);
  pdf.setFont("helvetica", "normal");
  infoRow("Unit price", money(prescription.unit_price));
  infoRow("Status", prescription.fulfillment_status || "—");

  y += 3;
  pdf.line(20, y, 190, y);
  y += 9;

  pdf.setFontSize(10);
  pdf.setTextColor(97, 118, 129);
  const note = prescription.fulfillment_status === "Purchasing Elsewhere"
    ? "The pet owner has indicated this medicine will be purchased outside PawCruz Veterinary Clinic. It will not be billed by the clinic."
    : "This medicine remains available for pickup and payment at PawCruz Veterinary Clinic. It will be billed when purchased.";
  const wrapped = pdf.splitTextToSize(note, 170);
  pdf.text(wrapped, 20, y);

  pdf.save(`Veterinarian-Prescription-Notice-${(prescription.item_name || "medicine").replace(/[^a-z0-9]+/gi, "-")}-${String(prescription.id || "").slice(0, 8)}.pdf`);
}

/**
 * Client-generated prescription slip for a consultation -- the classic
 * pharmacy "Rx pad" layout, filled in with just the medicines a
 * veterinarian prescribed. Deliberately carries no price or purchase-status
 * info (that lives on the invoice and the fulfillment notice); this one is
 * meant to be kept or shown elsewhere as the prescription itself.
 */
function buildPrescriptionPadPdf(prescriptions, meta = {}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const left = 22;
  const right = 188;
  const centerX = 105;
  let y = 24;

  pdf.setDrawColor(180, 205, 217);
  pdf.setLineWidth(0.6);
  pdf.rect(14, 14, 182, 260);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(37, 80, 101);
  pdf.text("PawCruz Veterinary Clinic", centerX, y, { align: "center" });

  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 135, 143);
  pdf.text("2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City", centerX, y, { align: "center" });

  y += 5.5;
  pdf.setFontSize(10.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Veterinarian Prescription", centerX, y, { align: "center" });

  y += 9;
  pdf.setDrawColor(37, 80, 101);
  pdf.setLineWidth(0.5);
  pdf.line(left, y, right, y);
  y += 11;

  pdf.setFontSize(10.5);
  // "Veterinarian Contact Number" / "Veterinary License Number" are wider
  // than the 40mm default label column below fits -- measured once here so
  // those three rows get a column wide enough that the label never runs
  // into the value. Other rows keep the original, already-fine default.
  const vetLabelWidth = Math.max(
    pdf.getTextWidth("Veterinarian Contact Number"),
    pdf.getTextWidth("Veterinary License Number"),
    pdf.getTextWidth("Prescribing Veterinarian")
  ) + 4;
  const fieldRow = (label, value, labelWidth = 40) => {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, left, y);
    const valueX = left + labelWidth;
    const valueWidth = right - valueX;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 49, 58);
    // Wraps instead of overflowing the page edge; the row's own height
    // (and the divider under it) grows to match, so nothing is ever cut
    // through or overlapped by whatever comes next.
    const lines = pdf.splitTextToSize(String(value || "—"), valueWidth);
    pdf.text(lines, valueX, y);
    const extraLines = Math.max(0, lines.length - 1);
    const underlineY = y + 1.8 + extraLines * 5;
    pdf.setDrawColor(214, 228, 235);
    pdf.setLineWidth(0.3);
    pdf.line(valueX, underlineY, right, underlineY);
    y += 10 + extraLines * 5;
  };

  fieldRow("Prescribing Veterinarian", meta.veterinarianName || "—", vetLabelWidth);
  fieldRow("Veterinarian Contact Number", meta.veterinarianPhone || "N/A", vetLabelWidth);
  fieldRow("Veterinary License Number", meta.veterinarianLicense || "N/A", vetLabelWidth);
  fieldRow("Client / Pet Owner", meta.ownerName || "—");
  if (meta.ownerAddress) fieldRow("Address", meta.ownerAddress);
  fieldRow("Patient / Pet", [meta.petName, meta.petSpecies && meta.petBreed ? `(${meta.petSpecies} - ${meta.petBreed})` : meta.petSpecies].filter(Boolean).join(" "));
  fieldRow("Age", meta.petAge || "—", 22);
  fieldRow("Date", meta.date || formatDateTime(new Date().toISOString()), 22);

  y += 4;
  pdf.setDrawColor(214, 228, 235);
  pdf.line(left, y, right, y);
  y += 20;

  pdf.setFont("times", "bolditalic");
  pdf.setFontSize(34);
  pdf.setTextColor(37, 80, 101);
  pdf.text("Rx", left, y);

  const listX = left + 28;
  let listY = y - 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11.5);
  if (!prescriptions.length) {
    pdf.setTextColor(120, 135, 143);
    pdf.text("No medicine prescribed for this consultation.", listX, listY);
    listY += 9;
  } else {
    prescriptions.forEach((rx, index) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11.5);
      pdf.setTextColor(30, 49, 58);
      const qty = rx.prescribed_quantity != null ? `  —  Qty: ${rx.prescribed_quantity}` : "";
      pdf.text(`${index + 1}. ${rx.item_name}${qty}`, listX, listY);
      listY += 6;

      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      pdf.setTextColor(120, 135, 143);
      const sigLines = pdf.splitTextToSize(`Sig: ${rx.sig || "No directions for use recorded."}`, right - listX);
      pdf.text(sigLines, listX, listY);
      listY += sigLines.length * 4.5 + 5;
    });
  }

  y = Math.max(listY + 30, y + 60);
  const sigX = right - 75;
  pdf.setDrawColor(97, 118, 129);
  pdf.setLineWidth(0.4);
  pdf.line(sigX, y, right, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(30, 49, 58);
  pdf.text(meta.veterinarianName || "Attending Veterinarian", sigX, y);
  y += 4.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Attending Veterinarian", sigX, y);

  pdf.setFont("helvetica", "bolditalic");
  pdf.setFontSize(8.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text("KEEP OUT OF REACH OF CHILDREN AND OTHER PETS  •  FOR VETERINARY USE ONLY", centerX, 268, { align: "center" });

  return pdf;
}

function prescriptionPadFileName(meta) {
  return `Veterinarian-Prescription-${(meta.petName || "patient").replace(/[^a-z0-9]+/gi, "-")}-${String(meta.date || Date.now()).replace(/[^a-z0-9]+/gi, "-")}.pdf`;
}

/** Saves the prescription slip to disk -- for staff and veterinarian use. */
export function downloadPrescriptionPadPdf(prescriptions, meta = {}) {
  buildPrescriptionPadPdf(prescriptions, meta).save(prescriptionPadFileName(meta));
}

/** Opens the prescription slip in a new tab for on-screen viewing, without forcing a download -- for pet owners. */
export function viewPrescriptionPadPdf(prescriptions, meta = {}) {
  const pdf = buildPrescriptionPadPdf(prescriptions, meta);
  window.open(pdf.output("bloburl"), "_blank");
}

async function loadImageDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function naText(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text || "N/A";
}

// Uploaded pet/owner photos can be JPEG or PNG (unlike the app's own fixed
// logo asset) -- jsPDF needs the right format passed to addImage or the
// image silently fails to render, so this reads it straight off the data
// URL's MIME type instead of assuming one.
function imageFormatFromDataUrl(dataUrl) {
  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(dataUrl || "");
  const type = (match?.[1] || "png").toLowerCase();
  if (type === "jpg" || type === "jpeg") return "JPEG";
  if (type === "webp") return "WEBP";
  return "PNG";
}

/**
 * Client-generated, print-ready copy of ONE finalized medical consultation
 * -- the "Print Medical Record" action inside Animal Patients. Never
 * includes any other consultation from the pet's history, and never writes
 * anything back to Supabase; it only reads the record/pet data already
 * loaded on screen and lays it out as a PDF opened in a new tab, where the
 * browser's own viewer offers Print / Save as PDF / page navigation.
 *
 * Layout: an ID-card-style masthead puts the pet's own photo beside the
 * clinic name (the first visual element on the page, ahead of the record
 * metadata strip above it), and every field below is laid out as a
 * label-above/value-below grid for a consistent, scannable clinical-report
 * look. The owner's section is text-only -- no photo -- by design.
 */
export async function printMedicalRecordDocument(record, pet, meta = {}) {
  if (!record || !pet || record.pet_id !== pet.id) {
    throw new Error("This consultation does not belong to the selected animal patient.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageHeight = 297;
  const left = 20;
  const right = 190;
  const bottomLimit = 277;
  let y = 20;

  // Brand palette -- teal/blue for identity + emphasis, slate for labels,
  // near-black for values, light blue-gray for hairline dividers, and a
  // muted gray reserved for empty ("N/A") values so a sparse record still
  // reads as intentional rather than broken.
  const BRAND = [37, 80, 101];
  const BRAND_LIGHT = [97, 118, 129];
  const TEXT_DARK = [30, 49, 58];
  const MUTED = [140, 152, 159];
  const DIVIDER = [214, 228, 235];
  const SECTION_DIVIDER = [225, 235, 240];

  const [logoDataUrl, petPhotoDataUrl] = await Promise.all([
    loadImageDataUrl(pawLogo),
    pet.photo_url ? loadImageDataUrl(pet.photo_url) : Promise.resolve(null),
  ]);

  function isEmptyValue(value) {
    return naText(value) === "N/A";
  }

  // Draws one photo (or a clearly-labeled placeholder if there isn't one)
  // at a fixed position/size. Deliberately high-contrast when there's no
  // photo (filled gray, dark border, bold label) -- this must never be
  // mistaken for "nothing rendered here" the way a faint hairline box could.
  function drawPhotoBox(x, photoY, size, dataUrl, fallbackLabel) {
    let drew = false;
    if (dataUrl) {
      try {
        pdf.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), x, photoY, size, size);
        drew = true;
      } catch {
        // A photo that fails to decode just falls back to the placeholder
        // box below -- never worth failing the whole printout over.
      }
    }
    if (drew) {
      pdf.setDrawColor(180, 205, 217);
      pdf.setLineWidth(0.4);
      pdf.rect(x, photoY, size, size);
    } else {
      pdf.setFillColor(230, 236, 240);
      pdf.setDrawColor(150, 170, 180);
      pdf.setLineWidth(0.5);
      pdf.rect(x, photoY, size, size, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(110, 130, 140);
      pdf.text(fallbackLabel, x + size / 2, photoY + size / 2, { align: "center", baseline: "middle" });
    }
    return photoY + size;
  }

  function ensureSpace(height = 8) {
    if (y + height > bottomLimit) {
      pdf.addPage();
      y = 20;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...BRAND_LIGHT);
      pdf.text("PawCruz Veterinary Clinic — Medical Record (continued)", left, y);
      pdf.setDrawColor(...DIVIDER);
      pdf.setLineWidth(0.3);
      pdf.line(left, y + 2.5, right, y + 2.5);
      y += 12;
    }
  }

  // Consistent section divider, with extra breathing room above and below
  // the heading so sections never feel cramped against each other.
  function sectionTitle(text) {
    ensureSpace(16);
    y += 3;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.setTextColor(...BRAND);
    pdf.text(text.toUpperCase(), left, y);
    y += 2.6;
    pdf.setDrawColor(...SECTION_DIVIDER);
    pdf.setLineWidth(0.3);
    pdf.line(left, y, right, y);
    y += 7.5;
  }

  // The shared label-above/value-below "grid cell", laid out N per row so
  // short related fields (e.g. Sex + Date of Birth) line up side by side
  // instead of each eating a full-width row. Empty values render in a
  // subtly lighter, italic gray instead of the same bold ink as real data.
  function fieldGrid(pairs, cols = 2) {
    const gap = 10;
    const colWidth = (right - left - gap * (cols - 1)) / cols;
    let i = 0;
    while (i < pairs.length) {
      const row = pairs.slice(i, i + cols);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const cellLines = row.map(([, value]) => pdf.splitTextToSize(naText(value), colWidth));
      const maxLines = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = 5 + maxLines * 4.6 + 6;
      ensureSpace(rowHeight);
      row.forEach(([label, value], idx) => {
        const x = left + idx * (colWidth + gap);
        const empty = isEmptyValue(value);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(...BRAND_LIGHT);
        pdf.text(label.toUpperCase(), x, y);
        pdf.setFont("helvetica", empty ? "italic" : "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(...(empty ? MUTED : TEXT_DARK));
        pdf.text(cellLines[idx], x, y + 5);
      });
      y += rowHeight;
      i += cols;
    }
  }

  function paragraph(label, value) {
    ensureSpace(15);
    const empty = isEmptyValue(value);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND_LIGHT);
    pdf.text(label.toUpperCase(), left, y);
    y += 5;
    const lines = pdf.splitTextToSize(naText(value), right - left);
    ensureSpace(lines.length * 5 + 7);
    pdf.setFont("helvetica", empty ? "italic" : "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...(empty ? MUTED : TEXT_DARK));
    pdf.text(lines, left, y);
    y += lines.length * 5 + 8;
  }

  // --- Masthead: the pet's own photo beside the clinic name/logo, ID-card
  // style, sitting at the very top of the page so the pet's photo is the
  // first thing the reader sees -- ahead of even the record number. ---
  const photoSize = 26;
  const photoTop = y;
  drawPhotoBox(left, photoTop, photoSize, petPhotoDataUrl, "No Photo");

  const textX = left + photoSize + 8;
  let ty = photoTop + 7;
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", textX, ty - 9, 12, 12);
    } catch {
      // A logo that fails to decode just means a text-only header below --
      // never worth failing the whole printout over.
    }
  }
  const nameX = logoDataUrl ? textX + 15 : textX;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...BRAND);
  pdf.text("PawCruz Veterinary Clinic", nameX, ty);
  ty += 6.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...BRAND_LIGHT);
  pdf.text("Official Medical Record / Consultation Summary", nameX, ty);
  ty += 5.5;
  pdf.setFontSize(8.5);
  pdf.setTextColor(120, 135, 143);
  pdf.text("2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City", nameX, ty);

  y = Math.max(photoTop + photoSize, ty + 3) + 8;
  pdf.setDrawColor(...DIVIDER);
  pdf.setLineWidth(0.4);
  pdf.line(left, y, right, y);
  y += 9;

  // --- Record metadata strip: Medical Record No. + status badge, sitting
  // neatly below the masthead. ---
  const recordNo = `MR-${String(record.id || "").slice(0, 8).toUpperCase()}`;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...TEXT_DARK);
  pdf.text(`Medical Record No: ${recordNo}`, left, y);

  const isFinalized = record.record_status === "Finalized";
  const statusLabel = isFinalized ? "FINALIZED" : (record.record_status || "DRAFT").toUpperCase();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  const badgeWidth = pdf.getTextWidth(statusLabel) + 10;
  const [badgeFillR, badgeFillG, badgeFillB] = isFinalized ? [222, 241, 245] : [236, 239, 241];
  const [badgeTextR, badgeTextG, badgeTextB] = isFinalized ? [16, 94, 116] : [108, 122, 131];
  pdf.setFillColor(badgeFillR, badgeFillG, badgeFillB);
  pdf.roundedRect(right - badgeWidth, y - 4.6, badgeWidth, 7, 1.4, 1.4, "F");
  pdf.setTextColor(badgeTextR, badgeTextG, badgeTextB);
  pdf.text(statusLabel, right - badgeWidth / 2, y, { align: "center" });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...BRAND_LIGHT);
  const dtLabel = "Consultation Date & Time:";
  pdf.text(dtLabel, left, y);
  const dtLabelWidth = pdf.getTextWidth(dtLabel);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...TEXT_DARK);
  pdf.text(naText(meta.visitDateTime), left + dtLabelWidth + 4, y);
  y += 8;

  pdf.setDrawColor(...DIVIDER);
  pdf.setLineWidth(0.3);
  pdf.line(left, y, right, y);
  y += 10;

  sectionTitle("Animal Patient Information");
  fieldGrid(
    [
      ["Pet Name", pet.pet_name],
      ["Species / Breed", [pet.species, pet.breed].filter(Boolean).join(" / ")],
      ["Sex", pet.sex],
      ["Date of Birth / Age", [pet.date_of_birth ? formatDateLong(pet.date_of_birth) : "", meta.petAge].filter(Boolean).join(" · ")],
      ["Weight on File (kg)", pet.weight],
      ["Color / Markings", pet.color],
      ["Microchip Number", pet.microchip_number],
    ],
    2
  );

  // Owner section is text-only by design -- no photo placeholder here.
  sectionTitle("Pet Owner Information");
  fieldGrid(
    [
      ["Full Name", pet.owner?.full_name],
      ["Contact Number", pet.owner?.phone],
      ["Email", pet.owner?.email],
      ["Address", pet.owner?.address],
    ],
    2
  );

  sectionTitle("Attending Veterinarian");
  fieldGrid(
    [
      ["Attending Veterinarian", meta.veterinarianName ? `Dr. ${meta.veterinarianName}` : ""],
      ["Veterinarian Contact Number", meta.veterinarianPhone],
    ],
    2
  );

  sectionTitle("Chief Complaint & Symptoms");
  paragraph("Chief Complaint", record.chief_complaint);
  paragraph("Symptoms", record.symptoms);

  sectionTitle("Vital Signs");
  fieldGrid(
    [
      ["Vital Signs", record.vital_signs],
      ["Weight (kg)", record.weight],
      ["Temperature (°C)", record.temperature],
    ],
    3
  );

  sectionTitle("Diagnosis");
  paragraph("Diagnosis", record.diagnosis);

  sectionTitle("Treatment");
  paragraph("Treatment", record.treatment);
  paragraph("Treatment Plan", record.treatment_plan);

  sectionTitle("Medications");
  fieldGrid(
    [
      ["Medication", record.medication],
      ["Dosage", record.dosage],
      ["Frequency", record.frequency],
      ["Duration", record.duration],
    ],
    2
  );

  sectionTitle("Laboratory");
  paragraph("Laboratory Request", record.laboratory_request);
  paragraph("Laboratory Result", record.laboratory_result);

  if (record.vaccination) {
    sectionTitle("Vaccination Details");
    paragraph("Vaccination", record.vaccination);
  }

  const services = (record.template_data?.inventoryItems || []).filter((item) => !item.isNA);
  sectionTitle("Services, Tests & Prescribed Medicines");
  if (!services.length) {
    ensureSpace(8);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...MUTED);
    pdf.text("N/A", left, y);
    y += 8;
  } else {
    ensureSpace(7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...BRAND_LIGHT);
    pdf.text("ITEM", left, y);
    pdf.text("CATEGORY", left + 85, y);
    pdf.text("QTY", right, y, { align: "right" });
    y += 2;
    pdf.setDrawColor(...SECTION_DIVIDER);
    pdf.setLineWidth(0.2);
    pdf.line(left, y, right, y);
    y += 5;
    services.forEach((item) => {
      ensureSpace(6.5);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...TEXT_DARK);
      pdf.text(String(item.item_name || "N/A"), left, y);
      pdf.text(String(item.category || "N/A"), left + 85, y);
      pdf.text(String(item.quantity ?? 1), right, y, { align: "right" });
      y += 6;
    });
    y += 3;
  }

  sectionTitle("Veterinarian Notes");
  paragraph("Notes", record.veterinarian_notes);

  sectionTitle("Follow-up");
  fieldGrid([["Follow-up Date", record.follow_up_date ? formatDateLong(record.follow_up_date) : ""]], 1);

  sectionTitle("Consultation Status");
  fieldGrid([["Status", record.record_status === "Finalized" ? "Finalized / Completed" : record.record_status]], 1);

  ensureSpace(30);
  y += 9;
  const sigX = right - 75;
  pdf.setDrawColor(...BRAND_LIGHT);
  pdf.setLineWidth(0.4);
  pdf.line(sigX, y, right, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...TEXT_DARK);
  pdf.text(meta.veterinarianName ? `Dr. ${meta.veterinarianName}` : "N/A", sigX, y);
  y += 4.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...BRAND_LIGHT);
  pdf.text("Attending Veterinarian — Signature over Printed Name", sigX, y);

  const printedAt = formatDateTime(new Date());
  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(...DIVIDER);
    pdf.setLineWidth(0.3);
    pdf.line(left, pageHeight - 14, right, pageHeight - 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...BRAND_LIGHT);
    pdf.text(`Printed: ${printedAt}`, left, pageHeight - 9);
    pdf.text(`Page ${page} of ${totalPages}`, right, pageHeight - 9, { align: "right" });
  }

  window.open(pdf.output("bloburl"), "_blank");
}
