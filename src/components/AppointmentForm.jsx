import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, PawPrint, Plus, RotateCcw, Stethoscope, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  createAppointment, getVeterinarianAvailability, getOwners, getPetsByOwner,
  createGuestOwner, sendGuestBookingConfirmationEmail, sendGuestAccountEmail, formatTime, todayLocal,
  cancelAppointmentsByIds
} from "../services/appointmentService";
import { savePet } from "../services/petService";
import { supabase } from "../config/supabaseClient";
import DataPrivacyConsent, { focusConsentBlock } from "./DataPrivacyConsent";
import { CONSENT_REQUIRED_ERROR } from "../constants/privacyNotice";
import { isValidPhMobile, INVALID_PH_MOBILE_MESSAGE } from "../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";

const EMPTY_PET_FORM = { petName: "", species: "", breed: "", sex: "Unknown", dateOfBirth: "", weight: "" };

function validateGuestField(name, value) {
  switch (name) {
    case "firstName":
      return String(value || "").trim() ? "" : "First name is required.";
    case "lastName":
      return String(value || "").trim() ? "" : "Last name is required.";
    case "phone":
      return isValidPhMobile(value) ? "" : INVALID_PH_MOBILE_MESSAGE;
    case "email": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Email is required.";
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) return "Please enter a valid email address.";
      return "";
    }
    case "address":
      return String(value || "").trim() ? "" : "Address is required.";
    default:
      return "";
  }
}

