import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import ConfirmDialog from "../common/ConfirmDialog";
import toast, { formatApiError } from "../../lib/toast";
import AudienceSelector from "./AudienceSelector";
import { AUDIENCE_LABELS, parseAudienceValue } from "./audienceOptions";
import { DateTimeField } from "./PickerField";
import { FALLBACK_VENUES, buildVenueCapacityMap, normalizeVenueList } from "../../constants/venues";

const EVENT_TYPE_OPTIONS = [
  { value: "mandatory_governance_meetings", label: "Mandatory Governance Meetings" },
  { value: "health_and_social_services", label: "Health and Social Services" },
  { value: "community_events", label: "Community Events" },
  { value: "operations_and_compliance", label: "Operations and Compliance" },
];

const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));

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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [venues, setVenues] = useState(FALLBACK_VENUES);
  const venueCapacityMap = useMemo(() => buildVenueCapacityMap(venues), [venues]);
  const hasAutoCapacity = venueCapacityMap[form.venue] !== undefined;
  const selectableVenues = useMemo(() => {
    const hasCurrent = venues.some(
      (venue) => String(venue.id) === String(form.venue_id || "") || venue.name === form.venue
    );
    if (!form.venue || hasCurrent) return venues;
    return [
      ...venues,
      {
        id: form.venue_id || null,
        name: form.venue,
        max_capacity: form.capacity || event?.venue_max_capacity || event?.capacity || 0,
        is_active: false,
      },
    ];
  }, [event?.capacity, event?.venue_max_capacity, form.capacity, form.venue, form.venue_id, venues]);

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
      venue_id: event.venue_ref_id ? String(event.venue_ref_id) : "",
      venue: event.venue || "",
      status: event.status || "upcoming",
      capacity: event.capacity ?? "",
      registration_open: toLocalInput(event.registration_open),
      registration_close: toLocalInput(event.registration_close),
      description: event.description || "",
    });
    setEditing(true);
  };

  const updateField = (e) => {
    const { name, value } = e.target;

    if (name === "venue") {
      const selectedVenue = selectableVenues.find((venue) => String(venue.id) === value || venue.name === value);
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

  const save = async () => {
    if (form.date && form.end_date && new Date(form.end_date) <= new Date(form.date)) {
      toast.error("Event end date/time must be after the start date/time.");
      return;
    }
    try {
      const payload = {
        title: form.title,
        event_type: form.event_type,
        audience_type: form.audience_type,
        // Send datetime-local with explicit offset to avoid time shifts
        date: toOffsetIso(form.date),
        end_date: toOffsetIso(form.end_date),
        venue_id: form.venue_id ? Number(form.venue_id) : null,
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
    try {
      await api.delete(`/events/delete/${eventId}/`);
      toast.success("Event deleted");
      setConfirmDeleteOpen(false);
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
              <button onClick={() => setConfirmDeleteOpen(true)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6 }}>Delete</button>
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
              <AudienceSelector
                id="edit-audience"
                value={form.audience_type}
                onChange={(nextValue) => setForm({ ...form, audience_type: nextValue })}
              />
            </div>
            <DateTimeField
              id="edit-date"
              name="date"
              label="Event Date & Time"
              value={form.date}
              onChange={updateField}
              placeholder="Select event date and time"
              helpText="The actual start date/time of the event."
              disablePastDates
            />
            <DateTimeField
              id="edit-end-date"
              name="end_date"
              label="Event End Date & Time"
              value={form.end_date}
              onChange={updateField}
              placeholder="Select event end date and time"
              helpText="Set when the event ends."
              disablePastDates
            />
            <div className="form-group">
              <label htmlFor="edit-venue">Venue</label>
              <select id="edit-venue" name="venue" value={form.venue_id || form.venue} onChange={updateField}>
                <option value="">Select a venue</option>
                {selectableVenues.map((venue) => (
                  <option key={venue.id || venue.name} value={venue.id || venue.name}>
                    {venue.name} ({venue.max_capacity || "no capacity"})
                  </option>
                ))}
              </select>
              <small>Select a venue to auto-fill the max capacity.</small>
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
              <input
                id="edit-capacity"
                type="number"
                min="0"
                name="capacity"
                value={form.capacity}
                onChange={updateField}
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
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Event"
        message="Delete this event? This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}
