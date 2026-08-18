import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Camera,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileHeart,
  History,
  PawPrint,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";

import { getOwners } from "../services/appointmentService";
import {
  archivePet,
  getPetAppointments,
  getPets,
  savePet,
  uploadPetPhoto,
} from "../services/petService";
import { validateImageFile } from "../utils/validators";
import { getMedicalRecords } from "../services/medicalRecordService";

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
  microchipNumber: "",
  allergies: "",
  existingConditions: "",
  notes: "",
  photoUrl: "",
};

const SPECIES_GROUPS = [
  {
    label: "Common Household Pets",
    options: [
      "Dog",
      "Cat",
      "Rabbit",
      "Guinea Pig",
      "Hamster",
      "Mouse",
      "Rat",
      "Gerbil",
      "Ferret",
      "Chinchilla",
      "Hedgehog",
      "Sugar Glider",
    ],
  },
  {
    label: "Birds",
    options: [
      "Parrot",
      "Cockatiel",
      "Budgerigar",
      "Lovebird",
      "Canary",
      "Finch",
      "Pigeon",
      "Dove",
      "Chicken",
      "Duck",
      "Goose",
      "Turkey",
      "Quail",
    ],
  },
  {
    label: "Fish",
    options: [
      "Goldfish",
      "Betta Fish",
      "Koi",
      "Guppy",
      "Molly",
      "Platy",
      "Swordtail",
      "Tetra",
      "Cichlid",
      "Angelfish",
      "Catfish",
    ],
  },
  {
    label: "Reptiles",
    options: [
      "Turtle",
      "Tortoise",
      "Gecko",
      "Iguana",
      "Chameleon",
      "Bearded Dragon",
      "Snake",
    ],
  },
  {
    label: "Amphibians",
    options: [
      "Frog",
      "Toad",
      "Salamander",
      "Newt",
      "Axolotl",
    ],
  },
  {
    label: "Farm and Companion Animals",
    options: [
      "Goat",
      "Sheep",
      "Pig",
      "Horse",
      "Pony",
      "Donkey",
      "Cow",
      "Carabao",
      "Llama",
      "Alpaca",
    ],
  },
  {
    label: "Other",
    options: ["Other"],
  },
];

const SPECIES_OPTIONS = SPECIES_GROUPS.flatMap(
  (group) => group.options
);

const SEX_OPTIONS = [
  "Unknown",
  "Male",
  "Female",
];

const BREEDS_BY_SPECIES = {
  Dog: [
    "Aspin (Askal)",
    "Labrador Retriever",
    "Golden Retriever",
    "German Shepherd",
    "Poodle",
    "Shih Tzu",
    "Chihuahua",
    "Beagle",
    "Siberian Husky",
    "Pomeranian",
    "Rottweiler",
    "Dachshund",
    "Bulldog",
    "French Bulldog",
    "Shiba Inu",
    "Corgi",
    "Doberman Pinscher",
    "Great Dane",
    "Border Collie",
    "Japanese Spitz",
    "Mixed Breed",
  ],
  Cat: [
    "Puspin (Domestic Shorthair)",
    "Persian",
    "Siamese",
    "Maine Coon",
    "British Shorthair",
    "Ragdoll",
    "Bengal",
    "Scottish Fold",
    "American Shorthair",
    "Sphynx",
    "Himalayan",
    "Mixed Breed",
  ],
  Rabbit: [
    "Holland Lop",
    "Netherland Dwarf",
    "Rex",
    "Angora",
    "Lionhead",
    "Dutch",
    "Flemish Giant",
    "Mixed Breed",
  ],
  "Guinea Pig": [
    "American",
    "Abyssinian",
    "Peruvian",
    "Silkie",
    "Teddy",
    "Texel",
  ],
  Hamster: [
    "Syrian",
    "Dwarf Campbell Russian",
    "Winter White",
    "Roborovski",
    "Chinese",
  ],
  Horse: [
    "Philippine Native Pony",
    "Arabian",
    "Thoroughbred",
    "Quarter Horse",
    "Appaloosa",
  ],
  Pony: [
    "Philippine Native Pony",
    "Shetland Pony",
    "Welsh Pony",
  ],
  Goat: [
    "Native / Native Cross",
    "Boer",
    "Anglo-Nubian",
    "Saanen",
  ],
  Cow: [
    "Native",
    "Holstein",
    "Brahman",
    "Sahiwal",
  ],
  Carabao: [
    "Native Carabao",
    "Murrah Buffalo",
  ],
  Pig: [
    "Native",
    "Landrace",
    "Large White",
    "Duroc",
  ],
  Chicken: [
    "Native (Darag)",
    "Rhode Island Red",
    "Leghorn",
    "Broiler",
  ],
  Duck: [
    "Native (Itik)",
    "Pekin",
    "Muscovy",
    "Khaki Campbell",
  ],
};

