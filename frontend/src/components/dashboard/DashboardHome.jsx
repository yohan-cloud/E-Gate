import { useCallback, useEffect, useState } from "react";
import { api, fetchJson } from "../../api";
import EventDetails from "./EventDetails";
import AttendanceTable from "./AttendanceTable";
import RegistrantsList from "./RegistrantsList";
import toast from "../../lib/toast";
import ConfirmDialog from "../common/ConfirmDialog";

function getEventBucket(event) {
  const rawStatus = (event?.status || "").toLowerCase();
  if (rawStatus === "completed" || rawStatus === "cancelled") return "ended";
  if (rawStatus === "ongoing") return "live";

  if (!event?.date) return "upcoming";

  const now = new Date();
  const date = new Date(event.date);
  if (Number.isNaN(date.getTime())) return "upcoming";

  const endDate = event?.end_date ? new Date(event.end_date) : null;
  if (endDate && !Number.isNaN(endDate.getTime())) {
    if (now >= date && now <= endDate) return "live";
    if (endDate < now) return "ended";
  } else {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    if (now >= startOfDay && now <= endOfDay) return "live";
  }

  if (date > now) return "upcoming";
  return "ended";
}

function formatScheduleRange(start, end) {
  if (!start) return { dateLabel: "TBD", timeLabel: "TBD" };
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return { dateLabel: "TBD", timeLabel: "TBD" };
  const dateLabel = startDate.toLocaleDateString();
  const startTime = startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (!end) return { dateLabel, timeLabel: startTime };
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return { dateLabel, timeLabel: startTime };
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const endTime = endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endDateLabel = endDate.toLocaleDateString();
  return {
    dateLabel: sameDay ? dateLabel : `${dateLabel} - ${endDateLabel}`,
    timeLabel: sameDay ? `${startTime} until ${endTime}` : `${startTime} until ${endDateLabel} ${endTime}`,
  };
}

function getSectionMeta(events) {
  const live = [];
  const upcoming = [];
  const ended = [];

  events.forEach((event) => {
    const bucket = getEventBucket(event);
    if (bucket === "live") live.push(event);
    else if (bucket === "ended") ended.push(event);
    else upcoming.push(event);
  });

  return [
    { key: "live", title: "Live Events", subtitle: "Events happening today or currently active", items: live },
    { key: "upcoming", title: "Upcoming Events", subtitle: "Scheduled events that have not started yet", items: upcoming },
    { key: "ended", title: "Ended Events", subtitle: "Completed, cancelled, or past events", items: ended },
  ];
}

