import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  BrainCircuit,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileHeart,
  History,
  PawPrint,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Stethoscope,
  UserCircle,
  Users,
  X,
} from "lucide-react";

import { getOwners } from "../services/appointmentService";
import {
  archivePet,
  getPetAppointments,
  getPetOwnersDirectory,
  getPets,
  savePet,
  uploadPetPhoto,
} from "../services/petService";
import { validateImageFile } from "../utils/validators";
import { formatDateLong, formatPetAge } from "../utils/timeFormat";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";
import { generateConsultationHealthInsight, generatePredictiveHealthAnalysis, getActiveVeterinarians, getMedicalRecords, getPreviousMedicalRecordsForAi } from "../services/medicalRecordService";
import { computeRiskLevel, daysUntil, keywordSet, parseAiReport, parseConsultationInsight, sharesKeyword, toListItems } from "../utils/predictiveHealthParsing";
import { downloadInvoicePdf, downloadPrescriptionPadPdf, printMedicalRecordDocument, viewPrescriptionPadPdf } from "../utils/invoicePdf";
import {
  getPrescriptionPurchaseHistory,
  getPrescriptionsForConsultation,
  markPrescriptionElsewhere,
} from "../services/billingService";
import { getTransactionsForQueueEntry } from "../services/transactionService";
import {
  SPECIES_GROUPS,
  SPECIES_OPTIONS,
  SEX_OPTIONS,
  BREEDS_BY_SPECIES,
  COLORS_BY_SPECIES,
} from "../constants/petOptions";
import AnimalPatientAIHealth from "./AnimalPatientAIHealth";
import ConsultationHealthInsight from "./ConsultationHealthInsight";

function money(value) {
  return Number(value || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function invoiceBalance(transaction) {
  return Math.max(0, Number(transaction?.total_amount || 0) - Number(transaction?.amount_paid || 0));
}

const MANILA_TIME_ZONE = "Asia/Manila";

function formatPurchaseDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone: MANILA_TIME_ZONE,
  });
}

// Resolves the real moment a timeline entry happened. appointments.start_time
// is a plain "time" column with no zone -- it's clinic-local wall time, so
// it's anchored to +08:00 (Asia/Manila) rather than the viewer's own
// timezone. Walk-ins (no linked appointment) use the record's created_at, a
// real timestamptz that marks when the consultation was actually recorded --
// never updated_at, which only reflects the most recent edit. Falls back to
// date-only when no time component exists, rather than inventing one.
function resolveVisitDateTime(entry) {
  const { appointment, record } = entry;

  if (appointment?.appointment_date && appointment?.start_time) {
    const time = String(appointment.start_time).slice(0, 8);
    const parsed = new Date(`${appointment.appointment_date}T${time}+08:00`);
    if (!Number.isNaN(parsed.getTime())) return { date: parsed, hasTime: true };
  }

  if (record?.created_at) {
    const parsed = new Date(record.created_at);
    if (!Number.isNaN(parsed.getTime())) return { date: parsed, hasTime: true };
  }

  const dateOnly = record?.consultation_date || appointment?.appointment_date;
  if (dateOnly) {
    const parsed = new Date(`${dateOnly}T00:00:00+08:00`);
    if (!Number.isNaN(parsed.getTime())) return { date: parsed, hasTime: false };
  }

  return { date: null, hasTime: false };
}

function formatVisitDateTime({ date, hasTime }) {
  if (!date) return "Date not recorded";
  const datePart = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: MANILA_TIME_ZONE,
  });
  if (!hasTime) return `${datePart} · Time not recorded`;
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MANILA_TIME_ZONE,
  });
  return `${datePart} · ${timePart}`;
}

const EMPTY_FORM = {
  id: "",
  ownerId: "",
  petName: "",
  species: "",
  customSpecies: "",
  breed: "",
  customBreed: "",
  sex: "Unknown",
  dateOfBirth: "",
  weight: "",
  color: "",
  customColor: "",
  microchipNumber: "",
  allergies: "",
  existingConditions: "",
  notes: "",
  photoUrl: "",
};

