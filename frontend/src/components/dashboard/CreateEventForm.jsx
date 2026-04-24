import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import toast, { formatApiError } from "../../lib/toast";
import AudienceSelector from "./AudienceSelector";
import ModernSelect from "../common/ModernSelect";
import { DateTimeField } from "./PickerField";
import addEventIcon from "../../assets/add-event.png";
import {
  FALLBACK_VENUES,
  TBD_VENUE_NAME,
  TBD_VENUE_VALUE,
  isTbdVenueName,
  normalizeVenueList,
} from "../../constants/venues";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const DEFAULTS = {
  title: "",
  event_type: "",
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
  const selectedVenue = useMemo(
    () => venues.find((venue) => String(venue.id) === String(form.venue_id || "") || venue.name === form.venue),
    [form.venue, form.venue_id, venues],
  );
  const selectedVenueMax = selectedVenue?.max_capacity ? Number(selectedVenue.max_capacity) : null;
  const isTbdVenue = isTbdVenueName(form.venue) && !form.venue_id;
  const venueOptions = useMemo(
    () => [
      { value: "", label: "Select a venue" },
      { divider: true, id: "venue-divider-top" },
      { value: TBD_VENUE_VALUE, label: "TBD", description: "Venue not yet assigned" },
      { divider: true, id: "venue-divider-bottom" },
      ...venues.map((venue) => ({
        value: String(venue.id || venue.name),
        label: `${venue.name} (${venue.max_capacity})`,
      })),
    ],
    [venues],
  );

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
      if (value === TBD_VENUE_VALUE) {
        setForm({ ...form, venue_id: "", venue: TBD_VENUE_NAME, capacity: "" });
        return;
      }
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

    if (name === "capacity" && selectedVenueMax && Number(value) > selectedVenueMax) {
      setForm({ ...form, capacity: String(selectedVenueMax) });
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
    if (!form.date) {
      toast.error("Please select an event date and time.");
      return;
    }
    if (form.capacity === "") {
      toast.error("Please enter the estimated capacity.");
      return;
    }
    if (selectedVenueMax && Number(form.capacity) > selectedVenueMax) {
      toast.error(`Estimated capacity cannot exceed ${selectedVenueMax} for the selected venue.`);
      return;
    }
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
          <select id="event-type" name="event_type" value={form.event_type} onChange={update} required>
            <option value="">Select event type</option>
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
          <ModernSelect
            id="event-venue"
            name="venue"
            value={isTbdVenue ? TBD_VENUE_VALUE : form.venue_id || form.venue}
            onChange={update}
            options={venueOptions}
            placeholder="Select a venue"
          />
          <small>Select an active venue or TBD if the venue is not yet finalized.</small>
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="event-capacity" invalid={submitted && form.capacity === ""}>
            {isTbdVenue ? "Estimated Capacity" : "Capacity"}
          </RequiredLabel>
          <input
            id="event-capacity"
            name="capacity"
            type="number"
            min="1"
            max={selectedVenueMax || undefined}
            placeholder="e.g., 100"
            value={form.capacity}
            onChange={update}
            disabled={Boolean(selectedVenueMax)}
            readOnly={Boolean(selectedVenueMax)}
            required
            style={
              selectedVenueMax
                ? {
                    background: "#e5e7eb",
                    color: "#475569",
                    borderColor: "#cbd5e1",
                  }
                : undefined
            }
          />
          <small>
            {isTbdVenue
              ? "Enter estimated number of attendees since the venue is not yet finalized."
              : selectedVenueMax
                ? `Auto-filled from the selected venue. Maximum allowed: ${selectedVenueMax}.`
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
          <button type="submit" disabled={busy} className="event-create-submit button-with-icon" style={{ padding: "10px 16px" }}>
            {!busy ? (
              <span className="button-icon-wrap event-action-icon" aria-hidden="true">
                <img src={addEventIcon} alt="" />
              </span>
            ) : null}
            <span>{busy ? "Creating..." : "Create"}</span>
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
