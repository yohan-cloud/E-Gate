import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../api";
import { DateTimeField } from "../dashboard/PickerField";

const DEFAULT_FORM = {
  purpose: "",
  appointment_at: "",
  resident_note: "",
};

const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "purpose", label: "Purpose A-Z" },
  { value: "status", label: "Status" },
];

function toOffsetIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const tzMinutes = -date.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzMinutes);
  const [datePart, timePart] = value.split("T");
  return `${datePart}T${timePart}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getStatusMeta(status) {
  const map = {
    approved: { label: "Approved", bg: "#dcfce7", color: "#166534" },
    rejected: { label: "Rejected", bg: "#fee2e2", color: "#991b1b" },
    rescheduled: { label: "Rescheduled", bg: "#dbeafe", color: "#1d4ed8" },
    completed: { label: "Completed", bg: "#e0e7ff", color: "#3730a3" },
    cancelled: { label: "Cancelled", bg: "#f1f5f9", color: "#475569" },
    pending: { label: "Pending", bg: "#fef3c7", color: "#92400e" },
  };
  return map[status] || map.pending;
}

function formatSchedule(value) {
  if (!value) return { date: "No schedule", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "No schedule", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function getTimestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);

  const stats = useMemo(() => {
    const base = { total: appointments.length, pending: 0, approved: 0, rejected: 0 };
    appointments.forEach((item) => {
      if (base[item.status] !== undefined) base[item.status] += 1;
    });
    return base;
  }, [appointments]);

  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments
      .filter((item) => (statusFilter ? item.status === statusFilter : true))
      .filter((item) => {
        if (!query) return true;
        return [item.purpose, item.resident_note, item.admin_note, item.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (sortBy === "oldest") return getTimestamp(a.appointment_at) - getTimestamp(b.appointment_at);
        if (sortBy === "purpose") return String(a.purpose || "").localeCompare(String(b.purpose || ""), undefined, { sensitivity: "base" });
        if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""), undefined, { sensitivity: "base" });
        return getTimestamp(b.appointment_at) - getTimestamp(a.appointment_at);
      });
  }, [appointments, search, sortBy, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/common/resident-appointments/");
      setAppointments(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const closeModal = () => {
    if (saving) return;
    resetForm();
    setModalOpen(false);
  };

  const openCreateModal = () => {
    resetForm();
    setError("");
    setMessage("");
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        purpose: form.purpose.trim(),
        appointment_at: toOffsetIso(form.appointment_at),
        resident_note: form.resident_note.trim(),
      };
      if (editingId) {
        await api.patch(`/common/resident-appointments/${editingId}/`, payload);
        setMessage("Appointment change submitted.");
      } else {
        await api.post("/common/resident-appointments/", payload);
        setMessage("Appointment request sent.");
      }
      resetForm();
      setModalOpen(false);
      await load();
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.error || data?.detail || JSON.stringify(data) || "Failed to save appointment.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (appointment) => {
    setEditingId(appointment.id);
    setForm({
      purpose: appointment.purpose || "",
      appointment_at: toLocalInputValue(appointment.appointment_at),
      resident_note: appointment.resident_note || "",
    });
    setMessage("");
    setError("");
    setModalOpen(true);
  };

  const cancelAppointment = async (appointmentId) => {
    setMessage("");
    setError("");
    try {
      await api.patch(`/common/resident-appointments/${appointmentId}/`, { status: "cancelled" });
      setMessage("Appointment cancelled.");
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to cancel appointment.");
    }
  };

  return (
    <div className="resident-appointments-page resident-appointments-table-page">
      <div className="resident-appointment-stat-grid">
        <StatCard label="Total appointments" value={stats.total} icon="calendar" />
        <StatCard label="Pending" value={stats.pending} icon="clock" />
        <StatCard label="Approved" value={stats.approved} icon="check" />
        <StatCard label="Rejected" value={stats.rejected} icon="x" />
      </div>

      <section className="resident-appointment-table-card">
        <div className="resident-appointment-table-toolbar">
          <div>
            <h2>Appointment List</h2>
            <p>Track your barangay service requests and admin notes.</p>
          </div>
          <div className="resident-appointment-toolbar-actions">
            <div className="resident-appointment-search">
              <input
                type="search"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort appointments">
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <button className="btn-primary" type="button" onClick={openCreateModal}>+ Create Appointment</button>
          </div>
        </div>

        <div className="resident-appointment-filters" aria-label="Appointment status filters">
          <button type="button" className={!statusFilter ? "active" : ""} onClick={() => setStatusFilter("")}>All</button>
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={statusFilter === item.value ? "active" : ""}
              onClick={() => setStatusFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="resident-appointment-alert error">{error}</div> : null}
        {message ? <div className="resident-appointment-alert success">{message}</div> : null}

        <div className="resident-appointment-table-wrap">
          <table className="resident-appointment-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Purpose</th>
                <th>Schedule</th>
                <th>Message</th>
                <th>Admin Note</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="resident-appointment-table-empty">Loading appointments...</td></tr>
              ) : null}
              {!loading && visibleAppointments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="resident-appointment-table-empty">
                    <strong>{appointments.length === 0 ? "No appointments yet" : "No matching appointments"}</strong>
                    <span>{appointments.length === 0 ? "Create an appointment to get started." : "Try another search, status, or sort option."}</span>
                  </td>
                </tr>
              ) : null}
              {!loading && visibleAppointments.map((appointment, index) => {
                const meta = getStatusMeta(appointment.status);
                const schedule = formatSchedule(appointment.appointment_at);
                const canEdit = appointment.status === "pending";
                const canCancel = appointment.status === "pending";
                return (
                  <tr key={appointment.id}>
                    <td>{index + 1}</td>
                    <td>
                      <div className="resident-appointment-title-cell">
                        <strong>{appointment.purpose}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="resident-appointment-date-cell">
                        <strong>{schedule.date}</strong>
                        <span>{schedule.time}</span>
                      </div>
                    </td>
                    <td>{appointment.resident_note || "None"}</td>
                    <td>{appointment.admin_note || "No remarks yet"}</td>
                    <td>
                      <span className="resident-appointment-status" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <div className="resident-appointment-table-actions">
                        {canEdit ? <button type="button" onClick={() => startEdit(appointment)}>Edit</button> : null}
                        {canCancel ? <button type="button" onClick={() => cancelAppointment(appointment.id)}>Cancel</button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="resident-appointment-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="resident-appointment-modal" role="dialog" aria-modal="true" aria-labelledby="resident-appointment-modal-title">
            <div className="resident-appointment-modal-head">
              <div>
                <small>Services</small>
                <h3 id="resident-appointment-modal-title">{editingId ? "Edit Appointment" : "Create Appointment"}</h3>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close">x</button>
            </div>
            <form className="resident-appointment-form" onSubmit={submit}>
              <label className="resident-appointment-field">
                <span>Purpose</span>
                <input
                  name="purpose"
                  placeholder="Barangay ID, certificate, consultation, etc."
                  value={form.purpose}
                  onChange={onChange}
                  required
                />
              </label>
              <div className="resident-appointment-field">
                <span>Preferred Schedule</span>
                <DateTimeField
                  id="resident-appointment-at"
                  name="appointment_at"
                  label=""
                  value={form.appointment_at}
                  onChange={onChange}
                  required
                  placeholder="Preferred appointment schedule"
                  panelInFlow
                  disablePastDates
                />
              </div>
              <label className="resident-appointment-field">
                <span>Message to Admin</span>
                <textarea
                  name="resident_note"
                  placeholder="Message to admin (optional)"
                  value={form.resident_note}
                  onChange={onChange}
                  rows={3}
                />
              </label>
              <div className="resident-appointment-modal-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button className="btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Update Appointment" : "Submit Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="resident-appointment-stat-card">
      <div className="resident-appointment-stat-icon" aria-hidden="true">{renderAppointmentStatIcon(icon)}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function renderAppointmentStatIcon(name) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const icons = {
    calendar: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.2 2.2 4.8-5.4" /></>,
    x: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  };
  return <svg {...common}>{icons[name] || icons.calendar}</svg>;
}
