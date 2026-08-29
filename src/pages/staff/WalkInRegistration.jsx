import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search, UserPlus, Users, X } from "lucide-react";
import AppShell from "../../components/AppShell";
import AppointmentForm from "../../components/AppointmentForm";
import { getPetOwnersDirectory, getPets } from "../../services/petService";

export default function WalkInRegistration({ profile }) {
  const [owners, setOwners] = useState([]);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // null | { owner: ownerObject|null, guestFlow: boolean } -- owner is null
  // only for the "New Account / Walk-In" entry point, which has no row to
  // pre-fill from.
  const [bookingFor, setBookingFor] = useState(null);

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
      <section className="card wr-list-card">
        <div className="wr-toolbar">
          <div>
            <div className="wr-heading-row">
              <h2><Users /> Pet Owners</h2>
              <button
                type="button"
                className="wr-new-account-btn"
                onClick={() => setBookingFor({ owner: null, guestFlow: true })}
              >
                <UserPlus size={16} /> New Account / Walk-In
              </button>
            </div>
            <p className="wr-list-description">
              Search registered pet owners, then create an appointment for one.
            </p>
          </div>

          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search owner by name, email, phone, or address"
            />
            {search && (
              <button type="button" className="wr-clear-search" aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {error && <p className="wr-error">{error}</p>}

        <p className="wr-result-summary">
          {loading ? "Loading pet owners..." : `Showing ${visibleOwners.length} of ${owners.length} pet owners`}
        </p>

        {!loading && visibleOwners.length === 0 ? (
          <div className="wr-empty">
            <Users size={35} />
            <h3>No pet owners found</h3>
            <p>Try a different search.</p>
          </div>
        ) : (
          <div className="wr-table">
            <table>
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
                    <td>
                      <div className="wr-owner-cell">
                        {owner.avatar_url ? (
                          <img className="wr-owner-avatar" src={owner.avatar_url} alt={owner.full_name || "Pet owner"} />
                        ) : (
                          <div className="wr-owner-avatar wr-owner-avatar-fallback">
                            <Users size={16} />
                          </div>
                        )}
                        <span>{owner.full_name || "Unnamed Owner"}</span>
                      </div>
                    </td>
                    <td>{owner.phone || "Not recorded"}</td>
                    <td>{owner.email || "Not recorded"}</td>
                    <td>{owner.address || "Not recorded"}</td>
                    <td>
                      <span className="pill wr-pill-active">
                        {owner.petCount} pet{owner.petCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="wr-appt-btn"
                        onClick={() => setBookingFor({ owner, guestFlow: false })}
                      >
                        <CalendarDays size={14} /> Create Appointment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
.wr-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:6px}
.wr-heading-row{display:flex;align-items:center;flex-wrap:wrap;gap:14px}
.wr-heading-row h2{display:flex;align-items:center;gap:8px;margin:0}
.wr-list-description{margin:6px 0 0;color:#6f7f88;font-size:13.5px}
.wr-new-account-btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;padding:10px 15px;background:#4DA8DA;color:#fff;font-weight:800;font-size:13.5px;cursor:pointer;white-space:nowrap}
.wr-list-card .search{display:flex;align-items:center;gap:7px;min-height:43px;min-width:min(360px,100%);border:1px solid #cfe4ed;border-radius:11px;background:#fff;color:#4da8da;padding-left:11px}
.wr-list-card .search input{width:100%;min-width:0;padding:10px 4px;font:inherit;color:#20313b}
.wr-clear-search{display:grid;place-items:center;margin-right:6px;border:0;border-radius:7px;padding:5px;background:#edf5f8;color:#5d7782;cursor:pointer}
.wr-result-summary{margin:14px 0 10px;color:#6f7f88;font-size:13px}
.wr-error{margin:0 0 10px;color:#b34848;font-size:13.5px}
.wr-empty{display:grid;justify-items:center;gap:8px;padding:48px 20px;color:#8496a0;text-align:center}
.wr-empty h3{margin:0;color:#20313B}
.wr-empty p{margin:0;font-size:13.5px}
.wr-table{overflow:auto;border:1px solid #e3f2fb;border-radius:16px}
.wr-table table{width:100%;min-width:760px;border-collapse:collapse}
.wr-table th,.wr-table td{padding:14px 16px;text-align:left;vertical-align:middle}
.wr-owner-cell{display:flex;align-items:center;gap:11px;font-weight:700;color:#20313b}
.wr-owner-avatar{width:40px;height:40px;flex:0 0 auto;border-radius:50%;object-fit:cover;background:#eaf8fd;color:#4da8da}
.wr-owner-avatar-fallback{display:grid;place-items:center}
.wr-pill-active{background:#e7f7ed;color:#26754a}
.wr-appt-btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:9px;padding:9px 14px;background:#eaf8fd;color:#2b83ad;font-weight:700;font-size:13px;white-space:nowrap;cursor:pointer}
.wr-appt-btn:hover{background:#dcf1fa}
.wr-modal-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:start center;padding:24px;background:rgba(24,50,63,.62);backdrop-filter:blur(4px);overflow:auto}
.wr-modal{position:relative;width:min(1100px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:50px 24px 24px;box-shadow:0 24px 60px rgba(22,56,72,.35)}
.wr-modal-close{position:absolute;top:14px;right:14px;z-index:5;display:grid;place-items:center;border:0;border-radius:9px;padding:8px;background:#eef7fa;color:#456472;cursor:pointer}
@media(max-width:900px){.wr-toolbar{flex-direction:column;align-items:stretch}.wr-list-card .search{min-width:0}}
`;
