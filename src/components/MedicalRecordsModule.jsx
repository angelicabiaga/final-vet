import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useLocation } from "react-router-dom";

import {
  DEFAULT_MEDICAL_RECORD_TEMPLATE,
  getMedicalRecordTemplate,
  MEDICAL_RECORD_TEMPLATES,
} from "../constants/medicalRecordTemplates";

import {
  BrainCircuit,
  FileDown,
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

import { getInventoryItems } from "../services/inventoryService";

import { completeQueueEntry } from "../services/queueService";

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
  parasiteTreatments: [],
  heartwormTests: [],
  vaccinationRecords: [],
  recordTemplate: DEFAULT_MEDICAL_RECORD_TEMPLATE,
  templateData: {},
  followUpDate: "",
  veterinarianNotes: "",
  attachmentUrl: "",
  recordStatus: "Draft",
};

const VACCINE_KEYS = [
  ["distemper", "Distemper"],
  ["parainfluenza", "Parainfluenza"],
  ["adenovirus", "Adenovirus"],
  ["parvovirus", "Parvovirus"],
  ["leptospirosis", "Leptospirosis"],
  ["coronavirus", "Coronavirus"],
  ["bordetella", "Bordetella"],
  ["rabies", "Rabies"],
];

const BLANK_VACCINATION_ROW = {
  date: "",
  age: "",
  weight: "",
  distemper: false,
  parainfluenza: false,
  adenovirus: false,
  parvovirus: false,
  leptospirosis: false,
  coronavirus: false,
  bordetella: false,
  rabies: false,
  others: "",
  administeredBy: "",
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
    inventoryOptions,
    setInventoryOptions,
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

  const [
    queueContext,
    setQueueContext,
  ] = useState(null);

  const [
    pendingQueueCompletion,
    setPendingQueueCompletion,
  ] = useState(null);

  const location = useLocation();

  const activeTemplate = getMedicalRecordTemplate(
    form.recordTemplate
  );

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === form.petId),
    [pets, form.petId]
  );

  // Everyone else (including admin) gets a read-only view; only the
  // veterinarian can create or edit a medical record.
  const canEdit =
    profile?.role === "veterinarian";

  const queueLaunch = useMemo(() => {
    const params = new URLSearchParams(
      location.search
    );

    const queueEntryId =
      params.get("queueEntryId");

    const petIds = (
      params.get("petIds") ||
      params.get("petId") ||
      ""
    )
      .split(",")
      .filter(Boolean);

    if (!queueEntryId || !petIds.length) {
      return null;
    }

    const appointmentIds = (
      params.get("appointmentIds") ||
      params.get("appointmentId") ||
      ""
    ).split(",");

    return {
      queueEntryId,
      petIds,
      appointmentIds,
      ownerId: params.get("ownerId") || "",
      veterinarianId:
        params.get("veterinarianId") ||
        (profile?.role === "veterinarian"
          ? profile.id
          : ""),
      recordTemplate: getMedicalRecordTemplate(
        params.get("template")
      ).value,
    };
  }, [
    location.search,
    profile?.id,
    profile?.role,
  ]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [
        recordRows,
        petRows,
        vetRows,
        inventoryRows,
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

        getInventoryItems().catch(
          () => []
        ),
      ]);

      setRecords(
        recordRows
      );

      setInventoryOptions(
        inventoryRows
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

  useEffect(() => {
    if (!canEdit) return;

    if (!queueLaunch) {
      setQueueContext(null);
      setPendingQueueCompletion(null);
      return;
    }

    setQueueContext({
      ...queueLaunch,
      currentIndex: 0,
    });

    setPendingQueueCompletion(null);

    setForm({
      ...blank,
      petId: queueLaunch.petIds[0],
      ownerId: queueLaunch.ownerId,
      veterinarianId:
        queueLaunch.veterinarianId,
      appointmentId:
        queueLaunch.appointmentIds[0] || "",
      recordTemplate:
        queueLaunch.recordTemplate,
      templateData: {},
    });

    getAppointmentsForPet(queueLaunch.petIds[0])
      .then(setAppointments)
      .catch(() => setAppointments([]));

    setShow(true);
  }, [canEdit, queueLaunch]);

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
      parasiteTreatments:
        record.parasite_treatments ||
        [],
      heartwormTests:
        record.heartworm_tests ||
        [],
      vaccinationRecords:
        record.vaccination_records ||
        [],
      recordTemplate:
        record.record_template ||
        DEFAULT_MEDICAL_RECORD_TEMPLATE,
      templateData:
        record.template_data ||
        {},
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

    setQueueContext(null);
    setPendingQueueCompletion(null);
    setShow(true);
  }

  function updateListItem(field, index, patch) {
    setForm((current) => {
      const list = [...(current[field] || [])];
      list[index] = { ...list[index], ...patch };
      return { ...current, [field]: list };
    });
  }

  function addListItem(field, item) {
    setForm((current) => ({
      ...current,
      [field]: [...(current[field] || []), item],
    }));
  }

  function removeListItem(field, index) {
    setForm((current) => ({
      ...current,
      [field]: (current[field] || []).filter(
        (_, i) => i !== index
      ),
    }));
  }

  function updateTemplateData(patch) {
    setForm((current) => ({
      ...current,
      templateData: {
        ...(current.templateData || {}),
        ...patch,
      },
    }));
  }

  function pickInventoryItem(event) {
    const value = event.target.value;
    event.target.value = "";
    if (!value) return;

    const current = form.templateData?.inventoryItems || [];

    if (value === "NA") {
      updateTemplateData({
        inventoryItems: [
          { id: "NA", item_name: "N/A", isNA: true },
        ],
      });
      return;
    }

    const item = inventoryOptions.find(
      (option) => option.id === value
    );
    if (!item) return;

    const withoutNA = current.filter(
      (entry) => !entry.isNA
    );
    if (withoutNA.some((entry) => entry.id === item.id)) return;

    updateTemplateData({
      inventoryItems: [
        ...withoutNA,
        {
          id: item.id,
          item_name: item.item_name,
          category: item.category,
          unit: item.unit,
          unit_price: Number(item.unit_price || 0),
        },
      ],
    });
  }

  function removeInventoryItem(id) {
    updateTemplateData({
      inventoryItems: (
        form.templateData?.inventoryItems || []
      ).filter((entry) => entry.id !== id),
    });
  }

  function closeQueuedRecordModal() {
    setPendingQueueCompletion(null);
    setQueueContext(null);
    setShow(false);
    setForm(blank);
  }

  async function retryQueueCompletion() {
    if (
      !queueContext ||
      !pendingQueueCompletion ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await completeQueueEntry(
        queueContext.queueEntryId,
        profile
      );

      setSuccess(
        "Medical record saved and appointment marked as done. The staff queue and queue display have been updated."
      );
      closeQueuedRecordModal();
    } catch (queueError) {
      setError(
        `Medical record is already saved, but the appointment could not be marked as done: ${queueError.message} Click Retry Mark as Done to try again without creating another record.`
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveQueuedTemplate(nextTemplate = "") {
    if (!queueContext || saving) return;

    if (pendingQueueCompletion) {
      await retryQueueCompletion();
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const savedRecord = await saveMedicalRecord(
        {
          ...form,
          recordStatus: "Finalized",
        },
        profile
      );

      setForm((current) => ({
        ...current,
        id: savedRecord?.id || current.id,
        recordStatus: "Finalized",
      }));

      await load();

      if (nextTemplate) {
        const nextContext = {
          ...queueContext,
          selectedPetId: form.petId,
          selectedAppointmentId: form.appointmentId,
          currentIndex: Math.max(
            0,
            queueContext.petIds.indexOf(form.petId)
          ),
        };

        setQueueContext(nextContext);
        setPendingQueueCompletion(null);
        setSuccess(
          `${activeTemplate.label} saved. Add the next record for this appointment.`
        );
        openAdditionalTemplate(nextTemplate, nextContext);
        return;
      }

      try {
        await completeQueueEntry(
          queueContext.queueEntryId,
          profile
        );

        setSuccess(
          "Medical record saved and appointment marked as done. The staff queue and queue display have been updated."
        );
        closeQueuedRecordModal();
      } catch (queueError) {
        setPendingQueueCompletion({
          recordId: savedRecord?.id || form.id || null,
          templateLabel: activeTemplate.label,
        });
        setError(
          `Medical record saved, but the appointment could not be marked as done: ${queueError.message} Click Retry Mark as Done to try again without creating another record.`
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (queueContext) {
      if (pendingQueueCompletion) {
        await retryQueueCompletion();
        return;
      }

      await saveQueuedTemplate();
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await saveMedicalRecord(form, profile);
      await load();
      setSuccess("Medical record saved successfully.");
      setPendingQueueCompletion(null);
      setShow(false);
      setForm(blank);
    } catch (e) {
      setError(e.message);
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

  function openAdditionalTemplate(template, context = queueContext) {
    if (!context) return;

    const petId =
      context.selectedPetId ||
      context.petIds[0];

    const appointmentId =
      context.selectedAppointmentId ||
      context.appointmentIds[
        context.petIds.indexOf(petId)
      ] ||
      "";

    setForm({
      ...blank,
      petId,
      ownerId: context.ownerId,
      veterinarianId:
        context.veterinarianId,
      appointmentId,
      recordTemplate: template,
      templateData: {},
    });

    getAppointmentsForPet(petId)
      .then(setAppointments)
      .catch(() => setAppointments([]));

    setShow(true);
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

        {profile?.role !== "pet_owner" && (
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

              setQueueContext(null);
              setPendingQueueCompletion(null);
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

                <p>
                  <b>
                    Test / Medicine / Vaccine Given:
                  </b>{" "}
                  {(record.template_data?.inventoryItems || []).length
                    ? record.template_data.inventoryItems
                        .map((entry) => entry.item_name)
                        .join(", ")
                    : "—"}
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
              onClick={() => {
                setPendingQueueCompletion(null);
                setQueueContext(null);
                setShow(false);
              }}
            >
              <X />
            </button>

            {queueContext && (
              <div className="queue-context-banner">
                {pendingQueueCompletion
                  ? `${pendingQueueCompletion.templateLabel} is already saved. Retry Mark as Done to complete this appointment without creating another record.`
                  : <>
                      Adding {activeTemplate.label} for pet{" "}
                      {queueContext.currentIndex + 1}{" "}
                      of {queueContext.petIds.length}{" "}
                      in this visit. Add more
                      templates as needed, then
                      choose Mark as Done to
                      complete this appointment.
                    </>}
              </div>
            )}

            <h2>
              {form.id ? "Update" : "Create"}{" "}
              {activeTemplate.label}
            </h2>

            <div className="template-intro">
              <b>{activeTemplate.label}</b>
              <span>{activeTemplate.description}</span>
            </div>

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
                Test / Medicine / Vaccine Given
                <span className="field-hint">
                  Required — used by the POS to compute the payment total.
                </span>

                <select
                  value=""
                  onChange={pickInventoryItem}
                  disabled={!canEdit}
                >
                  <option value="">
                    {(form.templateData?.inventoryItems || []).length
                      ? "Add another item…"
                      : "Select test, medicine, or vaccine…"}
                  </option>

                  <option value="NA">
                    N/A — nothing given
                  </option>

                  {inventoryOptions
                    .filter(
                      (option) =>
                        !(form.templateData?.inventoryItems || []).some(
                          (entry) => entry.id === option.id
                        )
                    )
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.item_name} — {option.category} (₱{Number(option.unit_price || 0).toFixed(2)})
                      </option>
                    ))}
                </select>

                {!(form.templateData?.inventoryItems || []).length && (
                  <small className="field-required-note">
                    Choose at least one item, or N/A, before saving.
                  </small>
                )}

                {(form.templateData?.inventoryItems || []).length > 0 && (
                  <div className="chosen-items">
                    {form.templateData.inventoryItems.map((entry) => (
                      <span className="chosen-item-chip" key={entry.id}>
                        {entry.item_name}
                        {!entry.isNA && ` — ₱${Number(entry.unit_price || 0).toFixed(2)}`}
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={`Remove ${entry.item_name}`}
                            onClick={() => removeInventoryItem(entry.id)}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </label>

              {form.recordTemplate === "health-record" && (
                <>
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

                </>
              )}

              {form.recordTemplate === "parasite-prevention" && (
              <div className="wide record-section">
                <div className="section-head">
                  <h3>Parasite Prevention</h3>
                  <button
                    type="button"
                    className="add-row"
                    onClick={() =>
                      addListItem(
                        "parasiteTreatments",
                        { date: "", treatment: "" }
                      )
                    }
                  >
                    <Plus size={14} /> Add Entry
                  </button>
                </div>

                {form.parasiteTreatments.length === 0 && (
                  <p className="section-empty">
                    No parasite prevention entries yet.
                  </p>
                )}

                {form.parasiteTreatments.map((row, index) => (
                  <div className="row-grid two" key={index}>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) =>
                        updateListItem("parasiteTreatments", index, {
                          date: e.target.value,
                        })
                      }
                    />
                    <input
                      value={row.treatment}
                      placeholder="Treatment"
                      onChange={(e) =>
                        updateListItem("parasiteTreatments", index, {
                          treatment: e.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="remove-row"
                      aria-label="Remove entry"
                      onClick={() =>
                        removeListItem("parasiteTreatments", index)
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              )}

              {form.recordTemplate === "heartworm" && (
              <div className="wide record-section">
                <div className="section-head">
                  <h3>Heartworm Tests and Prevention</h3>
                  <button
                    type="button"
                    className="add-row"
                    onClick={() =>
                      addListItem("heartwormTests", {
                        date: "",
                        result: "Negative",
                      })
                    }
                  >
                    <Plus size={14} /> Add Test
                  </button>
                </div>

                {form.heartwormTests.length === 0 && (
                  <p className="section-empty">
                    No heartworm test results yet.
                  </p>
                )}

                {form.heartwormTests.map((row, index) => (
                  <div className="row-grid two" key={index}>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) =>
                        updateListItem("heartwormTests", index, {
                          date: e.target.value,
                        })
                      }
                    />
                    <select
                      value={row.result}
                      onChange={(e) =>
                        updateListItem("heartwormTests", index, {
                          result: e.target.value,
                        })
                      }
                    >
                      <option>Negative</option>
                      <option>Positive</option>
                    </select>
                    <button
                      type="button"
                      className="remove-row"
                      aria-label="Remove test"
                      onClick={() =>
                        removeListItem("heartwormTests", index)
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              )}

              {form.recordTemplate === "vaccination" && (
              <div className="wide record-section">
                <div className="section-head">
                  <h3>Vaccination Record</h3>
                  <button
                    type="button"
                    className="add-row"
                    onClick={() =>
                      addListItem(
                        "vaccinationRecords",
                        { ...BLANK_VACCINATION_ROW }
                      )
                    }
                  >
                    <Plus size={14} /> Add Vaccination
                  </button>
                </div>

                {form.vaccinationRecords.length === 0 && (
                  <p className="section-empty">
                    No vaccinations recorded yet.
                  </p>
                )}

                {form.vaccinationRecords.map((row, index) => (
                  <div className="vaccine-card" key={index}>
                    <button
                      type="button"
                      className="remove-row"
                      aria-label="Remove vaccination"
                      onClick={() =>
                        removeListItem("vaccinationRecords", index)
                      }
                    >
                      <X size={14} />
                    </button>

                    <div className="row-grid three">
                      <label className="mini">
                        Date
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) =>
                            updateListItem(
                              "vaccinationRecords",
                              index,
                              { date: e.target.value }
                            )
                          }
                        />
                      </label>
                      <label className="mini">
                        Age
                        <input
                          value={row.age}
                          onChange={(e) =>
                            updateListItem(
                              "vaccinationRecords",
                              index,
                              { age: e.target.value }
                            )
                          }
                        />
                      </label>
                      <label className="mini">
                        Weight
                        <input
                          value={row.weight}
                          onChange={(e) =>
                            updateListItem(
                              "vaccinationRecords",
                              index,
                              { weight: e.target.value }
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="vaccine-checks">
                      {VACCINE_KEYS.map(([key, label]) => (
                        <label className="vaccine-check" key={key}>
                          <input
                            type="checkbox"
                            checked={!!row[key]}
                            onChange={(e) =>
                              updateListItem(
                                "vaccinationRecords",
                                index,
                                { [key]: e.target.checked }
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    <div className="row-grid two">
                      <input
                        value={row.others}
                        placeholder="Others"
                        onChange={(e) =>
                          updateListItem(
                            "vaccinationRecords",
                            index,
                            { others: e.target.value }
                          )
                        }
                      />
                      <input
                        value={row.administeredBy}
                        placeholder="Veterinarian's Signature"
                        onChange={(e) =>
                          updateListItem(
                            "vaccinationRecords",
                            index,
                            { administeredBy: e.target.value }
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              )}

              {form.recordTemplate === "pet-profile" && (
                <>
                  <div className="wide record-section pet-profile-summary">
                    <h3>Pet Details</h3>
                    <dl>
                      <div><dt>Name of Pet</dt><dd>{selectedPet?.pet_name || "—"}</dd></div>
                      <div><dt>Date of Birth</dt><dd>{selectedPet?.date_of_birth || "—"}</dd></div>
                      <div><dt>Breed</dt><dd>{selectedPet?.breed || "—"}</dd></div>
                      <div><dt>Sex</dt><dd>{selectedPet?.sex || "—"}</dd></div>
                      <div><dt>Markings</dt><dd>{selectedPet?.color || "—"}</dd></div>
                      <div><dt>Microchip No.</dt><dd>{selectedPet?.microchip_number || "—"}</dd></div>
                      <div><dt>Guardian</dt><dd>{selectedPet?.owner?.full_name || "—"}</dd></div>
                      <div><dt>Phone No.</dt><dd>{selectedPet?.owner?.phone || "—"}</dd></div>
                    </dl>
                  </div>

                  <label>
                    Patient No.

                    <input
                      value={form.templateData?.patientNumber || ""}
                      onChange={(e) =>
                        updateTemplateData({ patientNumber: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Profile / Record No.

                    <input
                      value={form.templateData?.recordNumber || ""}
                      onChange={(e) =>
                        updateTemplateData({ recordNumber: e.target.value })
                      }
                    />
                  </label>
                </>
              )}

              {form.recordTemplate === "dental" && (
                <>
                  <label>
                    Gingiva

                    <input
                      value={form.templateData?.gingiva || ""}
                      onChange={(e) => updateTemplateData({ gingiva: e.target.value })}
                    />
                  </label>

                  <label>
                    Occlusion

                    <input
                      value={form.templateData?.occlusion || ""}
                      onChange={(e) => updateTemplateData({ occlusion: e.target.value })}
                    />
                  </label>

                  <label>
                    Salivation

                    <input
                      value={form.templateData?.salivation || ""}
                      onChange={(e) => updateTemplateData({ salivation: e.target.value })}
                    />
                  </label>

                  <label>
                    Halitosis

                    <input
                      value={form.templateData?.halitosis || ""}
                      onChange={(e) => updateTemplateData({ halitosis: e.target.value })}
                    />
                  </label>

                  <label className="wide">
                    Dental Chart and Findings

                    <textarea
                      value={form.templateData?.dentalChart || ""}
                      placeholder="Record missing, displaced, injured, or decayed teeth and other observations."
                      onChange={(e) => updateTemplateData({ dentalChart: e.target.value })}
                    />
                  </label>

                  <label className="wide">
                    Periodontal Disease / Other Comment

                    <textarea
                      value={form.templateData?.periodontalNotes || ""}
                      onChange={(e) => updateTemplateData({ periodontalNotes: e.target.value })}
                    />
                  </label>

                  <label className="wide">
                    Dental Treatment

                    <textarea
                      value={form.treatment}
                      onChange={(e) =>
                        setForm({ ...form, treatment: e.target.value })
                      }
                    />
                  </label>
                </>
              )}

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

              {!queueContext && (
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
              )}

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

            {queueContext ? (
              <div className="template-actions">
                <select
                  className="add-template-action"
                  aria-label="Add another record"
                  defaultValue=""
                  disabled={
                    saving ||
                    Boolean(pendingQueueCompletion)
                  }
                  onChange={(event) => {
                    const template = event.target.value;
                    if (!template) return;

                    if (!event.currentTarget.form?.reportValidity()) {
                      event.currentTarget.value = "";
                      return;
                    }

                    event.target.value = "";
                    saveQueuedTemplate(template);
                  }}
                >
                  <option value="" disabled>
                    {pendingQueueCompletion
                      ? "Record saved — retry completion"
                      : saving
                        ? "Saving..."
                        : "Add Another Record"}
                  </option>

                  {MEDICAL_RECORD_TEMPLATES.map((template) => (
                    <option
                      key={template.value}
                      value={template.value}
                    >
                      {template.label}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="save mark-done-action"
                  disabled={saving}
                  formNoValidate={
                    Boolean(pendingQueueCompletion)
                  }
                >
                  {saving
                    ? "Saving..."
                    : pendingQueueCompletion
                      ? "Retry Mark as Done"
                      : "Mark as Done"}
                </button>
              </div>
            ) : (
              <button
                className="save"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : "Save Medical Record"}
              </button>
            )}
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
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 20px;
          padding: 18px;
          background: #fff;
          border: 1px solid #e1edf2;
          border-radius: 16px;
          box-shadow: 0 6px 20px rgba(40, 92, 116, .06);
        }

        .mr .toolbar input {
          flex: 1 1 260px;
        }

        .mr .toolbar select {
          flex: 0 1 190px;
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
          flex: 0 0 auto;
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

        .mr .template-intro {
          display: grid;
          gap: 4px;
          margin: 0 0 22px;
          padding: 13px 15px;
          border: 1px solid #d7eaf2;
          border-radius: 12px;
          background: #f4fbfe;
          color: #48717f;
          font-size: 13px;
          line-height: 1.45;
        }

        .mr .template-intro b {
          color: #267da3;
          font-size: 14px;
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

        .mr-panel .field-hint {
          font-weight: 500;
          font-size: 12px;
          color: #6f8792;
        }

        .mr-panel .field-required-note {
          font-weight: 600;
          font-size: 12px;
          color: #b34b4b;
        }

        .mr-panel .chosen-items {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .mr-panel .chosen-item-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 999px;
          background: #eaf6fb;
          color: #21697f;
          font-weight: 700;
          font-size: 12px;
        }

        .mr-panel .chosen-item-chip button {
          display: inline-flex;
          border: 0;
          background: none;
          color: #21697f;
          cursor: pointer;
          padding: 0;
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

        .mr-panel .template-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 22px;
        }

        .mr-panel .template-actions button,
        .mr-panel .template-actions select {
          min-height: 50px;
          border-radius: 11px;
          padding: 12px 15px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        .mr-panel .add-template-action {
          border: 1px solid #98d3e8;
          background: #eaf8fd;
          color: #267da3;
        }

        .mr-panel .mark-done-action {
          margin: 0;
          background: #318fbe;
        }

        .mr-panel .template-actions button:disabled,
        .mr-panel .template-actions select:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .queue-context-banner {
          margin: 0 0 18px;
          padding: 12px 15px;
          border-radius: 12px;
          background: #eaf7fc;
          color: #267da3;
          font-weight: 700;
          font-size: 13px;
          line-height: 1.5;
          clear: both;
        }

        .mr-panel .record-section {
          border: 1px solid #e1eef3;
          border-radius: 14px;
          padding: 16px;
          background: #f9fdff;
        }

        .mr-panel .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }

        .mr-panel .section-head h3 {
          margin: 0;
          font-size: 15px;
          color: #20313b;
        }

        .mr-panel .add-row {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #a9dff0;
          border-radius: 10px;
          padding: 7px 12px;
          background: #eaf8fd;
          color: #267da3;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }

        .mr-panel .add-row:hover {
          background: #dcf1fa;
        }

        .mr-panel .section-empty {
          margin: 0 0 6px;
          color: #7c8c94;
          font-size: 13px;
        }

        .mr-panel .pet-profile-summary h3 {
          margin: 0 0 12px;
          color: #20313b;
          font-size: 15px;
        }

        .mr-panel .pet-profile-summary dl {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 18px;
          margin: 0;
        }

        .mr-panel .pet-profile-summary dl div {
          display: grid;
          gap: 2px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e1eef3;
        }

        .mr-panel .pet-profile-summary dt {
          color: #718891;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .mr-panel .pet-profile-summary dd {
          margin: 0;
          color: #294653;
          font-weight: 700;
        }

        .mr-panel .row-grid {
          display: grid;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }

        .mr-panel .row-grid.two {
          grid-template-columns: 1fr 1fr auto;
        }

        .mr-panel .row-grid.three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .mr-panel .row-grid input,
        .mr-panel .row-grid select {
          height: 42px;
          padding: 8px 11px;
          border: 1px solid #cfe2ea;
          border-radius: 9px;
          font: inherit;
        }

        .mr-panel .remove-row {
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          padding: 8px;
          background: #fff0f0;
          color: #b34848;
          cursor: pointer;
        }

        .mr-panel .vaccine-card {
          position: relative;
          border: 1px solid #e1eef3;
          border-radius: 12px;
          padding: 14px 42px 14px 14px;
          margin-bottom: 12px;
          background: #fff;
        }

        .mr-panel .vaccine-card:last-child {
          margin-bottom: 0;
        }

        .mr-panel .vaccine-card .remove-row {
          position: absolute;
          top: 12px;
          right: 12px;
        }

        .mr-panel .vaccine-card .mini {
          display: grid;
          gap: 4px;
          font-weight: 700;
          font-size: 12px;
          color: #556c76;
        }

        .mr-panel .vaccine-checks {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin: 10px 0;
          padding: 10px;
          background: #f4fbfd;
          border-radius: 10px;
        }

        .mr-panel .vaccine-check {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 400;
          font-size: 12px;
          color: #294653;
        }

        .mr-panel .vaccine-check input {
          width: 15px;
          height: 15px;
          accent-color: #4da8da;
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
          .mr .toolbar select {
            flex-basis: 160px;
          }

          .mr .toolbar button {
            flex-basis: 100%;
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
            padding: 14px;
          }

          .mr .toolbar input,
          .mr .toolbar select {
            flex-basis: 100%;
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

          .mr-panel .row-grid.two,
          .mr-panel .row-grid.three {
            grid-template-columns: 1fr;
          }

          .mr-panel .vaccine-checks {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .mr-panel .template-actions {
            grid-template-columns: 1fr;
          }

          .mr-panel .pet-profile-summary dl {
            grid-template-columns: 1fr;
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
