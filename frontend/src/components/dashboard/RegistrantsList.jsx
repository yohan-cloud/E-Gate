import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";

export default function RegistrantsList({ eventId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("resident_asc");
  const [addingOpen, setAddingOpen] = useState(false);
  const [residentQuery, setResidentQuery] = useState("");
  const [residentResults, setResidentResults] = useState([]);
  const [residentSearchLoading, setResidentSearchLoading] = useState(false);
  const [addingResidentId, setAddingResidentId] = useState(null);
  const [unregisteringId, setUnregisteringId] = useState(null);

  const load = useCallback(() => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    api
      .get(`/events/${eventId}/registrants/`)
      .then((res) => setRows(res.data || []))
      .catch(() => setError("Failed to load registrants"))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!addingOpen) return;
    const q = residentQuery.trim();
    if (q.length < 2) {
      setResidentResults([]);
      setResidentSearchLoading(false);
      return;
    }
    let cancelled = false;
    setResidentSearchLoading(true);
    const timer = setTimeout(() => {
      api
        .get(`/residents/list/?q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (cancelled) return;
          const data = res.data || {};
          setResidentResults(Array.isArray(data) ? data : data.results || []);
        })
        .catch(() => {
          if (!cancelled) setResidentResults([]);
        })
        .finally(() => {
          if (!cancelled) setResidentSearchLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addingOpen, residentQuery]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (!q) return true;
      return (row.resident_username || "").toLowerCase().includes(q);
    });

    switch (sortBy) {
      case "resident_desc":
        list.sort((a, b) => (b.resident_username || "").localeCompare(a.resident_username || ""));
        break;
      case "registered_newest":
        list.sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));
        break;
      case "registered_oldest":
        list.sort((a, b) => new Date(a.registered_at) - new Date(b.registered_at));
        break;
      case "checked_in_first":
        list.sort((a, b) => Number(b.attendance_confirmed) - Number(a.attendance_confirmed));
        break;
      case "not_checked_in_first":
        list.sort((a, b) => Number(a.attendance_confirmed) - Number(b.attendance_confirmed));
        break;
      case "resident_asc":
      default:
        list.sort((a, b) => (a.resident_username || "").localeCompare(b.resident_username || ""));
    }
    return list;
  }, [rows, search, sortBy]);

  const mark = async (registrationId) => {
    try {
      await api.post(`/events/attendance/mark/`, { registration_id: registrationId });
      toast.success("Attendance marked");
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to mark attendance";
      toast.error(msg);
    }
  };

  const addResidentToEvent = async (resident) => {
    const residentId = resident?.user?.id;
    if (!residentId) return;
    try {
      setAddingResidentId(residentId);
      await api.post(`/events/${eventId}/registrants/add/`, { resident_id: residentId });
      toast.success("Resident added to event");
      setResidentQuery("");
      setResidentResults([]);
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to add resident";
      toast.error(msg);
    } finally {
      setAddingResidentId(null);
    }
  };

  const unregisterResident = async (registration) => {
    if (!registration?.id) return;
    const residentName = registration.resident_username || "this resident";
    const confirmed = window.confirm(`Unregister ${residentName} from this event?`);
    if (!confirmed) return;
    try {
      setUnregisteringId(registration.id);
      await api.delete(`/events/${eventId}/registrants/${registration.id}/unregister/`);
      toast.success("Resident unregistered from event");
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to unregister resident";
      toast.error(msg);
    } finally {
      setUnregisteringId(null);
    }
  };

  const registeredResidentIds = useMemo(
    () => new Set(rows.map((row) => row.resident).filter(Boolean)),
    [rows],
  );

  if (!eventId) return null;
  if (loading) return <div className="card">Loading registrants...</div>;
  if (error) return <div className="card">{error}</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Registrants</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setAddingOpen((open) => !open)}>
            {addingOpen ? "Close Add Resident" : "Add Resident"}
          </button>
          <button onClick={async () => {
            try {
              const res = await api.get(`/events/${eventId}/registrants/export/`, { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const link = document.createElement('a');
              link.href = url;
              link.download = `event_${eventId}_registrants.csv`;
              document.body.appendChild(link);
              link.click();
              link.remove();
            } catch {
              toast.error('Failed to export CSV');
            }
          }}>Export CSV</button>
        </div>
      </div>
      {addingOpen && (
        <div style={{ marginTop: 14, marginBottom: 12, border: "1px solid #bbdfc8", borderRadius: 8, padding: 12, background: "#f8fffa" }}>
          <label htmlFor={`event-add-resident-${eventId}`} style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
            Add resident to event
          </label>
          <input
            id={`event-add-resident-${eventId}`}
            type="search"
            value={residentQuery}
            onChange={(e) => setResidentQuery(e.target.value)}
            placeholder="Search resident name, username, or email"
            style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #bbdfc8", background: "#fff" }}
          />
          {residentQuery.trim().length > 0 && residentQuery.trim().length < 2 && (
            <div style={{ marginTop: 8, color: "#64748b" }}>Type at least 2 characters.</div>
          )}
          {residentSearchLoading && <div style={{ marginTop: 8, color: "#64748b" }}>Searching residents...</div>}
          {!residentSearchLoading && residentQuery.trim().length >= 2 && residentResults.length === 0 && (
            <div style={{ marginTop: 8, color: "#64748b" }}>No active residents found.</div>
          )}
          {residentResults.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {residentResults.slice(0, 8).map((resident) => {
                const user = resident.user || {};
                const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
                const label = fullName || user.username || "Resident";
                const alreadyAdded = registeredResidentIds.has(user.id);
                return (
                  <div key={user.id || resident.barangay_id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", border: "1px solid #d8eadf", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{label}</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>
                        {user.username || "No username"}{resident.barangay_id ? ` • ${resident.barangay_id}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => addResidentToEvent(resident)}
                      disabled={alreadyAdded || addingResidentId === user.id}
                      style={{ padding: "7px 10px" }}
                    >
                      {alreadyAdded ? "Added" : addingResidentId === user.id ? "Adding..." : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 10, alignItems: "end" }}>
        <div>
          <label className="sr-only" htmlFor={`registrants-search-${eventId}`}>Search registrants by name</label>
          <input
            id={`registrants-search-${eventId}`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resident name"
            style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #bbdfc8", background: "#fff" }}
          />
        </div>
        <div>
          <label htmlFor={`registrants-sort-${eventId}`} style={{ display: "block", marginBottom: 4 }}>Sort by:</label>
          <select
            id={`registrants-sort-${eventId}`}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ minWidth: 190, padding: "9px 10px", borderRadius: 8, border: "1px solid #bbdfc8", background: "#fff" }}
          >
            <option value="resident_asc">Resident: A to Z</option>
            <option value="resident_desc">Resident: Z to A</option>
            <option value="registered_newest">Registered: Newest first</option>
            <option value="registered_oldest">Registered: Oldest first</option>
            <option value="checked_in_first">Checked in first</option>
            <option value="not_checked_in_first">Not checked in first</option>
          </select>
        </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p>No registrants yet.</p>
      ) : visibleRows.length === 0 ? (
        <p>No registrants match your search.</p>
      ) : (
        <div className="table-container">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Registered At</th>
                <th>Checked In?</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.resident_username}
                    {r.resident_has_face ? (
                      <span style={{ marginLeft: 6, fontSize: 12, color: '#16a34a' }} title="Has enrolled face">(Face ✓)</span>
                    ) : (
                      <span style={{ marginLeft: 6, fontSize: 12, color: '#6b7280' }} title="No face enrolled">(No Face)</span>
                    )}
                  </td>
                  <td>{new Date(r.registered_at).toLocaleString()}</td>
                  <td>
                    {r.attendance_confirmed ? (
                      "Yes"
                    ) : (
                      <button onClick={() => mark(r.id)} style={{ padding: "4px 10px" }}>Mark</button>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => unregisterResident(r)}
                      disabled={r.attendance_confirmed || unregisteringId === r.id}
                      title={r.attendance_confirmed ? "Already checked in; cannot unregister" : "Unregister resident from this event"}
                      style={{ padding: "4px 10px" }}
                    >
                      {unregisteringId === r.id ? "Removing..." : "Unregister"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
