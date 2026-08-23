import jsPDF from "jspdf";
import { formatDateTime12h } from "./timeFormat";

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

  y += 7;
  pdf.setFont("helvetica", "normal");
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
  infoRow("Pet owner", meta.ownerName || "—");
  infoRow("Pet", meta.petName || "—");
  infoRow("Veterinarian", meta.veterinarianName || "—");

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

  y += 6.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text("Veterinarian Prescription", centerX, y, { align: "center" });

  y += 9;
  pdf.setDrawColor(37, 80, 101);
  pdf.setLineWidth(0.5);
  pdf.line(left, y, right, y);
  y += 11;

  pdf.setFontSize(10.5);
  const fieldRow = (label, value, labelWidth = 40) => {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(97, 118, 129);
    pdf.text(label, left, y);
    const valueX = left + labelWidth;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 49, 58);
    pdf.text(String(value || "—"), valueX, y);
    pdf.setDrawColor(214, 228, 235);
    pdf.setLineWidth(0.3);
    pdf.line(valueX, y + 1.8, right, y + 1.8);
    y += 10;
  };

  fieldRow("Prescriber", meta.veterinarianName || "—");
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
