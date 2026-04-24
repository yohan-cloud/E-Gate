import { useEffect, useMemo, useState } from "react";

import { api } from "../../api";
import ConfirmDialog from "../common/ConfirmDialog";
import { normalizeVenueList } from "../../constants/venues";
import toast, { formatApiError } from "../../lib/toast";
import addLocationIcon from "../../assets/add-location.png";

const EMPTY_FORM = {
  name: "",
  max_capacity: "",
};

export default function VenueManagement() {
  const [venues, setVenues] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null);

  const activeCount = useMemo(() => venues.filter((venue) => venue.is_active).length, [venues]);

  const loadVenues = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/events/venues/${showInactive ? "?include_inactive=1" : ""}`);
      setVenues(normalizeVenueList(res.data));
    } catch (e) {
      toast.error(formatApiError(e, "Failed to load venues"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVenues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const editVenue = (venue) => {
    setEditingId(venue.id);
    setForm({
      name: venue.name || "",
      max_capacity: venue.max_capacity ?? "",
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        max_capacity: Number(form.max_capacity),
      };
      if (editingId) {
        await api.patch(`/events/venues/${editingId}/`, payload);
        toast.success("Venue updated");
      } else {
        await api.post("/events/venues/", payload);
        toast.success("Venue added");
      }
      resetForm();
      await loadVenues();
    } catch (e) {
      toast.error(formatApiError(e, "Failed to save venue"));
    } finally {
      setSaving(false);
    }
  };

  const deactivateVenue = async (venue) => {
    try {
      await api.post(`/events/venues/${venue.id}/deactivate/`);
      toast.success("Venue deactivated");
      setConfirmAction(null);
      await loadVenues();
    } catch (e) {
      toast.error(formatApiError(e, "Failed to deactivate venue"));
    }
  };

  const reactivateVenue = async (venue) => {
    try {
      await api.post(`/events/venues/${venue.id}/reactivate/`);
      toast.success("Venue reactivated");
      setConfirmAction(null);
      await loadVenues();
    } catch (e) {
      toast.error(formatApiError(e, "Failed to reactivate venue"));
    }
  };

  const removeVenue = async (venue) => {
    try {
      await api.delete(`/events/venues/${venue.id}/delete/`);
      toast.success("Venue removed");
      setConfirmAction(null);
      if (editingId === venue.id) resetForm();
      await loadVenues();
    } catch (e) {
      toast.error(formatApiError(e, "Failed to remove venue"));
    }
  };

  return (
    <div className="venue-management">
      <div className="venue-management-head">
        <div>
          <h2>Venue Management</h2>
          <p>{activeCount} active venues available for event creation.</p>
        </div>
        <label className="venue-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show inactive</span>
        </label>
      </div>

      <div className="venue-management-grid">
        <form className="venue-form" onSubmit={submit}>
          <h3>{editingId ? "Edit Venue" : "Add Venue"}</h3>
          <div className="form-group">
            <label htmlFor="venue-name">Venue Name</label>
            <input
              id="venue-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Barangay Hall"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="venue-capacity">Max Capacity</label>
            <input
              id="venue-capacity"
              type="number"
              min="1"
              value={form.max_capacity}
              onChange={(e) => setForm({ ...form, max_capacity: e.target.value })}
              placeholder="e.g., 100"
              required
            />
          </div>
          <div className="venue-form-actions">
            {editingId ? (
              <button type="button" onClick={resetForm} className="secondary-btn">
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving} className={!editingId ? "button-with-icon" : ""}>
              {!editingId && !saving ? (
                <span className="button-icon-wrap venue-action-icon" aria-hidden="true">
                  <img src={addLocationIcon} alt="" />
                </span>
              ) : null}
              <span>{saving ? "Saving..." : editingId ? "Save Changes" : "Add Venue"}</span>
            </button>
          </div>
        </form>

        <div className="venue-table-shell">
          {loading ? (
            <p>Loading venues...</p>
          ) : venues.length === 0 ? (
            <p>No venues yet.</p>
          ) : (
            <table className="venue-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Max Capacity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((venue) => (
                  <tr key={venue.id}>
                    <td>{venue.name}</td>
                    <td>{venue.max_capacity}</td>
                    <td>
                      <span className={`venue-status ${venue.is_active ? "active" : "inactive"}`}>
                        {venue.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="venue-row-actions">
                        <button type="button" onClick={() => editVenue(venue)}>
                          Edit
                        </button>
                        {venue.is_active ? (
                          <button
                            type="button"
                            className="warning-btn"
                            onClick={() => setConfirmAction({ type: "deactivate", venue })}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setConfirmAction({ type: "reactivate", venue })}
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => setConfirmAction({ type: "remove", venue })}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === "remove"
            ? "Remove Venue"
            : confirmAction?.type === "reactivate"
              ? "Reactivate Venue"
              : "Deactivate Venue"
        }
        message={
          confirmAction?.type === "remove"
            ? `Remove ${confirmAction?.venue?.name}? This permanently deletes the venue if it is not used by any event.`
            : confirmAction?.type === "reactivate"
              ? `Reactivate ${confirmAction?.venue?.name}? It will appear again in event venue dropdowns.`
              : `Deactivate ${confirmAction?.venue?.name}? It will no longer appear in event venue dropdowns.`
        }
        confirmLabel={
          confirmAction?.type === "remove"
            ? "Remove"
            : confirmAction?.type === "reactivate"
              ? "Reactivate"
              : "Deactivate"
        }
        tone={confirmAction?.type === "remove" ? "danger" : confirmAction?.type === "reactivate" ? "success" : "warning"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction?.venue) return;
          if (confirmAction.type === "remove") {
            removeVenue(confirmAction.venue);
          } else if (confirmAction.type === "reactivate") {
            reactivateVenue(confirmAction.venue);
          } else {
            deactivateVenue(confirmAction.venue);
          }
        }}
      />
    </div>
  );
}
