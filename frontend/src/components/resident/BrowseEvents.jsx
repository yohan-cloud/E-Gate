import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const AUDIENCE_LABELS = {
  all: "All Residents",
  kids_only: "Kids/Teens",
  adult_only: "Adults",
  pwd: "PWD",
  pregnant_mothers: "Pregnant Women / Mothers",
  senior_only: "Senior Citizens",
};
const KIDS_MAX_AGE = 17;
const ADULT_MIN_AGE = 18;
const ADULT_MAX_AGE = 59;
const SENIOR_MIN_AGE = 60;

function parseAudienceValue(value) {
  if (!value || value === "all") return ["all"];
  const parsed = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : ["all"];
}

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const parsed = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const beforeBirthday =
    today.getMonth() < parsed.getMonth() ||
    (today.getMonth() === parsed.getMonth() && today.getDate() < parsed.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function audienceMessage(audienceType) {
  const audiences = parseAudienceValue(audienceType);
  if (audiences.includes("all")) return "";
  if (audiences.length === 1 && audiences[0] === "kids_only") return "This event is for kids/teens only.";
  if (audiences.length === 1 && audiences[0] === "adult_only") return "This event is for adult residents only.";
  if (audiences.length === 1 && audiences[0] === "pwd") return "This event is for PWD residents only.";
  if (audiences.length === 1 && audiences[0] === "pregnant_mothers") return "This event is for pregnant women / mothers only.";
  if (audiences.length === 1 && audiences[0] === "senior_only") return "This event is for senior residents only.";
  return "This event is only for selected audiences.";
}

function isEligibleForAudience(audienceType, age) {
  const audiences = parseAudienceValue(audienceType);
  if (audiences.includes("all")) return true;
  if (age === null) return false;
  return (
    (audiences.includes("kids_only") && age <= KIDS_MAX_AGE) ||
    (audiences.includes("adult_only") && age >= ADULT_MIN_AGE && age <= ADULT_MAX_AGE) ||
    (audiences.includes("senior_only") && age >= SENIOR_MIN_AGE)
  );
}

export default function BrowseEvents({ isVerified = false, onRequestVerification }) {
  const [events, setEvents] = useState([]);
  const [my, setMy] = useState(new Set());
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [ordering, setOrdering] = useState("-date");
  const [section, setSection] = useState("active");
  const residentAge = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      return calculateAge(user?.profile?.birthdate || user?.birthdate);
    } catch {
      return null;
    }
  }, []);

  const loadEvents = useCallback(async (p = 1) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (search.trim()) params.set("q", search.trim());
    if (section) params.set("visibility", section);
    if (status) params.set("status", status);
    if (eventType) params.set("event_type", eventType);
    if (ordering) params.set("ordering", ordering);
    const res = await api.get(`/events/list/?${params.toString()}`);
    const data = res.data || {};
    setEvents(data.results || []);
    setHasNext(!!data.next);
    setHasPrev(!!data.previous);
  }, [eventType, ordering, search, section, status]);

  const loadMine = async () => {
    const res = await api.get("/events/my-registrations/ids/");
    const ids = new Set(res.data?.event_ids || []);
    setMy(ids);
  };

  useEffect(() => {
    const id = setTimeout(() => {
      loadEvents(page).catch(() => toast.error("Failed to load events"));
    }, 200);
    return () => clearTimeout(id);
  }, [loadEvents, page]);

  useEffect(() => {
    loadMine().catch(() => {});
  }, []);

  const handleRegister = async (id) => {
    try {
      await api.post(`/events/${id}/register/`);
      setEvents((curr) =>
        curr.map((event) =>
          event.id === id
            ? { ...event, registrations_count: (event.registrations_count || 0) + 1 }
            : event
        )
      );
      toast.success("Registered for event");
      await loadMine();
      await loadEvents(page);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to register";
      toast.error(msg);
    }
  };

  const handleUnregister = async (id) => {
    try {
      await api.post(`/events/${id}/unregister/`);
      setEvents((curr) =>
        curr.map((event) =>
          event.id === id
            ? { ...event, registrations_count: Math.max(0, (event.registrations_count || 0) - 1) }
            : event
        )
      );
      toast.success("Unregistered from event");
      await loadMine();
      await loadEvents(page);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to unregister";
      toast.error(msg);
    }
  };

  const formattedEvents = useMemo(() => events, [events]);
  const sectionTitle =
    section === "past" ? "Past Events" : section === "all" ? "All Events" : "Browse Events";
  const sectionSubtitle =
    section === "past"
      ? "Review completed or unavailable barangay events"
      : section === "all"
        ? "See every barangay event in one place"
        : "Discover and register for upcoming barangay events";

  const statusOptions =
    section === "past"
      ? [
          { value: "", label: "All past status" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]
      : [
          { value: "", label: "All status" },
          { value: "upcoming", label: "Upcoming" },
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ];

  const formatSchedule = (start, end) => {
    if (!start) return { dateLabel: "TBD", timeLabel: "TBD" };
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return { dateLabel: "TBD", timeLabel: "TBD" };
    const dateLabel = startDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const startTime = startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!end) return { dateLabel, timeLabel: startTime };
    const endDate = new Date(end);
    if (Number.isNaN(endDate.getTime())) return { dateLabel, timeLabel: startTime };
    const endTime = endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { dateLabel, timeLabel: `${startTime} until ${endTime}` };
  };

  return (
    <div style={{ width: "100%", textAlign: "left" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{sectionTitle}</h2>
        <div style={{ color: "#475569" }}>{sectionSubtitle}</div>
      </div>

      {!isVerified && (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            Your resident ID needs reverification before you can register for barangay events.
          </div>
          <button
            type="button"
            onClick={() => onRequestVerification?.()}
            style={{
              border: "1px solid #f59e0b",
              background: "#fff",
              color: "#92400e",
              borderRadius: 999,
              padding: "8px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go to Reverification
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { key: "active", label: "Active Events" },
          { key: "past", label: "Ended Events" },
          { key: "all", label: "All Events" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setSection(item.key);
              setStatus("");
              setPage(1);
            }}
            className="pill"
            style={{
              background: section === item.key ? "#0f172a" : "#fff",
              color: section === item.key ? "#fff" : "#0f172a",
              border: "1px solid #cbd5e1",
              borderRadius: 999,
              padding: "9px 14px",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="resident-events-filters" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap", width: "min(100%, var(--admin-shell-width))", marginRight: "auto" }}>
        <div className="resident-events-search-shell" style={{ flex: "1 1 260px", background: "#f8fafc", borderRadius: 10, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
          <input
            className="resident-events-search-input"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", border: "none", background: "transparent", outline: "none" }}
          />
        </div>
        <select className="resident-events-filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          {statusOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="resident-events-filter-select" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }} style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="">All types</option>
          {EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="resident-events-filter-select" value={ordering} onChange={(e) => { setOrdering(e.target.value); setPage(1); }} style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option value="-date">Date: Newest</option>
          <option value="date">Date: Oldest</option>
          <option value="title">Title: A-Z</option>
          <option value="-title">Title: Z-A</option>
        </select>
      </div>

      <div className="resident-events-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,360px))", gap: 14, justifyContent: "flex-start" }}>
        {formattedEvents.map((e) => {
          const registered = my.has(e.id);
          const now = new Date();
          const startDate = e.date ? new Date(e.date) : null;
          const endDate = e.end_date ? new Date(e.end_date) : null;
          const isEnded =
            !startDate ||
            (endDate && !Number.isNaN(endDate.getTime()) ? endDate < now : startDate < now) ||
            ["completed", "cancelled"].includes(e.status);
          const { dateLabel, timeLabel } = formatSchedule(e.date, e.end_date);
          const capacity = e.capacity || 0;
          const registeredCount = e.registrations_count || 0;
          const pct = capacity ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;
          const spotsLeft = capacity ? Math.max(0, capacity - registeredCount) : "∞";
          const audienceType = e.audience_type || "all";
          const audienceValues = parseAudienceValue(audienceType);
          const eligibilityMessage = audienceMessage(audienceType);
          const audienceLocked = !registered && !isEligibleForAudience(audienceType, residentAge);
          const registrationLocked = !registered && !isVerified;
          const actionDisabled = registrationLocked || audienceLocked;
          const actionLabel = registered
            ? "Unregister"
            : registrationLocked
              ? "Verify Account to Register"
              : audienceLocked
                ? eligibilityMessage
                : "Register for Event";
          return (
            <div key={e.id} className="resident-event-card" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, boxShadow: "0 4px 12px rgba(15,23,42,0.06)", display: "flex", flexDirection: "column", minHeight: 278 }}>
              <div style={{ flex: 1 }}>
                <div className="resident-event-card-head" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <div className="resident-event-card-title" style={{ fontWeight: 700, fontSize: 18, flex: "1 1 180px" }}>{e.title}</div>
                  <span className="resident-event-chip" style={{ background: "#eef2ff", color: "#3730a3", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                    {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                  </span>
                  {audienceValues.filter((value) => value !== "all").map((value) => (
                    <span key={value} className="resident-event-chip" style={{ background: value === "kids_only" ? "#ecfeff" : value === "adult_only" ? "#eff6ff" : value === "pwd" ? "#f5f3ff" : value === "pregnant_mothers" ? "#fff1f2" : "#fef3c7", color: value === "kids_only" ? "#0f766e" : value === "adult_only" ? "#1d4ed8" : value === "pwd" ? "#6d28d9" : value === "pregnant_mothers" ? "#be123c" : "#92400e", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                      {AUDIENCE_LABELS[value] || value}
                    </span>
                  ))}
                  {registered && (
                    <span className="resident-event-chip" style={{ background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>Registered</span>
                  )}
                  <span className="resident-event-chip" style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: 999, fontSize: 12, textTransform: "capitalize" }}>
                    {e.status || "upcoming"}
                  </span>
                </div>
                <div className="resident-event-card-description" style={{ color: "#475569", marginBottom: 8, fontSize: 14, lineHeight: 1.45, minHeight: 40 }}>{e.description || "No description provided."}</div>
                <div className="resident-event-card-meta" style={{ display: "grid", gap: 5, color: "#475569", marginBottom: 10, fontSize: 14 }}>
                  <div>📅 {dateLabel}</div>
                  <div>⏰ {timeLabel}</div>
                  <div>📍 {e.venue || "TBD"}</div>
                  <div>👥 {registeredCount}/{capacity || "∞"} registered</div>
                </div>
              </div>
              <div className="resident-event-card-footer" style={{ marginTop: "auto" }}>
                <div className="resident-event-progress" style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb" }} />
                </div>
                <div className="resident-event-capacity" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, color: "#475569", fontSize: 13 }}>
                  <span>{capacity ? `${spotsLeft} spots left` : "No capacity limit"}</span>
                  <span>{registeredCount} registered</span>
                </div>
              </div>
              {isEnded ? (
                <div style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", textAlign: "center", fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
                  Event Ended
                </div>
              ) : (
                <button
                  className="btn-primary resident-event-action"
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    background: actionDisabled ? "#94a3b8" : "#0f172a",
                    borderColor: actionDisabled ? "#94a3b8" : "#0f172a",
                    borderRadius: 10,
                    cursor: actionDisabled ? "not-allowed" : "pointer",
                    fontSize: audienceLocked ? 13 : 15,
                  }}
                  onClick={() => {
                    if (registrationLocked) {
                      onRequestVerification?.();
                      toast.error("Complete your resident ID reverification before registering for an event.");
                      return;
                    }
                    if (audienceLocked) {
                      toast.error(eligibilityMessage);
                      return;
                    }
                    if (registered) {
                      handleUnregister(e.id);
                      return;
                    }
                    handleRegister(e.id);
                  }}
                  disabled={actionDisabled}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {events.length === 0 && <p>{section === "past" ? "No ended events found." : "No events found."}</p>}

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
        <button disabled={!hasPrev || page === 1} onClick={() => setPage((p) => (p > 1 ? p - 1 : p))}>Prev</button>
        <button disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
