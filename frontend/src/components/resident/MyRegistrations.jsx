import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";

export default function MyRegistrations() {
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/events/my-registrations/paginated/", {
        params: { page: p, page_size: pageSize },
      });
      setResults(res?.data?.results || []);
      setCount(res?.data?.count || 0);
      setPage(p);
    } catch {
      setError("Failed to load registrations");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    load(1);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = Array.isArray(results) ? [...results] : [];
    if (q) {
      list = list.filter((r) => (r.event_title || "").toLowerCase().includes(q));
    }
    switch (sortBy) {
      case "date_asc":
        list.sort((a, b) => new Date(a.registered_at) - new Date(b.registered_at));
        break;
      case "title_asc":
        list.sort((a, b) => (a.event_title || "").localeCompare(b.event_title || ""));
        break;
      case "title_desc":
        list.sort((a, b) => (b.event_title || "").localeCompare(a.event_title || ""));
        break;
      case "date_desc":
      default:
        list.sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));
    }
    return list;
  }, [results, search, sortBy]);

  async function handleUnregister(eventId, attendanceConfirmed) {
    if (attendanceConfirmed) return;
    try {
      await api.post(`/events/${eventId}/unregister/`);
      toast.success("Unregistered from event");
      await load(page);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to unregister";
      toast.error(msg);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div style={{ width: "100%", textAlign: "left" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>My Registrations</h2>
        <div style={{ color: "#475569" }}>Your upcoming and past event sign-ups</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          width: "min(100%, var(--admin-shell-width))",
          marginRight: "auto",
        }}
      >
        <div
          className="resident-events-search-shell"
          style={{
            flex: "1 1 240px",
            background: "#f8fafc",
            borderRadius: 10,
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
          }}
        >
          <input
            placeholder="Search by event title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", border: "none", background: "transparent", outline: "none" }}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option value="date_desc">Recently registered</option>
          <option value="date_asc">Oldest registrations</option>
          <option value="title_asc">Title A to Z</option>
          <option value="title_desc">Title Z to A</option>
        </select>
        <button onClick={() => load(page)} style={{ padding: "10px 12px" }}>
          Refresh
        </button>
      </div>

      {loading && <p>Loading my registrations...</p>}
      {error && !loading && <p>{error}</p>}
      {!loading && filtered.length === 0 && <p>No registrations found.</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,360px))",
          gap: 14,
          justifyContent: "flex-start",
        }}
      >
        {filtered.map((r) => {
          const eventId = r.event;
          const date = r.event_date ? new Date(r.event_date) : null;
          const dateStr = date
            ? date.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "TBD";
          const timeStr = date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          const capacity = r.event_capacity || 0;
          const registeredCount = r.event_registrations_count || 0;
          const pct = capacity ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;

          return (
            <div
              key={r.id}
              className="resident-event-card"
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                display: "flex",
                flexDirection: "column",
                minHeight: 310,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <div className="resident-event-card-title" style={{ fontWeight: 700, fontSize: 18, flex: "1 1 180px" }}>
                    {r.event_title || `Event #${eventId}`}
                  </div>
                  <span
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      textTransform: "capitalize",
                    }}
                  >
                    {r.event_status || "upcoming"}
                  </span>
                  {r.attendance_confirmed && (
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#166534",
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                      }}
                    >
                      Checked in
                    </span>
                  )}
                </div>
                <div className="resident-event-card-description" style={{ color: "#475569", marginBottom: 8, fontSize: 14, lineHeight: 1.45, minHeight: 40 }}>
                  {r.event_description || "No description provided."}
                </div>
                <div className="resident-event-card-meta" style={{ display: "grid", gap: 6, color: "#475569", marginBottom: 10, fontSize: 14 }}>
                  <div>📅 {dateStr}</div>
                  <div>⏰ {timeStr}</div>
                  <div>📍 {r.event_venue || "TBD"}</div>
                  <div>👥 {registeredCount}/{capacity || "∞"} registered</div>
                  <div>📝 Registered at: {new Date(r.registered_at).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: "auto" }}>
                <div className="resident-event-progress" style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb" }} />
                </div>
                <div className="resident-event-capacity" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, color: "#475569", fontSize: 13 }}>
                  <span>{capacity ? `${Math.max(0, capacity - registeredCount)} spots left` : "No capacity limit"}</span>
                  <span>{registeredCount} registered</span>
                </div>
              </div>
              <button
                className="btn-primary"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 0",
                  background: "#0f172a",
                  borderColor: "#0f172a",
                  borderRadius: 10,
                }}
                onClick={() => handleUnregister(eventId, r.attendance_confirmed)}
                disabled={r.attendance_confirmed}
              >
                {r.attendance_confirmed ? "Already checked in" : "Unregister"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
        <button disabled={!canPrev || loading} onClick={() => canPrev && load(page - 1)}>
          Prev
        </button>
        <span>Page {page} of {totalPages} ({count} total)</span>
        <button disabled={!canNext || loading} onClick={() => canNext && load(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
