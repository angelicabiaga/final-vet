import jsPDF from "jspdf";
import { formatDateTime12h } from "./timeFormat";
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
      pdf.setTextColor(30, 49, 58);
      const qty = rx.prescribed_quantity != null ? `  —  Qty: ${rx.prescribed_quantity}` : "";
      pdf.text(`${index + 1}. ${rx.item_name}${qty}`, listX, listY);
      listY += 9;
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

/**
 * Client-generated, print-ready copy of ONE finalized medical consultation
 * -- the "Print Medical Record" action inside Animal Patients. Never
 * includes any other consultation from the pet's history, and never writes
 * anything back to Supabase; it only reads the record/pet data already
 * loaded on screen and lays it out as a PDF opened in a new tab, where the
 * browser's own viewer offers Print / Save as PDF / page navigation.
 */
export async function printMedicalRecordDocument(record, pet, meta = {}) {
  if (!record || !pet || record.pet_id !== pet.id) {
    throw new Error("This consultation does not belong to the selected animal patient.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageHeight = 297;
  const left = 20;
  const right = 190;
  const centerX = 105;
  const bottomLimit = 277;
  let y = 20;

  const logoDataUrl = await loadImageDataUrl(pawLogo);

  function drawLetterhead() {
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, "PNG", left, y - 9, 15, 15);
      } catch {
        // A logo that fails to decode just means a text-only header below --
        // never worth failing the whole printout over.
      }
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(37, 80, 101);
    pdf.text("PawCruz Veterinary Clinic", centerX, y, { align: "center" });
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(97, 118, 129);
    pdf.text("Official Medical Record / Consultation Summary", centerX, y, { align: "center" });
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(120, 135, 143);
    pdf.text("2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City", centerX, y, { align: "center" });
    y += 6;
    pdf.setDrawColor(214, 228, 235);
    pdf.setLineWidth(0.4);
    pdf.line(left, y, right, y);
    y += 9;
  }

  function ensureSpace(height = 8) {
    if (y + height > bottomLimit) {
      pdf.addPage();
      y = 20;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(97, 118, 129);
      pdf.text("PawCruz Veterinary Clinic — Medical Record (continued)", left, y);
      pdf.setDrawColor(214, 228, 235);
      pdf.setLineWidth(0.3);
      pdf.line(left, y + 2.5, right, y + 2.5);
      y += 11;
    }
  }

  function sectionTitle(text) {
    ensureSpace(11);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.setTextColor(37, 80, 101);
    pdf.text(text, left, y);
    pdf.setDrawColor(230, 238, 243);
    pdf.setLineWidth(0.2);
    pdf.line(left, y + 1.8, right, y + 1.8);
    y += 7.5;
  }

  function fieldRow(label, value) {
    ensureSpace(7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, left, y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 49, 58);
    const lines = pdf.splitTextToSize(naText(value), right - left - 55);
    pdf.text(lines, left + 55, y);
    y += Math.max(6.5, lines.length * 5);
  }

  function paragraph(label, value) {
    ensureSpace(12);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, left, y);
    y += 5;
    const lines = pdf.splitTextToSize(naText(value), right - left);
    ensureSpace(lines.length * 5 + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(30, 49, 58);
    pdf.text(lines, left, y);
    y += lines.length * 5 + 5;
  }

  drawLetterhead();

  const recordNo = `MR-${String(record.id || "").slice(0, 8).toUpperCase()}`;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(30, 49, 58);
  pdf.text(`Medical Record No: ${recordNo}`, left, y);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  const statusLabel = record.record_status === "Finalized" ? "FINALIZED" : (record.record_status || "DRAFT").toUpperCase();
  const badgeWidth = pdf.getTextWidth(statusLabel) + 8;
  pdf.setFillColor(230, 247, 238);
  pdf.rect(right - badgeWidth, y - 4.5, badgeWidth, 6.5, "F");
  pdf.setTextColor(31, 133, 80);
  pdf.text(statusLabel, right - badgeWidth / 2, y, { align: "center" });
  y += 9;

  fieldRow("Consultation Date & Time", meta.visitDateTime);

  sectionTitle("Animal Patient Information");
  fieldRow("Pet Name", pet.pet_name);
  fieldRow("Species / Breed", [pet.species, pet.breed].filter(Boolean).join(" / "));
  fieldRow("Sex", pet.sex);
  fieldRow("Date of Birth / Age", [pet.date_of_birth, meta.petAge].filter(Boolean).join(" · "));
  fieldRow("Weight on File (kg)", pet.weight);
  fieldRow("Color / Markings", pet.color);
  fieldRow("Microchip Number", pet.microchip_number);

  sectionTitle("Pet Owner Information");
  fieldRow("Full Name", pet.owner?.full_name);
  fieldRow("Contact Number", pet.owner?.phone);
  fieldRow("Email", pet.owner?.email);
  fieldRow("Address", pet.owner?.address);

  sectionTitle("Attending Veterinarian");
  fieldRow("Attending Veterinarian", meta.veterinarianName ? `Dr. ${meta.veterinarianName}` : "");
  fieldRow("Veterinarian Contact Number", meta.veterinarianPhone || "N/A");

  sectionTitle("Chief Complaint & Symptoms");
  paragraph("Chief Complaint", record.chief_complaint);
  paragraph("Symptoms", record.symptoms);

  sectionTitle("Vital Signs");
  fieldRow("Vital Signs", record.vital_signs);
  fieldRow("Weight (kg)", record.weight);
  fieldRow("Temperature (°C)", record.temperature);

  sectionTitle("Diagnosis");
  paragraph("Diagnosis", record.diagnosis);

  sectionTitle("Treatment");
  paragraph("Treatment", record.treatment);
  paragraph("Treatment Plan", record.treatment_plan);

  sectionTitle("Medications");
  fieldRow("Medication", record.medication);
  fieldRow("Dosage", record.dosage);
  fieldRow("Frequency", record.frequency);
  fieldRow("Duration", record.duration);

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
    ensureSpace(7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(120, 135, 143);
    pdf.text("N/A", left, y);
    y += 7;
  } else {
    ensureSpace(7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(97, 118, 129);
    pdf.text("Item", left, y);
    pdf.text("Category", left + 85, y);
    pdf.text("Qty", right, y, { align: "right" });
    y += 2;
    pdf.setDrawColor(230, 238, 243);
    pdf.setLineWidth(0.2);
    pdf.line(left, y, right, y);
    y += 5;
    services.forEach((item) => {
      ensureSpace(6.5);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(30, 49, 58);
      pdf.text(String(item.item_name || "N/A"), left, y);
      pdf.text(String(item.category || "N/A"), left + 85, y);
      pdf.text(String(item.quantity ?? 1), right, y, { align: "right" });
      y += 6;
    });
    y += 2;
  }

  sectionTitle("Veterinarian Notes");
  paragraph("Notes", record.veterinarian_notes);

  sectionTitle("Follow-up");
  fieldRow("Follow-up Date", record.follow_up_date);

  sectionTitle("Consultation Status");
  fieldRow("Status", record.record_status === "Finalized" ? "Finalized / Completed" : record.record_status);

  ensureSpace(28);
  y += 8;
  const sigX = right - 75;
  pdf.setDrawColor(97, 118, 129);
  pdf.setLineWidth(0.4);
  pdf.line(sigX, y, right, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(30, 49, 58);
  pdf.text(meta.veterinarianName ? `Dr. ${meta.veterinarianName}` : "N/A", sigX, y);
  y += 4.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Attending Veterinarian — Signature over Printed Name", sigX, y);

  const printedAt = formatDateTime(new Date());
  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(214, 228, 235);
    pdf.setLineWidth(0.3);
    pdf.line(left, pageHeight - 14, right, pageHeight - 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(97, 118, 129);
    pdf.text(`Printed: ${printedAt}`, left, pageHeight - 9);
    pdf.text(`Page ${page} of ${totalPages}`, right, pageHeight - 9, { align: "right" });
  }

  window.open(pdf.output("bloburl"), "_blank");
}
