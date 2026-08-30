import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Eye,
  History,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";
import { getLatestConsultationDates, getPetOwnerProfile, getPetOwnersDirectory, getPets } from "../../services/petService";
import { formatDateLong, formatPetAge } from "../../utils/timeFormat";

// Human-readable Pet Owner ID, derived from the existing profiles.id uuid
// -- no new column. Same "prefix + first 8 hex chars, uppercased"
// convention already used for printed medical record numbers (MR- in
// src/utils/invoicePdf.js).
function formatOwnerId(ownerId) {
  return `PO-${String(ownerId || "").slice(0, 8).toUpperCase()}`;
}

// Shared fallback for any missing optional field on this page (phone,
// email, address, username, registration date, ...) -- a subtle gray
// label instead of plain body text, so a blank field reads visibly
// different from real data at a glance.
function NotRecorded() {
  return <span className="wr-not-recorded">Not recorded</span>;
}

export default function WalkInRegistration({ profile }) {
  const navigate = useNavigate();
  // Animal Patients lives at a different route per role -- Pet Owners
  // itself is only ever reached from the staff/admin sidebar (see
  // AppShell's navByRole), so those are the only two cases here.
  const animalPatientsPath = profile.role === "admin" ? "/admin/pets" : "/staff/patients";

  const [owners, setOwners] = useState([]);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // null | { owner: ownerObject|null, guestFlow: boolean } -- owner is null
  // only for the "New Account / Walk-In" entry point, which has no row to
  // pre-fill from.
  const [bookingFor, setBookingFor] = useState(null);

  // The owner currently being viewed (row/count/"View Pets" click), or
  // null when showing the Pet Owners table. Fetched fresh by this owner's
  // own id every time it's opened -- never derived from the bulk `pets`
  // list above, so it always reflects that owner's actual current pets.
  const [viewingOwner, setViewingOwner] = useState(null);
  const [ownerPets, setOwnerPets] = useState([]);
  const [ownerPetsLoading, setOwnerPetsLoading] = useState(false);
  const [ownerPetsError, setOwnerPetsError] = useState("");
  const [showArchivedForOwner, setShowArchivedForOwner] = useState(false);
  const [latestVisitByPet, setLatestVisitByPet] = useState({});

  // The owner currently open in the profile view (icon/photo/name click),
  // or null when showing the Pet Owners table. profileOwner stays null
  // while loading/on error so the view never renders a stale or partial
  // record -- profileOwnerId alone controls whether the section is shown.
  const [profileOwnerId, setProfileOwnerId] = useState(null);
  const [profileOwner, setProfileOwner] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [ownersData, petsData] = await Promise.all([getPetOwnersDirectory(), getPets()]);
      setOwners(ownersData);
      setPets(petsData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Loaded by the owner's own unique id (owner_id foreign key), never by
  // name or email -- see getPets's ownerId filter in petService.js.
  async function openOwnerPets(owner) {
    closeOwnerProfile();
    setViewingOwner(owner);
    setShowArchivedForOwner(false);
    setOwnerPets([]);
    setLatestVisitByPet({});
    setOwnerPetsError("");
    setOwnerPetsLoading(true);
    try {
      const petsForOwner = await getPets({ ownerId: owner.id, includeArchived: true });
      setOwnerPets(petsForOwner);
      const dates = await getLatestConsultationDates(petsForOwner.map((pet) => pet.id));
      setLatestVisitByPet(dates);
    } catch (e) {
      setOwnerPetsError(e.message || "Unable to load this owner's animal patients.");
    } finally {
      setOwnerPetsLoading(false);
    }
  }

  function closeOwnerPets() {
    setViewingOwner(null);
    setOwnerPets([]);
    setLatestVisitByPet({});
  }

  // Retrieves the full profile fresh by the owner's own unique id (never
  // by name/email, never derived from the already-loaded table row --
  // that row doesn't even carry account_status/created_at). profileOwner
  // is left null until this resolves, so the view shows a loading state
  // rather than a partial/stale record.
  async function openOwnerProfile(owner) {
    closeOwnerPets();
    setProfileOwnerId(owner.id);
    setProfileOwner(null);
    setProfileError("");
    setProfileLoading(true);
    try {
      const fullProfile = await getPetOwnerProfile(owner.id);
      setProfileOwner(fullProfile);
    } catch (e) {
      setProfileError(e.message || "Unable to load this pet owner's profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeOwnerProfile() {
    setProfileOwnerId(null);
    setProfileOwner(null);
    setProfileError("");
  }

  const visibleOwnerPets = useMemo(
    () => ownerPets.filter((pet) => (showArchivedForOwner ? pet.is_archived : !pet.is_archived)),
    [ownerPets, showArchivedForOwner]
  );

  function openPetProfile(pet) {
    navigate(`${animalPatientsPath}?pet=${pet.id}`);
  }

  function addPetForViewingOwner() {
    navigate(`${animalPatientsPath}?registerForOwner=${viewingOwner.id}`);
  }

  // Counts come from the pet list already loaded above -- no second query,
  // mirroring the same approach the Animal Patients page uses.
  const petCounts = useMemo(() => {
    const counts = {};
    pets.forEach((pet) => {
      counts[pet.owner_id] = (counts[pet.owner_id] || 0) + 1;
    });
    return counts;
  }, [pets]);

  const visibleOwners = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return owners
      .map((owner) => ({ ...owner, petCount: petCounts[owner.id] || 0 }))
      .filter((owner) => {
        if (!keyword) return true;
        return [owner.full_name, owner.email, owner.phone, owner.address, owner.username].some((value) =>
          String(value || "").toLowerCase().includes(keyword)
        );
      });
  }, [owners, petCounts, search]);

  function closeBooking() {
    setBookingFor(null);
    // A guest registration or a newly booked visit can change the pet/owner
    // counts shown here, so refresh once the modal closes.
    load();
  }

  return (
    <AppShell profile={profile} title="Pet Owners">
      {!viewingOwner && !profileOwnerId && (
      <section className="card wr-list-card">
        <div className="wr-toolbar">
          <div className="wr-toolbar-left">
            <h2><Users /> Pet Owners</h2>
            <p className="wr-list-description">
              Search registered pet owners, then create an appointment for one.
            </p>
            <p className="wr-result-summary">
              {loading ? "Loading pet owners..." : `Showing ${visibleOwners.length} of ${owners.length} pet owners`}
            </p>
          </div>

          <div className="wr-toolbar-right">
            <div className="search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, phone, or address"
              />
              {search && (
                <button type="button" className="wr-clear-search" aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="wr-new-account-btn"
              onClick={() => setBookingFor({ owner: null, guestFlow: true })}
            >
              <UserPlus size={16} /> New Account / Walk-In
            </button>
          </div>
        </div>

        {error && <p className="wr-error">{error}</p>}

        {!loading && visibleOwners.length === 0 ? (
          <div className="wr-empty">
            <Users size={35} />
            <h3>No pet owners found</h3>
            <p>Try a different search.</p>
          </div>
        ) : (
          <div className="wr-table">
            <table>
              <colgroup>
                <col className="wr-col-owner" />
                <col className="wr-col-contact" />
                <col className="wr-col-email" />
                <col className="wr-col-address" />
                <col className="wr-col-pets" />
                <col className="wr-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Pet Owner</th>
                  <th>Contact Number</th>
                  <th>Email Address</th>
                  <th>Address</th>
                  <th>Registered Pets</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOwners.map((owner) => (
                  <tr key={owner.id}>
                    <td data-label="Pet Owner">
                      <button type="button" className="wr-owner-cell wr-owner-cell-link" onClick={() => openOwnerProfile(owner)}>
                        {owner.avatar_url ? (
                          <img className="wr-owner-avatar" src={owner.avatar_url} alt={owner.full_name || "Pet owner"} />
                        ) : (
                          <div className="wr-owner-avatar wr-owner-avatar-fallback">
                            <Users size={16} />
                          </div>
                        )}
                        <span className="wr-owner-name">{owner.full_name || "Unnamed Owner"}</span>
                      </button>
                    </td>
                    <td data-label="Contact Number">
                      {owner.phone ? <span className="wr-cell-text">{owner.phone}</span> : <NotRecorded />}
                    </td>
                    <td data-label="Email Address">
                      {owner.email ? (
                        <span className="wr-cell-text wr-truncate" title={owner.email}>{owner.email}</span>
                      ) : (
                        <NotRecorded />
                      )}
                    </td>
                    <td data-label="Address">
                      {owner.address ? (
                        <span className="wr-cell-text wr-truncate" title={owner.address}>{owner.address}</span>
                      ) : (
                        <NotRecorded />
                      )}
                    </td>
                    <td data-label="Registered Pets">
                      <button type="button" className="wr-pill wr-pill-active wr-pill-link" onClick={() => openOwnerPets(owner)}>
                        {owner.petCount} pet{owner.petCount === 1 ? "" : "s"}
                      </button>
                    </td>
                    <td data-label="Actions">
                      <div className="wr-actions">
                        <button
                          type="button"
                          className="wr-appt-btn"
                          onClick={() => setBookingFor({ owner, guestFlow: false })}
                        >
                          <CalendarDays size={14} /> Create Appointment
                        </button>

                        <button
                          type="button"
                          className="wr-appt-btn wr-view-pets-btn"
                          onClick={() => openOwnerPets(owner)}
                        >
                          <Eye size={14} /> View Pets
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {profileOwnerId && (
        <section className="card wr-list-card">
          <button type="button" className="wr-back-link" onClick={closeOwnerProfile}>
            <ArrowLeft size={16} /> Back to Pet Owners
          </button>

          {profileLoading ? (
            <div className="wr-empty">
              <Users size={35} />
              <h3>Loading pet owner profile...</h3>
            </div>
          ) : profileError ? (
            <p className="wr-error">{profileError}</p>
          ) : profileOwner ? (
            <div className="wr-profile-card">
              <div className="wr-profile-photo">
                {profileOwner.avatar_url ? (
                  <img src={profileOwner.avatar_url} alt={profileOwner.full_name || "Pet owner"} />
                ) : (
                  <Users size={30} />
                )}
              </div>

              <div className="wr-profile-body">
                <div className="wr-profile-heading">
                  <h2>{profileOwner.full_name || "Not recorded"}</h2>
                  <span className={`wr-pill ${profileOwner.account_status === "active" ? "wr-pill-active" : "wr-pill-inactive"}`}>
                    {profileOwner.account_status
                      ? profileOwner.account_status.charAt(0).toUpperCase() + profileOwner.account_status.slice(1)
                      : "Not recorded"}
                  </span>
                </div>

                <div className="wr-profile-grid">
                  <div className="wr-profile-field">
                    <span>Pet Owner ID</span>
                    <strong>{formatOwnerId(profileOwner.id)}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Username</span>
                    <strong>{profileOwner.username || <NotRecorded />}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Email Address</span>
                    <strong>{profileOwner.email || <NotRecorded />}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Contact Number</span>
                    <strong>{profileOwner.phone || <NotRecorded />}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Complete Address</span>
                    <strong>{profileOwner.address || <NotRecorded />}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Registration Date</span>
                    <strong>{profileOwner.created_at ? formatDateLong(profileOwner.created_at) : <NotRecorded />}</strong>
                  </div>
                  <div className="wr-profile-field">
                    <span>Registered Pets</span>
                    <span className="wr-pill wr-pill-active">
                      {petCounts[profileOwner.id] || 0} pet{(petCounts[profileOwner.id] || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <div className="wr-actions wr-profile-actions">
                  <button
                    type="button"
                    className="wr-appt-btn"
                    onClick={() => setBookingFor({ owner: profileOwner, guestFlow: false })}
                  >
                    <CalendarDays size={14} /> Create Appointment
                  </button>

                  <button
                    type="button"
                    className="wr-appt-btn wr-view-pets-btn"
                    onClick={() => openOwnerPets(profileOwner)}
                  >
                    <Eye size={14} /> View Pets
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {viewingOwner && (
        <section className="card wr-list-card">
          <button type="button" className="wr-back-link" onClick={closeOwnerPets}>
            <ArrowLeft size={16} /> Back to Pet Owners
          </button>

          <div className="wr-owner-summary">
            {viewingOwner.avatar_url ? (
              <img className="wr-owner-avatar wr-owner-avatar-large" src={viewingOwner.avatar_url} alt={viewingOwner.full_name || "Pet owner"} />
            ) : (
              <div className="wr-owner-avatar wr-owner-avatar-fallback wr-owner-avatar-large">
                <Users size={22} />
              </div>
            )}

            <div>
              <h2>{viewingOwner.full_name || "Unnamed Owner"}</h2>
              <div className="wr-owner-summary-meta">
                <span><Phone size={13} /> {viewingOwner.phone || "Not recorded"}</span>
                <span><Mail size={13} /> {viewingOwner.email || "Not recorded"}</span>
                <span><MapPin size={13} /> {viewingOwner.address || "Not recorded"}</span>
              </div>
            </div>

            <button type="button" className="wr-new-account-btn" onClick={addPetForViewingOwner}>
              <Plus size={16} /> Add Pet
            </button>
          </div>

          <div className="wr-owner-pets-toolbar">
            <h3>Animal Patients ({visibleOwnerPets.length})</h3>

            <label className={showArchivedForOwner ? "wr-archive-check active" : "wr-archive-check"}>
              <input
                type="checkbox"
                checked={showArchivedForOwner}
                onChange={(event) => setShowArchivedForOwner(event.target.checked)}
              />
              <Archive size={15} />
              <span>View Archived</span>
            </label>
          </div>

          {ownerPetsError && <p className="wr-error">{ownerPetsError}</p>}

          {ownerPetsLoading ? (
            <div className="wr-empty">
              <PawPrint size={35} />
              <h3>Loading animal patients...</h3>
            </div>
          ) : visibleOwnerPets.length === 0 ? (
            <div className="wr-empty">
              <PawPrint size={35} />
              <h3>No registered animal patients found for this Pet Owner.</h3>
            </div>
          ) : (
            <div className="wr-pet-grid">
              {visibleOwnerPets.map((pet) => (
                <button type="button" key={pet.id} className="wr-pet-card" onClick={() => openPetProfile(pet)}>
                  <div className="wr-pet-card-photo">
                    {pet.photo_url ? (
                      <img src={pet.photo_url} alt={pet.pet_name} />
                    ) : (
                      <PawPrint size={22} />
                    )}
                  </div>

                  <div className="wr-pet-card-body">
                    <strong>{pet.pet_name || "Unnamed Pet"}</strong>

                    <div className="wr-pet-card-chips">
                      <span>{pet.species || "Species not recorded"}</span>
                      {pet.breed && <span>{pet.breed}</span>}
                      <span>{pet.sex || "Unknown"}</span>
                    </div>

                    <div className="wr-pet-card-meta">
                      <span>{formatPetAge(pet.date_of_birth) || "Age not recorded"}</span>
                      <span>{pet.weight ? `${pet.weight} kg` : "Weight not recorded"}</span>
                    </div>

                    <div className="wr-pet-card-visit">
                      <History size={12} />
                      {latestVisitByPet[pet.id]
                        ? `Last consultation: ${latestVisitByPet[pet.id]}`
                        : "No consultations yet"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {bookingFor && (
        <div className="wr-modal-backdrop" onClick={closeBooking}>
          <div className="wr-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="wr-modal-close" aria-label="Close" onClick={closeBooking}><X /></button>
            <AppointmentForm
              profile={profile}
              mode="staff"
              guestOwner={bookingFor.guestFlow}
              presetOwner={bookingFor.owner}
              lockOwnerSelection
              onCreated={load}
            />
          </div>
        </div>
      )}

      <style>{styles}</style>
    </AppShell>
  );
}

const styles = `
.wr-list-card{padding:24px}

.wr-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
.wr-toolbar-left{display:flex;flex-direction:column;gap:5px;min-width:240px}
.wr-toolbar-left h2{display:flex;align-items:center;gap:8px;margin:0;color:#20313b}
.wr-list-description{margin:0;color:#6f7f88;font-size:13.5px}
.wr-result-summary{margin:2px 0 0;color:#6f7f88;font-size:13px}

.wr-toolbar-right{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:12px}
.wr-new-account-btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;padding:0 16px;height:43px;background:#4DA8DA;color:#fff;font-weight:800;font-size:13.5px;cursor:pointer;white-space:nowrap}
.wr-list-card .search{display:flex;align-items:center;gap:7px;height:43px;min-width:280px;flex:1 1 300px;max-width:420px;border:1px solid #cfe4ed;border-radius:11px;background:#fff;color:#4da8da;padding-left:11px}
.wr-list-card .search input{width:100%;min-width:0;padding:10px 4px;font:inherit;font-size:13.5px;color:#20313b}
.wr-clear-search{display:grid;place-items:center;margin-right:6px;border:0;border-radius:7px;padding:5px;background:#edf5f8;color:#5d7782;cursor:pointer}

.wr-error{margin:0 0 14px;color:#b34848;font-size:13.5px}
.wr-empty{display:grid;justify-items:center;gap:8px;padding:48px 20px;color:#8496a0;text-align:center}
.wr-empty h3{margin:0;color:#20313B}
.wr-empty p{margin:0;font-size:13.5px}

/* Purely a scroll viewport -- no border/radius of its own, so it's not a
   second decorative box inside the card's own border/shadow/radius (the
   table's own white background/rounded corners already come from the
   shared .shell table rule in css-reference-theme.css). table-layout:fixed
   plus the wr-col-* widths below mean a column's content truncates
   (.wr-truncate) instead of ever forcing the table wider than the card. */
.wr-table{overflow:auto}
.wr-table table{width:100%;border-collapse:collapse;table-layout:fixed}
.wr-table th,.wr-table td{padding:11px 14px;text-align:left;vertical-align:middle}
.wr-col-owner{width:20%}
.wr-col-contact{width:12%}
.wr-col-email{width:16%}
.wr-col-address{width:13%}
.wr-col-pets{width:13%}
.wr-col-actions{width:26%}

.wr-owner-cell{display:flex;align-items:center;gap:11px;font-weight:700;color:#20313b;width:100%}
.wr-owner-cell-link{border:0;background:none;padding:0;font:inherit;text-align:left;cursor:pointer;min-width:0}
.wr-owner-cell-link:hover .wr-owner-name{text-decoration:underline}
.wr-owner-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wr-owner-avatar{width:38px;height:38px;flex:0 0 auto;border-radius:50%;object-fit:cover;background:#eaf8fd;color:#4da8da}
.wr-owner-avatar-fallback{display:grid;place-items:center}
.wr-owner-avatar-large{width:58px;height:58px}

.wr-cell-text{color:#334e5a}
.wr-truncate{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* !important on the properties that ancestor rules could otherwise win on
   (e.g. .wr-profile-field span sets uppercase/bold for its own label
   spans, which -- being a more specific descendant selector -- would
   otherwise beat this single class and make "Not recorded" render as
   "NOT RECORDED" in bold) -- this fallback must look the same, subdued
   and normal-case, no matter which ancestor it's placed under. */
.wr-not-recorded{color:#9aa9b0!important;font-style:italic;font-weight:500!important;text-transform:none!important;letter-spacing:normal!important}

.wr-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:999px;font-weight:700;font-size:12.5px;white-space:nowrap;line-height:1;text-transform:none!important;letter-spacing:normal!important}
.wr-pill-active{background:#e7f7ed;color:#26754a}
.wr-pill-inactive{background:#fdf1dc;color:#a5680b}
.wr-pill-link{border:0;font:inherit;cursor:pointer}
.wr-pill-link:hover{background:#d7f0e0}

.wr-actions{display:flex;flex-wrap:nowrap;gap:8px}
.wr-appt-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:34px;border:0;border-radius:9px;padding:0 10px;background:#eaf8fd;color:#2b83ad;font-weight:700;font-size:11.5px;white-space:nowrap;cursor:pointer}
.wr-appt-btn:hover{background:#dcf1fa}
.wr-view-pets-btn{background:#fdf1dc;color:#a5680b}
.wr-view-pets-btn:hover{background:#fbe6c4}
.wr-back-link{display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:0;margin-bottom:18px;color:#318fbe;font-weight:700;font-size:13.5px;cursor:pointer}
.wr-back-link:hover{text-decoration:underline}
.wr-profile-card{display:flex;gap:22px;flex-wrap:wrap}
.wr-profile-photo{width:88px;height:88px;flex:0 0 auto;border-radius:20px;background:#eaf8fd;color:#4da8da;display:grid;place-items:center;overflow:hidden}
.wr-profile-photo img{width:100%;height:100%;object-fit:cover}
.wr-profile-body{flex:1 1 320px;min-width:0}
.wr-profile-heading{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px}
.wr-profile-heading h2{margin:0;color:#20313b}
.wr-profile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px 24px;margin-bottom:22px}
.wr-profile-field{display:grid;gap:4px}
.wr-profile-field span{color:#6f7f88;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.wr-profile-field strong{color:#20313b;font-size:14.5px;font-weight:700;overflow-wrap:anywhere}
.wr-profile-actions{margin-top:4px}
.wr-owner-summary{display:flex;align-items:center;gap:16px;padding:18px;border-radius:14px;background:#f4fbfd;border:1px solid #e3f2fb;margin-bottom:22px;flex-wrap:wrap}
.wr-owner-summary h2{margin:0 0 6px;color:#20313b}
.wr-owner-summary-meta{display:flex;flex-wrap:wrap;gap:14px}
.wr-owner-summary-meta span{display:inline-flex;align-items:center;gap:6px;color:#55707c;font-size:13px}
.wr-owner-summary .wr-new-account-btn{margin-left:auto;flex-shrink:0}
.wr-owner-pets-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin:0 0 16px}
.wr-owner-pets-toolbar h3{margin:0;color:#20313b}
.wr-archive-check{display:inline-flex;align-items:center;gap:7px;border:1px solid #cfe4ed;border-radius:10px;padding:8px 12px;color:#55707c;font-weight:700;font-size:13px;cursor:pointer}
.wr-archive-check.active{background:#eaf8fd;border-color:#a9dff0;color:#21697f}
.wr-pet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.wr-pet-card{display:flex;gap:13px;align-items:flex-start;text-align:left;border:1px solid #e3edf2;border-radius:15px;padding:15px;background:#fff;cursor:pointer;font:inherit;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
.wr-pet-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(47,117,150,.14);border-color:#a9dff0}
.wr-pet-card-photo{width:54px;height:54px;flex:0 0 auto;border-radius:12px;background:#eaf8fd;color:#4da8da;display:grid;place-items:center;overflow:hidden}
.wr-pet-card-photo img{width:100%;height:100%;object-fit:cover}
.wr-pet-card-body{display:grid;gap:4px;min-width:0}
.wr-pet-card-body strong{color:#20313b;font-size:15px}
.wr-pet-card-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
.wr-pet-card-chips span{background:#eef5f8;color:#3c5866;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700}
.wr-pet-card-meta{display:flex;gap:10px;color:#6f7f88;font-size:12px;margin-top:2px}
.wr-pet-card-visit{display:flex;align-items:center;gap:5px;margin-top:6px;color:#55707c;font-size:11.5px;font-weight:700}
.wr-modal-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:start center;padding:24px;background:rgba(24,50,63,.62);backdrop-filter:blur(4px);overflow:auto}
.wr-modal{position:relative;width:min(1100px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:50px 24px 24px;box-shadow:0 24px 60px rgba(22,56,72,.35)}
.wr-modal-close{position:absolute;top:14px;right:14px;z-index:5;display:grid;place-items:center;border:0;border-radius:9px;padding:8px;background:#eef7fa;color:#456472;cursor:pointer}
/* Below this width the Pet Owner table converts into a stack of cards
   (one per owner) instead of forcing horizontal scroll -- each <td>
   becomes its own labeled row inside the card, using data-label (set in
   the JSX) as the visible label via ::before. Data-fetching and actions
   are unchanged; only the same cells render in a different layout. */
@media(max-width:800px){
  .wr-toolbar{flex-direction:column;align-items:stretch}
  .wr-toolbar-right{justify-content:stretch}
  .wr-list-card .search{max-width:none;flex:1 1 auto;min-width:0}
  .wr-new-account-btn{justify-content:center}

  .wr-table{overflow:visible}
  .wr-table table{display:block;table-layout:auto}
  .wr-table thead{display:none}
  .wr-table tbody,.wr-table tr,.wr-table td{display:block;width:100%}
  .wr-table tr{margin-bottom:14px;border:1px solid #e3edf2;border-radius:14px;padding:4px 14px;background:#fff}
  .wr-table tr:last-child{margin-bottom:0}
  .wr-table td{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef3f6;text-align:right}
  .wr-table tr td:last-child{border-bottom:0}
  .wr-table td::before{content:attr(data-label);flex-shrink:0;color:#6f7f88;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;text-align:left}

  .wr-table td[data-label="Pet Owner"]{justify-content:flex-start}
  .wr-table td[data-label="Pet Owner"]::before{display:none}
  .wr-table td[data-label="Pet Owner"] .wr-owner-name{overflow:visible;text-overflow:clip;white-space:normal}

  .wr-table td[data-label="Actions"]{flex-direction:column;align-items:stretch;gap:8px}
  .wr-table td[data-label="Actions"]::before{margin-bottom:2px}
  .wr-table td[data-label="Actions"] .wr-actions{width:100%}
  .wr-table td[data-label="Actions"] .wr-appt-btn{flex:1 1 0}
}
`;