function formatPetAge(dateOfBirth) {
  if (!dateOfBirth) return "";

  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "";

  const now = new Date();
  if (dob > now) return "";

  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();

  if (now.getDate() < dob.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  if (totalMonths < 1) return "Less than a month old";

  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);

  return `${parts.join(", ")} old`;
}

export default function PetManagementModule({
  profile,
  ownerOnly = false,
}) {
  const navigate = useNavigate();
  const [pets, setPets] = useState([]);
  const [owners, setOwners] = useState([]);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ownerId: ownerOnly ? profile.id : "",
  });

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

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

  const canManageAll =
    !ownerOnly &&
    ["admin", "staff", "veterinarian"].includes(profile.role);

  // Mirrors MedicalRecordsModule's own access rule: only a veterinarian (or
  // admin) can create/edit a medical record. Staff stays view-only there,
  // and a pet owner is always view-only, so no "Add Medical Record" action
  // is offered to either here.
  const canCreateRecord =
    !ownerOnly &&
    ["admin", "veterinarian"].includes(profile.role);

  // Staff/Vet/Admin see it inside their patient-management view; a pet
  // owner sees the same section for their own pets (getMedicalRecords
  // already limits that to their Finalized records only -- unchanged).
  const canViewMedicalHistory = canManageAll || ownerOnly;

  const medicalRecordsRoute =
    profile.role === "veterinarian"
      ? "/veterinarian/medical-records"
      : "/admin/medical-records";

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
      color: pet.color || "",
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

    setSaving(true);
    setMessage("");

    try {
      const ownerId = form.ownerId || profile.id;

      if (!ownerId) {
        throw new Error("Please select the pet owner.");
      }

      const finalSpecies =
        form.species === "Other"
          ? form.customSpecies.trim()
          : form.species.trim();

      if (!finalSpecies) {
        throw new Error(
          "Please select or enter the pet species."
        );
      }

      const finalBreed =
        form.breed === "Other"
          ? form.customBreed.trim()
          : form.breed.trim();

      if (!finalBreed) {
        throw new Error(
          "Please select or enter the pet breed."
        );
      }

      let photoUrl = form.photoUrl;

      if (file) {
        photoUrl = await uploadPetPhoto(file, ownerId);
      }

      await savePet(
        {
          ...form,
          species: finalSpecies,
          breed: finalBreed,
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
                      <span className="required-mark">*</span>
                    </span>

                    <div className="combo">
                      <div className="combo-input">
                        <Search size={15} />

                        <input
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
                      <span className="required-mark">*</span>
                    </span>

                    <input
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
                  </label>

                  <label>
                    <span>
                      Species
                      <span className="required-mark">*</span>
                    </span>

                    <div className="combo">
                      <div className="combo-input">
                        <Search size={15} />

                        <input
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
                  </label>

                  {form.species === "Other" && (
                    <label>
                      <span>
                        Specify Species
                        <span className="required-mark">*</span>
                      </span>

                      <input
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
                    </label>
                  )}

                  <label>
                    <span>
                      Breed
                      <span className="required-mark">*</span>
                    </span>

                    {breedOptions ? (
                      <select
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
                  </label>

                  {breedOptions && form.breed === "Other" && (
                    <label>
                      <span>
                        Specify Breed
                        <span className="required-mark">*</span>
                      </span>

                      <input
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
                    </label>
                  )}

                  <label>
                    <span>
                      Sex
                      <span className="required-mark">*</span>
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
                      <span className="required-mark">*</span>
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
                      <span className="required-mark">*</span>
                    </span>

                    <input
                      required
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
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">
                  Identification
                </h3>

                <div className="grid">
                  <label>
                    <span>Color</span>

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
                  </label>

                  <label>
                    <span>Microchip Number</span>

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
                  <span>Allergies</span>

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
                  <span>Existing Conditions</span>

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
                  <span>Additional Notes</span>

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

      <section className="card list-card">
        <div className="toolbar">
          <div>
            <div className="list-heading-row">
              <h2>
                <PawPrint />
                Animal Patients
              </h2>

              <button
                type="button"
                className="register-pet-btn"
                onClick={openRegisterModal}
              >
                <Plus size={16} />
                Register Pet
              </button>
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
                  : "Register a pet to see it listed here."
                : "Try changing the search text or species filter."}
            </p>
          </div>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Species / Breed</th>
                  {canManageAll && <th>Owner</th>}
                  <th>Details</th>
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
                      <div className="pet-cell">
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
                      </div>
                    </td>

                    <td>
                      {pet.species || "Species not recorded"}
                      {pet.breed && <small>{pet.breed}</small>}
                    </td>

                    {canManageAll && (
                      <td>
                        {pet.owner?.full_name || "Not assigned"}
                      </td>
                    )}

                    <td>
                      <button
                        type="button"
                        className="details-btn"
                        onClick={() => handleOpenHistory(pet)}
                      >
                        <Eye size={14} />
                        View Details
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

      {selectedPet && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSelectedPet(null)
          }
        >
          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="close"
              aria-label="Close pet details"
              onClick={() =>
                setSelectedPet(null)
              }
            >
              <X />
            </button>

            <p className="modal-eyebrow">Animal Patient Profile</p>
            <h2>{selectedPet.pet_name || "Unnamed Pet"}</h2>
            <p className="modal-subtitle">
              {canManageAll
                ? "Pet profile, owner information, and complete medical history."
                : "Pet profile and complete medical history."}
            </p>

            <h3 className="history-heading">Pet Profile</h3>

            <div className="details">
              <p>
                <strong>Species:</strong>{" "}
                {selectedPet.species ||
                  "Not recorded"}
              </p>

              <p>
                <strong>Breed:</strong>{" "}
                {selectedPet.breed ||
                  "Not recorded"}
              </p>

              <p>
                <strong>Sex:</strong>{" "}
                {selectedPet.sex || "Unknown"}
              </p>

              <p>
                <strong>Weight:</strong>{" "}
                {selectedPet.weight
                  ? `${selectedPet.weight} kg`
                  : "Not recorded"}
              </p>

              <p>
                <strong>Color:</strong>{" "}
                {selectedPet.color || "Not recorded"}
              </p>

              <p>
                <strong>Microchip:</strong>{" "}
                {selectedPet.microchip_number ||
                  "Not recorded"}
              </p>

              <p>
                <strong>Allergies:</strong>{" "}
                {selectedPet.allergies ||
                  "None recorded"}
              </p>

              <p>
                <strong>Conditions:</strong>{" "}
                {selectedPet.existing_conditions ||
                  "None recorded"}
              </p>

              <p>
                <strong>Notes:</strong>{" "}
                {selectedPet.notes || "None"}
              </p>
            </div>

            {canManageAll && (
              <>
                <h3 className="history-heading">
                  Pet Owner Information
                </h3>

                <div className="details">
                  <p>
                    <strong>Full Name:</strong>{" "}
                    {selectedPet.owner?.full_name ||
                      "Not assigned"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedPet.owner?.email ||
                      "Not recorded"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedPet.owner?.phone ||
                      "Not recorded"}
                  </p>
                </div>
              </>
            )}

            {canViewMedicalHistory && (
              <>
                <div className="history-heading-row">
                  <h3 className="history-heading">
                    <Stethoscope size={16} /> Medical History
                  </h3>

                  {canCreateRecord && (
                    <button
                      type="button"
                      className="add-record-button"
                      onClick={() =>
                        navigate(
                          `${medicalRecordsRoute}?petId=${selectedPet.id}`
                        )
                      }
                    >
                      <FileHeart size={14} /> Add Medical Record
                    </button>
                  )}
                </div>

                {medicalHistoryLoading ? (
                  <div className="history-empty">
                    <p>Loading medical history...</p>
                  </div>
                ) : medicalHistory.length === 0 ? (
                  <div className="history-empty">
                    <FileHeart size={30} />
                    <p>No medical records for this pet yet.</p>
                  </div>
                ) : (
                  medicalHistory.map((record) => (
                    <div className="history medical-history-item" key={record.id}>
                      <strong>
                        {record.consultation_date || "Date not recorded"}
                        {" · "}
                        {record.record_status || "Draft"}
                      </strong>

                      <span>
                        {record.chief_complaint || record.diagnosis || "General consultation"}
                      </span>

                      {record.diagnosis && (
                        <small><b>Diagnosis:</b> {record.diagnosis}</small>
                      )}

                      {(record.treatment || record.treatment_plan) && (
                        <small><b>Treatment:</b> {record.treatment || record.treatment_plan}</small>
                      )}

                      {record.medication && (
                        <small>
                          <b>Prescription:</b> {record.medication}
                          {record.dosage ? ` · ${record.dosage}` : ""}
                          {record.frequency ? ` · ${record.frequency}` : ""}
                          {record.duration ? ` · ${record.duration}` : ""}
                        </small>
                      )}

                      {record.laboratory_result && (
                        <small><b>Laboratory Results:</b> {record.laboratory_result}</small>
                      )}

                      {record.vaccination && (
                        <small><b>Vaccination:</b> {record.vaccination}</small>
                      )}

                      {record.veterinarian_notes && (
                        <small><b>Veterinarian Notes:</b> {record.veterinarian_notes}</small>
                      )}

                      {record.follow_up_date && (
                        <small><b>Follow-up:</b> {record.follow_up_date}</small>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            <h3 className="history-heading">
              Visit History
            </h3>

            {history.length === 0 ? (
              <div className="history-empty">
                <History size={30} />
                <p>No appointment history.</p>
              </div>
            ) : (
              history.map((appointment) => (
                <div
                  className="history"
                  key={appointment.id}
                >
                  <strong>
                    {appointment.appointment_date}
                    {" · "}
                    {String(
                      appointment.start_time
                    ).slice(0, 5)}
                  </strong>

                  <span>
                    {appointment.veterinarian
                      ?.full_name ||
                      "Veterinarian not assigned"}
                    {" · "}
                    {appointment.status}
                  </span>

                  <small>
                    {appointment.visit_reason ||
                      "General Consultation"}
                  </small>
                </div>
              ))
            )}
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

        .table {
          overflow: auto;
          margin-top: 18px;
          border: 1px solid #e3f2fb;
          border-radius: 16px;
        }

        .table table {
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

        .table thead th:first-child {
          border-top-left-radius: 15px;
        }

        .table thead th:last-child {
          border-top-right-radius: 15px;
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

        .add-record-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          border-radius: 9px;
          padding: 8px 13px;
          background: #eaf8fd;
          color: #2b83ad;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          white-space: nowrap;
        }

        .add-record-button:hover {
          background: #d9f1fb;
        }

        .medical-history-item small {
          display: block;
        }

        .history {
          display: grid;
          gap: 4px;
          padding: 13px 0;
          border-bottom: 1px solid #e2edf1;
        }

        .history span,
        .history small {
          color: #667d88;
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