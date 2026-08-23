import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router-dom";

import {
  DEFAULT_MEDICAL_RECORD_TEMPLATE,
  getMedicalRecordTemplate,
  MEDICAL_RECORD_TEMPLATES,
} from "../constants/medicalRecordTemplates";

import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import jsPDF from "jspdf";

import {
  getPets,
} from "../services/petService";

import {
  generateConsultationHealthInsight,
  generatePredictiveHealthAnalysis,
  getActiveVeterinarians,
  getAppointmentsForPet,
  getMedicalRecords,
  getPreviousMedicalRecordsForAi,
  saveConsultationInsight,
  saveMedicalRecord,
  uploadMedicalAttachment,
} from "../services/medicalRecordService";

import { formatDateTime12h, formatTime12h } from "../utils/timeFormat";

import { getInventoryItems } from "../services/inventoryService";
import PredictiveHealthReport from "./PredictiveHealthReport";
import ConfirmDialog from "./ConfirmDialog";

import { markConsultationReadyForBilling } from "../services/queueService";

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
  recordStatus: "Finalized",
  consultationFee: "500",
};

// Converts a saved medical_records row back into the form's shape. Shared
// by the "edit an existing record" action and by the queue-launch flow
// reopening an already-finalized consultation (so re-completing it updates
// the same row instead of inserting a duplicate).
function recordToFormValues(record) {
  return {
    id: record.id,
    petId: record.pet_id,
    ownerId: record.owner_id,
    veterinarianId: record.veterinarian_id,
    appointmentId: record.appointment_id || "",
    consultationDate: record.consultation_date || "",
    chiefComplaint: record.chief_complaint || "",
    symptoms: record.symptoms || "",
    vitalSigns: record.vital_signs || "",
    weight: record.weight || "",
    temperature: record.temperature || "",
    diagnosis: record.diagnosis || "",
    treatment: record.treatment || "",
    treatmentPlan: record.treatment_plan || "",
    medication: record.medication || "",
    dosage: record.dosage || "",
    frequency: record.frequency || "",
    duration: record.duration || "",
    laboratoryRequest: record.laboratory_request || "",
    laboratoryResult: record.laboratory_result || "",
    vaccination: record.vaccination || "",
    parasiteTreatments: record.parasite_treatments || [],
    heartwormTests: record.heartworm_tests || [],
    vaccinationRecords: record.vaccination_records || [],
    recordTemplate: record.record_template || DEFAULT_MEDICAL_RECORD_TEMPLATE,
    templateData: record.template_data || {},
    followUpDate: record.follow_up_date || "",
    veterinarianNotes: record.veterinarian_notes || "",
    attachmentUrl: record.attachment_url || "",
    recordStatus: record.record_status || "Finalized",
  };
}

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

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch]
  );
}

const INVENTORY_CATEGORY_TABS = ["All", "Test", "Medicine", "Vaccine"];

// Groups the clinic's finer-grained inventory categories (Test Kits,
// Antibiotics, Supplements, Anti Parasite, Eye Drops, ...) into the three
// buckets this field is actually labeled for.
function classifyPickerCategory(category) {
  const value = (category || "").toLowerCase();
  if (value.includes("test") || value.includes("lab") || value.includes("diagnostic")) return "Test";
  if (value.includes("vaccine")) return "Vaccine";
  return "Medicine";
}

