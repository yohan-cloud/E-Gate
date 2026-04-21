import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import toast, { formatApiError } from "../../lib/toast";
import AudienceSelector from "./AudienceSelector";
import { DateTimeField } from "./PickerField";
import { FALLBACK_VENUES, buildVenueCapacityMap, normalizeVenueList } from "../../constants/venues";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const DEFAULTS = {
  title: "",
  event_type: "mandatory_governance_meetings",
  audience_type: "all",
  date: "",
  end_date: "",
  venue_id: "",
  venue: "",
  capacity: "",
  registration_open: "",
  registration_close: "",
  description: "",
};

function RequiredLabel({ htmlFor, children, invalid = false }) {
  return (
    <label htmlFor={htmlFor} className={`required-field-label ${invalid ? "invalid" : ""}`}>
      <span className="required-marker">*</span>
      <span>{children}</span>
      <span className="required-text">Required</span>
    </label>
  );
}

export default function CreateEventForm({ onCreated }) {
  const [form, setForm] = useState(DEFAULTS);
  const [venues, setVenues] = useState(FALLBACK_VENUES);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const venueCapacityMap = useMemo(() => buildVenueCapacityMap(venues), [venues]);
  const hasAutoCapacity = venueCapacityMap[form.venue] !== undefined;

  useEffect(() => {
    let cancelled = false;
    api
      .get("/events/venues/")
      .then((res) => {
        if (!cancelled) {
          const nextVenues = normalizeVenueList(res.data);
          if (nextVenues.length) setVenues(nextVenues);
        }
      })
      .catch(() => {
        if (!cancelled) setVenues(FALLBACK_VENUES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (e) => {
    const { name, value } = e.target;

    if (name === "venue") {
      const selectedVenue = venues.find((venue) => String(venue.id) === value || venue.name === value);
      const venueName = selectedVenue?.name || "";
      const nextForm = { ...form, venue_id: selectedVenue?.id ? String(selectedVenue.id) : "", venue: venueName };
      const defaultCapacity = selectedVenue?.max_capacity;
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
    setSubmitted(true);
    if (form.date && form.end_date && new Date(form.end_date) <= new Date(form.date)) {
      toast.error("Event end date/time must be after the start date/time.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        event_type: form.event_type,
        audience_type: form.audience_type,
        date: toOffsetIso(form.date),
        end_date: toOffsetIso(form.end_date),
        venue_id: form.venue_id ? Number(form.venue_id) : null,
        venue: form.venue,
        capacity: form.capacity ? Number(form.capacity) : null,
        registration_open: toOffsetIso(form.registration_open),
        registration_close: toOffsetIso(form.registration_close),
        description: form.description.trim(),
      };
      const res = await api.post("/events/create/", payload);
      toast.success("Event created");
      setForm(DEFAULTS);
      setSubmitted(false);
      onCreated?.(res.data);
    } catch (e) {
      const msg = formatApiError(e, "Failed to create event");
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
        onInvalid={() => setSubmitted(true)}
        className="form-grid"
        style={{ gridTemplateColumns: "1fr", maxWidth: 520, margin: "0 auto" }}
      >
        <div className="form-group">
          <RequiredLabel htmlFor="event-title" invalid={submitted && !form.title}>Title</RequiredLabel>
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
          <RequiredLabel htmlFor="event-type" invalid={submitted && !form.event_type}>Event Type</RequiredLabel>
          <select id="event-type" name="event_type" value={form.event_type} onChange={update}>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="event-audience" invalid={submitted && !form.audience_type}>Audience</RequiredLabel>
          <AudienceSelector
            id="event-audience"
            value={form.audience_type}
            onChange={(nextValue) => setForm({ ...form, audience_type: nextValue })}
          />
          <small>Select one or more audiences. Choosing All Audience clears the other filters.</small>
        </div>
        <DateTimeField
          id="event-date"
          name="date"
          label="Event Date & Time"
          value={form.date}
          onChange={update}
          required
          requiredInvalid={submitted && !form.date}
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
            value={form.venue_id || form.venue}
            onChange={update}
          >
            <option value="">Select a venue</option>
            {venues.map((venue) => (
              <option key={venue.id || venue.name} value={venue.id || venue.name}>
                {venue.name} ({venue.max_capacity})
              </option>
            ))}
          </select>
          <small>Select a venue to auto-fill the max capacity.</small>
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
            disabled={hasAutoCapacity}
            readOnly={hasAutoCapacity}
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
