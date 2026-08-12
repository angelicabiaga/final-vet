import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BrainCircuit,
  FileDown,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import jsPDF from "jspdf";

import {
  getPets,
} from "../services/petService";

import {
  generatePredictiveHealthAnalysis,
  getActiveVeterinarians,
  getAppointmentsForPet,
  getMedicalRecords,
  saveMedicalRecord,
  uploadMedicalAttachment,
} from "../services/medicalRecordService";

const blank = {
  id: "",
  petId: "",
  ownerId: "",
  veterinarianId: "",
  appointmentId: "",
  consultationDate:
    new Date()
      .toISOString()
      .slice(0, 10),
  chiefComplaint: "",
  symptoms: "",
  vitalSigns: "",
  weight: "",
  temperature: "",
  diagnosis: "",
  treatment: "",
  treatmentPlan: "",
  medication: "",
  dosage: "",
  frequency: "",
  duration: "",
  laboratoryRequest: "",
  laboratoryResult: "",
  vaccination: "",
  followUpDate: "",
  veterinarianNotes: "",
  attachmentUrl: "",
  recordStatus: "Draft",
};

function cleanAiText(text) {
  if (!text) return "";

  return String(text)
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(
      /^\s*[-•]\s+/gm,
      ""
    )
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pdfSafeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(
      /\u2018|\u2019/g,
      "'"
    )
    .replace(
      /\u201C|\u201D/g,
      '"'
    )
    .replace(
      /\u2013|\u2014/g,
      "-"
    )
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

export default function MedicalRecordsModule({
  profile,
}) {
  const [
    records,
    setRecords,
  ] = useState([]);

  const [
    pets,
    setPets,
  ] = useState([]);

  const [
    vets,
    setVets,
  ] = useState([]);

  const [
    appointments,
    setAppointments,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState(blank);

  const [
    show,
    setShow,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    status,
    setStatus,
  ] = useState("");

  const [
    aiModal,
    setAiModal,
  ] = useState(false);

  const [
    aiRecord,
    setAiRecord,
  ] = useState(null);

  const [
    aiText,
    setAiText,
  ] = useState("");

  const [
    aiLoading,
    setAiLoading,
  ] = useState(false);

  const [
    aiError,
    setAiError,
  ] = useState("");

  const canEdit = [
    "admin",
    "staff",
    "veterinarian",
  ].includes(
    profile?.role
  );

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [
        recordRows,
        petRows,
        vetRows,
      ] = await Promise.all([
        getMedicalRecords(
          profile,
          { status }
        ),

        getPets({
          includeArchived:
            true,
        }),

        getActiveVeterinarians(),
      ]);

      setRecords(
        recordRows
      );

      setPets(
        profile.role ===
          "pet_owner"
          ? petRows.filter(
              (pet) =>
                pet.owner_id ===
                profile.id
            )
          : petRows
      );

      setVets(
        vetRows
      );
    } catch (e) {
      setError(
        e.message
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  const shown = useMemo(() => {
    const value =
      search.toLowerCase();

    return records.filter(
      (record) =>
        !value ||
        [
          record.pet
            ?.pet_name,
          record.owner
            ?.full_name,
          record.diagnosis,
          record.chief_complaint,
        ].some((field) =>
          String(
            field || ""
          )
            .toLowerCase()
            .includes(
              value
            )
        )
    );
  }, [
    records,
    search,
  ]);

  async function choosePet(
    id
  ) {
    const pet =
      pets.find(
        (item) =>
          item.id === id
      );

    setForm((current) => ({
      ...current,
      petId: id,
      ownerId:
        pet?.owner_id ||
        "",
      appointmentId: "",
    }));

    try {
      setAppointments(
        await getAppointmentsForPet(
          id
        )
      );
    } catch {
      setAppointments([]);
    }
  }

  function edit(record) {
    setForm({
      id: record.id,
      petId:
        record.pet_id,
      ownerId:
        record.owner_id,
      veterinarianId:
        record.veterinarian_id,
      appointmentId:
        record.appointment_id ||
        "",
      consultationDate:
        record.consultation_date ||
        "",
      chiefComplaint:
        record.chief_complaint ||
        "",
      symptoms:
        record.symptoms ||
        "",
      vitalSigns:
        record.vital_signs ||
        "",
      weight:
        record.weight || "",
      temperature:
        record.temperature ||
        "",
      diagnosis:
        record.diagnosis ||
        "",
      treatment:
        record.treatment ||
        "",
      treatmentPlan:
        record.treatment_plan ||
        "",
      medication:
        record.medication ||
        "",
      dosage:
        record.dosage ||
        "",
      frequency:
        record.frequency ||
        "",
      duration:
        record.duration ||
        "",
      laboratoryRequest:
        record.laboratory_request ||
        "",
      laboratoryResult:
        record.laboratory_result ||
        "",
      vaccination:
        record.vaccination ||
        "",
      followUpDate:
        record.follow_up_date ||
        "",
      veterinarianNotes:
        record.veterinarian_notes ||
        "",
      attachmentUrl:
        record.attachment_url ||
        "",
      recordStatus:
        record.record_status ||
        "Draft",
    });

    getAppointmentsForPet(
      record.pet_id
    )
      .then(
        setAppointments
      )
      .catch(() =>
        setAppointments([])
      );

    setShow(true);
  }

  async function submit(
    event
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      await saveMedicalRecord(
        form,
        profile
      );

      setSuccess(
        "Medical record saved successfully."
      );

      setShow(false);
      setForm(blank);

      await load();
    } catch (e) {
      setError(
        e.message
      );
    } finally {
      setSaving(false);
    }
  }

  async function fileChange(
    event
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    setSaving(true);

    try {
      const url =
        await uploadMedicalAttachment(
          file,
          profile.id
        );

      setForm(
        (current) => ({
          ...current,
          attachmentUrl:
            url,
        })
      );
    } catch (e) {
      setError(
        e.message
      );
    } finally {
      setSaving(false);
    }
  }

  function printRecord(
    record
  ) {
    const windowRef =
      window.open(
        "",
        "_blank"
      );

    if (!windowRef) {
      return;
    }

    windowRef.document.write(`
      <html>
      <head>
        <title>Medical Record</title>
        <style>
          body {
            font-family: Georgia, "Times New Roman", serif;
            padding: 32px;
            color: #20313b;
          }

          h1 {
            color: #318fbe;
            margin-bottom: 4px;
          }

          h2 {
            margin-top: 0;
          }

          .row {
            margin: 10px 0;
          }

          .label {
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <h1>Cruz Veterinary Clinic</h1>

        <h2>
          Electronic Pet Medical Record
        </h2>

        <div class="row">
          <span class="label">
            Pet:
          </span>
          ${
            record.pet
              ?.pet_name ||
            ""
          }
        </div>

        <div class="row">
          <span class="label">
            Owner:
          </span>
          ${
            record.owner
              ?.full_name ||
            ""
          }
        </div>

        <div class="row">
          <span class="label">
            Veterinarian:
          </span>
          ${
            record
              .veterinarian
              ?.full_name ||
            ""
          }
        </div>

        <div class="row">
          <span class="label">
            Date:
          </span>
          ${
            record.consultation_date ||
            ""
          }
        </div>

        <div class="row">
          <span class="label">
            Complaint:
          </span>
          ${
            record.chief_complaint ||
            "—"
          }
        </div>

        <div class="row">
          <span class="label">
            Diagnosis:
          </span>
          ${
            record.diagnosis ||
            "—"
          }
        </div>

        <div class="row">
          <span class="label">
            Treatment:
          </span>
          ${
            record.treatment ||
            "—"
          }
        </div>

        <div class="row">
          <span class="label">
            Medication:
          </span>
          ${
            record.medication ||
            "—"
          }
          ${
            record.dosage ||
            ""
          }
          ${
            record.frequency ||
            ""
          }
        </div>

        <div class="row">
          <span class="label">
            Follow-up:
          </span>
          ${
            record.follow_up_date ||
            "—"
          }
        </div>
      </body>
      </html>
    `);

    windowRef.document.close();

    windowRef.print();
  }

  async function openPredictiveAnalysis(
    record
  ) {
    setAiRecord(
      record
    );

    setAiModal(true);
    setAiText("");
    setAiError("");
    setAiLoading(true);

    try {
      const result =
        await generatePredictiveHealthAnalysis(
          record
        );

      setAiText(
        cleanAiText(
          result
        )
      );
    } catch (e) {
      setAiError(
        e.message
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function regeneratePredictiveAnalysis() {
    if (!aiRecord) {
      return;
    }

    setAiText("");
    setAiError("");
    setAiLoading(true);

    try {
      const result =
        await generatePredictiveHealthAnalysis(
          aiRecord
        );

      setAiText(
        cleanAiText(
          result
        )
      );
    } catch (e) {
      setAiError(
        e.message
      );
    } finally {
      setAiLoading(false);
    }
  }

  function downloadPredictivePdf() {
    if (
      !aiRecord ||
      !aiText
    ) {
      setAiError(
        "Generate the AI predictive health analysis before downloading the PDF."
      );

      return;
    }

    try {
      const pdf =
        new jsPDF({
          orientation:
            "portrait",
          unit: "mm",
          format: "a4",
          compress: true,
        });

      const pageWidth =
        pdf.internal
          .pageSize
          .getWidth();

      const pageHeight =
        pdf.internal
          .pageSize
          .getHeight();

      const left = 20;
      const right = 20;
      const top = 20;
      const bottom = 20;

      const width =
        pageWidth -
        left -
        right;

      const PRIMARY = [
        62,
        143,
        190,
      ];

      const DARK = [
        35,
        50,
        58,
      ];

      const MUTED = [
        100,
        112,
        118,
      ];

      const LINE = [
        214,
        228,
        235,
      ];

      const LIGHT = [
        242,
        249,
        252,
      ];

      let y = top;

      const headings = [
        "CLINICAL RECORD SUMMARY",
        "OBSERVED HEALTH PATTERNS",
        "POTENTIAL HEALTH RISKS TO MONITOR",
        "FOLLOW-UP CONSIDERATIONS",
        "SUGGESTED CLINICAL ACTIONS",
      ];

      function setBody() {
        pdf.setFont(
          "times",
          "normal"
        );

        pdf.setFontSize(
          10.5
        );

        pdf.setCharSpace(0);

        pdf.setTextColor(
          ...DARK
        );
      }

      function footer() {
        const page =
          pdf.internal
            .getCurrentPageInfo()
            .pageNumber;

        pdf.setDrawColor(
          ...LINE
        );

        pdf.line(
          left,
          pageHeight - 14,
          pageWidth - right,
          pageHeight - 14
        );

        pdf.setFont(
          "times",
          "normal"
        );

        pdf.setFontSize(8);

        pdf.setCharSpace(0);

        pdf.setTextColor(
          ...MUTED
        );

        pdf.text(
          "PawCruz Predictive Health Analysis",
          left,
          pageHeight - 9
        );

        pdf.text(
          `Page ${page}`,
          pageWidth - right,
          pageHeight - 9,
          {
            align:
              "right",
          }
        );
      }

      function pageHeader() {
        pdf.setFillColor(
          ...PRIMARY
        );

        pdf.rect(
          0,
          0,
          pageWidth,
          7,
          "F"
        );

        pdf.setFont(
          "times",
          "bold"
        );

        pdf.setFontSize(9);

        pdf.setTextColor(
          ...MUTED
        );

        pdf.text(
          "PAWCRUZ VETERINARY MANAGEMENT SYSTEM",
          left,
          14
        );

        pdf.setDrawColor(
          ...LINE
        );

        pdf.line(
          left,
          17,
          pageWidth -
            right,
          17
        );
      }

      function newPage() {
        footer();

        pdf.addPage();

        pageHeader();

        y = 27;

        setBody();
      }

      function ensure(
        amount
      ) {
        if (
          y + amount >
          pageHeight -
            bottom
        ) {
          newPage();
        }
      }

      function paragraph(
        value,
        {
          size = 10.5,
          style = "normal",
          lineHeight = 5.4,
          after = 4,
        } = {}
      ) {
        const text =
          pdfSafeText(
            value
          );

        if (!text) {
          y += after;

          return;
        }

        pdf.setFont(
          "times",
          style
        );

        pdf.setFontSize(
          size
        );

        pdf.setCharSpace(0);

        pdf.setTextColor(
          ...DARK
        );

        const lines =
          pdf.splitTextToSize(
            text,
            width
          );

        lines.forEach(
          (line) => {
            ensure(
              lineHeight +
                1
            );

            pdf.setCharSpace(
              0
            );

            pdf.text(
              pdfSafeText(
                line
              ),
              left,
              y
            );

            y +=
              lineHeight;
          }
        );

        y += after;
      }

      function section(
        heading
      ) {
        ensure(18);

        y += 3;

        pdf.setFillColor(
          ...LIGHT
        );

        pdf.roundedRect(
          left,
          y - 5,
          width,
          11,
          2,
          2,
          "F"
        );

        pdf.setFillColor(
          ...PRIMARY
        );

        pdf.rect(
          left,
          y - 5,
          2.5,
          11,
          "F"
        );

        pdf.setFont(
          "times",
          "bold"
        );

        pdf.setFontSize(
          10.5
        );

        pdf.setTextColor(
          ...DARK
        );

        pdf.setCharSpace(0);

        pdf.text(
          heading,
          left + 6,
          y + 1.8
        );

        y += 12;

        setBody();
      }

      function numbered(
        number,
        value
      ) {
        ensure(10);

        const text =
          pdfSafeText(
            value
          );

        pdf.setFillColor(
          ...PRIMARY
        );

        pdf.circle(
          left + 2.5,
          y - 1,
          2.5,
          "F"
        );

        pdf.setFont(
          "times",
          "bold"
        );

        pdf.setFontSize(
          8
        );

        pdf.setTextColor(
          255,
          255,
          255
        );

        pdf.text(
          String(number),
          left + 2.5,
          y - 0.2,
          {
            align:
              "center",
          }
        );

        pdf.setFont(
          "times",
          "normal"
        );

        pdf.setFontSize(
          10.5
        );

        pdf.setTextColor(
          ...DARK
        );

        pdf.setCharSpace(0);

        const lines =
          pdf.splitTextToSize(
            text,
            width - 10
          );

        lines.forEach(
          (line) => {
            ensure(5.5);

            pdf.text(
              pdfSafeText(
                line
              ),
              left + 9,
              y
            );

            y += 5.4;
          }
        );

        y += 3;
      }

      pageHeader();

      y = 28;

      pdf.setFont(
        "times",
        "bold"
      );

      pdf.setFontSize(
        21
      );

      pdf.setTextColor(
        ...DARK
      );

      pdf.setCharSpace(0);

      pdf.text(
        "PawCruz",
        left,
        y
      );

      y += 9;

      pdf.setFontSize(
        16
      );

      pdf.setTextColor(
        ...PRIMARY
      );

      pdf.text(
        "AI Predictive Health Analysis",
        left,
        y
      );

      y += 8;

      pdf.setFont(
        "times",
        "normal"
      );

      pdf.setFontSize(9);

      pdf.setTextColor(
        ...MUTED
      );

      pdf.text(
        `Pet: ${
          aiRecord.pet
            ?.pet_name ||
          "Animal Patient"
        }`,
        left,
        y
      );

      y += 5;

      pdf.text(
        `Veterinarian: ${
          aiRecord
            .veterinarian
            ?.full_name ||
          "Not recorded"
        }`,
        left,
        y
      );

      y += 5;

      pdf.text(
        `Consultation: ${
          aiRecord.consultation_date ||
          "Not recorded"
        }`,
        left,
        y
      );

      y += 5;

      pdf.text(
        `Generated: ${new Date().toLocaleString(
          "en-PH"
        )}`,
        left,
        y
      );

      y += 9;

      pdf.setFillColor(
        ...LIGHT
      );

      pdf.roundedRect(
        left,
        y,
        width,
        18,
        2,
        2,
        "F"
      );

      pdf.setFont(
        "times",
        "bold"
      );

      pdf.setFontSize(9);

      pdf.setTextColor(
        ...PRIMARY
      );

      pdf.text(
        "ANALYSIS BASIS",
        left + 5,
        y + 6
      );

      pdf.setFont(
        "times",
        "normal"
      );

      pdf.setFontSize(
        8.7
      );

      pdf.setTextColor(
        ...DARK
      );

      const basis =
        pdf.splitTextToSize(
          "This AI-assisted report analyzes the selected medical record and available previous finalized PawCruz medical records for the same animal patient.",
          width - 10
        );

      pdf.text(
        basis,
        left + 5,
        y + 12
      );

      y += 26;

      const lines =
        cleanAiText(
          aiText
        )
          .split("\n")
          .map(
            pdfSafeText
          );

      lines.forEach(
        (line) => {
          if (!line) {
            y += 2;

            return;
          }

          const upper =
            line.toUpperCase();

          if (
            headings.includes(
              upper
            )
          ) {
            section(
              upper
            );

            return;
          }

          const action =
            line.match(
              /^(\d+)\.\s*(.+)$/
            );

          if (action) {
            numbered(
              action[1],
              action[2]
            );

            return;
          }

          const disclaimer =
            line
              .toLowerCase()
              .startsWith(
                "ai predictive health analysis is based"
              );

          if (
            disclaimer
          ) {
            ensure(22);

            y += 3;

            pdf.setFillColor(
              248,
              248,
              248
            );

            pdf.roundedRect(
              left,
              y - 2,
              width,
              18,
              2,
              2,
              "F"
            );

            pdf.setFont(
              "times",
              "italic"
            );

            pdf.setFontSize(
              8.5
            );

            pdf.setTextColor(
              ...MUTED
            );

            const disclaimerLines =
              pdf.splitTextToSize(
                line,
                width - 10
              );

            let disclaimerY =
              y + 4;

            disclaimerLines.forEach(
              (
                item
              ) => {
                pdf.text(
                  pdfSafeText(
                    item
                  ),
                  left + 5,
                  disclaimerY
                );

                disclaimerY +=
                  4;
              }
            );

            y =
              disclaimerY +
              3;

            return;
          }

          paragraph(
            line
          );
        }
      );

      footer();

      const date =
        new Date()
          .toISOString()
          .slice(0, 10);

      const petName =
        String(
          aiRecord.pet
            ?.pet_name ||
            "Pet"
        ).replace(
          /[^a-zA-Z0-9_-]/g,
          "-"
        );

      pdf.save(
        `PawCruz-Predictive-Health-${petName}-${date}.pdf`
      );
    } catch (e) {
      console.error(
        "Predictive health PDF error:",
        e
      );

      setAiError(
        "Unable to generate the predictive health PDF."
      );
    }
  }

  return (
    <div className="mr">
      <div className="toolbar">
        <input
          placeholder="Search pet, owner, diagnosis..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
        />

        {canEdit && (
          <select
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value
              )
            }
          >
            <option value="">
              All statuses
            </option>

            <option>
              Draft
            </option>

            <option>
              Finalized
            </option>
          </select>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setForm({
                ...blank,

                veterinarianId:
                  profile.role ===
                  "veterinarian"
                    ? profile.id
                    : "",
              });

              setShow(true);
            }}
          >
            <Plus size={16} />

            New Record
          </button>
        )}
      </div>

      {error && (
        <div className="alert err">
          {error}
        </div>
      )}

      {success && (
        <div className="alert ok">
          {success}
        </div>
      )}

      {loading ? (
        <div className="card">
          Loading medical
          records...
        </div>
      ) : shown.length ===
        0 ? (
        <div className="card empty">
          No medical records
          found.
        </div>
      ) : (
        <div className="grid">
          {shown.map(
            (record) => (
              <article
                className="card"
                key={record.id}
              >
                <div className="head">
                  <div>
                    <h3>
                      {
                        record.pet
                          ?.pet_name
                      }
                    </h3>

                    <p>
                      {record.pet
                        ?.species ||
                        "Pet"}{" "}
                      •{" "}
                      {record.owner
                        ?.full_name ||
                        "Owner"}
                    </p>
                  </div>

                  <span
                    className={
                      record.record_status ===
                      "Finalized"
                        ? "final"
                        : "draft"
                    }
                  >
                    {
                      record.record_status
                    }
                  </span>
                </div>

                <p>
                  <b>Date:</b>{" "}
                  {
                    record.consultation_date
                  }
                </p>

                <p>
                  <b>
                    Veterinarian:
                  </b>{" "}
                  {record
                    .veterinarian
                    ?.full_name ||
                    "—"}
                </p>

                <p>
                  <b>
                    Complaint:
                  </b>{" "}
                  {record.chief_complaint ||
                    "—"}
                </p>

                <p>
                  <b>
                    Diagnosis:
                  </b>{" "}
                  {record.diagnosis ||
                    "—"}
                </p>

                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      printRecord(
                        record
                      )
                    }
                  >
                    <Printer
                      size={15}
                    />

                    Print
                  </button>

                  <button
                    type="button"
                    className="ai-record-btn"
                    onClick={() =>
                      openPredictiveAnalysis(
                        record
                      )
                    }
                  >
                    <BrainCircuit
                      size={15}
                    />

                    AI Predictive
                  </button>

                  {record.attachment_url && (
                    <a
                      href={
                        record.attachment_url
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Attachment
                    </a>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        edit(
                          record
                        )
                      }
                    >
                      Edit
                    </button>
                  )}
                </div>
              </article>
            )
          )}
        </div>
      )}

      {show && (
        <div className="mr-modal">
          <form
            className="mr-panel"
            onSubmit={
              submit
            }
          >
            <button
              type="button"
              className="close"
              onClick={() =>
                setShow(false)
              }
            >
              <X />
            </button>

            <h2>
              {form.id
                ? "Update"
                : "Create"}{" "}
              Medical Record
            </h2>

            <div className="fields">
              <label>
                Pet

                <select
                  required
                  value={
                    form.petId
                  }
                  onChange={(e) =>
                    choosePet(
                      e.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Select pet
                  </option>

                  {pets.map(
                    (pet) => (
                      <option
                        key={
                          pet.id
                        }
                        value={
                          pet.id
                        }
                      >
                        {
                          pet.pet_name
                        }{" "}
                        —{" "}
                        {pet.owner
                          ?.full_name ||
                          "Owner"}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Veterinarian

                <select
                  required
                  value={
                    form.veterinarianId
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      veterinarianId:
                        e.target
                          .value,
                    })
                  }
                >
                  <option value="">
                    Select veterinarian
                  </option>

                  {vets.map(
                    (vet) => (
                      <option
                        key={
                          vet.id
                        }
                        value={
                          vet.id
                        }
                      >
                        {
                          vet.full_name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Appointment

                <select
                  value={
                    form.appointmentId
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      appointmentId:
                        e.target
                          .value,
                    })
                  }
                >
                  <option value="">
                    No appointment
                    reference
                  </option>

                  {appointments.map(
                    (
                      appointment
                    ) => (
                      <option
                        key={
                          appointment.id
                        }
                        value={
                          appointment.id
                        }
                      >
                        {
                          appointment.appointment_date
                        }{" "}
                        {
                          appointment.start_time
                        }{" "}
                        —{" "}
                        {
                          appointment.status
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Consultation Date

                <input
                  type="date"
                  required
                  value={
                    form.consultationDate
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      consultationDate:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Chief Complaint

                <textarea
                  value={
                    form.chiefComplaint
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      chiefComplaint:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Symptoms

                <textarea
                  value={
                    form.symptoms
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      symptoms:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Vital Signs

                <input
                  value={
                    form.vitalSigns
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      vitalSigns:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Weight (kg)

                <input
                  type="number"
                  step="0.01"
                  value={
                    form.weight
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      weight:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Temperature °C

                <input
                  type="number"
                  step="0.1"
                  value={
                    form.temperature
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temperature:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Diagnosis

                <textarea
                  value={
                    form.diagnosis
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      diagnosis:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Treatment

                <textarea
                  value={
                    form.treatment
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      treatment:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Treatment Plan

                <textarea
                  value={
                    form.treatmentPlan
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      treatmentPlan:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Medication

                <input
                  value={
                    form.medication
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      medication:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Dosage

                <input
                  value={
                    form.dosage
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dosage:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Frequency

                <input
                  value={
                    form.frequency
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      frequency:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Duration

                <input
                  value={
                    form.duration
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Laboratory Request

                <textarea
                  value={
                    form.laboratoryRequest
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      laboratoryRequest:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Laboratory Result

                <textarea
                  value={
                    form.laboratoryResult
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      laboratoryResult:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide">
                Vaccination

                <textarea
                  value={
                    form.vaccination
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      vaccination:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Follow-up Date

                <input
                  type="date"
                  value={
                    form.followUpDate
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      followUpDate:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label>
                Status

                <select
                  value={
                    form.recordStatus
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      recordStatus:
                        e.target
                          .value,
                    })
                  }
                >
                  <option>
                    Draft
                  </option>

                  <option>
                    Finalized
                  </option>
                </select>
              </label>

              <label className="wide">
                Veterinarian Notes

                <textarea
                  value={
                    form.veterinarianNotes
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      veterinarianNotes:
                        e.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="wide upload">
                <Upload
                  size={18}
                />

                Attachment

                <input
                  type="file"
                  onChange={
                    fileChange
                  }
                />

                {form.attachmentUrl && (
                  <a
                    href={
                      form.attachmentUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    View uploaded
                    file
                  </a>
                )}
              </label>
            </div>

            <button
              className="save"
              disabled={
                saving
              }
            >
              {saving
                ? "Saving..."
                : "Save Medical Record"}
            </button>
          </form>
        </div>
      )}

      {aiModal && (
        <div className="mr-modal">
          <div className="ai-panel">
            <div className="ai-panel-head">
              <div className="ai-heading">
                <div className="ai-icon">
                  <BrainCircuit
                    size={24}
                  />
                </div>

                <div>
                  <h2>
                    AI Predictive
                    Health Analysis
                  </h2>

                  <p>
                    {aiRecord?.pet
                      ?.pet_name ||
                      "Animal Patient"}{" "}
                    •{" "}
                    {aiRecord
                      ?.consultation_date ||
                      ""}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="ai-close"
                onClick={() =>
                  setAiModal(
                    false
                  )
                }
              >
                <X size={20} />
              </button>
            </div>

            <div className="ai-warning">
              <Sparkles
                size={18}
              />

              <span>
                This analysis uses
                the selected medical
                record and available
                previous finalized
                PawCruz records for
                this pet. It is
                decision support
                only.
              </span>
            </div>

            {aiLoading && (
              <div className="ai-loading">
                <div className="ai-spinner" />

                <div>
                  <strong>
                    Analyzing medical
                    history
                  </strong>

                  <p>
                    Reviewing
                    symptoms,
                    diagnosis,
                    treatment,
                    laboratory
                    information and
                    previous records…
                  </p>
                </div>
              </div>
            )}

            {!aiLoading &&
              aiError && (
                <div className="alert err">
                  {aiError}
                </div>
              )}

            {!aiLoading &&
              aiText && (
                <div className="ai-result">
                  {aiText}
                </div>
              )}

            <div className="ai-footer-actions">
              <button
                type="button"
                className="ai-regenerate"
                disabled={
                  aiLoading
                }
                onClick={
                  regeneratePredictiveAnalysis
                }
              >
                <RefreshCw
                  size={16}
                />

                {aiLoading
                  ? "Analyzing..."
                  : "Regenerate"}
              </button>

              <button
                type="button"
                className="ai-download"
                disabled={
                  aiLoading ||
                  !aiText
                }
                onClick={
                  downloadPredictivePdf
                }
              >
                <FileDown
                  size={16}
                />

                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mr {
          width: 100%;
          color: #20313b;
        }

        .mr .toolbar {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 190px auto;
          gap: 12px;
          align-items: center;
          margin-bottom: 20px;
          padding: 18px;
          background: #fff;
          border: 1px solid #e1edf2;
          border-radius: 16px;
          box-shadow: 0 6px 20px rgba(40, 92, 116, .06);
        }

        .mr .toolbar input,
        .mr .toolbar select {
          width: 100%;
          height: 46px;
          padding: 0 14px;
          border: 1px solid #cfe4ec;
          border-radius: 11px;
          background: #fff;
          color: #20313b;
          font: inherit;
          outline: none;
        }

        .mr .toolbar input:focus,
        .mr .toolbar select:focus {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77,168,218,.13);
        }

        .mr .toolbar button,
        .mr .actions button,
        .mr .save {
          border: 0;
          background: #4da8da;
          color: #fff;
          border-radius: 10px;
          padding: 11px 15px;
          display: flex;
          gap: 7px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 700;
        }

        .mr .toolbar button {
          height: 46px;
          white-space: nowrap;
        }

        .mr .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
        }

        .mr .card {
          border: 1px solid #e1edf2;
        }

        .mr .head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .mr .head h3 {
          margin: 0;
        }

        .mr .head p {
          margin: 4px 0;
          color: #6f7f88;
        }

        .mr .final,
        .mr .draft {
          height: max-content;
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
        }

        .mr .final {
          background: #e8f7ef;
          color: #2d8558;
        }

        .mr .draft {
          background: #fff4d9;
          color: #9a6a00;
        }

        .mr .actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 14px;
        }

        .mr .actions .ai-record-btn {
          background: #edf7fb;
          color: #247ba5;
          border: 1px solid #cde6f0;
        }

        .mr .actions a {
          color: #318fbe;
          font-weight: 700;
        }

        .mr .alert {
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 12px;
        }

        .mr .err {
          background: #fff0f0;
          color: #b33;
        }

        .mr .ok {
          background: #eaf8ef;
          color: #27734b;
        }

        .mr .empty {
          text-align: center;
          color: #6f7f88;
        }

        .mr-modal {
          position: fixed;
          inset: 0 0 0 280px;
          background: rgba(24,47,59,.62);
          backdrop-filter: blur(2px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .mr-panel {
          background: #fff;
          border-radius: 20px;
          width: min(1080px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          position: relative;
          box-shadow: 0 24px 70px rgba(17,48,63,.28);
          padding: 0 28px 28px;
        }

        .mr-panel > h2 {
          position: sticky;
          top: 0;
          z-index: 3;
          margin: 0 -28px 24px;
          padding: 25px 76px 21px 28px;
          background: #fff;
          border-bottom: 1px solid #e5eff3;
          color: #17445a;
          font-size: 25px;
        }

        .mr-panel .close {
          position: sticky;
          float: right;
          top: 16px;
          z-index: 5;
          margin-top: 14px;
          border: 0;
          background: #eef7fa;
          color: #183642;
          border-radius: 50%;
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .mr-panel .fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 16px 18px;
          clear: both;
        }

        .mr-panel .fields label {
          display: grid;
          gap: 7px;
          font-weight: 700;
          font-size: 13px;
          color: #294653;
        }

        .mr-panel .fields input,
        .mr-panel .fields select,
        .mr-panel .fields textarea {
          width: 100%;
          padding: 12px 13px;
          border: 1px solid #cfe2ea;
          border-radius: 10px;
          background: #fff;
          color: #20313b;
          font: inherit;
          outline: none;
        }

        .mr-panel .fields input,
        .mr-panel .fields select {
          height: 48px;
        }

        .mr-panel .fields input:focus,
        .mr-panel .fields select:focus,
        .mr-panel .fields textarea:focus {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77,168,218,.12);
        }

        .mr-panel .fields textarea {
          min-height: 94px;
          resize: vertical;
        }

        .mr-panel .wide {
          grid-column: 1 / -1;
        }

        .mr-panel .upload {
          padding: 14px;
          border: 1px dashed #9dc9da;
          border-radius: 12px;
          background: #f8fdff;
        }

        .mr-panel .upload input {
          height: auto;
          padding: 8px;
        }

        .mr-panel .save {
          margin-top: 22px;
          width: 100%;
          min-height: 48px;
          font-size: 14px;
        }

        .mr-panel .save:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .ai-panel {
          width: min(920px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 24px 70px rgba(17,48,63,.28);
        }

        .ai-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 22px 24px;
          border-bottom: 1px solid #e3edf2;
          position: sticky;
          top: 0;
          z-index: 3;
          background: #fff;
        }

        .ai-heading {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .ai-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: #e9f6fb;
          color: #318fbe;
          display: grid;
          place-items: center;
        }

        .ai-heading h2 {
          margin: 0;
          font-size: 21px;
          color: #17445a;
        }

        .ai-heading p {
          margin: 4px 0 0;
          color: #748992;
          font-size: 12px;
        }

        .ai-close {
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 50%;
          background: #eef7fa;
          color: #34515e;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .ai-warning {
          margin: 20px 24px 0;
          background: #f2f9fc;
          border: 1px solid #d8ebf3;
          color: #416371;
          border-radius: 12px;
          padding: 13px 15px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12.5px;
          line-height: 1.5;
        }

        .ai-warning svg {
          color: #318fbe;
          flex-shrink: 0;
        }

        .ai-loading {
          margin: 22px 24px;
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          color: #375864;
        }

        .ai-loading p {
          margin: 5px 0 0;
          color: #7a8d96;
          font-size: 12px;
        }

        .ai-spinner {
          width: 31px;
          height: 31px;
          border: 4px solid #dceef5;
          border-top-color: #4da8da;
          border-radius: 50%;
          animation: aiSpin .8s linear infinite;
          flex-shrink: 0;
        }

        @keyframes aiSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .ai-result {
          margin: 20px 24px;
          background: #fbfdfe;
          border: 1px solid #e1edf2;
          border-radius: 14px;
          padding: 20px;
          white-space: pre-line;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 14px;
          line-height: 1.75;
          color: #263c46;
        }

        .ai-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 24px 22px;
          border-top: 1px solid #e5eff3;
        }

        .ai-regenerate,
        .ai-download {
          border: 0;
          border-radius: 10px;
          padding: 11px 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          font-weight: 700;
        }

        .ai-regenerate {
          background: #eaf7fb;
          color: #297da8;
        }

        .ai-download {
          background: #4da8da;
          color: #fff;
        }

        .ai-regenerate:disabled,
        .ai-download:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        @media(max-width:900px) {
          .mr .toolbar {
            grid-template-columns: 1fr 180px;
          }

          .mr .toolbar button {
            grid-column: 1 / -1;
          }

          .mr-modal {
            left: 0;
            padding: 16px;
          }

          .mr-panel {
            max-height: calc(100vh - 32px);
          }
        }

        @media(max-width:650px) {
          .mr .toolbar {
            grid-template-columns: 1fr;
            padding: 14px;
          }

          .mr .toolbar button {
            grid-column: auto;
          }

          .mr-modal {
            padding: 0;
            align-items: stretch;
          }

          .mr-panel,
          .ai-panel {
            width: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .mr-panel {
            padding: 0 16px 22px;
          }

          .mr-panel > h2 {
            margin: 0 -16px 20px;
            padding: 22px 65px 18px 16px;
            font-size: 21px;
          }

          .mr-panel .fields {
            grid-template-columns: 1fr;
          }

          .mr-panel .wide {
            grid-column: auto;
          }

          .mr-panel .close {
            right: 0;
          }

          .mr .grid {
            grid-template-columns: 1fr;
          }

          .ai-panel-head {
            padding: 18px 16px;
          }

          .ai-warning,
          .ai-result {
            margin-left: 16px;
            margin-right: 16px;
          }

          .ai-footer-actions {
            padding: 14px 16px;
            flex-direction: column;
          }

          .ai-regenerate,
          .ai-download {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}