function printDate(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function printField(label, value) {
  return `
    <div class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <span class="field-value">${
        value ? escapeHtml(value) : "—"
      }</span>
    </div>
  `;
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
    inventorySearch,
    setInventorySearch,
  ] = useState("");

  const [
    inventoryCategoryTab,
    setInventoryCategoryTab,
  ] = useState("All");

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

  const [page, setPage] =
    useState(1);

  const [
    viewRecord,
    setViewRecord,
  ] = useState(null);

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

  const [
    showCompleteConfirm,
    setShowCompleteConfirm,
  ] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const activeTemplate = getMedicalRecordTemplate(
    form.recordTemplate
  );

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === form.petId),
    [pets, form.petId]
  );

  // Sorted by owner first so pets belonging to the same owner sit
  // together, making the picker faster to scan than scrolling
  // through every pet alphabetically.
  const petOptions = useMemo(
    () =>
      [...pets].sort((a, b) => {
        const ownerA = (a.owner?.full_name || "").toLowerCase();
        const ownerB = (b.owner?.full_name || "").toLowerCase();
        if (ownerA !== ownerB) return ownerA < ownerB ? -1 : 1;

        const nameA = (a.pet_name || "").toLowerCase();
        const nameB = (b.pet_name || "").toLowerCase();
        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
      }),
    [pets]
  );

  // Pick the pet owner first, then the pet list narrows to just
  // that owner's pets instead of one long combined list.
  const ownerOptions = useMemo(() => {
    const seen = new Map();

    petOptions.forEach((pet) => {
      if (pet.owner_id && !seen.has(pet.owner_id)) {
        seen.set(pet.owner_id, {
          id: pet.owner_id,
          full_name: pet.owner?.full_name || "Unnamed Owner",
        });
      }
    });

    return [...seen.values()].sort((a, b) =>
      a.full_name.toLowerCase() < b.full_name.toLowerCase()
        ? -1
        : 1
    );
  }, [petOptions]);

  const petOptionsForOwner = useMemo(
    () =>
      petOptions.filter(
        (pet) => pet.owner_id === form.ownerId
      ),
    [petOptions, form.ownerId]
  );

  const filteredInventoryOptions = useMemo(() => {
    const chosen = form.templateData?.inventoryItems || [];
    const keyword = inventorySearch.trim().toLowerCase();

    return inventoryOptions
      .filter(
        (option) =>
          !chosen.some((entry) => entry.id === option.id)
      )
      .filter(
        (option) =>
          inventoryCategoryTab === "All" ||
          classifyPickerCategory(option.category) === inventoryCategoryTab
      )
      .filter(
        (option) =>
          !keyword ||
          `${option.item_name} ${option.category}`
            .toLowerCase()
            .includes(keyword)
      );
  }, [inventoryOptions, inventorySearch, inventoryCategoryTab, form.templateData]);

  // Staff and pet owners get a read-only view; only the veterinarian who
  // treats the pet (or an admin) can create or edit a medical record.
  const canEdit = [
    "admin",
    "veterinarian",
  ].includes(
    profile?.role
  );

  // Staff can only look records up and print them -- no creating or editing.
  const isStaffView =
    profile?.role === "staff";

  const canCreate =
    profile?.role !== "pet_owner" &&
    !isStaffView;

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
          profile
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Reopening this exact consultation (same queue visit + template) that
    // was already finalized -- a refresh, a re-clicked queue link, a second
    // tab, browser back-then-forward -- must load the saved record instead
    // of a blank one, so clicking Complete again updates it in place.
    // (saveMedicalRecord also guards this server-side regardless of what
    // the form shows; this just keeps the form from lying about it.) Looked
    // up directly instead of depending on `records` in this effect, so
    // saving a second template for the same visit -- which reloads
    // `records` -- can't re-fire this and stomp the next template's blank
    // form with the one that was just finalized. `active` guards against a
    // slow lookup from a superseded navigation landing after a newer one.
    let active = true;
    getMedicalRecords(profile, { petId: queueLaunch.petIds[0] })
      .then((petRecords) => {
        if (!active) return;
        const alreadyFinalized = petRecords.find(
          (record) =>
            record.queue_entry_id === queueLaunch.queueEntryId &&
            (record.record_template || DEFAULT_MEDICAL_RECORD_TEMPLATE) === queueLaunch.recordTemplate &&
            record.record_status === "Finalized"
        );
        if (alreadyFinalized) setForm(recordToFormValues(alreadyFinalized));
      })
      .catch(() => {});

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

    setInventorySearch("");
    setShow(true);

    return () => { active = false; };
  }, [canEdit, queueLaunch, profile]);

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

  const RECORDS_PAGE_SIZE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, records]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      shown.length / RECORDS_PAGE_SIZE
    )
  );

  const currentPage = Math.min(
    page,
    totalPages
  );

  const paginatedShown = shown.slice(
    (currentPage - 1) * RECORDS_PAGE_SIZE,
    currentPage * RECORDS_PAGE_SIZE
  );

  function chooseOwner(ownerId) {
    setForm((current) => ({
      ...current,
      ownerId,
      petId: "",
      appointmentId: "",
    }));

    setAppointments([]);
  }

  async function choosePet(
    id
  ) {
    setForm((current) => ({
      ...current,
      petId: id,
      appointmentId: "",
    }));

    if (!id) {
      setAppointments([]);
      return;
    }

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
    setForm(recordToFormValues(record));

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
    setInventorySearch("");
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

  function pickInventoryItem(value) {
    if (!value) return;

    const current = form.templateData?.inventoryItems || [];

    if (value === "NA") {
      updateTemplateData({
        inventoryItems: [
          { id: "NA", item_name: "N/A", isNA: true },
        ],
      });
      setInventorySearch("");
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
          quantity: 1,
        },
      ],
    });
    setInventorySearch("");
  }

  function updateInventoryItemQuantity(id, quantity) {
    const value = Math.max(1, Math.round(Number(quantity) || 1));
    updateTemplateData({
      inventoryItems: (form.templateData?.inventoryItems || []).map((entry) =>
        entry.id === id ? { ...entry, quantity: value } : entry
      ),
    });
  }

  function removeInventoryItem(id) {
    updateTemplateData({
      inventoryItems: (
        form.templateData?.inventoryItems || []
      ).filter((entry) => entry.id !== id),
    });
  }

  function closeQueuedRecordModal(petId = form.petId) {
    setPendingQueueCompletion(null);
    setQueueContext(null);
    setShow(false);
    setForm(blank);

    // The finalized consultation is now viewed under Animal Patients, not
    // this module -- land the veterinarian there, at the exact pet, instead
    // of leaving them on this page.
    if (petId) {
      const basePath =
        profile?.role === "admin" ? "/admin/pets" :
        profile?.role === "staff" ? "/staff/patients" :
        "/veterinarian/patients";
      navigate(`${basePath}?pet=${petId}`);
    }
  }

  // Best-effort: generates the per-consultation AI Health Insight for a
  // just-finalized record and persists it (see saveConsultationInsight).
  // Never awaited by a caller and never throws -- the consultation is
  // already completed and billed regardless of whether this succeeds (e.g.
  // no Groq API key configured). PetManagementModule falls back to
  // generating it live if this didn't get to run.
  function triggerInsightPersistence(record) {
    if (!record?.id || !record?.pet_id) return;
    const pet = pets.find((item) => item.id === record.pet_id);
    if (!pet) return;

    getPreviousMedicalRecordsForAi(record.pet_id, record.id)
      .then((previousRecords) =>
        generateConsultationHealthInsight({ ...record, pet }, previousRecords)
      )
      .then((insightText) => saveConsultationInsight(record.id, insightText))
      .catch(() => {});
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
      await markConsultationReadyForBilling(
        queueContext.queueEntryId,
        profile
      );

      setSuccess(
        "Consultation completed. The record was finalized and sent to Staff POS for billing."
      );
      triggerInsightPersistence(
        records.find((record) => record.id === pendingQueueCompletion.recordId)
      );
      closeQueuedRecordModal();
    } catch (queueError) {
      setError(
        `Medical record is already saved, but it could not be sent to billing: ${queueError.message} Click Retry Complete to try again without creating another record.`
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
          queueEntryId: queueContext.queueEntryId,
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
        await markConsultationReadyForBilling(
          queueContext.queueEntryId,
          profile
        );

        setSuccess(
          "Consultation completed. The record was finalized and sent to Staff POS for billing."
        );
        triggerInsightPersistence(savedRecord);
        closeQueuedRecordModal(savedRecord?.pet_id || form.petId);
      } catch (queueError) {
        setPendingQueueCompletion({
          recordId: savedRecord?.id || form.id || null,
          templateLabel: activeTemplate.label,
        });
        setError(
          `Medical record saved, but it could not be sent to billing: ${queueError.message} Click Retry Complete to try again without creating another record.`
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmComplete() {
    setShowCompleteConfirm(false);
    await saveQueuedTemplate();
  }

  async function submit(event) {
    event.preventDefault();

    // Without this guard a rapid double-click (or a slow request the user
    // retries by clicking again) fires this handler twice; since form.id is
    // still empty on the second call, saveMedicalRecord inserts a second,
    // blank record instead of updating the first. Mirrors the same guard
    // saveQueuedTemplate already uses below.
    if (saving) return;

    if (queueContext) {
      if (pendingQueueCompletion) {
        await retryQueueCompletion();
        return;
      }

      setShowCompleteConfirm(true);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await saveMedicalRecord(
        { ...form, recordStatus: "Finalized" },
        profile
      );
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

    setInventorySearch("");
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

    windowRef.document.write(
      buildRecordDocumentHtml(record)
    );

    windowRef.document.close();

    windowRef.print();
  }

  function buildRecordDocumentHtml(
    record
  ) {
    const pet = record.pet || {};
    const owner = record.owner || {};
    const vet = record.veterinarian || {};
    const templateData = record.template_data || {};
    const template =
      record.record_template ||
      DEFAULT_MEDICAL_RECORD_TEMPLATE;
    const templateLabel = getMedicalRecordTemplate(
      template
    ).label;

    const patientBar = `
      <table class="patient-bar">
        <tr>
          <td><span class="k">Pet</span>${escapeHtml(pet.pet_name)}</td>
          <td><span class="k">Species / Breed</span>${escapeHtml(
            [pet.species, pet.breed].filter(Boolean).join(" / ") || "—"
          )}</td>
          <td><span class="k">Sex</span>${escapeHtml(pet.sex || "—")}</td>
        </tr>
        <tr>
          <td><span class="k">Guardian</span>${escapeHtml(
            owner.full_name
          )}</td>
          <td><span class="k">Veterinarian</span>${escapeHtml(
            vet.full_name
          )}</td>
          <td><span class="k">Date</span>${printDate(
            record.consultation_date
          )}</td>
        </tr>
      </table>
    `;

    function inventorySection() {
      const items = templateData.inventoryItems || [];
      if (!items.length) return "";

      return `
        <div class="section">
          <div class="section-title">Test / Medicine / Vaccine Given</div>
          <p class="plain">
            ${items
              .map((item) => escapeHtml(item.item_name))
              .join(", ")}
          </p>
        </div>
      `;
    }

    function tailSection() {
      return `
        ${
          record.follow_up_date
            ? `<div class="section">${printField(
                "Follow-up Date",
                printDate(record.follow_up_date)
              )}</div>`
            : ""
        }
        ${
          record.veterinarian_notes
            ? `<div class="section">
                <div class="section-title">Veterinarian Notes</div>
                <p class="plain">${escapeHtml(
                  record.veterinarian_notes
                )}</p>
              </div>`
            : ""
        }
      `;
    }

    function healthRecordBody() {
      return `
        <div class="section grid-2">
          ${printField("Chief Complaint", record.chief_complaint)}
          ${printField("Symptoms", record.symptoms)}
          ${printField("Vital Signs", record.vital_signs)}
          ${printField(
            "Weight",
            record.weight ? `${record.weight} kg` : ""
          )}
          ${printField(
            "Temperature",
            record.temperature
              ? `${record.temperature} °C`
              : ""
          )}
        </div>
        <div class="section">
          ${printField("Diagnosis", record.diagnosis)}
          ${printField("Treatment", record.treatment)}
          ${printField("Treatment Plan", record.treatment_plan)}
        </div>
        <div class="section grid-2">
          ${printField("Medication", record.medication)}
          ${printField("Dosage", record.dosage)}
          ${printField("Frequency", record.frequency)}
          ${printField("Duration", record.duration)}
        </div>
        <div class="section">
          ${printField(
            "Laboratory Request",
            record.laboratory_request
          )}
          ${printField(
            "Laboratory Result",
            record.laboratory_result
          )}
        </div>
      `;
    }

    function petProfileBody() {
      return `
        <div class="cover-box">
          <div class="cover-title">Health Record</div>
          <div class="cover-subtitle">Your Pet's Passport to Health</div>
          <div class="cover-fields">
            ${printField("Name of Pet", pet.pet_name)}
            ${printField(
              "Date of Birth",
              pet.date_of_birth
                ? printDate(pet.date_of_birth)
                : ""
            )}
            ${printField("Breed", pet.breed)}
            ${printField("Sex", pet.sex)}
            ${printField("Markings", pet.color)}
            ${printField("Microchip No.", pet.microchip_number)}
            ${printField("Guardian's Name", owner.full_name)}
            ${printField("Address", owner.address)}
            ${printField("Phone No.", owner.phone)}
            ${printField(
              "Patient No.",
              templateData.patientNumber
            )}
            ${printField(
              "Record No.",
              templateData.recordNumber
            )}
          </div>
        </div>
      `;
    }

    function vaccinationBody() {
      const rows = record.vaccination_records || [];
      const columns = [
        "Date",
        "Age",
        "Weight",
        ...VACCINE_KEYS.map(([, label]) => label),
        "Others",
        "Administered By",
      ];

      const rowsHtml = rows.length
        ? rows
            .map(
              (row) => `
              <tr>
                <td>${printDate(row.date)}</td>
                <td>${escapeHtml(row.age || "—")}</td>
                <td>${escapeHtml(row.weight || "—")}</td>
                ${VACCINE_KEYS.map(
                  ([key]) =>
                    `<td class="center">${
                      row[key] ? "✓" : ""
                    }</td>`
                ).join("")}
                <td>${escapeHtml(row.others || "—")}</td>
                <td>${escapeHtml(
                  row.administeredBy || "—"
                )}</td>
              </tr>
            `
            )
            .join("")
        : `<tr><td colspan="${columns.length}" class="empty">No vaccinations recorded.</td></tr>`;

      return `
        <table class="record-table">
          <thead>
            <tr>${columns
              .map((col) => `<th>${escapeHtml(col)}</th>`)
              .join("")}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    }

    function parasiteBody() {
      const rows = record.parasite_treatments || [];
      const rowsHtml = rows.length
        ? rows
            .map(
              (row) => `
              <tr>
                <td>${printDate(row.date)}</td>
                <td>${escapeHtml(row.treatment || "—")}</td>
              </tr>
            `
            )
            .join("")
        : `<tr><td colspan="2" class="empty">No parasite prevention entries.</td></tr>`;

      return `
        <table class="record-table">
          <thead><tr><th>Date</th><th>Treatment</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    }

    function heartwormBody() {
      const rows = record.heartworm_tests || [];
      const rowsHtml = rows.length
        ? rows
            .map(
              (row) => `
              <tr>
                <td>${printDate(row.date)}</td>
                <td>${escapeHtml(row.result || "—")}</td>
              </tr>
            `
            )
            .join("")
        : `<tr><td colspan="2" class="empty">No heartworm test results.</td></tr>`;

      return `
        <table class="record-table">
          <thead><tr><th>Date</th><th>Result</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    }

    function dentalBody() {
      return `
        <p class="legend">
          KEY: O = Displayed Tooth &nbsp;•&nbsp; X = Missing Tooth
          &nbsp;•&nbsp; ✕ = Caries, Injury, FX
        </p>
        <div class="section grid-2">
          ${printField("Gingiva", templateData.gingiva)}
          ${printField("Occlusion", templateData.occlusion)}
          ${printField("Salivation", templateData.salivation)}
          ${printField("Halitosis", templateData.halitosis)}
        </div>
        <div class="section">
          ${printField(
            "Periodontal Disease / Other Comment",
            templateData.periodontalNotes
          )}
          ${printField(
            "Dental Chart and Findings",
            templateData.dentalChart
          )}
          ${printField("Dental Treatment", record.treatment)}
        </div>
      `;
    }

    const bodyByTemplate = {
      "health-record": healthRecordBody,
      "pet-profile": petProfileBody,
      vaccination: vaccinationBody,
      "parasite-prevention": parasiteBody,
      heartworm: heartwormBody,
      dental: dentalBody,
    };

    const templateBody = (
      bodyByTemplate[template] || healthRecordBody
    )();

    return (`
      <html>
      <head>
        <title>${escapeHtml(templateLabel)} — ${escapeHtml(
      pet.pet_name || "Pet"
    )}</title>
        <style>
          * { box-sizing: border-box; }

          body {
            margin: 0;
            padding: 36px;
            font-family: Georgia, "Times New Roman", serif;
            color: #2b2320;
          }

          .letterhead {
            padding-bottom: 14px;
            margin-bottom: 16px;
            border-bottom: 3px solid #7a4a5a;
            text-align: center;
          }

          .clinic-name {
            font-size: 24px;
            font-weight: 700;
            color: #7a4a5a;
            letter-spacing: 0.3px;
          }

          .clinic-address,
          .clinic-contact {
            font-size: 12px;
            color: #5c5450;
            margin-top: 2px;
          }

          h2.doc-title {
            margin: 0 0 16px;
            padding: 8px 14px;
            background: #f3e1e6;
            border: 1px solid #d9b7c1;
            border-radius: 6px;
            color: #7a4a5a;
            font-size: 16px;
            text-align: center;
          }

          .patient-bar {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 18px;
          }

          .patient-bar td {
            border: 1px solid #d9c6cb;
            padding: 8px 10px;
            font-size: 12.5px;
            vertical-align: top;
          }

          .patient-bar .k {
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: #8a7a76;
            margin-bottom: 2px;
          }

          .section {
            margin-bottom: 14px;
          }

          .section-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: #7a4a5a;
            margin-bottom: 6px;
          }

          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 24px;
          }

          .field {
            display: flex;
            gap: 6px;
            padding: 5px 0;
            border-bottom: 1px dotted #d9c6cb;
            font-size: 13px;
          }

          .field-label {
            flex: 0 0 auto;
            font-weight: 700;
            color: #5c5450;
            white-space: nowrap;
          }

          .field-value {
            flex: 1;
          }

          .plain {
            margin: 0;
            font-size: 13px;
            line-height: 1.6;
          }

          .cover-box {
            border: 2px solid #7a4a5a;
            border-radius: 8px;
            padding: 18px 22px;
          }

          .cover-title {
            font-size: 20px;
            font-weight: 700;
            color: #7a4a5a;
          }

          .cover-subtitle {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #8a7a76;
            margin-bottom: 12px;
          }

          .record-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11.5px;
          }

          .record-table th,
          .record-table td {
            border: 1px solid #cbb8bd;
            padding: 6px 7px;
            text-align: left;
          }

          .record-table th {
            background: #f3e1e6;
            color: #7a4a5a;
          }

          .record-table .center {
            text-align: center;
          }

          .record-table .empty {
            text-align: center;
            color: #8a7a76;
            padding: 14px;
          }

          .legend {
            font-size: 11px;
            color: #5c5450;
            margin: 0 0 14px;
          }

          .signature {
            margin-top: 46px;
            width: 260px;
          }

          .signature .sig-line {
            border-top: 1px solid #2b2320;
            margin-bottom: 4px;
          }

          .sig-name {
            font-size: 13px;
            font-weight: 700;
          }

          .sig-label {
            font-size: 10.5px;
            color: #8a7a76;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }

          @media print {
            body { padding: 18px; }
          }
        </style>
      </head>

      <body>
        <div class="letterhead">
          <div class="clinic-name">Cruz Veterinary Clinic</div>
          <div class="clinic-address">
            2189 Stall G, Felimarc Pet Center, A. Luna St., Pasay City
          </div>
          <div class="clinic-contact">
            Sun: 0933 853 7649 &nbsp;•&nbsp; Globe: 0917 116 5379
            &nbsp;•&nbsp; Tel: 8356 0126
          </div>
        </div>

        <h2 class="doc-title">${escapeHtml(templateLabel)}</h2>

        ${patientBar}
        ${templateBody}
        ${inventorySection()}
        ${tailSection()}

        <div class="signature">
          <div class="sig-line"></div>
          <div class="sig-name">
            ${escapeHtml(vet.full_name || "")}${
      vet.full_name ? ", DVM" : ""
    }
          </div>
          <div class="sig-label">Veterinarian's Signature</div>
        </div>
      </body>
      </html>
    `);
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
        `Generated: ${formatDateTime12h(new Date())}`,
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

        {canCreate && (
          <select
            className="new-record-select"
            aria-label="Create a new medical record"
            defaultValue=""
            onChange={(event) => {
              const template = event.target.value;
              event.target.value = "";
              if (!template) return;

              setForm({
                ...blank,

                veterinarianId:
                  profile.role ===
                  "veterinarian"
                    ? profile.id
                    : "",

                recordTemplate: template,
              });

              setQueueContext(null);
              setPendingQueueCompletion(null);
              setInventorySearch("");
              setShow(true);
            }}
          >
            <option value="" disabled>
              + New Record
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
      ) : isStaffView ? (
        <>
          <div className="mr-table-wrap">
            <table className="mr-table">
              <thead>
                <tr>
                  <th>Pet / Owner</th>
                  <th>Date</th>
                  <th>Veterinarian</th>
                  <th>Complaint</th>
                  <th>Diagnosis</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedShown.map(
                  (record) => (
                    <tr key={record.id}>
                      <td>
                        <b>
                          {record.pet
                            ?.pet_name}
                        </b>

                        <div>
                          {record.pet
                            ?.species ||
                            "Pet"}{" "}
                          •{" "}
                          {record.owner
                            ?.full_name ||
                            "Owner"}
                        </div>
                      </td>

                      <td>
                        {
                          record.consultation_date
                        }
                      </td>

                      <td>
                        {record
                          .veterinarian
                          ?.full_name ||
                          "—"}
                      </td>

                      <td>
                        {record.chief_complaint ||
                          "—"}
                      </td>

                      <td>
                        {record.diagnosis ||
                          "—"}
                      </td>

                      <td>
                        <div className="mr-row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setViewRecord(
                                record
                              )
                            }
                          >
                            <Eye
                              size={15}
                            />
                            View
                          </button>

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
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mr-pagination">
              <button
                type="button"
                className="mr-page-nav"
                disabled={currentPage === 1}
                onClick={() =>
                  setPage(
                    (p) => p - 1
                  )
                }
                aria-label="Previous page"
              >
                <ChevronLeft
                  size={17}
                />
              </button>

              <div className="mr-pagination-pages">
                {Array.from(
                  {
                    length: totalPages,
                  },
                  (_, i) => i + 1
                ).map((num) => (
                  <button
                    type="button"
                    key={num}
                    className={
                      num ===
                      currentPage
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setPage(num)
                    }
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="mr-page-nav"
                disabled={
                  currentPage ===
                  totalPages
                }
                onClick={() =>
                  setPage(
                    (p) => p + 1
                  )
                }
                aria-label="Next page"
              >
                <ChevronRight
                  size={17}
                />
              </button>
            </div>
          )}
        </>
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

      {viewRecord && (
        <div
          className="mr-view-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Medical record details"
        >
          <div className="mr-view-card">
            <div className="mr-view-head">
              <h3>
                {getMedicalRecordTemplate(
                  viewRecord.record_template ||
                    DEFAULT_MEDICAL_RECORD_TEMPLATE
                ).label}{" "}
                —{" "}
                {viewRecord.pet
                  ?.pet_name ||
                  "Pet"}
              </h3>

              <div className="mr-view-actions">
                {viewRecord.attachment_url && (
                  <a
                    href={
                      viewRecord.attachment_url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Attachment
                  </a>
                )}

                <button
                  type="button"
                  onClick={() =>
                    printRecord(
                      viewRecord
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
                  className="mr-view-close"
                  onClick={() =>
                    setViewRecord(
                      null
                    )
                  }
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <iframe
              title="Medical record preview"
              className="mr-view-frame"
              srcDoc={buildRecordDocumentHtml(
                viewRecord
              )}
            />
          </div>
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
                  ? `${pendingQueueCompletion.templateLabel} is already saved. Retry Complete to send this consultation to billing without creating another record.`
                  : <>
                      Adding {activeTemplate.label} for pet{" "}
                      {queueContext.currentIndex + 1}{" "}
                      of {queueContext.petIds.length}{" "}
                      in this visit. Add more
                      templates as needed, then
                      choose Complete to
                      finish this consultation.
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
              <div className="wide context-fields">
              <label>
                Pet Owner<span className="required-mark"> *</span>

                <select
                  required
                  disabled={!!queueContext}
                  value={
                    form.ownerId
                  }
                  onChange={(e) =>
                    chooseOwner(
                      e.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Select pet owner
                  </option>

                  {ownerOptions.map(
                    (owner) => (
                      <option
                        key={
                          owner.id
                        }
                        value={
                          owner.id
                        }
                      >
                        {
                          owner.full_name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Pet<span className="required-mark"> *</span>

                <select
                  required
                  disabled={
                    !!queueContext ||
                    !form.ownerId
                  }
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
                    {form.ownerId
                      ? "Select pet"
                      : "Select pet owner first"}
                  </option>

                  {petOptionsForOwner.map(
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
                        }
                        {pet.species
                          ? ` — ${pet.species}`
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Veterinarian<span className="required-mark"> *</span>

                <select
                  required
                  disabled={
                    !!queueContext ||
                    profile.role === "veterinarian"
                  }
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
                  disabled={!!queueContext}
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
                          formatTime12h(appointment.start_time)
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Consultation Date<span className="required-mark"> *</span>

                <input
                  type="date"
                  required
                  disabled={!!queueContext}
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

              {queueContext && (
                <label>
                  Consultation Fee (₱)

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!canEdit}
                    readOnly
                    value={
                      form.consultationFee
                    }
                  />
                </label>
              )}
              </div>

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

              <div className="wide field-block">
                Attachment

                <div className="attachment-box">
                  <label className="attachment-trigger">
                    <Upload size={16} />

                    <span>
                      {saving
                        ? "Uploading…"
                        : form.attachmentUrl
                          ? "Replace File"
                          : "Choose File"}
                    </span>

                    <input
                      type="file"
                      disabled={saving}
                      onChange={
                        fileChange
                      }
                    />
                  </label>

                  {form.attachmentUrl ? (
                    <a
                      className="attachment-view"
                      href={
                        form.attachmentUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileDown size={14} />
                      View uploaded file
                    </a>
                  ) : (
                    <span className="attachment-empty">
                      No file attached yet.
                    </span>
                  )}
                </div>
              </div>

              <label className="wide">
                Test / Medicine / Vaccine Given
                <span className="field-hint">
                  Required — used by the POS to compute the payment total.
                </span>

                <div className="inventory-picker">
                  <div className="inventory-category-tabs" role="tablist" aria-label="Filter by item type">
                    <div
                      className="inventory-category-tabs-slider"
                      style={{
                        width: `${100 / INVENTORY_CATEGORY_TABS.length}%`,
                        left: `${(INVENTORY_CATEGORY_TABS.indexOf(inventoryCategoryTab) * 100) / INVENTORY_CATEGORY_TABS.length}%`,
                      }}
                    />
                    {INVENTORY_CATEGORY_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={inventoryCategoryTab === tab}
                        className={`inventory-category-tab${inventoryCategoryTab === tab ? " active" : ""}`}
                        disabled={!canEdit}
                        onClick={() => setInventoryCategoryTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="inventory-picker-search">
                    <Search size={15} />

                    <input
                      type="text"
                      placeholder="Search inventory by name or category…"
                      value={inventorySearch}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setInventorySearch(e.target.value)
                      }
                    />
                  </div>

                  <div className="inventory-picker-list">
                    <button
                      type="button"
                      className="inventory-picker-na"
                      disabled={!canEdit}
                      onClick={() => pickInventoryItem("NA")}
                    >
                      N/A — nothing given
                    </button>

                    {filteredInventoryOptions.length === 0 ? (
                      <div className="inventory-picker-empty">
                        No matching inventory items.
                      </div>
                    ) : (
                      filteredInventoryOptions.map((option) => (
                        <button
                          type="button"
                          key={option.id}
                          className="inventory-picker-item"
                          disabled={!canEdit}
                          onClick={() =>
                            pickInventoryItem(option.id)
                          }
                        >
                          <span className="inventory-picker-item-name">
                            {option.item_name}
                          </span>

                          <span className="inventory-picker-item-meta">
                            {option.category} · ₱
                            {Number(
                              option.unit_price || 0
                            ).toFixed(2)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {(form.templateData?.inventoryItems || []).length > 0 && (
                  <div className="chosen-items">
                    {form.templateData.inventoryItems.map((entry) => {
                      const qty = Math.max(1, Number(entry.quantity ?? 1) || 1);
                      const lineTotal = Number(entry.unit_price || 0) * qty;
                      return (
                        <div className="chosen-item-box" key={entry.id}>
                          <div className="chosen-item-box-main">
                            <span className="chosen-item-box-name">{entry.item_name}</span>
                            {!entry.isNA && (
                              <span className="chosen-item-box-price">
                                ₱{Number(entry.unit_price || 0).toFixed(2)} each
                                {qty > 1 && <> · <b>₱{lineTotal.toFixed(2)} total</b></>}
                              </span>
                            )}
                          </div>
                          <div className="chosen-item-box-actions">
                            {!entry.isNA && (canEdit ? (
                              <label className="chosen-item-qty">
                                <span>Qty</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={entry.quantity ?? 1}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => updateInventoryItemQuantity(entry.id, event.target.value)}
                                  aria-label={`Quantity for ${entry.item_name}`}
                                />
                              </label>
                            ) : (
                              <span className="chosen-item-box-qty-static">× {entry.quantity ?? 1}</span>
                            ))}
                            {canEdit && (
                              <button
                                type="button"
                                aria-label={`Remove ${entry.item_name}`}
                                onClick={() => removeInventoryItem(entry.id)}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                      ? "Retry Complete"
                      : "Complete"}
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

      <ConfirmDialog
        open={showCompleteConfirm}
        title="Complete Consultation?"
        description="This medical record will be finalized and sent to Staff POS for billing."
        confirmLabel="Complete"
        cancelLabel="Cancel"
        tone="primary"
        busy={saving}
        onConfirm={confirmComplete}
        onCancel={() => setShowCompleteConfirm(false)}
      />

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
                <PredictiveHealthReport
                  record={aiRecord}
                  aiText={aiText}
                />
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
          grid-template-columns: minmax(260px, 1fr) auto;
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

        .mr .toolbar select.new-record-select {
          background: #4da8da;
          border-color: #4da8da;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .mr .toolbar select.new-record-select:focus {
          box-shadow: 0 0 0 3px rgba(77,168,218,.28);
        }

        .mr .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
        }

        .mr .card {
          display: flex;
          flex-direction: column;
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

        .mr .actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: auto;
          padding-top: 14px;
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

        .mr-panel .context-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 16px 18px;
          margin-bottom: 4px;
          padding: 16px 18px;
          border: 1px solid #e1edf2;
          border-radius: 14px;
          background: #f7fbfd;
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

        .mr-panel .fields input:disabled,
        .mr-panel .fields select:disabled {
          background: #f4f7f9;
          color: #7c8c94;
          cursor: not-allowed;
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
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 10px;
        }

        .mr-panel .chosen-item-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #cfe2ea;
          background: #f5fbfd;
        }

        .mr-panel .chosen-item-box-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .mr-panel .chosen-item-box-name {
          color: #21697f;
          font-weight: 800;
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mr-panel .chosen-item-box-price {
          color: #6f8792;
          font-size: 11.5px;
          font-weight: 600;
        }

        .mr-panel .chosen-item-box-price b {
          color: #21697f;
        }

        .mr-panel .chosen-item-box-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .mr-panel .chosen-item-box-qty-static {
          color: #21697f;
          font-weight: 700;
          font-size: 12px;
        }

        .mr-panel .chosen-item-box-actions button {
          display: inline-flex;
          border: 0;
          background: #eaf6fb;
          border-radius: 8px;
          padding: 5px;
          color: #21697f;
          cursor: pointer;
        }

        .mr-panel .chosen-item-qty {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #fff;
          border: 1px solid #cfe2ea;
          border-radius: 8px;
          padding: 3px 6px 3px 8px;
        }

        .mr-panel .chosen-item-qty span {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: .3px;
          color: #6f8a95;
          font-weight: 800;
        }

        .mr-panel .chosen-item-qty input {
          width: 42px;
          border: 0;
          padding: 2px 0;
          font-size: 12px;
          text-align: center;
          color: #21697f;
          font-weight: 700;
        }

        .mr-panel .inventory-picker {
          border: 1px solid #cfe2ea;
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
        }

        .mr-panel .inventory-category-tabs {
          position: relative;
          display: flex;
          margin: 10px 10px 0;
          padding: 3px;
          border-radius: 10px;
          background: #eaf3f7;
        }

        .mr-panel .inventory-category-tabs-slider {
          position: absolute;
          top: 3px;
          bottom: 3px;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 2px 6px rgba(33, 105, 127, .18);
          transition: left .22s ease;
        }

        .mr-panel .inventory-category-tab {
          position: relative;
          z-index: 1;
          flex: 1;
          border: 0;
          background: none;
          padding: 8px 6px;
          font-size: 12.5px;
          font-weight: 700;
          color: #6f8792;
          cursor: pointer;
          border-radius: 8px;
        }

        .mr-panel .inventory-category-tab.active {
          color: #21697f;
        }

        .mr-panel .inventory-category-tab:disabled {
          cursor: not-allowed;
          opacity: .6;
        }

        .mr-panel .inventory-picker-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 13px;
          border-bottom: 1px solid #e6f1f5;
          background: #f8fcfe;
          color: #7c8c94;
        }

        .mr-panel .inventory-picker-search input {
          width: 100%;
          height: 44px;
          border: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          color: #20313b;
          font: inherit;
          outline: none;
        }

        .mr-panel .inventory-picker-list {
          max-height: 220px;
          overflow-y: auto;
          padding: 6px;
        }

        .mr-panel .inventory-picker-na,
        .mr-panel .inventory-picker-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          border: 0;
          border-radius: 9px;
          padding: 10px 11px;
          background: none;
          text-align: left;
          font: inherit;
          font-weight: 600;
          color: #20313b;
          cursor: pointer;
        }

        .mr-panel .inventory-picker-na {
          margin-bottom: 4px;
          color: #718792;
          border-bottom: 1px solid #edf3f6;
          border-radius: 9px 9px 0 0;
        }

        .mr-panel .inventory-picker-na:hover,
        .mr-panel .inventory-picker-item:hover {
          background: #eaf6fb;
        }

        .mr-panel .inventory-picker-na:disabled,
        .mr-panel .inventory-picker-item:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .mr-panel .inventory-picker-item-name {
          color: #20313b;
        }

        .mr-panel .inventory-picker-item-meta {
          flex-shrink: 0;
          color: #7c8c94;
          font-weight: 500;
          font-size: 12px;
        }

        .mr-panel .inventory-picker-empty {
          padding: 16px 11px;
          color: #8496a0;
          font-size: 13px;
          font-weight: 400;
          text-align: center;
        }

        .mr-panel .field-block {
          display: grid;
          gap: 7px;
          font-weight: 700;
          font-size: 13px;
          color: #294653;
        }

        .mr-panel .attachment-box {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 14px;
          border: 1px dashed #9dc9da;
          border-radius: 12px;
          background: #f8fdff;
        }

        .mr-panel .attachment-trigger {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 15px;
          border: 1px solid #cfe4ec;
          border-radius: 10px;
          background: #fff;
          color: #237da4;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition:
            background 0.2s ease,
            border-color 0.2s ease;
        }

        .mr-panel .attachment-trigger:hover {
          background: #eaf6fb;
          border-color: #a9dff0;
        }

        .mr-panel .attachment-trigger input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .mr-panel .attachment-view {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #21697f;
          font-weight: 700;
          font-size: 13px;
          text-decoration: underline;
        }

        .mr-panel .attachment-empty {
          color: #7c8c94;
          font-weight: 500;
          font-size: 13px;
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

        .mr-table-wrap {
          overflow-x: auto;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(47,117,150,.09);
        }

        .mr-table {
          width: 100%;
          min-width: 780px;
          border-collapse: collapse;
          font-size: 14px;
        }

        .mr-table th {
          text-align: left;
          padding: 13px 14px;
          color: #536b78;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .4px;
          border-bottom: 1px solid #e1edf2;
        }

        .mr-table td {
          padding: 13px 14px;
          border-bottom: 1px solid #edf3f5;
          color: #334f5d;
          vertical-align: top;
        }

        .mr-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .mr-table tbody tr:hover {
          background: #f5fbfd;
        }

        .mr-table .mr-row-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .mr-row-actions button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #cde6f0;
          background: #edf7fb;
          color: #247ba5;
          border-radius: 8px;
          padding: 7px 11px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .mr-row-actions button:hover {
          background: #dcf0f8;
        }

        .mr-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-top: 18px;
          padding-top: 16px;
        }

        .mr-page-nav {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border: 1px solid #cfe4ed;
          border-radius: 50%;
          background: #fff;
          color: #2b6f8f;
          cursor: pointer;
        }

        .mr-page-nav:hover:not(:disabled) {
          background: #eaf6fb;
        }

        .mr-page-nav:disabled {
          cursor: not-allowed;
          opacity: .4;
        }

        .mr-pagination-pages {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .mr-pagination-pages button {
          min-width: 38px;
          min-height: 38px;
          border: 1px solid transparent;
          border-radius: 9px;
          background: transparent;
          color: #536b78;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }

        .mr-pagination-pages button:hover {
          background: #eaf6fb;
        }

        .mr-pagination-pages button.active {
          border-color: #318fbe;
          background: #318fbe;
          color: #fff;
        }

        .mr-view-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20,40,50,.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 80;
          padding: 20px;
        }

        .mr-view-card {
          background: #fff;
          border-radius: 16px;
          width: min(820px, 100%);
          height: min(82vh, 780px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 48px rgba(16,50,67,.24);
        }

        .mr-view-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid #e1edf2;
          flex: 0 0 auto;
        }

        .mr-view-head h3 {
          margin: 0;
          color: #213944;
          font-size: 17px;
        }

        .mr-view-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .mr-view-actions button,
        .mr-view-actions a {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #cde6f0;
          background: #edf7fb;
          color: #247ba5;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
        }

        .mr-view-actions button.mr-view-close {
          border: 0;
          background: transparent;
          color: #536b78;
          padding: 8px;
        }

        .mr-view-frame {
          flex: 1 1 auto;
          border: 0;
          width: 100%;
          height: 100%;
          min-height: 0;
          background: #f7fbfd;
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

          .mr-panel .context-fields {
            grid-template-columns: 1fr;
            padding: 14px;
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

          .ai-warning {
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
