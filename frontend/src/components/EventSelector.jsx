import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function formatScheduleLabel(start, end) {
  if (!start) return { dateLabel: "TBD", timeLabel: "" };
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return { dateLabel: "TBD", timeLabel: "" };
  const dateLabel = startDate.toLocaleDateString();
  const startTime = startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (!end) return { dateLabel, timeLabel: startTime };
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return { dateLabel, timeLabel: startTime };
  const endTime = endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return { dateLabel, timeLabel: `${startTime} until ${endTime}` };
}

export default function EventSelector({ onSelect, endpoint = "/events/list/?page=1&page_size=200&ordering=-date&visibility=active" }) {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await api.get(endpoint);
        const data = res?.data;
        const list = Array.isArray(data) ? data : data?.results || [];
        setEvents(list);
      } catch {
        setMessage("Failed to load events");
      }
    }
    fetchEvents();
  }, [endpoint]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title?.toLowerCase().includes(q) ||
        e.venue?.toLowerCase().includes(q) ||
        e.event_type?.toLowerCase().includes(q)
    );
  }, [events, search]);

  const handleSelect = (ev) => {
    setSelectedEvent(ev.id);
    onSelect && onSelect(ev);
  };

  const selectedLabel = useMemo(() => {
    const ev = events.find((e) => e.id === selectedEvent);
    if (!ev) return "No event selected";
    return `${ev.title} • ${ev.venue || "TBD"}`;
  }, [events, selectedEvent]);

  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Select an Event</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{selectedLabel}</div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <input
            type="search"
            placeholder="Search events by title, venue, or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", borderRadius: 10, border: "1px solid #e5e7eb", padding: "10px 12px" }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{message}</div>
      </div>
      <div
        style={{
          marginTop: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          maxHeight: 260,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: 12, color: "#6b7280" }}>No events found.</div>
        )}
        {filtered.map((ev) => {
          const { dateLabel, timeLabel } = formatScheduleLabel(ev.date, ev.end_date);
          const capacity = ev.capacity || 0;
          const registered = ev.registrations_count || 0;
          return (
            <button
              key={ev.id}
              onClick={() => handleSelect(ev)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 12,
                border: "none",
                borderBottom: "1px solid #e5e7eb",
                background: selectedEvent === ev.id ? "#0f172a" : "#fff",
                color: selectedEvent === ev.id ? "#fff" : "#111827",
                borderRadius: selectedEvent === ev.id ? 10 : 0,
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{ev.title}</div>
                <div style={{ color: selectedEvent === ev.id ? "#e5e7eb" : "#475569", fontSize: 13 }}>
                  {ev.description || "No description"}
                </div>
                <div style={{ display: "flex", gap: 10, color: selectedEvent === ev.id ? "#cbd5e1" : "#6b7280", fontSize: 12, marginTop: 4, flexWrap: "wrap" }}>
                  <span>📅 {dateLabel}</span>
                  <span>⏰ {timeLabel || "TBD"}</span>
                  <span>📍 {ev.venue || "TBD"}</span>
                  <span>👥 {registered}/{capacity || "∞"}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, textTransform: "capitalize" }}>{ev.status || "upcoming"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