export default function AppointmentForm({ profile, mode = "owner", guestOwner = false, onCreated }) {
  const isStaff = mode === "staff";
  const [owners, setOwners] = useState([]);
  const [pets, setPets] = useState([]);
  const [vets, setVets] = useState([]);
  const [slotMap, setSlotMap] = useState({});
  const [availableTimes, setAvailableTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [walkInSuccess, setWalkInSuccess] = useState(null);

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [ownerRecord, setOwnerRecord] = useState(null);
  const [guestForm, setGuestForm] = useState({ firstName: "", lastName: "", phone: "", email: "", address: "" });
  const [serviceConsent, setServiceConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const consentRef = useRef(null);
  const submittingRef = useRef(false);
  const petModalSavingRef = useRef(false);
  const guestOwnerPromiseRef = useRef(null);
  const guestFieldRefs = useRef({}).current;
  const registerGuestFieldRef = (name) => (el) => { guestFieldRefs[name] = el; };
  const ownerSearchRef = useRef(null);
  const appointmentDateFieldRef = useRef(null);
  const startTimeFieldRef = useRef(null);
  const veterinarianFieldRef = useRef(null);
  const [petDropdownOpen, setPetDropdownOpen] = useState(false);
  const petSelectRef = useRef(null);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [petModalForm, setPetModalForm] = useState(EMPTY_PET_FORM);
  const [petModalSaving, setPetModalSaving] = useState(false);
  const [petModalMessage, setPetModalMessage] = useState("");

  const [form, setForm] = useState({
    ownerId: isStaff ? "" : profile?.id || "",
    petIds: [], veterinarianId: "", appointmentDate: todayLocal(), startTime: "", notes: ""
  });

  useEffect(() => {
    async function loadBase() {
      try {
        setLoading(true);
        if (isStaff && !guestOwner) setOwners(await getOwners());
        else if (!isStaff && profile?.id) setPets(await getPetsByOwner(profile.id));
      } catch (error) { setMessage({ type: "error", text: error.message }); }
      finally { setLoading(false); }
    }
    loadBase();
  }, [isStaff, guestOwner, profile?.id]);

  useEffect(() => {
    if (!isStaff) return;
    async function loadPets() {
      setForm(value => ({ ...value, petIds: [] }));
      try { setPets(form.ownerId ? await getPetsByOwner(form.ownerId) : []); }
      catch (error) { setMessage({ type: "error", text: error.message }); }
    }
    loadPets();
  }, [form.ownerId, isStaff]);

  useEffect(() => {
    async function loadAvailability() {
      setForm(value => ({ ...value, startTime: "", veterinarianId: "" }));
      if (!form.appointmentDate) { setVets([]); setSlotMap({}); setAvailableTimes([]); return; }
      try {
        setAvailabilityLoading(true);
        const result = await getVeterinarianAvailability(form.appointmentDate);
        setVets(result.vets);
        setSlotMap(result.slotMap);
        setAvailableTimes(result.times);
      } catch (error) { setMessage({ type: "error", text: error.message }); }
      finally { setAvailabilityLoading(false); }
    }
    loadAvailability();
  }, [form.appointmentDate]);

  useEffect(() => {
    const channel = supabase
      .channel(`appointment-availability-${profile?.id || "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        if (!form.appointmentDate) return;
        getVeterinarianAvailability(form.appointmentDate)
          .then(result => {
            setVets(result.vets);
            setSlotMap(result.slotMap);
            setAvailableTimes(result.times);
          })
          .catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [form.appointmentDate, profile?.id]);

  useEffect(() => {
    if (!petDropdownOpen) return;
    function handleClickOutside(event) {
      if (petSelectRef.current && !petSelectRef.current.contains(event.target)) {
        setPetDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [petDropdownOpen]);

  useEffect(() => {
    if (!petModalOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [petModalOpen]);

  useEffect(() => {
    setForm(value => {
      if (!value.veterinarianId) return value;
      const stillEligible = (slotMap[value.veterinarianId] || []).includes(value.startTime);
      return stillEligible ? value : { ...value, veterinarianId: "" };
    });
  }, [form.startTime, slotMap]);

  const selectedPets = useMemo(() => pets.filter(pet => form.petIds.includes(pet.id)), [pets, form.petIds]);
  const eligibleVets = useMemo(() => vets.filter(vet => (slotMap[vet.id] || []).includes(form.startTime)), [vets, slotMap, form.startTime]);
  const selectedVet = useMemo(() => vets.find(item => item.id === form.veterinarianId), [vets, form.veterinarianId]);
  const selectedOwner = useMemo(() => owners.find(item => item.id === form.ownerId), [owners, form.ownerId]);

  const vetSlots = slotMap[form.veterinarianId] || [];
  const startIndex = vetSlots.indexOf(form.startTime);
  const consecutiveSlots = [];
  if (startIndex !== -1) {
    const needed = Math.max(form.petIds.length, 1);
    consecutiveSlots.push(vetSlots[startIndex]);
    for (let i = startIndex + 1; i < vetSlots.length && consecutiveSlots.length < needed; i++) {
      if (vetSlots[i] === nextTime(consecutiveSlots[consecutiveSlots.length - 1])) consecutiveSlots.push(vetSlots[i]);
      else break;
    }
  }
  const notEnoughSlots = form.petIds.length > 1 && form.veterinarianId && form.startTime && consecutiveSlots.length < form.petIds.length;

  const filteredOwners = useMemo(() => {
    const query = ownerQuery.trim().toLowerCase();
    if (!query) return owners;
    return owners.filter(owner => `${owner.full_name || ""} ${owner.username || ""} ${owner.email || ""}`.toLowerCase().includes(query));
  }, [owners, ownerQuery]);

  function updateForm(patch) {
    setForm(current => ({ ...current, ...patch }));
    setMessage({ type: "", text: "" });
    setFieldErrors(current => {
      const relevant = Object.keys(patch).filter((name) => current[name]);
      if (!relevant.length) return current;
      const next = { ...current };
      relevant.forEach((name) => {
        const value = patch[name];
        if (name === "petIds") next.petIds = value.length ? "" : current.petIds;
        else if (name === "appointmentDate") next.appointmentDate = value ? "" : current.appointmentDate;
        else if (name === "startTime") next.startTime = value ? "" : current.startTime;
        else if (name === "veterinarianId") next.veterinarianId = value ? "" : current.veterinarianId;
        else if (name === "ownerId") next.ownerId = value ? "" : current.ownerId;
      });
      return next;
    });
  }

  function updateGuestField(name, value) {
    setGuestForm(current => ({ ...current, [name]: value }));
    if (message.text) setMessage({ type: "", text: "" });
    setFieldErrors(current => (
      current[name] ? { ...current, [name]: validateGuestField(name, value) } : current
    ));
  }

  function onOwnerQueryChange(event) {
    const value = event.target.value;
    setOwnerQuery(value);
    setOwnerDropdownOpen(true);
    if (form.ownerId) updateForm({ ownerId: "" });
  }

  function selectOwner(owner) {
    updateForm({ ownerId: owner.id });
    setOwnerQuery(`${owner.full_name}${owner.username ? ` (${owner.username})` : ""}`);
    setOwnerDropdownOpen(false);
  }

  function clearOwner() {
    updateForm({ ownerId: "" });
    setOwnerQuery("");
  }

  async function ensureOwnerId() {
    if (form.ownerId) return form.ownerId;
    if (!guestOwner) throw new Error("Search for and select a pet owner first.");
    // The single choke point for creating a new walk-in owner account --
    // reached both from the main submit and from the "Add Pet" modal, so
    // the consent gate has to live here rather than only in submit(), or
    // a guest account could be created (via Add Pet) before consent was
    // ever checked.
    if (!serviceConsent) {
      setConsentError(CONSENT_REQUIRED_ERROR);
      focusConsentBlock(consentRef);
      throw new Error(CONSENT_REQUIRED_ERROR);
    }
    if (guestOwnerPromiseRef.current) return guestOwnerPromiseRef.current;
    const { firstName, lastName, phone, email, address } = guestForm;
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !address.trim()) {
      throw new Error("Fill in the guest's first name, last name, phone, email, and address first.");
    }
    // The profiles table requires every pet_owner account to have a
    // correctly-formatted phone number (the pet_owner_phone_format check
    // constraint) -- checked here so a bad format surfaces as a clear
    // message instead of a raw database constraint error.
    if (!isValidPhMobile(phone)) {
      throw new Error(INVALID_PH_MOBILE_MESSAGE);
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    guestOwnerPromiseRef.current = createGuestOwner({
      fullName, phone, email, address,
      marketingConsent, recordedBy: profile?.id, sourceContext: "Walk-in Registration",
    })
      .then(owner => {
        setOwnerRecord(owner);
        updateForm({ ownerId: owner.id });
        return owner.id;
      })
      .catch(error => {
        guestOwnerPromiseRef.current = null;
        throw error;
      });
    return guestOwnerPromiseRef.current;
  }

  function togglePet(id) {
    setForm(current => ({
      ...current,
      petIds: current.petIds.includes(id) ? current.petIds.filter(item => item !== id) : [...current.petIds, id]
    }));
    setMessage({ type: "", text: "" });
    setFieldErrors(current => (current.petIds ? { ...current, petIds: "" } : current));
  }

  function removePet(id) {
    setForm(current => ({ ...current, petIds: current.petIds.filter(item => item !== id) }));
  }

  async function openPetModal() {
    try {
      await ensureOwnerId();
      setPetModalForm(EMPTY_PET_FORM);
      setPetModalMessage("");
      setPetModalOpen(true);
      setPetDropdownOpen(false);
    } catch (error) {
      if (error.message !== CONSENT_REQUIRED_ERROR) setMessage({ type: "error", text: error.message });
    }
  }

  async function submitPetModal(event) {
    event.preventDefault();
    if (petModalSavingRef.current) return;
    if (!petModalForm.petName.trim() || !petModalForm.species.trim()) {
      setPetModalMessage("Pet name and species are required.");
      return;
    }
    petModalSavingRef.current = true;
    try {
      setPetModalSaving(true);
      setPetModalMessage("");
      const resolvedOwnerId = await ensureOwnerId();
      const newPet = await savePet({ ...petModalForm }, resolvedOwnerId);
      setPets(current => [...current, newPet].sort((a, b) => a.pet_name.localeCompare(b.pet_name)));
      setForm(current => ({ ...current, petIds: [...current.petIds, newPet.id] }));
      setPetModalOpen(false);
    } catch (error) { setPetModalMessage(error.message); }
    finally { setPetModalSaving(false); petModalSavingRef.current = false; }
  }

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const errors = {};
    const allFieldRefs = {};

    if (isStaff && guestOwner && !ownerRecord) {
      ["firstName", "lastName", "phone", "email", "address"].forEach((name) => {
        const errorMessage = validateGuestField(name, guestForm[name]);
        if (errorMessage) errors[name] = errorMessage;
        if (guestFieldRefs[name]) allFieldRefs[name] = guestFieldRefs[name];
      });
    } else if (isStaff && !guestOwner && !form.ownerId) {
      errors.ownerId = "Search for and select a pet owner.";
      if (ownerSearchRef.current) allFieldRefs.ownerId = ownerSearchRef.current;
    }

    if (!form.petIds.length) {
      errors.petIds = "Select at least one pet.";
      if (petSelectRef.current) allFieldRefs.petIds = petSelectRef.current;
    }

    if (!form.appointmentDate) {
      errors.appointmentDate = "Select an appointment date.";
      if (appointmentDateFieldRef.current) allFieldRefs.appointmentDate = appointmentDateFieldRef.current;
    }

    if (!form.startTime) {
      errors.startTime = "Select an available time.";
      if (startTimeFieldRef.current) allFieldRefs.startTime = startTimeFieldRef.current;
    }

    if (!form.veterinarianId) {
      errors.veterinarianId = "Select a veterinarian.";
      if (veterinarianFieldRef.current) allFieldRefs.veterinarianId = veterinarianFieldRef.current;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(allFieldRefs, errors);
      return;
    }

    // A scheduling-capacity constraint, not a field-emptiness case -- the
    // fields involved (time/pet count) are already individually valid, so
    // this stays a summary-only message rather than pointing at one field.
    if (consecutiveSlots.length < form.petIds.length) {
      setMessage({ type: "error", text: `Only ${consecutiveSlots.length} consecutive slot(s) available from the selected time for ${form.petIds.length} pet(s). Choose an earlier time or fewer pets.` });
      return;
    }

    submittingRef.current = true;
    try {
      setSubmitting(true);
      const ownerId = isStaff ? await ensureOwnerId() : profile.id;
      const source = isStaff ? "Walk-In" : "Online";
      const visitGroupId = form.petIds.length > 1
        ? (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
        : null;
      const bookings = [];
      const createdAppointmentIds = [];
      let queueNumber = null;
      try {
        for (let index = 0; index < form.petIds.length; index++) {
          const petId = form.petIds[index];
          const startTime = consecutiveSlots[index];
          const created = await createAppointment({
            ownerId, petId, veterinarianId: form.veterinarianId,
            appointmentDate: form.appointmentDate, startTime,
            source, notes: form.notes, status: "Confirmed", createdBy: profile.id,
            visitGroupId
          });
          if (created?.id) createdAppointmentIds.push(created.id);
          if (!queueNumber) queueNumber = created?.queue_number || null;
          bookings.push({
            pet: pets.find(item => item.id === petId)?.pet_name || "Registered pet",
            time: `${formatTime(startTime)} to ${formatTime(nextTime(startTime))}`
          });
        }
      } catch (bookingError) {
        if (createdAppointmentIds.length) await cancelAppointmentsByIds(createdAppointmentIds);
        throw bookingError;
      }

      const refreshed = await getVeterinarianAvailability(form.appointmentDate);
      setVets(refreshed.vets);
      setSlotMap(refreshed.slotMap);
      setAvailableTimes(refreshed.times);

      const emailFailures = [];
      if (isStaff && guestOwner && ownerRecord?.email) {
        try {
          await sendGuestBookingConfirmationEmail({
            email: ownerRecord.email,
            fullName: ownerRecord.full_name,
            petNames: bookings.map(booking => booking.pet),
            appointmentDate: form.appointmentDate,
            startTime: consecutiveSlots[0],
            endTime: nextTime(consecutiveSlots[consecutiveSlots.length - 1] || consecutiveSlots[0]),
            veterinarianName: selectedVet?.full_name || "",
            queueNumber
          });
        } catch (emailError) {
          emailFailures.push(`booking confirmation (${emailError.message})`);
        }
        if (ownerRecord.tempPassword) {
          try {
            await sendGuestAccountEmail({
              email: ownerRecord.email,
              fullName: ownerRecord.full_name,
              tempPassword: ownerRecord.tempPassword
            });
          } catch (emailError) {
            emailFailures.push(`account credentials (${emailError.message})`);
          }
        }
      }
      const emailWarning = emailFailures.length ? ` Some emails could not be sent: ${emailFailures.join("; ")}.` : "";

      if (isStaff) {
        setMessage({ type: "", text: "" });
        setWalkInSuccess({
          owner: selectedOwner?.full_name || ownerRecord?.full_name || "Pet owner",
          veterinarian: selectedVet?.full_name || "Selected veterinarian",
          date: form.appointmentDate,
          pets: bookings,
          queueNumber,
          emailed: guestOwner && !!ownerRecord?.email && !emailFailures.length,
          hasAccount: !!ownerRecord?.tempPassword,
          emailError: emailWarning ? emailWarning.trim() : null
        });
      } else {
        setMessage({ type: "success", text: `${bookings.length > 1 ? "Appointments" : "Appointment"} booked successfully.${queueNumber ? ` Your queue number is ${queueNumber}.` : ""}` });
      }

      setForm(current => ({ ...current, petIds: [], startTime: "", notes: "" }));
      onCreated?.();
    } catch (error) {
      // The consent-required case already shows its own message directly
      // below the consent checkbox (and scrolls/highlights it) -- avoid
      // showing the exact same text a second time in the general banner.
      if (error.message !== CONSENT_REQUIRED_ERROR) setMessage({ type: "error", text: error.message });
    }
    finally { setSubmitting(false); submittingRef.current = false; }
  }

  if (loading) return <div className="appointment-card">Loading appointment form…</div>;

  if (walkInSuccess) {
    return (
      <div className="walkin-success-view">
        <section
          className="walkin-success-card"
          aria-labelledby="walkin-success-title"
        >
          <div className="walkin-success-icon" aria-hidden="true">
            <Check size={52} strokeWidth={2.6} />
          </div>

          <span className="walkin-success-label">Walk-In Registration</span>
          <div role="status" aria-live="polite">
            <h2 id="walkin-success-title">Walk-In Registered!</h2>
            <p className="walkin-success-copy">
              The consultation was successfully added to the clinic schedule.
            </p>
          </div>

          <dl className="walkin-success-details" aria-label="Registered consultation details">
            {walkInSuccess.queueNumber && (
              <div>
                <dt>Queue Number</dt>
                <dd>{walkInSuccess.queueNumber}</dd>
              </div>
            )}
            <div>
              <dt>Pet Owner</dt>
              <dd>{walkInSuccess.owner}</dd>
            </div>
            <div>
              <dt>Veterinarian</dt>
              <dd>{walkInSuccess.veterinarian}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatAppointmentDate(walkInSuccess.date)}</dd>
            </div>
            {walkInSuccess.pets.map((booking, index) => (
              <div key={index}>
                <dt>{walkInSuccess.pets.length > 1 ? `Pet ${index + 1}` : "Pet"}</dt>
                <dd>{booking.pet}<br />{booking.time}</dd>
              </div>
            ))}
          </dl>
          {walkInSuccess.emailed && (
            <p className="walkin-success-copy">
              {walkInSuccess.hasAccount
                ? "A booking confirmation and account login details (with a temporary password) were emailed to the guest."
                : "A confirmation email was sent to the guest."}
            </p>
          )}
          {walkInSuccess.emailError && <div className="notice error">{walkInSuccess.emailError}</div>}

          <div className="walkin-success-actions">
            <button type="button" onClick={() => setWalkInSuccess(null)}>
              <RotateCcw size={17} aria-hidden="true" />
              Register Another Walk-In
            </button>
            <Link to="/staff/appointments">
              View Appointments
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="appointment-grid">
      <form className="appointment-card" onSubmit={submit}>
        <div className="form-title"><CalendarDays /> <div><h2>{isStaff ? "Create Appointment / Walk-In" : "Book an Appointment"}</h2><p>General Consultation · 10-minute time slots</p></div></div>
        {message.text && <div className={`notice ${message.type}`}>{message.text}</div>}

        {isStaff && (guestOwner ? (
          <>
            <div className="two-cols">
              <label>First Name<span className="required-mark"> *</span><input ref={registerGuestFieldRef("firstName")} className={invalidClass(fieldErrors, "firstName")} required value={guestForm.firstName} disabled={!!ownerRecord} onChange={event => updateGuestField("firstName", event.target.value)} placeholder="Enter first name" />{fieldErrors.firstName && <span className="field-error-text">{fieldErrors.firstName}</span>}</label>
              <label>Last Name<span className="required-mark"> *</span><input ref={registerGuestFieldRef("lastName")} className={invalidClass(fieldErrors, "lastName")} required value={guestForm.lastName} disabled={!!ownerRecord} onChange={event => updateGuestField("lastName", event.target.value)} placeholder="Enter last name" />{fieldErrors.lastName && <span className="field-error-text">{fieldErrors.lastName}</span>}</label>
            </div>
            <div className="two-cols">
              <label>Phone Number<span className="required-mark"> *</span><input ref={registerGuestFieldRef("phone")} className={invalidClass(fieldErrors, "phone")} required value={guestForm.phone} disabled={!!ownerRecord} onChange={event => updateGuestField("phone", event.target.value)} placeholder="09XXXXXXXXX or +639XXXXXXXXX" />{fieldErrors.phone && <span className="field-error-text">{fieldErrors.phone}</span>}</label>
              <label>Email<span className="required-mark"> *</span><input ref={registerGuestFieldRef("email")} className={invalidClass(fieldErrors, "email")} required type="email" value={guestForm.email} disabled={!!ownerRecord} onChange={event => updateGuestField("email", event.target.value)} placeholder="Enter email address" />{fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}</label>
            </div>
            <label>Address<span className="required-mark"> *</span><input ref={registerGuestFieldRef("address")} className={invalidClass(fieldErrors, "address")} required value={guestForm.address} disabled={!!ownerRecord} onChange={event => updateGuestField("address", event.target.value)} placeholder="Enter home address" />{fieldErrors.address && <span className="field-error-text">{fieldErrors.address}</span>}</label>
            {ownerRecord && (
              <p className="help">
                Registered as a new pet owner account for {ownerRecord.full_name}. <button type="button" className="appt-linklike" onClick={() => { guestOwnerPromiseRef.current = null; setOwnerRecord(null); updateForm({ ownerId: "" }); }}>Not them? Start over</button>
              </p>
            )}
          </>
        ) : (
          <label>Pet Owner<span className="required-mark"> *</span>
            <div className="appt-owner-select">
              <input
                ref={ownerSearchRef}
                className={invalidClass(fieldErrors, "ownerId")}
                type="text"
                role="combobox"
                aria-expanded={ownerDropdownOpen}
                placeholder="Search pet owner by name or username"
                value={ownerQuery}
                onChange={onOwnerQueryChange}
                onFocus={() => setOwnerDropdownOpen(true)}
                onBlur={() => window.setTimeout(() => setOwnerDropdownOpen(false), 120)}
              />
              {form.ownerId && <button type="button" className="appt-clear" aria-label="Clear pet owner" onClick={clearOwner}><X size={15} /></button>}
              {ownerDropdownOpen && (
                <div className="appt-owner-dropdown">
                  {filteredOwners.length === 0 && <div className="appt-dropdown-empty">No matching pet owners</div>}
                  {filteredOwners.map(owner => (
                    <button type="button" key={owner.id} className="appt-dropdown-item" onMouseDown={() => selectOwner(owner)}>
                      <strong>{owner.full_name}</strong>
                      <span>{owner.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {fieldErrors.ownerId && <span className="field-error-text">{fieldErrors.ownerId}</span>}
          </label>
        ))}

        <label>Pet Selection<span className="required-mark"> *</span>
          <div className={invalidClass(fieldErrors, "petIds", "appt-pet-select")} ref={petSelectRef} tabIndex={-1}>
            <div className="appt-pet-controls">
              <button type="button" className="appt-pet-trigger" disabled={isStaff && !form.ownerId} onClick={() => setPetDropdownOpen(open => !open)}>
                {form.petIds.length ? `${form.petIds.length} pet${form.petIds.length > 1 ? "s" : ""} selected` : (pets.length ? "Select pet(s)" : "No registered pets found")}
                <ChevronDown size={16} />
              </button>
              <button type="button" className="appt-addpet-btn" disabled={isStaff && !guestOwner && !form.ownerId} onClick={openPetModal}>
                <Plus size={16} /> Add Pet
              </button>
            </div>
            {petDropdownOpen && (
              <div className="appt-pet-dropdown">
                {pets.length === 0 && <div className="appt-dropdown-empty">No registered pets found</div>}
                {pets.map(pet => (
                  <label key={pet.id} className="appt-pet-option">
                    <input type="checkbox" checked={form.petIds.includes(pet.id)} onChange={() => togglePet(pet.id)} />
                    <span>{pet.pet_name} — {pet.species}{pet.breed ? ` / ${pet.breed}` : ""}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedPets.length > 0 && (
              <div className="appt-pet-chips">
                {selectedPets.map(pet => (
                  <span key={pet.id} className="appt-pet-chip">
                    {pet.pet_name}
                    <button type="button" onClick={() => removePet(pet.id)} aria-label={`Remove ${pet.pet_name}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {fieldErrors.petIds && <span className="field-error-text">{fieldErrors.petIds}</span>}
        </label>

        <div className="two-cols">
          <label>Appointment Date<span className="required-mark"> *</span><input ref={appointmentDateFieldRef} className={invalidClass(fieldErrors, "appointmentDate")} type="date" name="appointmentDate" min={todayLocal()} value={form.appointmentDate} onChange={event => updateForm({ appointmentDate: event.target.value })} required />{fieldErrors.appointmentDate && <span className="field-error-text">{fieldErrors.appointmentDate}</span>}</label>
          <label>Available Time<span className="required-mark"> *</span><select ref={startTimeFieldRef} className={invalidClass(fieldErrors, "startTime")} value={form.startTime} onChange={event => updateForm({ startTime: event.target.value })} required disabled={availabilityLoading || !availableTimes.length}>
            <option value="">{availabilityLoading ? "Loading…" : availableTimes.length ? "Select time" : "No available slots"}</option>
            {availableTimes.map(slot => <option key={slot} value={slot}>{formatTime(slot)}</option>)}
          </select>{fieldErrors.startTime && <span className="field-error-text">{fieldErrors.startTime}</span>}</label>
        </div>

        <label>Veterinarian<span className="required-mark"> *</span>
          <select ref={veterinarianFieldRef} className={invalidClass(fieldErrors, "veterinarianId")} value={form.veterinarianId} onChange={event => updateForm({ veterinarianId: event.target.value })} required disabled={!form.startTime}>
            <option value="">{!form.startTime ? "Select a time first" : eligibleVets.length ? "Select veterinarian" : "No veterinarian available at this time"}</option>
            {eligibleVets.map(vet => <option key={vet.id} value={vet.id}>{vet.full_name}</option>)}
          </select>
          {fieldErrors.veterinarianId && <span className="field-error-text">{fieldErrors.veterinarianId}</span>}
        </label>

        {notEnoughSlots && <p className="notice error">Only {consecutiveSlots.length} consecutive slot(s) available from this time for {form.petIds.length} pets. Choose an earlier time or fewer pets.</p>}

        <label>Notes<span className="optional-mark"> (Optional)</span><textarea value={form.notes} onChange={event => updateForm({ notes: event.target.value })} maxLength="500" rows="4" placeholder="Additional information for the clinic" /></label>

        {isStaff && guestOwner && !ownerRecord && (
          <DataPrivacyConsent
            ref={consentRef}
            serviceConsent={serviceConsent}
            onServiceConsentChange={(checked) => { setServiceConsent(checked); if (checked) setConsentError(""); }}
            marketingConsent={marketingConsent}
            onMarketingConsentChange={setMarketingConsent}
            error={consentError}
          />
        )}

        <button className="book-button" disabled={submitting || notEnoughSlots}>{submitting ? "Saving…" : isStaff ? "Register Walk-In" : "Book Appointment"}</button>
      </form>

      <aside className="appointment-card summary">
        <h3>Appointment Summary</h3>
        <Summary icon={<PawPrint />} label={selectedPets.length > 1 ? "Pets" : "Pet"} value={selectedPets.length ? selectedPets.map(pet => pet.pet_name).join(", ") : "Not selected"} />
        {isStaff && <Summary icon={<PawPrint />} label="Owner" value={selectedOwner?.full_name || ownerRecord?.full_name || "Not selected"} />}
        <Summary icon={<Stethoscope />} label="Veterinarian" value={selectedVet?.full_name || "Not selected"} />
        <Summary icon={<CalendarDays />} label="Date" value={form.appointmentDate || "Not selected"} />
        <Summary icon={<Clock3 />} label="Time" value={form.startTime ? `${formatTime(form.startTime)} – ${formatTime(nextTime(form.startTime))}${form.petIds.length > 1 ? ` (+${form.petIds.length - 1} more slot${form.petIds.length > 2 ? "s" : ""})` : ""}` : "Not selected"} />
        <div className="summary-type"><strong>Consultation Type</strong><span>General Consultation</span></div>
        <p className="help">Clinic booking hours: Monday–Sunday, 9:00 AM–7:00 PM. Slots are 10 minutes each; the last slot is 6:50 PM–7:00 PM. A time disappears as soon as it is booked for the selected veterinarian.</p>
      </aside>

      {petModalOpen && (
        <div className="appt-modal-backdrop" onClick={() => setPetModalOpen(false)}>
          <div className="appt-modal" onClick={event => event.stopPropagation()}>
            <button type="button" className="appt-modal-close" aria-label="Close" onClick={() => setPetModalOpen(false)}><X /></button>
            <h3><PawPrint size={18} /> Add Pet</h3>
            <form onSubmit={submitPetModal} className="appt-modal-form">
              {petModalMessage && <div className="notice error">{petModalMessage}</div>}
              <label>Pet Name<span className="required-mark"> *</span><input required value={petModalForm.petName} onChange={event => setPetModalForm(value => ({ ...value, petName: event.target.value }))} placeholder="Enter pet name" /></label>
              <div className="two-cols">
                <label>Species<span className="required-mark"> *</span><input required value={petModalForm.species} onChange={event => setPetModalForm(value => ({ ...value, species: event.target.value }))} placeholder="e.g. Dog, Cat" /></label>
                <label>Breed<span className="optional-mark"> (Optional)</span><input value={petModalForm.breed} onChange={event => setPetModalForm(value => ({ ...value, breed: event.target.value }))} placeholder="Enter breed" /></label>
              </div>
              <div className="two-cols">
                <label>Sex
                  <select value={petModalForm.sex} onChange={event => setPetModalForm(value => ({ ...value, sex: event.target.value }))}>
                    <option>Unknown</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </label>
                <label>Weight (kg)<span className="optional-mark"> (Optional)</span><input type="number" min="0" step="0.01" value={petModalForm.weight} onChange={event => setPetModalForm(value => ({ ...value, weight: event.target.value }))} placeholder="0.00" /></label>
              </div>
              <label>Date of Birth<span className="optional-mark"> (Optional)</span><input type="date" max={todayLocal()} value={petModalForm.dateOfBirth} onChange={event => setPetModalForm(value => ({ ...value, dateOfBirth: event.target.value }))} /></label>
              <button className="book-button" disabled={petModalSaving}>{petModalSaving ? "Saving…" : "Register Pet"}</button>
            </form>
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

function nextTime(time) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, h, m + 10);
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
function Summary({ icon, label, value }) { return <div className="summary-row"><span className="summary-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

function formatAppointmentDate(value) {
  if (!value) return "Not selected";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

const styles = `
.appointment-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.75fr);gap:22px;align-items:start}.appointment-card{background:#fff;border-radius:20px;padding:24px;box-shadow:0 10px 30px rgba(55,126,158,.1)}.form-title{display:flex;gap:12px;align-items:center;margin-bottom:20px;color:#318fbe}.form-title h2{margin:0;color:#20313B}.form-title p{margin:3px 0;color:#6F7F88}.appointment-card label{display:grid;gap:7px;font-weight:700;margin-bottom:16px}.appointment-card label span{font-weight:400;color:#7c8c94}.appointment-card label .required-mark{display:inline;font-weight:700;color:#d14b4b;margin-left:2px}.appointment-card input,.appointment-card select,.appointment-card textarea{width:100%;border:1px solid #cfe4ed;border-radius:12px;padding:12px 13px;font:inherit;color:#20313B;background:#fbfeff}.appointment-card input:focus,.appointment-card select:focus,.appointment-card textarea:focus{outline:2px solid #a9dff0;border-color:#4DA8DA}.two-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.book-button{width:100%;border:0;border-radius:13px;padding:14px;background:#4DA8DA;color:white;font-weight:800;font-size:15px;cursor:pointer}.book-button:disabled{opacity:.65;cursor:not-allowed}.notice{padding:12px 14px;border-radius:12px;margin-bottom:16px}.notice.success{background:#eaf8ef;color:#28774b}.notice.error{background:#fff0f0;color:#b34848}.summary{position:sticky;top:105px}.summary h3{margin-top:0}.summary-row{display:flex;gap:11px;padding:13px 0;border-bottom:1px solid #edf4f7}.summary-icon{width:36px;height:36px;background:#eaf8fd;color:#3998c5;border-radius:10px;display:grid;place-items:center;flex-shrink:0}.summary-icon svg{width:18px}.summary-row small,.summary-row strong{display:block}.summary-row small{color:#758891;margin-bottom:3px}.summary-row strong{word-break:break-word}.summary-type{margin-top:18px;padding:14px;background:#f2fafd;border-radius:12px;display:grid;gap:5px}.summary-type span{color:#318fbe}.help{font-size:12px;line-height:1.55;color:#6F7F88}

.appt-owner-select{position:relative}.appt-owner-select input{padding-right:36px}.appt-clear{position:absolute;right:8px;top:12px;border:0;background:#edf5f8;color:#5d7782;border-radius:7px;padding:5px;cursor:pointer;display:grid;place-items:center}
.appt-linklike{border:0;background:none;padding:0;color:#318fbe;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
.appt-owner-dropdown{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;max-height:260px;overflow:auto;background:#fff;border:1px solid #cfe4ed;border-radius:12px;box-shadow:0 14px 30px rgba(45,111,143,.16);padding:6px}
.appt-pet-dropdown{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;max-height:260px;overflow:auto;background:#fff;border:1px solid #cfe4ed;border-radius:12px;box-shadow:0 14px 30px rgba(45,111,143,.16);padding:6px;display:grid;gap:2px}
.appt-dropdown-empty{padding:12px;color:#8496a0;font-size:13px;font-weight:400}
.appt-dropdown-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:0;background:none;padding:9px 10px;border-radius:8px;cursor:pointer;font:inherit}
.appt-dropdown-item:hover{background:#eaf8fd}.appt-dropdown-item strong{color:#20313B;font-size:14px;font-weight:700}.appt-dropdown-item span{color:#7c8c94;font-size:12px;font-weight:400}
.appt-pet-select{position:relative;display:grid;gap:10px}.appt-pet-controls{display:flex;gap:8px}
.appt-pet-trigger{flex:1;display:flex;align-items:center;justify-content:space-between;border:1px solid #cfe4ed;border-radius:12px;padding:12px 13px;background:#fbfeff;color:#20313B;font:inherit;font-weight:400;cursor:pointer}
.appt-pet-select.field-invalid{border-color:transparent!important;box-shadow:none!important}
.appt-pet-select.field-invalid .appt-pet-trigger{border-color:#d9534f!important;box-shadow:0 0 0 1px #d9534f!important}
.appt-pet-trigger:disabled{opacity:.6;cursor:not-allowed}
.appt-addpet-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #a9dff0;border-radius:12px;padding:12px 14px;background:#eaf8fd;color:#267da3;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}
.appt-addpet-btn:hover{background:#dcf1fa}.appt-addpet-btn:disabled{opacity:.6;cursor:not-allowed}
.appt-pet-option{display:flex!important;align-items:center;gap:9px!important;padding:8px 10px;border-radius:8px;font-weight:400!important;cursor:pointer;margin-bottom:0!important}
.appt-pet-option:hover{background:#eaf8fd}.appt-pet-option input{width:16px;height:16px;flex-shrink:0;accent-color:#4DA8DA}
.appt-pet-chips{display:flex;flex-wrap:wrap;gap:8px}
.appt-pet-chip{display:inline-flex;align-items:center;gap:6px;background:#eaf8fd;color:#267da3;border-radius:999px;padding:6px 6px 6px 12px;font-size:13px;font-weight:700}
.appt-pet-chip button{display:grid;place-items:center;border:0;background:rgba(38,125,163,.14);color:#267da3;border-radius:50%;padding:3px;cursor:pointer}
.appt-modal-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:rgba(24,50,63,.62);backdrop-filter:blur(4px)}
.appt-modal{position:relative;width:min(520px,100%);max-height:86vh;overflow:auto;border-radius:19px;padding:25px;background:#fff;box-shadow:0 22px 55px rgba(22,56,72,.24)}
.appt-modal h3{margin:0 0 16px;display:flex;align-items:center;gap:8px;color:#20313B;padding-right:30px}
.appt-modal-close{position:absolute;top:12px;right:12px;display:grid;place-items:center;border:0;border-radius:9px;padding:7px;background:#edf5f8;color:#456472;cursor:pointer}
.appt-modal-form label{display:grid;gap:7px;font-weight:700;margin-bottom:14px}.appt-modal-form label span{font-weight:400;color:#7c8c94}.appt-modal-form label .required-mark{display:inline;font-weight:700;color:#d14b4b;margin-left:2px}
.appt-modal-form input,.appt-modal-form select{width:100%;border:1px solid #cfe4ed;border-radius:12px;padding:11px 13px;font:inherit;color:#20313B;background:#fbfeff}

.walkin-success-view{height:calc(100vh - 156px);overflow:hidden;display:grid;place-items:center;padding:24px 18px;background:radial-gradient(circle at top left,rgba(77,168,218,.13),transparent 38%),linear-gradient(145deg,#f8fcfe 0%,#edf8fc 100%);border-radius:24px}.walkin-success-card{position:relative;width:min(100%,680px);max-height:100%;overflow-y:auto;background:rgba(255,255,255,.96);border:1px solid rgba(119,189,218,.35);border-radius:28px;padding:30px 34px;box-shadow:0 24px 65px rgba(34,99,128,.16);text-align:center}.walkin-success-card:before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#3f9fca,#72c6dc)}.walkin-success-icon{width:72px;height:72px;margin:0 auto 14px;display:grid;place-items:center;border-radius:50%;color:#fff;background:linear-gradient(145deg,#42a6cc,#69c4d9);box-shadow:0 14px 30px rgba(57,157,196,.28)}.walkin-success-label{display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px;padding:7px 13px;border-radius:999px;background:#eaf7fc;color:#267da3;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.walkin-success-card h2{margin:0;color:#183c50;font-size:clamp(24px,3.4vw,32px);line-height:1.15;letter-spacing:-.025em}.walkin-success-copy{max-width:510px;margin:10px auto 18px;color:#607985;font-size:15px;line-height:1.55}.walkin-success-details{margin:0;padding:4px 22px;background:#f6fbfd;border:1px solid #dceff6;border-radius:18px;text-align:left}.walkin-success-details>div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;padding:11px 4px;border-bottom:1px solid #e1eef3}.walkin-success-details>div:last-child{border-bottom:0}.walkin-success-details dt{color:#6b818b;font-size:13px;font-weight:700}.walkin-success-details dd{margin:0;color:#183c50;font-size:15px;font-weight:800;line-height:1.4}.walkin-success-actions{display:flex;justify-content:center;gap:12px;margin-top:18px}.walkin-success-actions button,.walkin-success-actions a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:13px;padding:12px 18px;font:inherit;font-size:14px;font-weight:800;text-decoration:none;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}.walkin-success-actions button{border:1px solid #bcdce9;background:#fff;color:#267da3}.walkin-success-actions a{border:1px solid #318fbe;background:#318fbe;color:#fff;box-shadow:0 9px 18px rgba(49,143,190,.22)}.walkin-success-actions button:hover,.walkin-success-actions a:hover{transform:translateY(-2px)}.walkin-success-actions button:hover{background:#f1f9fc}.walkin-success-actions a:hover{background:#287fa9;box-shadow:0 12px 24px rgba(49,143,190,.28)}.walkin-success-actions button:focus-visible,.walkin-success-actions a:focus-visible{outline:3px solid rgba(77,168,218,.32);outline-offset:3px}

@media(max-width:900px){.appointment-grid{grid-template-columns:1fr}.summary{position:static}}@media(max-width:560px){.two-cols{grid-template-columns:1fr}.appointment-card{padding:17px}.appt-pet-controls{flex-direction:column}.walkin-success-view{height:auto;overflow:visible;padding:14px 0;background:transparent}.walkin-success-card{max-height:none;overflow-y:visible;border-radius:20px;padding:31px 18px 22px}.walkin-success-icon{width:72px;height:72px}.walkin-success-icon svg{width:39px;height:39px}.walkin-success-copy{font-size:14px;margin-bottom:21px}.walkin-success-details{padding:5px 14px}.walkin-success-details>div{grid-template-columns:1fr;gap:4px;padding:12px 2px}.walkin-success-details dt{font-size:12px}.walkin-success-actions{flex-direction:column}.walkin-success-actions button,.walkin-success-actions a{width:100%}}
`;
