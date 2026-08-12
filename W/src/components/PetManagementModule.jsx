import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Camera,
  Edit3,
  History,
  PawPrint,
  Plus,
  RotateCcw,
  Search,
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

const EMPTY_FORM = {
  id: "",
  ownerId: "",
  petName: "",
  species: "",
  customSpecies: "",
  breed: "",
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

export default function PetManagementModule({
  profile,
  ownerOnly = false,
}) {
  const [pets, setPets] = useState([]);
  const [owners, setOwners] = useState([]);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ownerId: ownerOnly ? profile.id : "",
  });

  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedPet, setSelectedPet] = useState(null);
  const [history, setHistory] = useState([]);

  const canManageAll =
    !ownerOnly &&
    ["admin", "staff", "veterinarian"].includes(profile.role);

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

      return matchesSpecies && matchesSearch;
    });
  }, [pets, search, speciesFilter]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setMessage("");

      try {
        const petList = await getPets({
          ownerId: ownerOnly ? profile.id : null,
          includeArchived: showArchived,
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
  }, [
    canManageAll,
    ownerOnly,
    profile.id,
    showArchived,
  ]);

  async function loadPets() {
    try {
      const petList = await getPets({
        ownerId: ownerOnly ? profile.id : null,
        includeArchived: showArchived,
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
  }

  function handleSpeciesChange(event) {
    const selectedSpecies = event.target.value;

    setForm((currentForm) => ({
      ...currentForm,
      species: selectedSpecies,
      customSpecies:
        selectedSpecies === "Other"
          ? currentForm.customSpecies
          : "",
      breed:
        selectedSpecies !== currentForm.species
          ? ""
          : currentForm.breed,
    }));
  }

  function handleEdit(pet) {
    const isKnownSpecies = SPECIES_OPTIONS.includes(
      pet.species
    );

    setForm({
      id: pet.id,
      ownerId: pet.owner_id,
      petName: pet.pet_name || "",
      species: isKnownSpecies
        ? pet.species
        : pet.species
          ? "Other"
          : "",
      customSpecies: isKnownSpecies
        ? ""
        : pet.species || "",
      breed: pet.breed || "",
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

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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

      let photoUrl = form.photoUrl;

      if (file) {
        photoUrl = await uploadPetPhoto(file, ownerId);
      }

      await savePet(
        {
          ...form,
          species: finalSpecies,
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
      <form
        className="card form-card"
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

          {form.id && (
            <button
              type="button"
              className="text-btn"
              onClick={resetForm}
            >
              <X size={16} />
              Cancel Edit
            </button>
          )}
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
          <label>
            <span>Pet Owner</span>

            <select
              required
              value={form.ownerId}
              onChange={(event) =>
                updateForm(
                  "ownerId",
                  event.target.value
                )
              }
            >
              <option value="">
                Select pet owner
              </option>

              {owners.map((owner) => (
                <option
                  key={owner.id}
                  value={owner.id}
                >
                  {owner.full_name || "Unnamed Owner"}
                  {owner.username
                    ? ` (${owner.username})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid">
          <label>
            <span>Pet Name</span>

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
            <span>Species</span>

            <select
              required
              value={form.species}
              onChange={handleSpeciesChange}
            >
              <option value="">
                Select pet species
              </option>

              {SPECIES_GROUPS.map((group) => (
                <optgroup
                  key={group.label}
                  label={group.label}
                >
                  {group.options.map((species) => (
                    <option
                      key={species}
                      value={species}
                    >
                      {species}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {form.species === "Other" && (
            <label>
              <span>Specify Species</span>

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
            <span>Breed</span>

            <input
              value={form.breed}
              placeholder="Enter breed"
              onChange={(event) =>
                updateForm(
                  "breed",
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>Sex</span>

            <select
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
            <span>Date of Birth</span>

            <input
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
            <span>Weight (kg)</span>

            <input
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

        <label className="upload">
          <Camera size={18} />

          <div>
            <strong>Pet Photo</strong>
            <small>
              Select a clear image of the pet.
            </small>
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              setFile(
                event.target.files?.[0] || null
              )
            }
          />
        </label>

        {file && (
          <div className="selected-file">
            Selected file: {file.name}
          </div>
        )}

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

      <section className="card list-card">
        <div className="toolbar">
          <div>
            <h2>
              <PawPrint />
              Animal Patients
            </h2>

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

            <label className="archive-check">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) =>
                  setShowArchived(
                    event.target.checked
                  )
                }
              />

              <span>Include archived</span>
            </label>
          </div>
        </div>

        <div className="result-summary">
          <span>
            Showing {visiblePets.length} of {pets.length} pets
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

            <h3>No pet records found</h3>

            <p>
              Try changing the search text or species filter.
            </p>
          </div>
        ) : (
          <div className="pet-grid">
            {visiblePets.map((pet) => (
              <article
                key={pet.id}
                className={
                  pet.is_archived
                    ? "pet-card archived"
                    : "pet-card"
                }
              >
                {pet.photo_url ? (
                  <img
                    src={pet.photo_url}
                    alt={pet.pet_name}
                  />
                ) : (
                  <div className="photo">
                    <PawPrint />
                  </div>
                )}

                <div className="pet-info">
                  <div className="pet-heading">
                    <h3>
                      {pet.pet_name || "Unnamed Pet"}
                    </h3>

                    {pet.is_archived && (
                      <span className="archived-badge">
                        Archived
                      </span>
                    )}
                  </div>

                  <p>
                    {pet.species || "Species not recorded"}
                    {pet.breed
                      ? ` · ${pet.breed}`
                      : ""}
                  </p>

                  {canManageAll && (
                    <small>
                      Owner:{" "}
                      {pet.owner?.full_name ||
                        "Not assigned"}
                    </small>
                  )}

                  <small>
                    {pet.sex || "Unknown"}
                    {pet.weight
                      ? ` · ${pet.weight} kg`
                      : ""}
                  </small>

                  {pet.color && (
                    <small>
                      Color: {pet.color}
                    </small>
                  )}

                  {pet.microchip_number && (
                    <small>
                      Microchip:{" "}
                      {pet.microchip_number}
                    </small>
                  )}
                </div>

                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      handleEdit(pet)
                    }
                  >
                    <Edit3 size={15} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleOpenHistory(pet)
                    }
                  >
                    <History size={15} />
                    History
                  </button>

                  <button
                    type="button"
                    className={
                      pet.is_archived
                        ? "restore"
                        : "danger"
                    }
                    onClick={() =>
                      handleArchiveToggle(pet)
                    }
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
              </article>
            ))}
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
              aria-label="Close visit history"
              onClick={() =>
                setSelectedPet(null)
              }
            >
              <X />
            </button>

            <h2>
              {selectedPet.pet_name} — Visit History
            </h2>

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

        .text-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          border: 0;
          padding: 8px !important;
          background: transparent !important;
          color: #4b7182 !important;
          cursor: pointer;
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

        .upload {
          display: grid !important;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: 11px;
          border: 1px dashed #9dc9da;
          border-radius: 12px;
          padding: 14px;
          background: #f8fdff;
        }

        .upload div {
          display: grid;
          gap: 3px;
        }

        .upload small {
          color: #72858e;
          font-weight: 400;
        }

        .upload input {
          grid-column: 1 / -1;
          border: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }

        .selected-file {
          margin: -4px 0 14px;
          color: #507180;
          font-size: 13px;
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
          padding: 0 11px;
          border: 1px solid #cfe4ed;
          border-radius: 11px;
          background: #ffffff;
          color: #435f6b;
          font-size: 13px;
          cursor: pointer;
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

        .pet-grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(280px, 1fr)
          );
          gap: 15px;
          margin-top: 16px;
        }

        .pet-card {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr);
          gap: 13px;
          padding: 14px;
          border: 1px solid #dfedf3;
          border-radius: 16px;
          background: #ffffff;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease;
        }

        .pet-card:hover {
          transform: translateY(-2px);
          border-color: #bcddea;
          box-shadow: 0 10px 24px rgba(45, 111, 143, 0.1);
        }

        .pet-card.archived {
          background: #f5f6f7;
          opacity: 0.72;
        }

        .pet-card img,
        .photo {
          width: 76px;
          height: 76px;
          border-radius: 14px;
          background: #eaf8fd;
          color: #4da8da;
          object-fit: cover;
        }

        .photo {
          display: grid;
          place-items: center;
        }

        .pet-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .pet-info h3,
        .pet-info p {
          margin: 0;
        }

        .pet-info h3 {
          color: #20313b;
        }

        .pet-info p {
          margin: 4px 0;
          color: #607985;
        }

        .pet-info small {
          display: block;
          margin-top: 3px;
          color: #71848d;
        }

        .archived-badge {
          border-radius: 999px;
          padding: 3px 7px;
          background: #e6eaec;
          color: #687b84;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .actions {
          grid-column: 1 / -1;
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          padding-top: 3px;
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

        .actions button:hover {
          transform: translateY(-1px);
          filter: brightness(0.97);
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

        .details {
          border-radius: 12px;
          padding: 13px;
          background: #f4fbfd;
        }

        .details p {
          margin: 7px 0;
          line-height: 1.5;
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

          .pet-card {
            grid-template-columns: 62px minmax(0, 1fr);
          }

          .pet-card img,
          .photo {
            width: 62px;
            height: 62px;
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