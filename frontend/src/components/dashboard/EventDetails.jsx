import { useEffect, useState } from "react";
import { api } from "../../api";
import toast, { formatApiError } from "../../lib/toast";
import { DateTimeField } from "./PickerField";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Residents" },
  { value: "kids_only", label: "Kids/Teens" },
  { value: "adult_only", label: "Adults" },
  { value: "senior_only", label: "Senior Citizens" },
];
const AUDIENCE_LABELS = Object.fromEntries(AUDIENCE_OPTIONS.map((option) => [option.value, option.label]));

function parseAudienceValue(value) {
  if (!value || value === "all") return ["all"];
  const parsed = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : ["all"];
}

function stringifyAudienceValue(values) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0 || unique.includes("all")) return "all";
  return unique.join(",");
}

function toLocalInput(dt) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function formatEventSchedule(start, end) {
  if (!start) return "TBD schedule";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "TBD schedule";
  const startLabel = startDate.toLocaleString();
  if (!end) return startLabel;
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return startLabel;
  return `${startLabel} until ${endDate.toLocaleString()}`;
}

export default function EventDetails({ eventId, initialEvent = null, onDeleted, onUpdated, mode = "view" }) {
  const [event, setEvent] = useState(initialEvent);
  const [editing, setEditing] = useState(mode === "edit");
  const [form, setForm] = useState({});
  const selectedAudiences = parseAudienceValue(form.audience_type);

  const toOffsetIso = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    const tzMinutes = -d.getTimezoneOffset();
    const sign = tzMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(tzMinutes);
    const hh = pad(Math.floor(abs / 60));
    const mm = pad(abs % 60);
    const [datePart, timePart] = val.split("T");
    if (!datePart || !timePart) return null;
    return `${datePart}T${timePart}${sign}${hh}:${mm}`;
  };

  useEffect(() => {
    if (initialEvent) {
      setEvent(initialEvent);
      return;
    }
    api
      .get(`/events/${eventId}/`)
      .then((res) => setEvent(res.data))
      .catch((err) => console.error(err));
  }, [eventId, initialEvent]);

  useEffect(() => {
    setEditing(mode === "edit");
    if (mode === "edit" && event) {
      startEdit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, event?.id]);

  const startEdit = () => {
    if (!event) return;
    setForm({
      title: event.title || "",
      event_type: event.event_type || "mandatory_governance_meetings",
      audience_type: event.audience_type || "all",
      date: toLocalInput(event.date),
      end_date: toLocalInput(event.end_date),
      venue: event.venue || "",
      status: event.status || "upcoming",
      capacity: event.capacity ?? "",
      registration_open: toLocalInput(event.registration_open),
      registration_close: toLocalInput(event.registration_close),
      description: event.description || "",
    });
    setEditing(true);
  };

  const updateField = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleAudience = (value) => {
    const current = parseAudienceValue(form.audience_type);

    if (value === "all") {
      setForm({ ...form, audience_type: "all" });
      return;
    }

    const withoutAll = current.filter((item) => item !== "all");
    const nextValues = withoutAll.includes(value)
      ? withoutAll.filter((item) => item !== value)
      : [...withoutAll, value];

    setForm({
      ...form,
      audience_type: stringifyAudienceValue(nextValues),
    });
  };

  const save = async () => {
    try {
      const payload = {
        title: form.title,
        event_type: form.event_type,
        audience_type: form.audience_type,
        // Send datetime-local with explicit offset to avoid time shifts
        date: toOffsetIso(form.date),
        end_date: toOffsetIso(form.end_date),
        venue: form.venue,
        status: form.status,
        capacity: form.capacity === "" ? null : Number(form.capacity),
        registration_open: toOffsetIso(form.registration_open),
        registration_close: toOffsetIso(form.registration_close),
        description: form.description,
      };
      const res = await api.put(`/events/update/${eventId}/`, payload);
      setEvent(res.data);
      onUpdated?.(res.data);
      setEditing(false);
      toast.success("Event updated");
    } catch (e) {
      const msg = formatApiError(e, "Failed to update");
      toast.error(msg);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try {
      await api.delete(`/events/delete/${eventId}/`);
      toast.success("Event deleted");
      onDeleted?.();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to delete";
      toast.error(msg);
    }
  };

  if (!event) return <p>Loading event details...</p>;

  return (
    <div className="card">
      {!editing ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{event.title}</h2>
            <div>
              <button onClick={startEdit} style={{ marginRight: 8 }}>Edit</button>
              <button onClick={remove} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6 }}>Delete</button>
            </div>
          </div>
          <p><b>Type:</b> {EVENT_TYPE_LABELS[event.event_type] || event.event_type}</p>
          <p><b>Audience:</b> {parseAudienceValue(event.audience_type).map((value) => AUDIENCE_LABELS[value] || value).join(", ")}</p>
          <p><b>Venue:</b> {event.venue}</p>
          <p><b>Status:</b> {event.status}</p>
          <p><b>Schedule:</b> {formatEventSchedule(event.date, event.end_date)}</p>
          <p><b>Description:</b> {event.description}</p>
        </>
      ) : (
        <>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="edit-title">Title</label>
              <input id="edit-title" name="title" value={form.title} onChange={updateField} />
            </div>
            <div className="form-group">
              <label htmlFor="edit-type">Event Type</label>
              <select id="edit-type" name="event_type" value={form.event_type} onChange={updateField}>
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-audience">Audience</label>
              <div id="edit-audience" className="audience-picker" role="group" aria-label="Audience selection">
                <div className="audience-chip-list">
                  {selectedAudiences.map((value) => {
                    const option = AUDIENCE_OPTIONS.find((item) => item.value === value);
                    if (!option) return null;
                    return (
                      <button
                        key={value}
                        type="button"
                        className="audience-chip active"
                        onClick={() => toggleAudience(value)}
                      >
                        <span>{option.label}</span>
                        <span className="audience-chip-close" aria-hidden="true">x</span>
                      </button>
                    );
                  })}
                </div>
                <div className="audience-option-row">
                  {AUDIENCE_OPTIONS.map((option) => {
                    const isSelected = selectedAudiences.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`audience-option ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleAudience(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DateTimeField
              id="edit-date"
              name="date"
              label="Event Date & Time"
              value={form.date}
              onChange={updateField}
              placeholder="Select event date and time"
              helpText="The actual start date/time of the event."
            />
            <DateTimeField
              id="edit-end-date"
              name="end_date"
              label="Event End Date & Time"
              value={form.end_date}
              onChange={updateField}
              placeholder="Select event end date and time"
              helpText="Set when the event ends."
            />
            <div className="form-group">
              <label htmlFor="edit-venue">Venue</label>
              <input id="edit-venue" name="venue" value={form.venue} onChange={updateField} />
            </div>
            <div className="form-group">
              <label htmlFor="edit-status">Status</label>
              <select id="edit-status" name="status" value={form.status} onChange={updateField}>
                <option value="upcoming">upcoming</option>
                <option value="ongoing">ongoing</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-capacity">Capacity</label>
              <input id="edit-capacity" type="number" min="0" name="capacity" value={form.capacity} onChange={updateField} />
            </div>
            <DateTimeField
              id="edit-open"
              name="registration_open"
              label="Registration Opens"
              value={form.registration_open}
              onChange={updateField}
              placeholder="Select opening date and time"
            />
            <DateTimeField
              id="edit-close"
              name="registration_close"
              label="Registration Closes"
              value={form.registration_close}
              onChange={updateField}
              placeholder="Select closing date and time"
            />
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="edit-description">Description</label>
              <textarea id="edit-description" name="description" rows={3} value={form.description} onChange={updateField} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={() => setEditing(false)} style={{ marginRight: 8 }}>Cancel</button>
            <button onClick={save} style={{ padding: '8px 12px' }}>Save</button>
          </div>
        </>
      )}
    </div>
  );
}
