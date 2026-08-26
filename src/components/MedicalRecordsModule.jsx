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
  Check,
  FileDown,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";

import {
  getPets,
} from "../services/petService";

import {
  generateConsultationHealthInsight,
  getActiveVeterinarians,
  getAppointmentsForPet,
  getMedicalRecords,
  getPreviousMedicalRecordsForAi,
  saveConsultationInsight,
  saveMedicalRecord,
  uploadMedicalAttachment,
} from "../services/medicalRecordService";

import { formatTime12h } from "../utils/timeFormat";

import { getInventoryItems } from "../services/inventoryService";
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

// Built from the y/m/d components (not parsed from the string) so this never
// shifts a day off from timezone-parsing a plain "YYYY-MM-DD" value.
function formatHistoryDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

  const [
    historyRecords,
    setHistoryRecords,
  ] = useState([]);

  const [
    expandedHistoryId,
    setExpandedHistoryId,
  ] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const activeTemplate = getMedicalRecordTemplate(
    form.recordTemplate
  );

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === form.petId),
    [pets, form.petId]
  );

  // Every record already saved for this visit, regardless of template --
  // lets the left-side template rail mark which ones are done, and lets
  // selectTemplate know whether switching needs to save first.
  const visitSavedRecords = useMemo(
    () =>
      queueContext
        ? records.filter(
            (record) => record.queue_entry_id === queueContext.queueEntryId
          )
        : [],
    [records, queueContext]
  );

  const visitSavedTemplateValues = useMemo(
    () => visitSavedRecords.map((record) => record.record_template),
    [visitSavedRecords]
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

    // History panel: every vet's finalized past visits for this pet, minus
    // whatever's already been saved for the visit in progress right now.
    getMedicalRecords(profile, {
      petId: queueLaunch.petIds[0],
      allVeterinarians: true,
    })
      .then((pastRecords) => {
        if (!active) return;
        setHistoryRecords(
          pastRecords.filter(
            (record) => record.queue_entry_id !== queueLaunch.queueEntryId
          )
        );
      })
      .catch(() => setHistoryRecords([]));

    setInventorySearch("");
    setShow(true);

    return () => { active = false; };
  }, [canEdit, queueLaunch, profile]);

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

  // Left-rail "Choose Template" click. Before anything has been saved for
  // this visit there's nothing to preserve, so just switch locally with no
  // network call; once at least one template has been saved, switching
  // behaves exactly like the old "Add Another Record" control -- save the
  // current template, then open the next one blank.
  function selectTemplate(template) {
    if (template === form.recordTemplate || saving) return;

    if (visitSavedRecords.length === 0 && !form.id) {
      setForm((current) => ({
        ...blank,
        petId: current.petId,
        ownerId: current.ownerId,
        veterinarianId: current.veterinarianId,
        appointmentId: current.appointmentId,
        consultationDate: current.consultationDate,
        recordTemplate: template,
        templateData: {},
      }));
      setInventorySearch("");
      return;
    }

    saveQueuedTemplate(template);
  }

  return (
    <div className="mr">

      {show && (
        <div className="mrp">
          <div className="mrp-header">
            <div>
              <p className="mrp-eyebrow">Medical Record</p>
              <h1>{form.id ? "Update" : "Create"} {activeTemplate.label}</h1>
            </div>

            <button
              type="button"
              className="mrp-back"
              onClick={() => {
                setPendingQueueCompletion(null);
                setQueueContext(null);
                setShow(false);
                setForm(blank);

                // Closing without completing returns straight to the
                // veterinarian's queue -- this form is only ever reached
                // from there now, never from a standalone records page.
                const queuePath =
                  profile?.role === "admin" ? "/admin/queue" :
                  profile?.role === "staff" ? "/staff/queue" :
                  "/veterinarian/queue";
                navigate(queuePath);
              }}
            >
              <X size={16} /> Back to Queue
            </button>
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

          {queueContext && (
            <div className="queue-context-banner">
              {pendingQueueCompletion
                ? `${pendingQueueCompletion.templateLabel} is already saved. Retry Complete to send this consultation to billing without creating another record.`
                : <>
                    Adding {activeTemplate.label} for pet{" "}
                    {queueContext.currentIndex + 1}{" "}
                    of {queueContext.petIds.length}{" "}
                    in this visit. Choose a
                    different template on the left
                    whenever you need to, then
                    choose Complete to
                    finish this consultation.
                  </>}
            </div>
          )}

          <form
            onSubmit={
              submit
            }
          >
            <div className="context-fields mrp-summary">
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

            <div className="mrp-grid">
              <aside className="mrp-rail">
                <span className="mrp-rail-title">Choose Template</span>
                {MEDICAL_RECORD_TEMPLATES.map((template) => (
                  <button
                    type="button"
                    key={template.value}
                    className={`mrp-rail-item${form.recordTemplate === template.value ? " active" : ""}${visitSavedTemplateValues.includes(template.value) ? " saved" : ""}`}
                    disabled={saving}
                    onClick={() => selectTemplate(template.value)}
                  >
                    <span>{template.label}</span>
                    {visitSavedTemplateValues.includes(template.value) && <Check size={14} />}
                  </button>
                ))}
              </aside>

              <section className="mr-panel">
                <div className="template-intro">
                  <b>{activeTemplate.label}</b>
                  <span>{activeTemplate.description}</span>
                </div>

                <div className="fields">

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
              </section>

              <aside className="mrp-history">
                <span className="mrp-history-title">History</span>

                {historyRecords.length === 0 ? (
                  <p className="mrp-history-empty">
                    No past visits recorded for this pet yet.
                  </p>
                ) : (
                  historyRecords.map((record) => {
                    const expanded = expandedHistoryId === record.id;
                    const template = getMedicalRecordTemplate(record.record_template);

                    return (
                      <div className={`mrp-history-card${expanded ? " expanded" : ""}`} key={record.id}>
                        <button
                          type="button"
                          className="mrp-history-summary"
                          onClick={() => setExpandedHistoryId(expanded ? null : record.id)}
                        >
                          <span className="mrp-history-date">{formatHistoryDate(record.consultation_date)}</span>
                          <span className="mrp-history-label">{template.label}</span>
                          <span className="mrp-history-title-text">{record.diagnosis || record.chief_complaint || "General consultation"}</span>
                          <span className="mrp-history-vet">{record.veterinarian?.full_name ? `Dr. ${record.veterinarian.full_name}` : "Veterinarian not recorded"}</span>
                        </button>

                        {expanded && (
                          <div className="mrp-history-details">
                            {record.symptoms && <p><b>Symptoms:</b> {record.symptoms}</p>}
                            {record.diagnosis && <p><b>Diagnosis:</b> {record.diagnosis}</p>}
                            {record.treatment && <p><b>Treatment:</b> {record.treatment}</p>}
                            {record.veterinarian_notes && <p><b>Notes:</b> {record.veterinarian_notes}</p>}
                            {!record.symptoms && !record.diagnosis && !record.treatment && !record.veterinarian_notes && (
                              <p>No additional details recorded.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </aside>
            </div>

            <div className="mrp-actions">
              {queueContext ? (
                <button
                  type="submit"
                  className="save"
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
            </div>
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

      <style>{`
        .mr {
          width: 100%;
          color: #20313b;
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

        .mrp {
          width: 100%;
        }

        .mrp-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .mrp-eyebrow {
          margin: 0 0 2px;
          color: #6f8792;
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .mrp-header h1 {
          margin: 0;
          color: #17445a;
          font-size: 26px;
        }

        .mrp-back {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          flex-shrink: 0;
          border: 1px solid #cfe2ea;
          background: #fff;
          color: #21697f;
          border-radius: 10px;
          padding: 10px 15px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .mrp-back:hover {
          background: #eaf6fb;
        }

        .mrp-grid {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr) 300px;
          gap: 20px;
          align-items: start;
        }

        .mrp-rail {
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: sticky;
          top: 20px;
        }

        .mrp-rail-title,
        .mrp-history-title {
          font-weight: 800;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #6f8792;
          padding: 0 2px 4px;
        }

        .mrp-rail-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border: 1px solid #dcecf2;
          background: #fff;
          border-radius: 12px;
          padding: 13px 14px;
          font-weight: 700;
          font-size: 13px;
          color: #48717f;
          text-align: left;
          cursor: pointer;
        }

        .mrp-rail-item:hover {
          background: #f4fbfe;
        }

        .mrp-rail-item.saved {
          color: #267da3;
          border-color: #bfe3f0;
        }

        .mrp-rail-item.active {
          border-color: #4da8da;
          background: #eaf6fb;
          color: #17445a;
          box-shadow: 0 0 0 1px #4da8da;
        }

        .mrp-rail-item.active svg {
          color: #267da3;
        }

        .mrp-rail-item:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .mr-panel {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(47,117,150,.09);
          padding: 22px;
          min-width: 0;
        }

        .mrp-history {
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: sticky;
          top: 20px;
          max-height: calc(100vh - 150px);
          overflow-y: auto;
        }

        .mrp-history-empty {
          margin: 0;
          padding: 14px;
          border: 1px dashed #d7e6ec;
          border-radius: 12px;
          color: #7c8c94;
          font-size: 12.5px;
        }

        .mrp-history-card {
          border: 1px solid #e1eef3;
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
        }

        .mrp-history-card.expanded {
          border-color: #a9dff0;
        }

        .mrp-history-summary {
          display: flex;
          flex-direction: column;
          gap: 2px;
          width: 100%;
          border: 0;
          background: none;
          padding: 12px 13px;
          text-align: left;
          cursor: pointer;
        }

        .mrp-history-summary:hover {
          background: #f7fbfd;
        }

        .mrp-history-date {
          color: #6f8792;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .03em;
        }

        .mrp-history-label {
          color: #267da3;
          font-weight: 700;
          font-size: 11.5px;
        }

        .mrp-history-title-text {
          color: #20313b;
          font-weight: 700;
          font-size: 13px;
        }

        .mrp-history-vet {
          color: #7c8c94;
          font-size: 12px;
        }

        .mrp-history-details {
          display: grid;
          gap: 6px;
          padding: 0 13px 13px;
          font-size: 12.5px;
          color: #48717f;
        }

        .mrp-history-details p {
          margin: 0;
        }

        .mrp-history-details b {
          color: #294653;
        }

        .mrp-actions {
          margin-top: 22px;
        }

        .mrp-actions .save {
          width: 100%;
          min-height: 50px;
          border: 0;
          border-radius: 11px;
          background: #318fbe;
          color: #fff;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }

        .mrp-actions .save:disabled {
          opacity: .65;
          cursor: not-allowed;
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

        .mr .context-fields {
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 16px 18px;
          margin-bottom: 18px;
          padding: 16px 18px;
          border: 1px solid #e1edf2;
          border-radius: 14px;
          background: #f7fbfd;
        }

        .mr-panel .fields label,
        .mr .context-fields label {
          display: grid;
          gap: 7px;
          font-weight: 700;
          font-size: 13px;
          color: #294653;
        }

        .mr-panel .fields input,
        .mr-panel .fields select,
        .mr-panel .fields textarea,
        .mr .context-fields input,
        .mr .context-fields select {
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
        .mr-panel .fields select,
        .mr .context-fields input,
        .mr .context-fields select {
          height: 48px;
        }

        .mr-panel .fields input:focus,
        .mr-panel .fields select:focus,
        .mr-panel .fields textarea:focus,
        .mr .context-fields input:focus,
        .mr .context-fields select:focus {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77,168,218,.12);
        }

        .mr-panel .fields input:disabled,
        .mr-panel .fields select:disabled,
        .mr .context-fields input:disabled,
        .mr .context-fields select:disabled {
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

        @media(max-width:1100px) {
          .mrp-grid {
            grid-template-columns: 1fr;
          }

          .mrp-rail {
            position: static;
            flex-direction: row;
            flex-wrap: wrap;
          }

          .mrp-rail-item {
            flex: 1 1 160px;
          }

          .mrp-history {
            position: static;
            max-height: none;
          }
        }

        @media(max-width:650px) {
          .mrp-header {
            flex-direction: column;
          }

          .mr .context-fields {
            grid-template-columns: 1fr;
            padding: 14px;
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

          .mr-panel .pet-profile-summary dl {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