export default function PetManagementModule({
  profile,
  ownerOnly = false,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pets, setPets] = useState([]);
  const [owners, setOwners] = useState([]);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ownerId: ownerOnly ? profile.id : "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const petFieldRefs = useRef({}).current;
  const registerPetFieldRef = (name) => (el) => { petFieldRefs[name] = el; };

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // Every pet owner, id-only lookup -- not rendered as its own browsable
  // list here (that lives in the separate Pet Owners sidebar module, see
  // WalkInRegistration.jsx). Kept just so this module can resolve an
  // owner by id for the register-form's owner combobox and for the
  // ?registerForOwner= deep link below.
  const [ownerDirectory, setOwnerDirectory] = useState([]);

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [speciesDropdownOpen, setSpeciesDropdownOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [selectedPet, setSelectedPet] = useState(null);
  const [history, setHistory] = useState([]);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [medicalHistoryLoading, setMedicalHistoryLoading] = useState(false);
  const [profileTab, setProfileTab] = useState("history");
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [openInsightId, setOpenInsightId] = useState(null);
  const [consultationInsights, setConsultationInsights] = useState({});
  const [billingByRecordId, setBillingByRecordId] = useState({});
  const [rxBusyId, setRxBusyId] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPreviousRecords, setAiPreviousRecords] = useState([]);
  const [aiLatestRecord, setAiLatestRecord] = useState(null);
  const [vetsById, setVetsById] = useState({});

  const canManageAll =
    !ownerOnly &&
    ["admin", "staff", "veterinarian"].includes(profile.role);

  // Vets treat Animal Patients as a read/edit view of pets brought to them
  // for consultation, not an intake desk -- registering a new patient record
  // stays a staff/admin/pet-owner action, so the button is hidden here even
  // though a vet otherwise has full canManageAll access to this module.
  const canRegisterPet = ownerOnly || (canManageAll && profile.role !== "veterinarian");

  // Staff/Vet/Admin see it inside their patient-management view; a pet
  // owner sees the same section for their own pets (getMedicalRecords
  // already limits that to their Finalized records only -- unchanged).
  const canViewMedicalHistory = canManageAll || ownerOnly;

  // Shown to everyone who can open this pet's profile at all -- staff/admin
  // already manage billing directly from Transactions, but seeing the same
  // billing/prescription status here too (instead of cross-referencing POS)
  // was requested even though it's redundant with that page.
  const canViewBilling = ownerOnly || canManageAll;

  // Small, bounded list (a clinic's active veterinarians) reused from the
  // existing exported function, just to resolve veterinarian_id -> profile
  // (name, contact number) for display on consultation cards and the
  // printed record -- looked up by id only, never by name, and never
  // persisted onto the record itself; no schema change.
  useEffect(() => {
    if (!canViewMedicalHistory) return;
    getActiveVeterinarians()
      .then((list) => setVetsById(Object.fromEntries(list.map((vet) => [vet.id, vet]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Owner id -> profile lookup for the register-form combobox and the
  // ?registerForOwner= deep link below -- not shown as its own browsable
  // list here (see the Pet Owners sidebar module instead).
  useEffect(() => {
    if (!canManageAll) return;
    let active = true;
    getPetOwnersDirectory()
      .then((rows) => { if (active) setOwnerDirectory(rows); })
      .catch((error) => { if (active) setMessage(error.message || "Unable to load pet owners."); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAll]);

  // Deep link support: a link elsewhere in the app (e.g. a veterinarian
  // finalizing a consultation, or the Pet Owners module) can open straight
  // to one pet's profile via ?pet=<petId> on this module's route, instead
  // of stranding the user on wherever they were. Resolved by pet id only,
  // never by name -- pets can share a name. Runs once the pet list
  // finishes loading, then clears the param so a later refresh doesn't
  // reopen it.
  useEffect(() => {
    if (!canManageAll) return;
    const targetPetId = new URLSearchParams(location.search).get("pet");
    if (!targetPetId || !pets.length) return;

    const pet = pets.find((item) => item.id === targetPetId);
    if (!pet) return;

    handleOpenHistory(pet);

    // Forwards location.state (e.g. returnTo/reopenOwnerId set by the Pet
    // Owners module below) onto the replaced entry -- navigate() does not
    // carry state over automatically, and closeProfile() below needs it
    // to still be there once the profile modal is closed.
    navigate(location.pathname, { replace: true, state: location.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAll, location.search, pets]);

  // Deep link support: the Pet Owners module's "Add Pet" button (for an
  // owner it's already looking at) can open straight to this module's
  // registration form pre-filled with that owner via
  // ?registerForOwner=<ownerId>, instead of requiring the owner to be
  // re-picked here. Resolved by owner id only. Runs once the owner
  // directory finishes loading, then clears the param so a later refresh
  // doesn't reopen it.
  useEffect(() => {
    if (!canRegisterPet) return;
    const targetOwnerId = new URLSearchParams(location.search).get("registerForOwner");
    if (!targetOwnerId || !ownerDirectory.length) return;

    const owner = ownerDirectory.find((item) => item.id === targetOwnerId);
    if (!owner) return;

    openRegisterModalForOwner(owner);

    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRegisterPet, location.search, ownerDirectory]);

  // Prevents the page behind either modal from scrolling while it's open.
  useEffect(() => {
    if (!formOpen && !selectedPet) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [formOpen, selectedPet]);

  // Locally computed indicator only -- generatePredictiveHealthAnalysis and
  // its prompt are never asked for a score. Combines three concrete signals:
  // how many risks the AI's own (unmodified) risk section named, how many
  // recorded symptoms/diagnoses recur across this pet's visits, and whether
  // a follow-up is due soon or overdue.
  const aiRisk = useMemo(() => {
    if (!aiLatestRecord) return null;
    const { sections } = parseAiReport(aiText);
    const riskCount = toListItems(sections["POTENTIAL HEALTH RISKS TO MONITOR"] || [], 5).length;
    const combined = [...aiPreviousRecords, aiLatestRecord];
    let recurringCount = 0;
    combined.forEach((entry, index) => {
      const own = keywordSet(`${entry.symptoms || ""} ${entry.diagnosis || ""}`);
      const priors = combined.slice(0, index);
      if (own.size && priors.some((prior) => sharesKeyword(own, keywordSet(`${prior.symptoms || ""} ${prior.diagnosis || ""}`)))) recurringCount++;
    });
    const days = daysUntil(aiLatestRecord.follow_up_date);
    return computeRiskLevel({
      riskCount,
      recurringCount,
      followUpSoon: days !== null && days >= 0 && days <= 14,
      followUpOverdue: days !== null && days < 0,
    });
  }, [aiText, aiPreviousRecords, aiLatestRecord]);

  // Merges appointments (history) with consultations (medicalHistory) into
  // one chronological timeline. medical_records.appointment_id is the merge
  // key -- pet_id/petId is only the scope filter already applied to both
  // queries, not what links a specific visit to its resulting record. Every
  // appointment consumed by a match is tracked so it never also renders as
  // a separate "upcoming" row -- the single source of duplicate-prevention
  // for this view.
  // Medical History shows only consultations the veterinarian has actually
  // completed and finalized -- upcoming/pending/cancelled appointments and
  // draft (not-yet-finalized) records are excluded here, not deleted; they
  // still exist untouched in their own tables and still show up in the
  // Appointments module. Sorted by each consultation's real completion
  // date/time, latest first.
  const timelineEntries = useMemo(() => {
    const entries = medicalHistory
      .filter((record) => record.record_status === "Finalized")
      .map((record) => ({
        key: `record-${record.id}`,
        kind: "consultation",
        record,
        appointment: record.appointment_id
          ? history.find((appt) => appt.id === record.appointment_id) || null
          : null,
      }));

    entries.forEach((entry) => {
      const visit = resolveVisitDateTime(entry);
      entry.visitDate = visit.date;
      entry.visitHasTime = visit.hasTime;
    });

    entries.sort((a, b) => (b.visitDate?.getTime() || 0) - (a.visitDate?.getTime() || 0));
    return entries;
  }, [medicalHistory, history]);

  const latestConsultationKey = useMemo(
    () => timelineEntries.find((entry) => entry.kind === "consultation")?.key || null,
    [timelineEntries]
  );

  const filteredOwners = useMemo(() => {
    const keyword = ownerQuery.trim().toLowerCase();
    if (!keyword) return owners;

    return owners.filter((owner) =>
      `${owner.full_name || ""} ${owner.username || ""} ${
        owner.email || ""
      }`
        .toLowerCase()
        .includes(keyword)
    );
  }, [owners, ownerQuery]);

  const filteredSpeciesGroups = useMemo(() => {
    const keyword = speciesQuery.trim().toLowerCase();
    if (!keyword) return SPECIES_GROUPS;

    return SPECIES_GROUPS.map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        option.toLowerCase().includes(keyword)
      ),
    })).filter((group) => group.options.length > 0);
  }, [speciesQuery]);

  const breedOptions = BREEDS_BY_SPECIES[form.species] || null;
  const colorOptions = COLORS_BY_SPECIES[form.species] || null;

  const petAge = useMemo(
    () => formatPetAge(form.dateOfBirth),
    [form.dateOfBirth]
  );

  useEffect(() => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setPreviewUrl(form.photoUrl || "");
  }, [file, form.photoUrl]);

  const visiblePets = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const knownSpecies = SPECIES_OPTIONS.filter(
      (species) => species !== "Other"
    );

    return pets.filter((pet) => {
      const petSpecies = String(pet.species || "");

      const isOtherSpecies =
        petSpecies &&
        !knownSpecies.some(
          (species) =>
            species.toLowerCase() === petSpecies.toLowerCase()
        );

      const matchesSpecies =
        speciesFilter === "all" ||
        (speciesFilter === "Other" && isOtherSpecies) ||
        petSpecies.toLowerCase() === speciesFilter.toLowerCase();

      const matchesSearch =
        !keyword ||
        [
          pet.pet_name,
          pet.species,
          pet.breed,
          pet.sex,
          pet.color,
          pet.owner?.full_name,
          pet.owner?.username,
          pet.owner?.email,
          pet.microchip_number,
          pet.allergies,
          pet.existing_conditions,
          pet.notes,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(keyword)
        );

      const matchesArchivedState = showArchived
        ? pet.is_archived
        : !pet.is_archived;

      return matchesSpecies && matchesSearch && matchesArchivedState;
    });
  }, [pets, search, speciesFilter, showArchived]);

  const archivedScopeCount = useMemo(
    () =>
      pets.filter((pet) =>
        showArchived ? pet.is_archived : !pet.is_archived
      ).length,
    [pets, showArchived]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(visiblePets.length / PAGE_SIZE)
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedPets = useMemo(
    () =>
      visiblePets.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [visiblePets, currentPage]
  );

  useEffect(() => {
    setPage(1);
  }, [search, speciesFilter, showArchived]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setMessage("");

      try {
        const petList = await getPets({
          ownerId: ownerOnly ? profile.id : null,
          includeArchived: true,
          search: "",
        });

        if (!active) {
          return;
        }

        setPets(petList);

        if (canManageAll) {
          const ownerList = await getOwners();

          if (active) {
            setOwners(ownerList);
          }
        }
      } catch (error) {
        if (active) {
          setMessage(
            error.message || "Unable to load pet records."
          );
        }
      }
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, [canManageAll, ownerOnly, profile.id]);

  async function loadPets() {
    try {
      const petList = await getPets({
        ownerId: ownerOnly ? profile.id : null,
        includeArchived: true,
        search: "",
      });

      setPets(petList);
    } catch (error) {
      setMessage(
        error.message || "Unable to load pet records."
      );
    }
  }

  function updateForm(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
    // customSpecies/customBreed share their error slot with species/breed
    // since only one of the pair is ever shown at a time.
    const errorKey = field === "customSpecies" ? "species" : field === "customBreed" ? "breed" : field;
    if (!fieldErrors[errorKey]) return;
    if (field === "weight") {
      const trimmed = String(value ?? "").trim();
      const stillInvalid = trimmed && (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0);
      setFieldErrors((current) => ({ ...current, weight: stillInvalid ? "Enter a valid weight greater than 0." : "" }));
    } else if (String(value || "").trim()) {
      setFieldErrors((current) => ({ ...current, [errorKey]: "" }));
    }
  }

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      ownerId: ownerOnly ? profile.id : "",
    });

    setFile(null);
    setOwnerQuery("");
    setOwnerDropdownOpen(false);
    setSpeciesQuery("");
    setSpeciesDropdownOpen(false);
  }

  function openRegisterModal() {
    resetForm();
    setMessage("");
    setFormOpen(true);
  }

  function openRegisterModalForOwner(owner) {
    openRegisterModal();
    selectOwner(owner);
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  function selectOwner(owner) {
    updateForm("ownerId", owner.id);
    setOwnerQuery(
      `${owner.full_name || "Unnamed Owner"}${
        owner.username ? ` (${owner.username})` : ""
      }`
    );
    setOwnerDropdownOpen(false);
  }

  function clearOwner() {
    updateForm("ownerId", "");
    setOwnerQuery("");
  }

  function selectSpecies(species) {
    setForm((currentForm) => ({
      ...currentForm,
      species,
      customSpecies:
        species === "Other" ? currentForm.customSpecies : "",
      breed: "",
      customBreed: "",
      color: "",
      customColor: "",
    }));
    setSpeciesQuery(species);
    setSpeciesDropdownOpen(false);
  }

  function handleEdit(pet) {
    const isKnownSpecies = SPECIES_OPTIONS.includes(
      pet.species
    );
    const resolvedSpecies = isKnownSpecies
      ? pet.species
      : pet.species
        ? "Other"
        : "";
    const speciesBreedList = BREEDS_BY_SPECIES[resolvedSpecies] || null;
    const isKnownBreed = speciesBreedList
      ? speciesBreedList.includes(pet.breed)
      : false;
    const speciesColorList = COLORS_BY_SPECIES[resolvedSpecies] || null;
    const isKnownColor = speciesColorList
      ? speciesColorList.includes(pet.color)
      : false;

    setForm({
      id: pet.id,
      ownerId: pet.owner_id,
      petName: pet.pet_name || "",
      species: resolvedSpecies,
      customSpecies: isKnownSpecies
        ? ""
        : pet.species || "",
      breed: speciesBreedList
        ? isKnownBreed
          ? pet.breed
          : pet.breed
            ? "Other"
            : ""
        : pet.breed || "",
      customBreed:
        speciesBreedList && !isKnownBreed ? pet.breed || "" : "",
      sex: pet.sex || "Unknown",
      dateOfBirth: pet.date_of_birth || "",
      weight: pet.weight || "",
      color: speciesColorList
        ? isKnownColor
          ? pet.color
          : pet.color
            ? "Other"
            : ""
        : pet.color || "",
      customColor:
        speciesColorList && !isKnownColor ? pet.color || "" : "",
      microchipNumber: pet.microchip_number || "",
      allergies: pet.allergies || "",
      existingConditions: pet.existing_conditions || "",
      notes: pet.notes || "",
      photoUrl: pet.photo_url || "",
    });

    setFile(null);
    setOwnerQuery(
      pet.owner
        ? `${pet.owner.full_name || "Unnamed Owner"}${
            pet.owner.username ? ` (${pet.owner.username})` : ""
          }`
        : ""
    );
    setOwnerDropdownOpen(false);
    setSpeciesQuery(resolvedSpecies);
    setSpeciesDropdownOpen(false);
    setMessage("");
    setFormOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Without this guard a rapid double-click (or a slow request retried by
    // clicking again) fires this handler twice; since form.id is still
    // empty on the second call, savePet inserts a second Animal Patient
    // record for the same pet instead of updating the first.
    if (saving) return;

    setMessage("");

    const ownerId = form.ownerId || profile.id;
    const finalSpecies = form.species === "Other" ? form.customSpecies.trim() : form.species.trim();
    const finalBreed = form.breed === "Other" ? form.customBreed.trim() : form.breed.trim();
    const finalColor = form.color === "Other" ? form.customColor.trim() : form.color.trim();

    const errors = {};
    const allFieldRefs = {};

    if (canManageAll && !ownerId) {
      errors.ownerId = "Please select the pet owner.";
      if (petFieldRefs.ownerId) allFieldRefs.ownerId = petFieldRefs.ownerId;
    }
    if (!form.petName.trim()) {
      errors.petName = "Pet name is required.";
      if (petFieldRefs.petName) allFieldRefs.petName = petFieldRefs.petName;
    }
    if (!finalSpecies) {
      errors.species = "Please select or enter the pet species.";
      const target = form.species === "Other" ? petFieldRefs.customSpecies : petFieldRefs.species;
      if (target) allFieldRefs.species = target;
    }
    if (!finalBreed) {
      errors.breed = "Please select or enter the pet breed.";
      const target = form.breed === "Other" ? petFieldRefs.customBreed : petFieldRefs.breed;
      if (target) allFieldRefs.breed = target;
    }

    // Weight is optional here -- only checked when a value was actually
    // entered. savePet() already stores an empty value as null, not 0.
    const trimmedWeight = String(form.weight ?? "").trim();
    if (trimmedWeight && (!/^\d+(\.\d+)?$/.test(trimmedWeight) || Number(trimmedWeight) <= 0)) {
      errors.weight = "Enter a valid weight greater than 0.";
      if (petFieldRefs.weight) allFieldRefs.weight = petFieldRefs.weight;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setMessage("Please fix the highlighted field(s) before continuing.");
      focusFirstInvalidField(allFieldRefs, errors);
      return;
    }

    setSaving(true);

    try {
      let photoUrl = form.photoUrl;

      if (file) {
        photoUrl = await uploadPetPhoto(file, ownerId);
      }

      await savePet(
        {
          ...form,
          species: finalSpecies,
          breed: finalBreed,
          color: finalColor,
          photoUrl,
        },
        ownerId
      );

      setMessage(
        form.id
          ? "Pet record updated successfully."
          : "Pet registered successfully."
      );

      resetForm();
      setFormOpen(false);
      await loadPets();
    } catch (error) {
      setMessage(
        error.message || "Unable to save the pet record."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenHistory(pet) {
    setSelectedPet(pet);
    setHistory([]);
    setMedicalHistory([]);
    setMessage("");
    setProfileTab("history");
    setExpandedRecordId(null);
    setOpenInsightId(null);
    setConsultationInsights({});
    setAiText("");
    setAiError("");
    setAiPreviousRecords([]);
    setAiLatestRecord(null);

    try {
      const appointmentHistory = await getPetAppointments(
        pet.id
      );

      setHistory(appointmentHistory);
    } catch (error) {
      setMessage(
        error.message ||
          "Unable to load the pet appointment history."
      );
    }

    if (canViewMedicalHistory) {
      setMedicalHistoryLoading(true);

      try {
        const records = await getMedicalRecords(profile, {
          petId: pet.id,
        });

        setMedicalHistory(records);
        setExpandedRecordId(records[0]?.id || null);
        if (records[0] && canViewBilling) loadBillingForRecord(records[0]);
        loadAiHealthAnalysis(pet, records);
        loadConsultationInsights(pet, records);
      } catch (error) {
        console.warn(
          "Unable to load medical history for this pet:",
          error
        );
      } finally {
        setMedicalHistoryLoading(false);
      }
    }
  }

  // Undoes handleOpenHistory's navigation-based open (see the ?pet= deep
  // link effect above): when this profile was reached by navigating away
  // from another page -- e.g. clicking a pet inside the Pet Owners module,
  // which pushes here with { returnTo, reopenOwnerId } in location.state --
  // closing it must navigate back there instead of leaving the user
  // stranded on this Animal Patients page they never chose to visit.
  function closeProfile() {
    setSelectedPet(null);
    const returnTo = location.state?.returnTo;
    if (returnTo) {
      navigate(returnTo, {
        replace: true,
        state: { reopenOwnerId: location.state?.reopenOwnerId || null },
      });
    }
  }

  // Runs the unchanged generatePredictiveHealthAnalysis once, up front, so
  // the Low/Moderate/High badge next to the AI Predictive Health tab is
  // already known before the user ever opens that tab -- exactly what the
  // AI Predictive Health tab renders is generated from this same call.
  async function loadAiHealthAnalysis(pet, records) {
    const finalized = (records || [])
      .filter((record) => record.record_status === "Finalized")
      .sort((a, b) => new Date(b.consultation_date || 0) - new Date(a.consultation_date || 0));
    const latest = finalized[0] || null;
    setAiLatestRecord(latest);
    if (!latest) return;

    setAiLoading(true);
    setAiError("");
    try {
      const [text, previous] = await Promise.all([
        generatePredictiveHealthAnalysis({ ...latest, pet }),
        getPreviousMedicalRecordsForAi(latest.pet_id, latest.id),
      ]);
      setAiText(text);
      setAiPreviousRecords(previous);
    } catch (error) {
      setAiError(error.message || "Unable to generate the AI predictive health analysis.");
    } finally {
      setAiLoading(false);
    }
  }

  // Generated eagerly (bounded) so the risk badge on each row is ready
  // without waiting for a click -- "quick viewing" per row -- while still
  // capping how many concurrent AI requests one pet-open can trigger.
  // Anything past the cap generates lazily the first time its row is
  // expanded (see toggleConsultationInsight below).
  const CONSULTATION_INSIGHT_EAGER_CAP = 8;

  async function generateInsightFor(pet, record, previousRecords) {
    // Completing a consultation already generates and persists this insight
    // (see triggerInsightPersistence in MedicalRecordsModule) -- reuse that
    // fixed fact about the visit instead of silently re-querying the AI on
    // every view, which can also fail for older records with no live cache.
    const cachedInsight = record.template_data?.aiHealthInsight;
    if (cachedInsight) {
      setConsultationInsights((current) => ({
        ...current,
        [record.id]: { text: cachedInsight, loading: false, error: "", riskLevel: parseConsultationInsight(cachedInsight).riskLevel },
      }));
      return;
    }

    setConsultationInsights((current) => ({
      ...current,
      [record.id]: { ...current[record.id], loading: true, error: "" },
    }));

    try {
      const text = await generateConsultationHealthInsight({ ...record, pet }, previousRecords);
      const { riskLevel } = parseConsultationInsight(text);
      setConsultationInsights((current) => ({
        ...current,
        [record.id]: { text, loading: false, error: "", riskLevel },
      }));
    } catch (error) {
      setConsultationInsights((current) => ({
        ...current,
        [record.id]: { text: "", loading: false, error: error.message || "Unable to generate the AI health insight.", riskLevel: null },
      }));
    }
  }

  function loadConsultationInsights(pet, records) {
    // Newest first, matching how Medical History is already displayed --
    // finding this record's own index gives every strictly-older finalized
    // consultation as its comparison context, with no extra query.
    const finalized = (records || [])
      .filter((record) => record.record_status === "Finalized")
      .sort((a, b) => new Date(b.consultation_date || 0) - new Date(a.consultation_date || 0));

    finalized.slice(0, CONSULTATION_INSIGHT_EAGER_CAP).forEach((record, index) => {
      generateInsightFor(pet, record, finalized.slice(index + 1));
    });
  }

  function toggleConsultationInsight(record) {
    const nextOpen = openInsightId === record.id ? null : record.id;
    setOpenInsightId(nextOpen);
    if (!nextOpen) return;
    if (record.record_status !== "Finalized") return;
    if (consultationInsights[record.id]) return;

    const finalized = medicalHistory
      .filter((item) => item.record_status === "Finalized")
      .sort((a, b) => new Date(b.consultation_date || 0) - new Date(a.consultation_date || 0));
    const index = finalized.findIndex((item) => item.id === record.id);
    const previousRecords = index === -1 ? [] : finalized.slice(index + 1);
    generateInsightFor(selectedPet, record, previousRecords);
  }

  // Lazy, cached per record so opening/closing a visit card never re-fetches
  // billing that's already loaded. Only meaningful once the vet has sent the
  // consultation to billing (queue_entry_id is only set from that point on).
  async function loadBillingForRecord(record) {
    if (!record.queue_entry_id || billingByRecordId[record.id]) return;
    setBillingByRecordId((current) => ({ ...current, [record.id]: { loading: true } }));
    try {
      const [invoices, prescriptions] = await Promise.all([
        getTransactionsForQueueEntry(record.queue_entry_id),
        getPrescriptionsForConsultation(record.queue_entry_id),
      ]);
      const purchaseHistory = await getPrescriptionPurchaseHistory(prescriptions.map((rx) => rx.id));
      const purchaseHistoryByRxId = purchaseHistory.reduce((map, row) => {
        (map[row.prescription_id] ||= []).push(row);
        return map;
      }, {});
      setBillingByRecordId((current) => ({ ...current, [record.id]: { loading: false, invoices, prescriptions, purchaseHistoryByRxId } }));
    } catch (error) {
      setBillingByRecordId((current) => ({ ...current, [record.id]: { loading: false, error: error.message } }));
    }
  }

  async function refreshBillingForRecord(record) {
    setBillingByRecordId((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    await loadBillingForRecord(record);
  }

  async function handleBuyElsewhere(prescription, record) {
    if (rxBusyId) return;
    setRxBusyId(prescription.id);
    try {
      await markPrescriptionElsewhere(prescription.id, profile);
      await refreshBillingForRecord(record);
    } catch (error) {
      setMessage(error.message || "Unable to update this prescription.");
    } finally {
      setRxBusyId(null);
    }
  }

  async function handleArchiveToggle(pet) {
    setMessage("");

    try {
      await archivePet(pet.id, !pet.is_archived);
      await loadPets();

      setMessage(
        pet.is_archived
          ? "Pet record restored successfully."
          : "Pet record archived successfully."
      );
    } catch (error) {
      setMessage(
        error.message ||
          "Unable to update the pet archive status."
      );
    }
  }

  return (
    <div className="pet-module">
      {message && !formOpen && (
        <div
          className={`notice ${
            message.toLowerCase().includes("successfully")
              ? "success"
              : "error"
          }`}
          role="status"
        >
          {message}
        </div>
      )}

      {formOpen && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div
            className="modal form-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="close"
              aria-label="Close pet form"
              onClick={closeForm}
            >
              <X />
            </button>

            <form
              className="form-card"
              onSubmit={handleSubmit}
            >
              <div className="form-head">
                <div>
                  <h2>
                    {form.id ? <Edit3 /> : <Plus />}

                    {form.id
                      ? "Edit Pet Record"
                      : "Register Animal Patient"}
                  </h2>

                  <p className="form-description">
                    Enter the pet's basic profile, health notes,
                    identification details, and owner information.
                  </p>
                </div>
              </div>

              {message && (
                <div
                  className={`notice ${
                    message.toLowerCase().includes("successfully")
                      ? "success"
                      : "error"
                  }`}
                  role="status"
                >
                  {message}
                </div>
              )}

              {canManageAll && (
                <div className="form-section">
                  <h3 className="form-section-title">
                    Pet Owner
                  </h3>

                  <label>
                    <span>
                      Pet Owner
                      <span className="required-mark"> *</span>
                    </span>

                    <div className="combo">
                      <div className="combo-input">
                        <Search size={15} />

                        <input
                          ref={registerPetFieldRef("ownerId")}
                          className={invalidClass(fieldErrors, "ownerId")}
                          type="text"
                          role="combobox"
                          aria-expanded={ownerDropdownOpen}
                          placeholder="Search pet owner by name or username"
                          value={ownerQuery}
                          onChange={(event) => {
                            setOwnerQuery(event.target.value);
                            setOwnerDropdownOpen(true);
                            if (form.ownerId) {
                              updateForm("ownerId", "");
                            }
                          }}
                          onFocus={() => setOwnerDropdownOpen(true)}
                          onBlur={() =>
                            window.setTimeout(
                              () => setOwnerDropdownOpen(false),
                              120
                            )
                          }
                        />

                        {form.ownerId && (
                          <button
                            type="button"
                            className="combo-clear"
                            aria-label="Clear pet owner"
                            onClick={clearOwner}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {ownerDropdownOpen && (
                        <div className="combo-dropdown">
                          {filteredOwners.length === 0 && (
                            <div className="combo-empty">
                              No matching pet owners
                            </div>
                          )}

                          {filteredOwners.map((owner) => (
                            <button
                              type="button"
                              key={owner.id}
                              className="combo-item"
                              onMouseDown={() => selectOwner(owner)}
                            >
                              <strong>
                                {owner.full_name || "Unnamed Owner"}
                              </strong>
                              <span>{owner.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {fieldErrors.ownerId && <span className="field-error-text">{fieldErrors.ownerId}</span>}
                  </label>
                </div>
              )}

              <div className="form-section">
                <h3 className="form-section-title">
                  Pet Profile
                </h3>

                <div className="grid">
                  <label>
                    <span>
                      Pet Name
                      <span className="required-mark"> *</span>
                    </span>

                    <input
                      ref={registerPetFieldRef("petName")}
                      className={invalidClass(fieldErrors, "petName")}
                      required
                      value={form.petName}
                      placeholder="Enter pet name"
                      onChange={(event) =>
                        updateForm(
                          "petName",
                          event.target.value
                        )
                      }
                    />
                    {fieldErrors.petName && <span className="field-error-text">{fieldErrors.petName}</span>}
                  </label>

                  <label>
                    <span>
                      Species
                      <span className="required-mark"> *</span>
                    </span>

                    <div className="combo">
                      <div className="combo-input">
                        <Search size={15} />

                        <input
                          ref={registerPetFieldRef("species")}
                          className={invalidClass(fieldErrors, "species")}
                          type="text"
                          role="combobox"
                          aria-expanded={speciesDropdownOpen}
                          placeholder="Search species"
                          value={speciesQuery}
                          onChange={(event) => {
                            setSpeciesQuery(event.target.value);
                            setSpeciesDropdownOpen(true);
                            if (form.species) {
                              setForm((current) => ({
                                ...current,
                                species: "",
                                customSpecies: "",
                                breed: "",
                                customBreed: "",
                                color: "",
                                customColor: "",
                              }));
                            }
                          }}
                          onFocus={() => setSpeciesDropdownOpen(true)}
                          onBlur={() =>
                            window.setTimeout(
                              () => setSpeciesDropdownOpen(false),
                              120
                            )
                          }
                        />

                        {form.species && (
                          <button
                            type="button"
                            className="combo-clear"
                            aria-label="Clear species"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                species: "",
                                customSpecies: "",
                                breed: "",
                                customBreed: "",
                                color: "",
                                customColor: "",
                              }));
                              setSpeciesQuery("");
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {speciesDropdownOpen && (
                        <div className="combo-dropdown">
                          {filteredSpeciesGroups.length === 0 && (
                            <div className="combo-empty">
                              No matching species
                            </div>
                          )}

                          {filteredSpeciesGroups.map((group) => (
                            <div
                              className="combo-group"
                              key={group.label}
                            >
                              <div className="combo-group-label">
                                {group.label}
                              </div>

                              {group.options.map((species) => (
                                <button
                                  type="button"
                                  key={species}
                                  className="combo-item"
                                  onMouseDown={() =>
                                    selectSpecies(species)
                                  }
                                >
                                  {species}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {fieldErrors.species && form.species !== "Other" && <span className="field-error-text">{fieldErrors.species}</span>}
                  </label>

                  {form.species === "Other" && (
                    <label>
                      <span>
                        Specify Species
                        <span className="required-mark"> *</span>
                      </span>

                      <input
                        ref={registerPetFieldRef("customSpecies")}
                        className={invalidClass(fieldErrors, "species")}
                        required
                        maxLength={80}
                        value={form.customSpecies}
                        placeholder="Enter the species"
                        onChange={(event) =>
                          updateForm(
                            "customSpecies",
                            event.target.value
                          )
                        }
                      />
                      {fieldErrors.species && <span className="field-error-text">{fieldErrors.species}</span>}
                    </label>
                  )}

                  <label>
                    <span>
                      Breed
                      <span className="required-mark"> *</span>
                    </span>

                    {breedOptions ? (
                      <select
                        ref={registerPetFieldRef("breed")}
                        className={invalidClass(fieldErrors, "breed")}
                        required
                        value={form.breed}
                        onChange={(event) => {
                          const value = event.target.value;

                          setForm((current) => ({
                            ...current,
                            breed: value,
                            customBreed:
                              value === "Other"
                                ? current.customBreed
                                : "",
                          }));
                          if (fieldErrors.breed && value && value !== "Other") {
                            setFieldErrors((current) => ({ ...current, breed: "" }));
                          }
                        }}
                      >
                        <option value="">Select breed</option>

                        {breedOptions.map((breed) => (
                          <option key={breed} value={breed}>
                            {breed}
                          </option>
                        ))}

                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <input
                        ref={registerPetFieldRef("breed")}
                        className={invalidClass(fieldErrors, "breed")}
                        required
                        value={form.breed}
                        placeholder="Enter breed"
                        onChange={(event) =>
                          updateForm(
                            "breed",
                            event.target.value
                          )
                        }
                      />
                    )}
                    {fieldErrors.breed && form.breed !== "Other" && <span className="field-error-text">{fieldErrors.breed}</span>}
                  </label>

                  {breedOptions && form.breed === "Other" && (
                    <label>
                      <span>
                        Specify Breed
                        <span className="required-mark"> *</span>
                      </span>

                      <input
                        ref={registerPetFieldRef("customBreed")}
                        className={invalidClass(fieldErrors, "breed")}
                        required
                        maxLength={80}
                        value={form.customBreed}
                        placeholder="Enter the breed"
                        onChange={(event) =>
                          updateForm(
                            "customBreed",
                            event.target.value
                          )
                        }
                      />
                      {fieldErrors.breed && <span className="field-error-text">{fieldErrors.breed}</span>}
                    </label>
                  )}

                  <label>
                    <span>
                      Sex
                      <span className="required-mark"> *</span>
                    </span>

                    <select
                      required
                      value={form.sex}
                      onChange={(event) =>
                        updateForm(
                          "sex",
                          event.target.value
                        )
                      }
                    >
                      {SEX_OPTIONS.map((sex) => (
                        <option
                          key={sex}
                          value={sex}
                        >
                          {sex}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>
                      Date of Birth
                      <span className="required-mark"> *</span>
                    </span>

                    <input
                      required
                      type="date"
                      max={new Date()
                        .toISOString()
                        .slice(0, 10)}
                      value={form.dateOfBirth}
                      onChange={(event) =>
                        updateForm(
                          "dateOfBirth",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Age</span>

                    <input
                      type="text"
                      className="age-field"
                      readOnly
                      tabIndex={-1}
                      value={petAge}
                      placeholder="Fills in from date of birth"
                    />
                  </label>

                  <label>
                    <span>
                      Weight (kg)
                      <span className="optional-mark"> (Optional)</span>
                    </span>

                    <input
                      ref={registerPetFieldRef("weight")}
                      className={invalidClass(fieldErrors, "weight")}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.weight}
                      placeholder="0.00"
                      onChange={(event) =>
                        updateForm(
                          "weight",
                          event.target.value
                        )
                      }
                    />
                    {fieldErrors.weight && <span className="field-error-text">{fieldErrors.weight}</span>}
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">
                  Identification
                </h3>

                <div className="grid">
                  <label>
                    <span>Color<span className="optional-mark"> (Optional)</span></span>

                    {colorOptions ? (
                      <select
                        value={form.color}
                        onChange={(event) => {
                          const value = event.target.value;
                          setForm((current) => ({
                            ...current,
                            color: value,
                            customColor:
                              value === "Other" ? current.customColor : "",
                          }));
                        }}
                      >
                        <option value="">Select color</option>

                        {colorOptions.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}

                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <input
                        value={form.color}
                        placeholder="Enter color or markings"
                        onChange={(event) =>
                          updateForm(
                            "color",
                            event.target.value
                          )
                        }
                      />
                    )}
                  </label>

                  {colorOptions && form.color === "Other" && (
                    <label>
                      <span>Specify Color<span className="optional-mark"> (Optional)</span></span>

                      <input
                        value={form.customColor}
                        placeholder="Enter color or markings"
                        onChange={(event) =>
                          updateForm(
                            "customColor",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  )}

                  <label>
                    <span>Microchip Number<span className="optional-mark"> (Optional)</span></span>

                    <input
                      value={form.microchipNumber}
                      placeholder="Enter microchip number"
                      onChange={(event) =>
                        updateForm(
                          "microchipNumber",
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">
                  Health Notes
                </h3>

                <label>
                  <span>Allergies<span className="optional-mark"> (Optional)</span></span>

                  <textarea
                    value={form.allergies}
                    placeholder="Enter known allergies or write none"
                    onChange={(event) =>
                      updateForm(
                        "allergies",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Existing Conditions<span className="optional-mark"> (Optional)</span></span>

                  <textarea
                    value={form.existingConditions}
                    placeholder="Enter existing medical conditions"
                    onChange={(event) =>
                      updateForm(
                        "existingConditions",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  <span>Additional Notes<span className="optional-mark"> (Optional)</span></span>

                  <textarea
                    value={form.notes}
                    placeholder="Enter relevant care or behavior notes"
                    onChange={(event) =>
                      updateForm(
                        "notes",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">
                  Photo
                </h3>

                <div className="photo-upload">
                  <div className="photo-preview">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Pet preview" />
                    ) : (
                      <PawPrint size={26} />
                    )}

                    <label
                      className="photo-camera"
                      title="Upload pet photo"
                    >
                      <Camera size={15} />

                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(event) => {
                          const selected =
                            event.target.files?.[0] || null;
                          event.target.value = "";
                          if (!selected) {
                            setFile(null);
                            return;
                          }
                          try {
                            validateImageFile(selected);
                            setMessage("");
                            setFile(selected);
                          } catch (error) {
                            setMessage(error.message);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="photo-copy">
                    <strong>Pet Photo</strong>

                    <small>
                      {file
                        ? file.name
                        : "Optional — select a clear image of the pet."}
                    </small>

                    {file && (
                      <button
                        type="button"
                        className="photo-remove"
                        onClick={() => setFile(null)}
                      >
                        Remove selected photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Saving Pet Record..."
            : form.id
              ? "Update Pet"
              : "Register Pet"}
        </button>
            </form>
          </div>
        </div>
      )}

      {(ownerOnly || canManageAll) && (
      <section className="card list-card">
        <div className="toolbar">
          <div>
            <div className="list-heading-row">
              <h2>
                <PawPrint />
                List of Animal Patients
              </h2>

              {canRegisterPet && (
                <button
                  type="button"
                  className="register-pet-btn"
                  onClick={openRegisterModal}
                >
                  <Plus size={16} />
                  Register Pet
                </button>
              )}
            </div>

            <p className="list-description">
              Search and review registered animal patients.
            </p>
          </div>

          <div className="toolbar-controls">
            <div className="search">
              <Search size={17} />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search pet, owner, species, breed, color, or microchip"
              />

              {search && (
                <button
                  type="button"
                  className="clear-search"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="species-filter">
              <PawPrint size={17} />

              <select
                value={speciesFilter}
                onChange={(event) =>
                  setSpeciesFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All species
                </option>

                {SPECIES_GROUPS.map((group) => (
                  <optgroup
                    key={group.label}
                    label={group.label}
                  >
                    {group.options
                      .filter(
                        (species) =>
                          species !== "Other"
                      )
                      .map((species) => (
                        <option
                          key={species}
                          value={species}
                        >
                          {species}
                        </option>
                      ))}
                  </optgroup>
                ))}

                <option value="Other">
                  Other species
                </option>
              </select>
            </div>

            <label
              className={
                showArchived
                  ? "archive-check active"
                  : "archive-check"
              }
            >
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) =>
                  setShowArchived(
                    event.target.checked
                  )
                }
              />

              <Archive size={15} />
              <span>View Archived</span>
            </label>
          </div>
        </div>

        <div className="result-summary">
          <span>
            {visiblePets.length === 0
              ? `Showing 0 of ${archivedScopeCount} ${
                  showArchived ? "archived" : "active"
                } pets`
              : `Showing ${
                  (currentPage - 1) * PAGE_SIZE + 1
                }–${Math.min(
                  currentPage * PAGE_SIZE,
                  visiblePets.length
                )} of ${visiblePets.length} pets`}
          </span>

          {(search || speciesFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSpeciesFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {visiblePets.length === 0 ? (
          <div className="empty">
            <PawPrint size={35} />

            <h3>
              {showArchived
                ? "No archived pets found"
                : "No pet records found"}
            </h3>

            <p>
              {archivedScopeCount === 0
                ? showArchived
                  ? "No pets have been archived yet."
                  : canRegisterPet
                    ? "Register a pet to see it listed here."
                    : "No pets have been registered yet."
                : "Try changing the search text or species filter."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Species / Breed</th>
                  {canManageAll && <th>Owner</th>}
                  <th>Records</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedPets.map((pet) => (
                  <tr
                    key={pet.id}
                    className={pet.is_archived ? "archived" : ""}
                  >
                    <td>
                      <button
                        type="button"
                        className="pet-cell pet-cell-link"
                        onClick={() => handleOpenHistory(pet)}
                      >
                        {pet.photo_url ? (
                          <img
                            src={pet.photo_url}
                            alt={pet.pet_name}
                          />
                        ) : (
                          <div className="photo">
                            <PawPrint size={17} />
                          </div>
                        )}

                        <span>
                          {pet.pet_name || "Unnamed Pet"}
                        </span>
                      </button>
                    </td>

                    <td>
                      {pet.species || "Species not recorded"}
                      {pet.breed && <small>{pet.breed}</small>}
                    </td>

                    {canManageAll && (
                      <td>
                        {pet.owner ? (
                          <span className="pet-cell">
                            {pet.owner.avatar_url ? (
                              <img className="owner-avatar small" src={pet.owner.avatar_url} alt={pet.owner.full_name || "Pet owner"} />
                            ) : (
                              <div className="photo owner-avatar small">
                                <Users size={13} />
                              </div>
                            )}
                            <span>{pet.owner.full_name || "Unnamed Owner"}</span>
                          </span>
                        ) : "Not assigned"}
                      </td>
                    )}

                    <td>
                      <button
                        type="button"
                        className="details-btn"
                        onClick={() => handleOpenHistory(pet)}
                      >
                        <Eye size={14} />
                        View Records
                      </button>
                    </td>

                    <td>
                      <span
                        className={`pill ${
                          pet.is_archived ? "archived" : "active"
                        }`}
                      >
                        {pet.is_archived ? "Archived" : "Active"}
                      </span>
                    </td>

                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={pet.is_archived}
                          title={
                            pet.is_archived
                              ? "Restore this pet to edit its record."
                              : undefined
                          }
                          onClick={() => handleEdit(pet)}
                        >
                          <Edit3 size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            pet.is_archived ? "restore" : "danger"
                          }
                          onClick={() => handleArchiveToggle(pet)}
                        >
                          {pet.is_archived ? (
                            <>
                              <RotateCcw size={15} />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive size={15} />
                              Archive
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              type="button"
              className="page-nav"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={18} />
            </button>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    aria-current={
                      pageNumber === currentPage ? "page" : undefined
                    }
                    className={
                      pageNumber === currentPage ? "active" : ""
                    }
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              className="page-nav"
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </section>
      )}


      {selectedPet && (
        <div
          className="modal-backdrop"
          onClick={closeProfile}
        >
          <div
            className="modal patient-profile-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="close"
              aria-label="Close pet details"
              onClick={closeProfile}
            >
              <X />
            </button>

            <p className="modal-eyebrow">Animal Patient Profile</p>

            <div className="patient-header">
              <div className="patient-header-photo">
                {selectedPet.photo_url ? (
                  <img src={selectedPet.photo_url} alt={selectedPet.pet_name || "Pet"} />
                ) : (
                  <PawPrint size={26} />
                )}
              </div>
              <div className="patient-header-main">
                <h2>{selectedPet.pet_name || "Unnamed Pet"}</h2>
                <div className="patient-chips">
                  <span>{selectedPet.species || "Species not recorded"}</span>
                  {selectedPet.breed && <span>{selectedPet.breed}</span>}
                  <span>{selectedPet.sex || "Unknown"}</span>
                  {selectedPet.weight && <span>{selectedPet.weight} kg</span>}
                  {selectedPet.color && <span>{selectedPet.color}</span>}
                </div>
                {canManageAll && (
                  <p className="patient-owner-line">
                    {selectedPet.owner?.avatar_url ? (
                      <img className="patient-owner-avatar" src={selectedPet.owner.avatar_url} alt={selectedPet.owner.full_name || "Pet owner"} />
                    ) : (
                      <UserCircle size={16} className="patient-owner-avatar-fallback" />
                    )}
                    Owner: {selectedPet.owner?.full_name || "Not assigned"}
                    {selectedPet.owner?.phone ? ` · ${selectedPet.owner.phone}` : ""}
                    {selectedPet.owner?.email ? ` · ${selectedPet.owner.email}` : ""}
                  </p>
                )}
              </div>
            </div>

            {(selectedPet.microchip_number || selectedPet.allergies || selectedPet.existing_conditions || selectedPet.notes) && (
              <div className="details patient-extra-details">
                {selectedPet.microchip_number && <p><strong>Microchip:</strong> {selectedPet.microchip_number}</p>}
                {selectedPet.allergies && <p><strong>Allergies:</strong> {selectedPet.allergies}</p>}
                {selectedPet.existing_conditions && <p><strong>Conditions:</strong> {selectedPet.existing_conditions}</p>}
                {selectedPet.notes && <p><strong>Notes:</strong> {selectedPet.notes}</p>}
              </div>
            )}

            {canViewMedicalHistory && (
              <div className="profile-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === "history"}
                  className={profileTab === "history" ? "active" : ""}
                  onClick={() => setProfileTab("history")}
                >
                  <Stethoscope size={14} /> Medical History
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === "ai"}
                  className={profileTab === "ai" ? "active" : ""}
                  onClick={() => setProfileTab("ai")}
                >
                  <BrainCircuit size={14} /> AI Predictive Health
                  {aiRisk && (
                    <span className={`profile-tab-badge profile-tab-badge-${aiRisk.level.toLowerCase()}`}>
                      {aiRisk.level}
                    </span>
                  )}
                </button>
              </div>
            )}

            <div className="patient-profile-scroll">
            {canViewMedicalHistory && profileTab === "history" && (
              <div className="profile-tab-panel">
                <div className="history-heading-row">
                  <div>
                    <h3 className="history-heading">Medical History</h3>
                    <p className="history-subtext">
                      {timelineEntries.length} completed consultation{timelineEntries.length === 1 ? "" : "s"} on record
                    </p>
                  </div>
                </div>

                {medicalHistoryLoading ? (
                  <div className="history-empty">
                    <p>Loading medical history...</p>
                  </div>
                ) : timelineEntries.length === 0 ? (
                  <div className="history-empty">
                    <FileHeart size={30} />
                    <p>No completed medical consultations yet.</p>
                  </div>
                ) : (
                  <div className="consultation-list">
                    {timelineEntries.map((entry) => {
                      const { record, appointment } = entry;
                      const expanded = expandedRecordId === record.id;
                      return (
                        <div className={`consultation-card${expanded ? " expanded" : ""}`} key={entry.key}>
                          <button
                            type="button"
                            className="consultation-summary"
                            onClick={() => {
                              setExpandedRecordId(expanded ? null : record.id);
                              if (!expanded && canViewBilling) loadBillingForRecord(record);
                            }}
                          >
                            <span className="consultation-date">
                              {formatVisitDateTime({ date: entry.visitDate, hasTime: entry.visitHasTime })}
                              {entry.key === latestConsultationKey && <span className="consultation-latest">Latest</span>}
                            </span>

                            <span className="consultation-title">
                              {record.diagnosis || record.chief_complaint || "General consultation"}
                            </span>

                            <span className="consultation-meta">
                              {vetsById[record.veterinarian_id]?.full_name ? `Dr. ${vetsById[record.veterinarian_id].full_name}` : "Veterinarian not recorded"}
                              {record.weight ? ` · ${record.weight}kg` : ""}
                              {record.temperature ? ` · ${record.temperature}°C` : ""}
                              {" · "}{appointment?.status ? `${appointment.status} · ` : ""}{record.record_status || "Draft"}
                            </span>

                            {consultationInsights[record.id]?.riskLevel && (
                              <span className={`consultation-risk-badge risk-${consultationInsights[record.id].riskLevel.toLowerCase()}`}>
                                {consultationInsights[record.id].riskLevel} Risk
                              </span>
                            )}

                            <ChevronDown size={16} className="consultation-chevron" />
                          </button>

                          {expanded && (
                            <div className="consultation-details">
                              <div className="consultation-field">
                                <span>Symptoms</span>
                                <p>{record.symptoms || "Not recorded"}</p>
                              </div>

                              <div className="consultation-field">
                                <span>Vital Signs</span>
                                <p>{record.vital_signs || "Not recorded"}</p>
                              </div>

                              <div className="consultation-field">
                                <span>Diagnosis</span>
                                <p>{record.diagnosis || "Not recorded"}</p>
                              </div>

                              <div className="consultation-field">
                                <span>Treatment</span>
                                <p>{record.treatment || record.treatment_plan || "Not recorded"}</p>
                              </div>

                              <div className="consultation-field">
                                <span>Medications</span>
                                <p>
                                  {record.medication
                                    ? `${record.medication}${record.dosage ? ` · ${record.dosage}` : ""}${record.frequency ? ` · ${record.frequency}` : ""}${record.duration ? ` · ${record.duration}` : ""}`
                                    : "Not recorded"}
                                </p>
                              </div>

                              {(record.template_data?.inventoryItems || []).filter((item) => !item.isNA).length > 0 && (
                                <div className="consultation-field consultation-field-wide">
                                  <span>Services, Tests &amp; Prescribed Medicine</span>
                                  <ul className="consultation-items-list">
                                    {record.template_data.inventoryItems.filter((item) => !item.isNA).map((item) => (
                                      <li key={item.id}>
                                        <span>{item.item_name}{item.category ? ` (${item.category})` : ""} × {item.quantity ?? 1}</span>
                                        <b>₱{(Number(item.unit_price || 0) * Number(item.quantity || 1)).toFixed(2)}</b>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div className="consultation-field">
                                <span>Laboratory Results</span>
                                <p>{record.laboratory_result || "Not recorded"}</p>
                              </div>

                              {record.vaccination && (
                                <div className="consultation-field">
                                  <span>Vaccination</span>
                                  <p>{record.vaccination}</p>
                                </div>
                              )}

                              <div className="consultation-field consultation-field-wide consultation-notes">
                                <span>Notes</span>
                                <p>{record.veterinarian_notes || "No additional notes."}</p>
                              </div>

                              {record.follow_up_date && (
                                <div className="consultation-followup">
                                  <History size={14} /> Next visit: {formatDateLong(record.follow_up_date)}
                                </div>
                              )}

                              {canViewBilling && record.queue_entry_id && (
                                <div className="pet-billing-card">
                                  <div className="pet-billing-head">
                                    <h4><CreditCard size={15} /> Billing</h4>
                                    <button type="button" className="pet-billing-refresh" onClick={() => refreshBillingForRecord(record)} disabled={billingByRecordId[record.id]?.loading}>
                                      <RefreshCw size={13} className={billingByRecordId[record.id]?.loading ? "spin" : ""} /> Refresh
                                    </button>
                                  </div>
                                  {billingByRecordId[record.id]?.loading && <p className="pet-billing-loading">Loading billing…</p>}
                                  {billingByRecordId[record.id]?.error && <p className="pet-billing-error">Unable to load billing details for this visit right now.</p>}
                                  {billingByRecordId[record.id] && !billingByRecordId[record.id].loading && !billingByRecordId[record.id].error && (
                                    billingByRecordId[record.id].invoices.length === 0 ? (
                                      <p className="pet-billing-empty">Staff hasn't processed billing for this visit yet.</p>
                                    ) : (
                                      billingByRecordId[record.id].invoices.map((invoice) => (
                                        <div className="pet-billing-row" key={invoice.id}>
                                          <div>
                                            <b>{invoice.or_number}</b>
                                            <span>Total {money(invoice.total_amount)} · Paid {money(invoice.amount_paid)}{invoiceBalance(invoice) > 0 ? ` · ${money(invoiceBalance(invoice))} due` : ""}</span>
                                            <span className={`pet-billing-status pet-billing-status-${invoice.payment_status.replaceAll(" ", "-").toLowerCase()}`}>{invoice.payment_status}</span>
                                          </div>
                                          <button type="button" className="pet-download-btn" onClick={() => downloadInvoicePdf(invoice)}>
                                            <Download size={14} /> Download
                                          </button>
                                        </div>
                                      ))
                                    )
                                  )}
                                </div>
                              )}

                              {canViewBilling && record.queue_entry_id && (
                                <div className="pet-billing-card">
                                  <div className="pet-billing-head">
                                    <h4><Pill size={15} /> Veterinarian Prescriptions</h4>
                                    <div className="pet-billing-head-actions">
                                      {billingByRecordId[record.id]?.prescriptions?.length > 0 && (
                                        <button
                                          type="button"
                                          className="pet-download-btn"
                                          onClick={() => (ownerOnly ? viewPrescriptionPadPdf : downloadPrescriptionPadPdf)(billingByRecordId[record.id].prescriptions, {
                                            veterinarianName: vetsById[record.veterinarian_id]?.full_name ? `Dr. ${vetsById[record.veterinarian_id].full_name}` : "",
                                            veterinarianPhone: vetsById[record.veterinarian_id]?.phone || "",
                                            veterinarianLicense: vetsById[record.veterinarian_id]?.license_number || "",
                                            ownerName: selectedPet.owner?.full_name,
                                            ownerAddress: selectedPet.owner?.address,
                                            petName: selectedPet.pet_name,
                                            petSpecies: selectedPet.species,
                                            petBreed: selectedPet.breed,
                                            petAge: formatPetAge(selectedPet.date_of_birth),
                                            date: formatVisitDateTime({ date: entry.visitDate, hasTime: entry.visitHasTime }),
                                          })}
                                        >
                                          {ownerOnly ? <><Eye size={13} /> View</> : <><Download size={13} /> Download</>}
                                        </button>
                                      )}
                                      <button type="button" className="pet-billing-refresh" onClick={() => refreshBillingForRecord(record)} disabled={billingByRecordId[record.id]?.loading}>
                                        <RefreshCw size={13} className={billingByRecordId[record.id]?.loading ? "spin" : ""} /> Refresh
                                      </button>
                                    </div>
                                  </div>
                                  {billingByRecordId[record.id]?.loading && <p className="pet-billing-loading">Loading prescriptions…</p>}
                                  {billingByRecordId[record.id]?.error && <p className="pet-billing-error">Unable to load prescription details for this visit right now.</p>}
                                  {billingByRecordId[record.id] && !billingByRecordId[record.id].loading && !billingByRecordId[record.id].error && (
                                    billingByRecordId[record.id].prescriptions.length === 0 ? (
                                      billingByRecordId[record.id].invoices.length === 0 ? (
                                        <p className="pet-billing-empty">Staff hasn't processed billing for this visit yet.</p>
                                      ) : (
                                        <p className="pet-billing-no-rx"><Pill size={14} /> No Prescription Given</p>
                                      )
                                    ) : (
                                      billingByRecordId[record.id].prescriptions.map((rx) => {
                                        const remaining = Math.max(0, Number(rx.prescribed_quantity) - Number(rx.total_quantity_purchased));
                                        const history = billingByRecordId[record.id].purchaseHistoryByRxId?.[rx.id] || [];
                                        return (
                                          <div className="pet-billing-row" key={rx.id}>
                                            <div>
                                              <b>{rx.item_name}</b>
                                              <span>Prescribed {rx.prescribed_quantity} · Purchased {rx.total_quantity_purchased} · Remaining {remaining}</span>
                                              <span className="pet-billing-rx-sig">Sig: {rx.sig || "No directions for use recorded."}</span>
                                              <span className={`pet-billing-status pet-billing-status-${rx.fulfillment_status.replaceAll(" ", "-").toLowerCase()}`}>{rx.fulfillment_status}</span>
                                              {history.length > 0 && (
                                                <ul className="pet-billing-rx-history">
                                                  {history.map((entry) => (
                                                    <li key={entry.id}>
                                                      <span>{entry.quantity} purchased</span>
                                                      <span>{formatPurchaseDateTime(entry.created_at)}</span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              )}
                                            </div>
                                            {ownerOnly && ["Not Purchased", "Partially Purchased"].includes(rx.fulfillment_status) && (
                                              <div className="pet-billing-row-actions">
                                                <button type="button" className="pet-elsewhere-btn" disabled={rxBusyId === rx.id} onClick={() => handleBuyElsewhere(rx, record)}>
                                                  {rxBusyId === rx.id ? "Saving…" : "I'll buy this elsewhere"}
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )
                                  )}
                                </div>
                              )}

                              <span
                                className="consultation-print-wrap"
                                title={record.record_status !== "Finalized" ? "Complete this consultation before printing." : undefined}
                              >
                                <button
                                  type="button"
                                  className="consultation-print-btn"
                                  disabled={record.record_status !== "Finalized"}
                                  onClick={async () => {
                                    try {
                                      await printMedicalRecordDocument(record, selectedPet, {
                                        veterinarianName: vetsById[record.veterinarian_id]?.full_name || "",
                                        veterinarianPhone: vetsById[record.veterinarian_id]?.phone || "",
                                        // Only pass a formatted string when there's a real date -- formatVisitDateTime's
                                        // own "Date not recorded" fallback is for the on-screen card; the printout
                                        // falls back to the record's single "N/A" convention instead.
                                        visitDateTime: entry.visitDate ? formatVisitDateTime({ date: entry.visitDate, hasTime: entry.visitHasTime }) : "",
                                        petAge: formatPetAge(selectedPet.date_of_birth),
                                      });
                                    } catch (printError) {
                                      setMessage(printError.message || "Unable to print this medical record.");
                                    }
                                  }}
                                >
                                  <Printer size={14} /> Print Medical Record
                                </button>
                              </span>

                              <button
                                type="button"
                                className="consultation-insight-toggle"
                                onClick={() => toggleConsultationInsight(record)}
                              >
                                <BrainCircuit size={14} />
                                AI Health Insight
                                {consultationInsights[record.id]?.riskLevel && (
                                  <span className={`consultation-risk-badge risk-${consultationInsights[record.id].riskLevel.toLowerCase()}`}>
                                    {consultationInsights[record.id].riskLevel} Risk
                                  </span>
                                )}
                                <ChevronDown
                                  size={14}
                                  className={openInsightId === record.id ? "consultation-chevron open" : "consultation-chevron"}
                                />
                              </button>

                              {openInsightId === record.id && (
                                <ConsultationHealthInsight
                                  isFinalized={record.record_status === "Finalized"}
                                  insightText={consultationInsights[record.id]?.text}
                                  loading={consultationInsights[record.id]?.loading}
                                  error={consultationInsights[record.id]?.error}
                                  onRetry={() => {
                                    const finalized = medicalHistory
                                      .filter((item) => item.record_status === "Finalized")
                                      .sort((a, b) => new Date(b.consultation_date || 0) - new Date(a.consultation_date || 0));
                                    const recordIndex = finalized.findIndex((item) => item.id === record.id);
                                    generateInsightFor(selectedPet, record, recordIndex === -1 ? [] : finalized.slice(recordIndex + 1));
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {canViewMedicalHistory && profileTab === "ai" && (
              <div className="profile-tab-panel">
                <AnimalPatientAIHealth
                  latestRecord={aiLatestRecord}
                  previousRecords={aiPreviousRecords}
                  aiText={aiText}
                  loading={aiLoading}
                  error={aiError}
                  riskScore={aiRisk?.score}
                  riskLevel={aiRisk?.level}
                />
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pet-module {
          display: grid;
          gap: 20px;
        }

        .form-head,
        .toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .form-head h2,
        .toolbar h2 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          color: #20313b;
        }

        .form-description,
        .list-description {
          margin: 7px 0 0;
          color: #6f7f88;
          line-height: 1.5;
        }

        .form-card label {
          display: grid;
          gap: 7px;
          margin-bottom: 13px;
          color: #334e5a;
          font-size: 13px;
          font-weight: 700;
        }

        .form-card input,
        .form-card select,
        .form-card textarea {
          width: 100%;
          padding: 12px 13px;
          border: 1px solid #cfe4ed;
          border-radius: 11px;
          background: #ffffff;
          color: #20313b;
          font: inherit;
          outline: none;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .form-card input:focus,
        .form-card select:focus,
        .form-card textarea:focus {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77, 168, 218, 0.13);
          background: #fbfeff;
        }

        .form-card textarea {
          min-height: 82px;
          resize: vertical;
        }

        .form-card select,
        .species-filter select {
          appearance: none;
          cursor: pointer;
          background-image:
            linear-gradient(
              45deg,
              transparent 50%,
              #4da8da 50%
            ),
            linear-gradient(
              135deg,
              #4da8da 50%,
              transparent 50%
            );
          background-position:
            calc(100% - 18px) 50%,
            calc(100% - 13px) 50%;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
          padding-right: 38px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(
            4,
            minmax(0, 1fr)
          );
          gap: 13px;
        }

        .form-card > button {
          min-width: 155px;
          border: 0;
          border-radius: 11px;
          padding: 13px 20px;
          background: #4da8da;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .form-card > button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(77, 168, 218, 0.22);
        }

        .form-card > button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .notice {
          margin-bottom: 14px;
          padding: 14px 18px;
          border: 1px solid transparent;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.5;
        }

        .notice.success {
          border-color: #cdebd9;
          background: #e9f7ef;
          color: #177a45;
        }

        .notice.error {
          border-color: #f2cccc;
          background: #fff0f0;
          color: #a94444;
        }

        .form-section {
          margin-bottom: 22px;
          padding-bottom: 18px;
          border-bottom: 1px solid #edf3f6;
        }

        .form-section:last-of-type {
          margin-bottom: 20px;
          padding-bottom: 0;
          border-bottom: 0;
        }

        .form-section-title {
          margin: 0 0 13px;
          color: #237da4;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .required-mark {
          display: inline;
          margin-left: 3px;
          color: #d14b4b;
          font-weight: 800;
        }

        .age-field {
          background: #f4fafd !important;
          color: #237da4 !important;
          font-weight: 700;
          cursor: default;
        }

        .age-field::placeholder {
          color: #9aabb3;
          font-weight: 400;
        }

        .combo {
          position: relative;
        }

        .combo-input {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          border: 1px solid #cfe4ed;
          border-radius: 11px;
          background: #ffffff;
          color: #9aabb3;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .combo-input:focus-within {
          border-color: #4da8da;
          box-shadow: 0 0 0 3px rgba(77, 168, 218, 0.13);
        }

        .combo-input input {
          width: 100%;
          border: 0 !important;
          padding: 12px 0 !important;
          color: #20313b;
          background: transparent !important;
        }

        .combo-input input:focus {
          box-shadow: none !important;
        }

        .combo-clear {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 0;
          border-radius: 7px;
          padding: 5px;
          background: #edf5f8;
          color: #5d7782;
          cursor: pointer;
        }

        .combo-dropdown {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          z-index: 20;
          max-height: 260px;
          overflow: auto;
          border: 1px solid #cfe4ed;
          border-radius: 12px;
          padding: 6px;
          background: #ffffff;
          box-shadow: 0 14px 30px rgba(45, 111, 143, 0.16);
        }

        .combo-empty {
          padding: 12px;
          color: #8496a0;
          font-size: 13px;
          font-weight: 400;
        }

        .combo-group-label {
          padding: 8px 10px 4px;
          color: #8496a0;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .combo-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          border: 0;
          border-radius: 8px;
          padding: 9px 10px;
          background: none;
          text-align: left;
          font: inherit;
          font-weight: 400;
          cursor: pointer;
        }

        .combo-item:hover {
          background: #eaf8fd;
        }

        .combo-item strong {
          color: #20313b;
          font-size: 14px;
          font-weight: 700;
        }

        .combo-item span {
          color: #7c8c94;
          font-size: 12px;
          font-weight: 400;
        }

        .photo-upload {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .photo-preview {
          position: relative;
          width: 84px;
          height: 84px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 18px;
          background: #eaf8fd;
          color: #4da8da;
          overflow: visible;
        }

        .photo-preview img {
          width: 100%;
          height: 100%;
          border-radius: 18px;
          object-fit: cover;
        }

        .photo-camera {
          position: absolute;
          right: -6px;
          bottom: -6px;
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border: 3px solid #ffffff;
          border-radius: 50%;
          background: #4da8da;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 10px rgba(45, 111, 143, 0.28);
        }

        .photo-camera input {
          display: none;
        }

        .photo-copy {
          display: grid;
          gap: 4px;
        }

        .photo-copy strong {
          color: #20313b;
        }

        .photo-copy small {
          color: #72858e;
          font-weight: 400;
        }

        .photo-remove {
          justify-self: start;
          border: 0;
          background: none;
          padding: 0;
          color: #c84f4f;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .toolbar-controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .search,
        .species-filter {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 43px;
          border: 1px solid #cfe4ed;
          border-radius: 11px;
          background: #ffffff;
          color: #4da8da;
        }

        .search {
          min-width: min(360px, 100%);
          padding-left: 11px;
        }

        .search input {
          width: 100%;
          min-width: 0;
          border: 0;
          padding: 10px 4px;
          background: transparent;
          color: #20313b;
          font: inherit;
          outline: 0;
        }

        .clear-search {
          display: grid;
          place-items: center;
          margin-right: 6px;
          border: 0;
          border-radius: 7px;
          padding: 5px;
          background: #edf5f8;
          color: #5d7782;
          cursor: pointer;
        }

        .species-filter {
          min-width: 220px;
          padding-left: 11px;
        }

        .species-filter select {
          width: 100%;
          border: 0;
          padding: 10px 38px 10px 4px;
          background-color: transparent;
          color: #20313b;
          font: inherit;
          outline: none;
        }

        .archive-check {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 43px;
          padding: 0 14px;
          border: 1px solid #cfe4ed;
          border-radius: 11px;
          background: #ffffff;
          color: #435f6b;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            color 0.2s ease;
        }

        .archive-check svg {
          flex-shrink: 0;
        }

        .archive-check.active {
          border-color: #4da8da;
          background: #eaf8fd;
          color: #237da4;
        }

        .result-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 16px;
          color: #6f7f88;
          font-size: 13px;
        }

        .result-summary button {
          border: 0;
          background: transparent;
          color: #348fbb;
          font-weight: 700;
          cursor: pointer;
        }

        /* Purely a scroll viewport now -- no background/border/radius of
           its own, so it's not a second decorative box around what's
           already inside the list-card's own border/shadow/radius. (An
           earlier version of this fix tried dropping this wrapper
           entirely and putting overflow straight on the table element,
           but overflow genuinely does not apply to a bare table element
           in any browser -- it computes back as "visible" regardless of
           what you set, isolated and confirmed -- so a plain block-level
           wrapper is required for the horizontal scroll itself to work,
           not just for styling.) */
        .table-scroll {
          overflow: auto;
          margin-top: 18px;
        }

        /* The table's own white background/rounded corners already come
           from the shared .shell table rule in css-reference-theme.css --
           this class no longer adds a competing border/radius of its own. */
        .table {
          width: 100%;
          min-width: 720px;
          border-collapse: collapse;
        }

        .table th,
        .table td {
          padding: 14px 16px;
          border-bottom: 1px solid #e9f3f8;
          text-align: left;
          vertical-align: middle;
        }

        .table thead th {
          background: #f4fafd;
          color: #55707d;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .table td {
          color: #334e5a;
        }

        .table tbody tr:last-child td {
          border-bottom: 0;
        }

        .table tbody tr {
          transition: background 0.15s ease;
        }

        .table tbody tr:hover {
          background: #f9fcfe;
        }

        .table tbody tr.archived {
          background: #f7f8f9;
          opacity: 0.7;
        }

        .table td small {
          display: block;
          margin-top: 3px;
          color: #71848d;
          font-weight: 400;
          white-space: normal;
        }

        .pet-cell {
          display: flex;
          align-items: center;
          gap: 11px;
          font-weight: 700;
          color: #20313b;
        }

        .pet-cell-link {
          border: 0;
          background: none;
          padding: 0;
          font: inherit;
          text-align: left;
          cursor: pointer;
          width: 100%;
        }

        .pet-cell-link:hover span {
          text-decoration: underline;
        }

        .pet-cell img.owner-avatar {
          border-radius: 50%;
        }

        .pet-cell img,
        .photo {
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          border-radius: 11px;
          background: #eaf8fd;
          color: #4da8da;
          object-fit: cover;
        }

        .photo {
          display: grid;
          place-items: center;
        }

        .pill {
          display: inline-flex;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }

        .pill.active {
          background: #e7f7ed;
          color: #26754a;
        }

        .pill.archived {
          background: #e6eaec;
          color: #687b84;
        }

        .actions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .actions button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          border-radius: 9px;
          padding: 8px 10px;
          background: #eaf8fd;
          color: #2b83ad;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            filter 0.2s ease;
        }

        .actions button:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(0.97);
        }

        .actions button:disabled {
          cursor: not-allowed;
          background: #eef2f4;
          color: #9aa9b0;
        }

        .actions .danger {
          background: #fff0f0;
          color: #c84f4f;
        }

        .actions .restore {
          background: #eaf8ef;
          color: #2d8050;
        }

        .empty {
          display: grid;
          place-items: center;
          gap: 6px;
          padding: 42px 20px;
          text-align: center;
          color: #71848d;
        }

        .owner-avatar {
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .owner-avatar.small {
          width: 28px;
          height: 28px;
        }

        .empty h3 {
          margin: 4px 0 0;
          color: #314a55;
        }

        .empty p {
          margin: 0;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(24, 50, 63, 0.62);
          backdrop-filter: blur(4px);
        }

        .modal {
          position: relative;
          width: min(680px, 100%);
          max-height: 86vh;
          overflow: auto;
          border-radius: 19px;
          padding: 25px;
          background: #ffffff;
          box-shadow: 0 22px 55px rgba(22, 56, 72, 0.24);
        }

        .modal h2 {
          margin-top: 0;
          padding-right: 40px;
          color: #20313b;
        }

        .modal-eyebrow {
          margin: 0 0 4px;
          color: #2696c4;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .form-modal {
          width: min(820px, 100%);
        }

        .form-modal .form-card {
          padding-right: 30px;
        }

        .form-modal .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .list-heading-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .register-pet-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 0;
          border-radius: 11px;
          padding: 10px 16px;
          background: #4da8da;
          color: #ffffff;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .register-pet-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(77, 168, 218, 0.22);
        }

        .close {
          position: absolute;
          top: 12px;
          right: 12px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 9px;
          padding: 7px;
          background: #edf5f8;
          color: #456472;
          cursor: pointer;
        }

        .modal-subtitle {
          margin: 0 0 16px;
          color: #6f7f88;
          font-size: 13px;
        }

        .details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px 18px;
          border-radius: 14px;
          padding: 15px 17px;
          background: #f4fbfd;
          border: 1px solid #e3f2fb;
        }

        .details p {
          margin: 6px 0;
          color: #334e5a;
          line-height: 1.5;
        }

        .details p strong {
          color: #6f7f88;
          font-weight: 700;
          margin-right: 4px;
        }

        .patient-profile-modal {
          width: min(980px, 100%);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .patient-profile-scroll {
          flex: 1 1 auto;
          overflow-y: auto;
          min-height: 0;
        }

        .patient-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding-right: 40px;
        }

        .patient-header-photo {
          flex-shrink: 0;
          width: 64px;
          height: 64px;
          border-radius: 16px;
          background: #eaf8fd;
          color: #4da8da;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .patient-header-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .patient-header-main {
          min-width: 0;
          flex: 1;
        }

        .patient-header-main h2 {
          margin: 0 0 8px;
          padding-right: 0;
        }

        .patient-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .patient-chips span {
          background: #eef5f8;
          color: #3c5866;
          border-radius: 999px;
          padding: 4px 11px;
          font-size: 12px;
          font-weight: 700;
        }

        .patient-owner-line {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6f7f88;
          font-size: 13px;
        }

        .patient-owner-avatar {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          object-fit: cover;
        }

        .patient-owner-avatar-fallback {
          flex-shrink: 0;
          color: #a9c1cb;
        }

        .patient-extra-details {
          margin-top: 16px;
        }

        .profile-tabs {
          display: flex;
          gap: 8px;
          margin-top: 20px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e3edf2;
        }

        .profile-tabs button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 0;
          border-radius: 10px 10px 0 0;
          padding: 10px 16px;
          background: transparent;
          color: #6f7f88;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
        }

        .profile-tabs button.active {
          background: #eaf8fd;
          color: #1c6e91;
        }

        .profile-tab-badge {
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 800;
        }

        .profile-tab-badge-low {
          background: #e5f4ea;
          color: #2f8f5b;
        }

        .profile-tab-badge-moderate {
          background: #fdf1dc;
          color: #a5680b;
        }

        .profile-tab-badge-high {
          background: #fbe6e4;
          color: #c0392b;
        }

        .profile-tab-panel {
          margin-top: 18px;
        }

        .history-subtext {
          margin: 2px 0 0;
          color: #93a4ac;
          font-size: 12px;
        }

        .consultation-list {
          display: grid;
          gap: 10px;
        }

        .consultation-card {
          border: 1px solid #e3edf2;
          border-radius: 13px;
          overflow: hidden;
          background: #fff;
        }

        .consultation-card.expanded {
          border-color: #a9dff0;
        }

        .consultation-summary {
          width: 100%;
          display: grid;
          grid-template-columns: 130px 1fr auto auto 20px;
          align-items: center;
          gap: 14px;
          border: 0;
          background: #fff;
          padding: 13px 15px;
          cursor: pointer;
          text-align: left;
          font: inherit;
        }

        .consultation-risk-badge {
          justify-self: start;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 800;
          white-space: nowrap;
        }

        .risk-low {
          background: #e5f4ea;
          color: #2f8f5b;
        }

        .risk-moderate {
          background: #fdf1dc;
          color: #a5680b;
        }

        .risk-high {
          background: #fbe6e4;
          color: #c0392b;
        }

        .consultation-card.expanded .consultation-summary {
          background: #f7fcfe;
        }

        .consultation-date {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          color: #20313b;
          font-weight: 800;
          font-size: 13px;
        }

        .consultation-latest {
          background: #e5f4ea;
          color: #2f8f5b;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 800;
        }

        .consultation-title {
          color: #20313b;
          font-weight: 700;
          font-size: 14px;
        }

        .consultation-meta {
          color: #6f7f88;
          font-size: 12px;
          white-space: nowrap;
        }

        .consultation-chevron {
          color: #93a4ac;
          transition: transform 0.15s ease;
        }

        .consultation-card.expanded .consultation-chevron {
          transform: rotate(180deg);
        }

        .consultation-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px 18px;
          padding: 4px 17px 17px;
          border-top: 1px solid #eef3f5;
          background: #fbfdfe;
        }

        .consultation-field {
          padding: 8px 0;
        }

        .consultation-field span {
          display: block;
          color: #93a4ac;
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 3px;
        }

        .consultation-field p {
          margin: 0;
          color: #334e5a;
          font-size: 13.5px;
          line-height: 1.5;
        }

        .consultation-field-wide {
          grid-column: 1 / -1;
        }

        .consultation-items-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 6px;
        }

        .consultation-items-list li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 7px 10px;
          border: 1px solid #eef3f5;
          border-radius: 9px;
          background: #fbfeff;
          font-size: 13px;
        }

        .consultation-items-list li span {
          display: inline;
          color: #334e5a;
          font-size: 13px;
          font-weight: 500;
          text-transform: none;
          letter-spacing: normal;
        }

        .consultation-items-list li b {
          color: #21697f;
        }

        .consultation-notes p {
          background: #fff8e1;
          padding: 10px 12px;
          border-radius: 9px;
          color: #6b5900;
        }

        .consultation-followup {
          grid-column: 1 / -1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          width: max-content;
          margin-top: 4px;
          padding: 7px 12px;
          border-radius: 9px;
          background: #eaf1ff;
          color: #3653a3;
          font-size: 12.5px;
          font-weight: 700;
        }

        .pet-billing-card {
          grid-column: 1 / -1;
          display: grid;
          gap: 14px;
          margin-top: 10px;
          padding: 14px;
          border: 1px solid #e2f0f5;
          border-radius: 12px;
          background: #fbfeff;
        }
        .pet-billing-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .pet-billing-head h4 {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0;
          color: #213944;
          font-size: 14px;
        }
        .pet-billing-refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #cfe4ed;
          background: #effaff;
          color: #247fa8;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .pet-billing-refresh:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .pet-billing-refresh .spin {
          animation: pet-billing-spin 1s linear infinite;
        }
        @keyframes pet-billing-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pet-billing-loading,
        .pet-billing-empty {
          margin: 0;
          color: #6f7f88;
          font-size: 13.5px;
        }
        .pet-billing-no-rx {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff6e0;
          border: 1px solid #f2dfa0;
          color: #8a6d00;
          font-weight: 800;
          font-size: 13px;
        }
        .pet-billing-error {
          margin: 0;
          color: #b94b4b;
          font-size: 13.5px;
        }
        .pet-billing-head-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pet-billing-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 10px 12px;
          border: 1px solid #eef3f5;
          border-radius: 10px;
          background: #fff;
          margin-bottom: 8px;
        }
        .pet-billing-row:last-child {
          margin-bottom: 0;
        }
        .pet-billing-row > div {
          display: grid;
          gap: 3px;
        }
        .pet-billing-row b {
          color: #213944;
        }
        .pet-billing-row span {
          color: #6f7f88;
          font-size: 12.5px;
        }
        .pet-billing-rx-sig {
          font-style: italic;
        }
        .pet-billing-status {
          display: inline-block;
          width: max-content;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11.5px;
          font-weight: 800;
        }
        .pet-billing-status-paid,
        .pet-billing-status-fully-purchased {
          background: #eafaf0;
          color: #227a52;
        }
        .pet-billing-status-partially-paid,
        .pet-billing-status-partially-purchased {
          background: #fff0da;
          color: #b0620a;
        }
        .pet-billing-status-unpaid,
        .pet-billing-status-not-purchased {
          background: #fff6e0;
          color: #9a7000;
        }
        .pet-billing-status-voided,
        .pet-billing-status-purchasing-elsewhere {
          background: #eef1f4;
          color: #5b6b76;
        }
        .pet-billing-rx-history {
          list-style: none;
          margin: 4px 0 0;
          padding: 6px 0 0;
          border-top: 1px dashed #e4ecef;
          display: grid;
          gap: 3px;
        }
        .pet-billing-rx-history li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 11.5px;
          color: #6f7f88;
        }
        .pet-billing-rx-history li span:first-child {
          color: #21697f;
          font-weight: 700;
        }
        .pet-billing-row-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pet-download-btn,
        .pet-elsewhere-btn {
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .pet-download-btn {
          border: 1px solid #cfe4ed;
          background: #fff;
          color: #257fa9;
        }
        .pet-download-btn:hover {
          background: #f2f9fc;
        }
        .pet-elsewhere-btn {
          border: 1px solid #e4d3ba;
          background: #fff8ee;
          color: #8a6414;
        }
        .pet-elsewhere-btn:hover {
          background: #fbeeda;
        }
        .pet-elsewhere-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .consultation-print-wrap {
          display: block;
          grid-column: 1 / -1;
          margin-top: 10px;
        }
        .consultation-print-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          border: 1px solid #cfe4ed;
          border-radius: 10px;
          padding: 10px 13px;
          background: #fff;
          color: #257fa9;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
        }
        .consultation-print-btn:hover:not(:disabled) {
          background: #f2f9fc;
        }
        .consultation-print-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .consultation-insight-toggle {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          margin-top: 10px;
          border: 1px solid #e3edf2;
          border-radius: 10px;
          padding: 10px 13px;
          background: #f7fcfe;
          color: #267da3;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
        }

        .consultation-insight-toggle:hover {
          background: #eaf8fd;
        }

        .consultation-insight-toggle .consultation-risk-badge {
          margin-left: auto;
        }

        .consultation-insight-toggle .consultation-chevron.open {
          transform: rotate(180deg);
        }

        .history-heading {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 22px 0 10px;
          color: #20313b;
          font-size: 15px;
        }

        .history-heading-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .history-heading-row .history-heading {
          margin: 22px 0 10px;
        }

        .history-empty {
          display: grid;
          place-items: center;
          gap: 7px;
          padding: 28px;
          color: #71848d;
          text-align: center;
        }

        .details-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 9px;
          padding: 9px 14px;
          background: #eaf8fd;
          color: #2b83ad;
          font-weight: 700;
          font-size: 13px;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            filter 0.2s ease;
        }

        .details-btn svg {
          flex-shrink: 0;
        }

        .details-btn:hover {
          transform: translateY(-1px);
          filter: brightness(0.97);
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-top: 18px;
          padding-top: 17px;
          border-top: 1px solid #edf3f6;
        }

        .page-nav {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border: 1px solid #cfe4ed;
          border-radius: 50%;
          background: #ffffff;
          color: #2b6f8f;
          cursor: pointer;
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            opacity 0.2s ease;
        }

        .page-nav:hover:not(:disabled) {
          background: #eaf8fd;
          border-color: #a9dff0;
        }

        .page-nav:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }

        .pagination-pages {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .pagination-pages button {
          min-width: 36px;
          min-height: 36px;
          border: 1px solid transparent;
          border-radius: 9px;
          background: transparent;
          color: #55707d;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease;
        }

        .pagination-pages button:hover {
          background: #eaf8fd;
        }

        .pagination-pages button.active {
          border-color: #4da8da;
          background: #4da8da;
          color: #ffffff;
        }

        .list-card { padding: 28px 30px; }
        .list-card .toolbar { display:grid; grid-template-columns:minmax(240px, 1fr) minmax(560px, auto); align-items:end; gap:24px; }
        .list-card .toolbar-controls { display:grid; grid-template-columns:minmax(300px, 1fr) 220px auto; width:100%; justify-content:stretch; gap:12px; }
        .list-card .search, .list-card .species-filter, .list-card .archive-check { min-height:48px; border-radius:12px; }
        .list-card .search { min-width:0; }
        .list-card .species-filter { min-width:0; }
        .list-card .archive-check { justify-content:center; white-space:nowrap; padding:0 16px; }
        .list-card .archive-check input { width:17px; height:17px; accent-color:#4da8da; }
        .list-card .result-summary { padding-top:17px; border-top:1px solid #edf3f6; margin-top:22px; }

        @media (max-width: 1000px) {
          .grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .list-card .toolbar { grid-template-columns:1fr; align-items:start; }
          .list-card .toolbar-controls { width:100%; grid-template-columns:minmax(260px,1fr) 220px auto; }
        }

        @media (max-width: 700px) {
          .search,
          .species-filter,
          .archive-check {
            width: 100%;
          }

          .search {
            min-width: 0;
          }

          .list-card .toolbar-controls { display:grid; grid-template-columns:1fr; }
          .list-card { padding:22px 18px; }

          .patient-header { flex-direction:column; }
          .consultation-summary { grid-template-columns:1fr 20px; row-gap:4px; }
          .consultation-title, .consultation-meta, .consultation-risk-badge { grid-column:1; justify-self:start; }
          .consultation-details { grid-template-columns:1fr; }
        }

        @media (max-width: 560px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .pet-cell img,
          .photo {
            width: 32px;
            height: 32px;
          }

          .table th,
          .table td {
            padding: 10px 8px;
            font-size: 13px;
          }

          .result-summary {
            align-items: flex-start;
            flex-direction: column;
          }

          .form-card > button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}