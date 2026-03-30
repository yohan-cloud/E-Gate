import { useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";
import { DateTimeField } from "./PickerField";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const DEFAULTS = {
  title: "",
  event_type: "mandatory_governance_meetings",
  date: "",
  end_date: "",
  venue: "",
  capacity: "",
  registration_open: "",
  registration_close: "",
  description: "",
};

export default function CreateEventForm({ onCreated }) {
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

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

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        event_type: form.event_type,
        date: toOffsetIso(form.date),
        end_date: toOffsetIso(form.end_date),
        venue: form.venue,
        capacity: form.capacity ? Number(form.capacity) : null,
        registration_open: toOffsetIso(form.registration_open),
        registration_close: toOffsetIso(form.registration_close),
        description: form.description.trim(),
      };
      const res = await api.post("/events/create/", payload);
      toast.success("Event created");
      setForm(DEFAULTS);
      onCreated?.(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error || JSON.stringify(e?.response?.data) || "Failed to create event";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="event-create-shell" style={{ marginBottom: 12 }}>
      <div className="event-create-card">
        <div className="event-create-head">
          <h3 style={{ margin: 0 }}>Create Event</h3>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Set up a new barangay event and registration window.</p>
        </div>
      <form
        onSubmit={submit}
        className="form-grid"
        style={{ gridTemplateColumns: "1fr", maxWidth: 520, margin: "0 auto" }}
      >
        <div className="form-group">
          <label htmlFor="event-title">Title</label>
          <input
            id="event-title"
            name="title"
            placeholder="e.g., Community Clean-up"
            value={form.title}
            onChange={update}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="event-type">Event Type</label>
          <select id="event-type" name="event_type" value={form.event_type} onChange={update}>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <DateTimeField
          id="event-date"
          name="date"
          label="Event Date & Time"
          value={form.date}
          onChange={update}
          required
          placeholder="Select event date and time"
          helpText="The actual start date/time of the event."
          panelInFlow
        />
        <DateTimeField
          id="event-end-date"
          name="end_date"
          label="Event End Date & Time"
          value={form.end_date}
          onChange={update}
          placeholder="Select event end date and time"
          helpText="Set when the event is expected to end."
          panelInFlow
        />
        <div className="form-group">
          <label htmlFor="event-venue">Venue</label>
          <input
            id="event-venue"
            name="venue"
            placeholder="e.g., Barangay Hall"
            value={form.venue}
            onChange={update}
          />
        </div>
        <div className="form-group">
          <label htmlFor="event-capacity">Capacity</label>
          <input
            id="event-capacity"
            name="capacity"
            type="number"
            min="0"
            placeholder="e.g., 100"
            value={form.capacity}
            onChange={update}
          />
        </div>
        <div className="form-group">
          <label htmlFor="event-description">Notes</label>
          <textarea
            id="event-description"
            name="description"
            rows={4}
            placeholder="Add important notes, reminders, or extra event details..."
            value={form.description}
            onChange={update}
          />
          <small>Optional notes that residents and admins can see with the event.</small>
        </div>
        <DateTimeField
          id="event-open"
          name="registration_open"
          label="Registration Opens"
          value={form.registration_open}
          onChange={update}
          placeholder="Select opening date and time"
          helpText="Residents can start registering at this time."
          panelInFlow
        />
        <DateTimeField
          id="event-close"
          name="registration_close"
          label="Registration Closes"
          value={form.registration_close}
          onChange={update}
          placeholder="Select closing date and time"
          helpText="No more registrations after this time."
          panelInFlow
        />
        <div style={{ gridColumn: "1 / -1", textAlign: "right" }}>
          <button type="submit" disabled={busy} className="event-create-submit" style={{ padding: "10px 16px" }}>
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
