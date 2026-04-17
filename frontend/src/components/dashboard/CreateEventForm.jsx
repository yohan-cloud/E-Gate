import { useState } from "react";
import { api } from "../../api";
import toast, { formatApiError } from "../../lib/toast";
import { DateTimeField } from "./PickerField";
import { VENUE_DEFAULT_CAPACITIES, VENUE_OPTIONS } from "../../constants/venues";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Residents" },
  { value: "kids_only", label: "Kids/Teens" },
  { value: "adult_only", label: "Adults" },
  { value: "senior_only", label: "Senior Citizens" },
];

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

const DEFAULTS = {
  title: "",
  event_type: "mandatory_governance_meetings",
  audience_type: "all",
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
  const hasAutoCapacity = VENUE_DEFAULT_CAPACITIES[form.venue] !== undefined;
  const selectedAudiences = parseAudienceValue(form.audience_type);

  const update = (e) => {
    const { name, value } = e.target;

    if (name === "venue") {
      const nextForm = { ...form, venue: value };
      const defaultCapacity = VENUE_DEFAULT_CAPACITIES[value];
      if (defaultCapacity !== undefined) {
        nextForm.capacity = String(defaultCapacity);
      }
      setForm(nextForm);
      return;
    }

    setForm({ ...form, [name]: value });
  };

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
        audience_type: form.audience_type,
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
      const msg = formatApiError(e, "Failed to create event");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

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
        <div className="form-group">
          <label htmlFor="event-audience">Audience</label>
          <div id="event-audience" className="audience-picker" role="group" aria-label="Audience selection">
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
          <small>Select one or more audiences. Choosing All Residents clears the age filters.</small>
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
          disablePastDates
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
          disablePastDates
        />
        <div className="form-group">
          <label htmlFor="event-venue">Venue</label>
          <select
            id="event-venue"
            name="venue"
            value={form.venue}
            onChange={update}
          >
            <option value="">Select a venue</option>
            {VENUE_OPTIONS.map((venue) => (
              <option key={venue} value={venue}>{venue}</option>
            ))}
          </select>
          <small>Select a venue to auto-fill the default capacity.</small>
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
            style={
              hasAutoCapacity
                ? {
                    background: "#e5e7eb",
                    color: "#475569",
                    borderColor: "#cbd5e1",
                  }
                : undefined
            }
          />
          <small>
            {hasAutoCapacity
              ? "Auto-filled from the selected venue. You can still adjust it if needed."
              : "Set the event capacity."}
          </small>
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