export default function DashboardHome() {
  const [selectedEvent, setSelectedEvent] = useState(null); // { id, edit?: boolean }
  const [refreshKey, setRefreshKey] = useState(0);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("active");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (eventFilter === "archived") params.set("archived_only", "true");
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await fetchJson(`/events/list/${query}`);
      const results = Array.isArray(data) ? data : data?.results;
      setEvents(results || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [eventFilter, search]);

  const deleteEvent = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/events/delete/${deleteTarget.id}/`);
      setSelectedEvent(null);
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
      loadEvents();
    } catch {
      toast.error("Failed to delete event");
    }
  };

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshKey]);

  useEffect(() => {
    if (selectedEvent?.id) return undefined;

    const onFocus = () => {
      loadEvents();
    };
    const intervalId = window.setInterval(() => {
      loadEvents();
    }, 10000);

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(intervalId);
    };
  }, [loadEvents, selectedEvent?.id]);

  const handleSelect = (id, edit = false) => {
    setSelectedEvent((prev) => {
      if (prev && prev.id === id) {
        if (prev.edit === edit) return null;
        return { id, edit };
      }
      return { id, edit };
    });
  };

  const sections = eventFilter === "archived"
    ? [{ key: "archived", title: "Archived Events", subtitle: "Archived event records retained for history and reporting", items: events }]
    : getSectionMeta(events);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Manage Events</h2>
          <div style={{ color: "#475569" }}>View and manage all barangay events</div>
        </div>
        <div style={{ color: "#475569" }}>
          Total Events: <b>{events.length}</b>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => setEventFilter("active")} className={`top-pill ${eventFilter === "active" ? "active" : ""}`}>Active Events</button>
          <button onClick={() => setEventFilter("archived")} className={`top-pill ${eventFilter === "archived" ? "active" : ""}`}>Archived Events</button>
        </div>
        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
          <input
            type="search"
            placeholder="Search events by title or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadEvents(); }}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
      {loading ? (
        <p>Loading events...</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 18 }}>
            {sections.map((section) => (
              <div key={section.key} className="event-section">
                <div className="event-section-head">
                  <div>
                    <h3 className="event-section-title">{section.title}</h3>
                    <div className="event-section-subtitle">{section.subtitle}</div>
                  </div>
                  <div className="event-section-count">{section.items.length}</div>
                </div>

                {section.items.length === 0 ? (
                  <div className="event-section-empty">No events in this section.</div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {section.items.map((ev) => {
                      const { dateLabel, timeLabel } = formatScheduleRange(ev.date, ev.end_date);
                      const capacity = ev.capacity || 0;
                      const registered = ev.registrations_count || 0;
                      const pct = capacity ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;
                      const status = getEventBucket(ev);

                      return (
                        <div key={ev.id} className={`event-accordion ${selectedEvent?.id === ev.id ? "open" : ""}`}>
                          <button
                            type="button"
                            className="event-accordion-summary"
                            onClick={() => handleSelect(ev.id, false)}
                          >
                            <div className="event-accordion-main">
                              <div className="event-accordion-icon">EVT</div>
                              <div className="event-accordion-content">
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 700, fontSize: 17 }}>{ev.title}</div>
                                  <span style={statusPill[status]}>
                                    {ev.is_archived ? "archived" : status}
                                  </span>
                                </div>
                                <div style={{ color: "#475569", marginTop: 4 }}>{ev.description || "No description"}</div>
                                <div className="event-accordion-meta">
                                  <span>Date: {dateLabel}</span>
                                  <span>Time: {timeLabel}</span>
                                  <span>Venue: {ev.venue || "TBD"}</span>
                                  <span>Registrants: {registered} / {capacity || "No limit"}</span>
                                </div>
                                <div style={{ marginTop: 8, height: 6, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb" }} />
                                </div>
                              </div>
                            </div>
                            <span className="event-accordion-chevron">
                              {selectedEvent?.id === ev.id ? "▲" : "▼"}
                            </span>
                          </button>
                          {selectedEvent?.id === ev.id && (
                            <div className="event-accordion-panel">
                              <div className="event-accordion-actions">
                                <button onClick={() => handleSelect(ev.id, false)} title="View" style={iconBtn}>View</button>
                                {!ev.is_archived && <button onClick={() => handleSelect(ev.id, true)} title="Edit" style={iconBtn}>Edit</button>}
                                {!ev.is_archived && (status === "ended") && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.post(`/events/archive/${ev.id}/`);
                                        toast.success("Event archived");
                                        if (selectedEvent?.id === ev.id) setSelectedEvent(null);
                                        setRefreshKey((k) => k + 1);
                                        loadEvents();
                                      } catch (e) {
                                        toast.error(e?.response?.data?.error || "Failed to archive event");
                                      }
                                    }}
                                    style={iconBtn}
                                  >
                                    Archive
                                  </button>
                                )}
                                {ev.is_archived && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.post(`/events/unarchive/${ev.id}/`);
                                        toast.success("Event restored");
                                        setRefreshKey((k) => k + 1);
                                        loadEvents();
                                      } catch (e) {
                                        toast.error(e?.response?.data?.error || "Failed to restore event");
                                      }
                                    }}
                                    style={iconBtn}
                                  >
                                    Unarchive
                                  </button>
                                )}
                                {!ev.is_archived && <button
                                  onClick={() => setDeleteTarget(ev)}
                                  title="Delete"
                                  style={{ ...iconBtn, color: "#b91c1c" }}
                                >
                                  Delete
                                </button>}
                              </div>
                              <EventDetails
                                eventId={ev.id}
                                initialEvent={ev}
                                mode={selectedEvent.edit ? "edit" : "view"}
                                onUpdated={(updated) => {
                                  setEvents((curr) =>
                                    curr.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
                                  );
                                }}
                                onDeleted={() => { setSelectedEvent(null); setRefreshKey((k) => k + 1); loadEvents(); }}
                              />
                              <RegistrantsList eventId={ev.id} />
                              <AttendanceTable eventId={ev.id} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Event"
        message={`Delete ${deleteTarget?.title || "this event"}? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteEvent}
      />
    </div>
  );
}

const iconBtn = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};

const statusPill = {
  live: {
    background: "#dcfce7",
    color: "#166534",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    textTransform: "capitalize",
  },
  upcoming: {
    background: "#e0f2fe",
    color: "#0369a1",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    textTransform: "capitalize",
  },
  ended: {
    background: "#f1f5f9",
    color: "#475569",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    textTransform: "capitalize",
  },
};
