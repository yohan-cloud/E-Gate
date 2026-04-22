import React, { useEffect, useMemo, useState } from "react";
import { api, fetchJson } from "../../api";
import { DateTimeField } from "./PickerField";

const DEFAULT_FORM = {
  name: "",
  organization_company: "",
  no_of_participants: "",
  contact: "",
  purpose: "",
  eta: "",
  status: "expected",
  notes: "",
};

const STATUS_OPTIONS = [
  { value: "expected", label: "Expected" },
  { value: "arrived", label: "Arrived" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...STATUS_OPTIONS,
];

const SORT_OPTIONS = [
  { value: "time_newest", label: "Time: Newest first" },
  { value: "time_oldest", label: "Time: Oldest first" },
  { value: "guest_az", label: "Guest: A to Z" },
  { value: "guest_za", label: "Guest: Z to A" },
];

const CONTACT_ALLOWED_PATTERN = /^[0-9+\-() ]*$/;

function getGuestStatusMeta(status, isArchived = false) {
  if (isArchived) {
    return { label: "Archived", background: "#e2e8f0", color: "#475569" };
  }
  if (status === "arrived") {
    return { label: "Arrived", background: "#dcfce7", color: "#166534" };
  }
  if (status === "completed") {
    return { label: "Completed", background: "#dbeafe", color: "#1d4ed8" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", background: "#fee2e2", color: "#991b1b" };
  }
  return { label: "Expected", background: "#fef3c7", color: "#92400e" };
}

function toOffsetIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const tzMinutes = -date.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzMinutes);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  return `${datePart}T${timePart}${sign}${hh}:${mm}`;
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatGuestDateParts(value) {
  if (!value) return { date: "-", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "-", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [manualActionId, setManualActionId] = useState("");
  const [qrBusyId, setQrBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("today");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("time_newest");
  const [actionMenuId, setActionMenuId] = useState(null);
  const [numericOnlyNotice, setNumericOnlyNotice] = useState({ contact: false, participants: false });

  const heading = useMemo(() => {
    if (filter === "all") return "All guest appointments";
    if (filter === "archived") return "Archived guest appointments";
    return "Guests scheduled for today";
  }, [filter]);

  const totalGuests = useMemo(() => guests.length, [guests]);
  const sortedGuests = useMemo(() => {
    const toTimestamp = (value) => {
      if (!value) return Number.NEGATIVE_INFINITY;
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    };

    const compareText = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });

    return [...guests].sort((a, b) => {
      if (sortOrder === "time_oldest") {
        const etaDiff = toTimestamp(a?.eta) - toTimestamp(b?.eta);
        if (etaDiff !== 0) return etaDiff;
        return (a?.id || 0) - (b?.id || 0);
      }
      if (sortOrder === "guest_az" || sortOrder === "guest_za") {
        const nameDiff = compareText(a?.name, b?.name);
        if (nameDiff !== 0) return sortOrder === "guest_az" ? nameDiff : -nameDiff;
      }
      const etaDiff = toTimestamp(b?.eta) - toTimestamp(a?.eta);
      if (etaDiff !== 0) return etaDiff;
      const createdDiff = toTimestamp(b?.created_at) - toTimestamp(a?.created_at);
      if (createdDiff !== 0) return createdDiff;
      return (b?.id || 0) - (a?.id || 0);
    });
  }, [guests, sortOrder]);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      setError("");
      const endpoint = filter === "today" ? "/common/guests/today/" : "/common/guests/";
      const params = {};
      if (filter === "all" && search.trim()) params.q = search.trim();
      if (filter === "all" && statusFilter) params.status = statusFilter;
      if (filter === "archived") params.archived_only = true;
      if (filter === "archived" && search.trim()) params.q = search.trim();
      const searchParams = new URLSearchParams(params).toString();
      const data = await fetchJson(`${endpoint}${searchParams ? `?${searchParams}` : ""}`);
      setGuests(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load guest appointments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, statusFilter]);

  useEffect(() => {
    if (!numericOnlyNotice.contact && !numericOnlyNotice.participants) return undefined;
    const timeout = window.setTimeout(() => {
      setNumericOnlyNotice({ contact: false, participants: false });
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [numericOnlyNotice]);

  const onChange = (e) => {
    const { name, value } = e.target;
    if (name === "contact") {
      if (!CONTACT_ALLOWED_PATTERN.test(value)) {
        setNumericOnlyNotice((prev) => ({ ...prev, contact: true }));
        return;
      }
      setNumericOnlyNotice((prev) => ({ ...prev, contact: false }));
      setForm((prev) => ({ ...prev, contact: value }));
      return;
    }
    if (name === "no_of_participants") {
      if (/\D/.test(value)) {
        setNumericOnlyNotice((prev) => ({ ...prev, participants: true }));
      } else {
        setNumericOnlyNotice((prev) => ({ ...prev, participants: false }));
      }
      setForm((prev) => ({ ...prev, no_of_participants: value.replace(/\D/g, "") }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const contact = form.contact.trim();
    const participantCount = Number(form.no_of_participants || 1);
    if (contact && !CONTACT_ALLOWED_PATTERN.test(contact)) {
      setError("Contact number can only contain numbers and phone symbols.");
      setSuccess("");
      return;
    }
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      setError("Number of participants must be at least 1.");
      setSuccess("");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        contact,
        no_of_participants: participantCount,
        eta: toOffsetIso(form.eta),
      };
      if (editingId) {
        await api.patch(`/common/guests/${editingId}/`, payload);
        setSuccess("Guest appointment updated.");
      } else {
        await api.post("/common/guests/", payload);
        setSuccess("Guest appointment created.");
      }
      resetForm();
      fetchGuests();
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.error || JSON.stringify(data) || "Failed to save guest appointment.");
    } finally {
      setSaving(false);
    }
  };

  const editGuest = (guest) => {
    if (guest.is_archived) return;
    setEditingId(guest.id);
    setForm({
      name: guest.name || "",
      organization_company: guest.organization_company || "",
      no_of_participants: guest.no_of_participants ? String(guest.no_of_participants) : "",
      contact: guest.contact || "",
      purpose: guest.purpose || "",
      eta: toLocalInputValue(guest.eta),
      status: guest.status || "expected",
      notes: guest.notes || "",
    });
    setSuccess("");
    setError("");
  };

  const removeGuest = async (guestId) => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/common/guests/${guestId}/`);
      if (editingId === guestId) resetForm();
      setSuccess("Guest appointment deleted.");
      fetchGuests();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to delete guest appointment.");
    }
  };

  const archiveGuest = async (guestId) => {
    setArchivingId(guestId);
    setError("");
    setSuccess("");
    try {
      await api.post(`/common/guests/${guestId}/archive/`);
      if (editingId === guestId) resetForm();
      setSuccess("Guest appointment archived.");
      fetchGuests();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to archive guest appointment.");
    } finally {
      setArchivingId(null);
    }
  };

  const unarchiveGuest = async (guestId) => {
    setArchivingId(guestId);
    setError("");
    setSuccess("");
    try {
      await api.post(`/common/guests/${guestId}/unarchive/`);
      setSuccess("Guest appointment restored.");
      fetchGuests();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to restore guest appointment.");
    } finally {
      setArchivingId(null);
    }
  };

  const updateGuestStatus = async (guestId, status) => {
    try {
      await api.patch(`/common/guests/${guestId}/`, { status });
      fetchGuests();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to update guest status.");
    }
  };

  const downloadGuestQr = async (guest) => {
    if (!guest?.qr_ready || !guest?.qr_payload) {
      setError("QR is only available for active guest appointments.");
      return;
    }
    setQrBusyId(String(guest.id));
    try {
      let QRModule;
      try {
        QRModule = await import("qrcode");
      } catch {
        QRModule = await import(/* @vite-ignore */ "qrcode");
      }
      const QRCode = QRModule.default || QRModule;
      const dataUrl = await QRCode.toDataURL(guest.qr_payload, { width: 360, margin: 1 });
      const link = document.createElement("a");
      const safeName = (guest.name || "guest").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      link.href = dataUrl;
      link.download = `${safeName || "guest"}-appointment-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess("Guest appointment QR downloaded.");
    } catch (e) {
      setError(e?.message || "Failed to generate guest QR.");
    } finally {
      setQrBusyId("");
    }
  };

  const manualScan = async (guestId, direction) => {
    setManualActionId(`${guestId}:${direction}`);
    setError("");
    setSuccess("");
    try {
      const res = await api.post(`/common/guests/${guestId}/manual-scan/`, { direction });
      setSuccess(res?.data?.message || (direction === "time_out" ? "Guest manually checked out." : "Guest manually checked in."));
      fetchGuests();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to record manual guest scan.");
    } finally {
      setManualActionId("");
    }
  };

  const renderGuestFormFields = (context = "create") => {
    const isInline = context === "inline";

    return (
      <>
        <input className="guest-form-input" name="name" placeholder="Guest Name" value={form.name} onChange={onChange} required />
        <input className="guest-form-input" name="organization_company" placeholder="Organization / Company" value={form.organization_company} onChange={onChange} />
        <div className="guest-input-shell">
          <input
            className="guest-form-input"
            name="contact"
            placeholder="Contact Number"
            value={form.contact}
            onChange={onChange}
            inputMode="tel"
            autoComplete="tel"
            pattern="[0-9+\-() ]*"
            title="Use numbers only. You may include +, spaces, hyphens, or parentheses."
          />
          {numericOnlyNotice.contact ? (
            <div className="guest-input-notice" role="alert">
              <span className="guest-input-notice-icon">!</span>
              <span>
                <strong>Unacceptable Character</strong>
                <span>You can only type a number here.</span>
              </span>
            </div>
          ) : null}
        </div>
        <input className="guest-form-input" name="purpose" placeholder="Purpose of Visit" value={form.purpose} onChange={onChange} required />
        <DateTimeField
          id={isInline ? `guest-eta-inline-${editingId}` : "guest-eta"}
          name="eta"
          label=""
          value={form.eta}
          onChange={onChange}
          required
          placeholder="Appointment Schedule"
          panelInFlow
          disablePastDates
        />
        <div className="guest-input-shell">
          <input
            className="guest-form-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            name="no_of_participants"
            placeholder="Number of Participants"
            value={form.no_of_participants}
            onChange={onChange}
            required
          />
          {numericOnlyNotice.participants ? (
            <div className="guest-input-notice" role="alert">
              <span className="guest-input-notice-icon">!</span>
              <span>
                <strong>Unacceptable Character</strong>
                <span>You can only type a number here.</span>
              </span>
            </div>
          ) : null}
        </div>
        <select className="guest-form-input" name="status" value={form.status} onChange={onChange}>
          {STATUS_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <textarea
          className="guest-form-input guest-form-textarea"
          name="notes"
          placeholder="Notes"
          value={form.notes}
          onChange={onChange}
          rows={3}
        />
      </>
    );
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Guest Appointment</h3>
          <div style={{ color: "#475569" }}>{heading}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ color: "#475569" }}>Total Guests: <b>{totalGuests}</b></div>
          <button onClick={() => setFilter("today")} className={`top-pill ${filter === "today" ? "active" : ""}`}>Today</button>
          <button onClick={() => setFilter("all")} className={`top-pill ${filter === "all" ? "active" : ""}`}>All</button>
          <button onClick={() => setFilter("archived")} className={`top-pill ${filter === "archived" ? "active" : ""}`}>Archived</button>
          <button onClick={fetchGuests}>Refresh</button>
        </div>
      </div>

      {filter !== "archived" && !editingId && (
      <div className="guest-form-card guest-form-shell" style={{ marginTop: 12, marginBottom: 12, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f8fafc" }}>
      <div className="guest-form-head">
        <div className="guest-form-title">Create Guest Appointment</div>
        <div className="guest-form-subtitle">Keep the guest record short, clear, and ready for gate processing.</div>
      </div>
      <form className="guest-form-grid" onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", columnGap: 20, rowGap: 16, alignItems: "start" }}>
        {renderGuestFormFields()}
        <div className="guest-form-actions" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-primary guest-form-submit" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add Appointment"}
          </button>
        </div>
      </form>
      </div>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb", maxWidth: 360, flex: "1 1 320px" }}>
            <input
              type="search"
              placeholder={filter === "archived" ? "Search archived guests..." : "Search guests, purpose, or notes..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchGuests();
                }
              }}
              disabled={filter === "today"}
              style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
            />
          </div>
          {filter === "all" && (
            <label className="guest-filter-field">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(filter === "all" || filter === "archived") && (
            <label className="guest-sort-field">
              <span>Sort by:</span>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                {SORT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {loading && <p style={{ color: "#475569" }}>Loading guest appointments...</p>}
      {error && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 8, marginTop: 8 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#f0fdf4", color: "#166534", padding: 12, borderRadius: 8, marginTop: 8 }}>
          {success}
        </div>
      )}

      {!loading && (
        <>
          {sortedGuests.length === 0 ? (
            <p style={{ color: "#475569" }}>No guest appointments found.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sortedGuests.map((g) => {
                const isMenuOpen = actionMenuId === g.id;
                const appointmentParts = formatGuestDateParts(g.eta);
                const checkInParts = formatGuestDateParts(g.checked_in_at);
                const checkOutParts = formatGuestDateParts(g.checked_out_at);

                return (
                <div
                  className={`admin-guest-row guest-detail-card ${editingId === g.id ? "editing" : ""}`}
                  key={g.id}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 10, alignItems: "start" }}
                >
                  <div className="guest-record-header">
                    <div className="guest-record-identity">
                      <div className="guest-record-avatar">G</div>
                      <div className="guest-record-name-block">
                        <div className="guest-record-title-line">
                          <div className="guest-record-name">{editingId === g.id ? form.name || g.name : g.name}</div>
                        </div>
                        <div className="guest-record-contact">
                          {editingId === g.id ? form.contact || "No contact number" : g.contact || "No contact number"}
                        </div>
                      </div>
                    </div>
                    <div className="guest-record-controls">
                      <div className="guest-record-status-slot">
                        <span
                          className="guest-status-badge"
                          style={{
                            background: getGuestStatusMeta(editingId === g.id ? form.status : g.status, g.is_archived).background,
                            color: getGuestStatusMeta(editingId === g.id ? form.status : g.status, g.is_archived).color,
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {getGuestStatusMeta(editingId === g.id ? form.status : g.status, g.is_archived).label}
                        </span>
                      </div>
                      {editingId !== g.id && (
                        <div className="admin-guest-actions guest-detail-actions">
                          <div className="guest-action-group guest-action-primary">
                            {!g.is_archived && <button className="btn-primary" onClick={() => editGuest(g)} title="Edit">Edit</button>}
                            {!g.is_archived && !g.checked_in_at && (
                              <button className="btn-primary" onClick={() => manualScan(g.id, "time_in")} disabled={manualActionId === `${g.id}:time_in`}>
                                {manualActionId === `${g.id}:time_in` ? "Checking In..." : "Manual Check In"}
                              </button>
                            )}
                            {!g.is_archived && g.checked_in_at && !g.checked_out_at && (
                              <button className="btn-primary" onClick={() => manualScan(g.id, "time_out")} disabled={manualActionId === `${g.id}:time_out`}>
                                {manualActionId === `${g.id}:time_out` ? "Checking Out..." : "Manual Check Out"}
                              </button>
                            )}
                          </div>
                          <div className="resident-menu-wrap guest-menu-wrap">
                            <button
                              className="resident-action-button resident-action-neutral resident-more-button"
                              type="button"
                              aria-label="More guest appointment actions"
                              aria-expanded={isMenuOpen}
                              onClick={() => setActionMenuId(isMenuOpen ? null : g.id)}
                            >
                              ...
                            </button>
                            {isMenuOpen ? (
                              <div className="resident-action-menu guest-action-menu">
                                {!g.is_archived && (
                                  <button
                                    className="resident-action-button resident-action-neutral"
                                    onClick={() => { setActionMenuId(null); downloadGuestQr(g); }}
                                    disabled={!g.qr_ready || qrBusyId === String(g.id)}
                                  >
                                    {qrBusyId === String(g.id) ? "Preparing QR..." : "Download QR"}
                                  </button>
                                )}
                                {!g.is_archived && g.status !== "cancelled" && (
                                  <button
                                    className="resident-action-button resident-action-neutral"
                                    onClick={() => { setActionMenuId(null); updateGuestStatus(g.id, "cancelled"); }}
                                  >
                                    Cancel Visit
                                  </button>
                                )}
                                {!g.is_archived && (
                                  <button
                                    className="resident-action-button resident-action-neutral"
                                    onClick={() => { setActionMenuId(null); archiveGuest(g.id); }}
                                    disabled={archivingId === g.id}
                                  >
                                    {archivingId === g.id ? "Archiving..." : "Archive"}
                                  </button>
                                )}
                                {g.is_archived && (
                                  <button
                                    className="resident-action-button resident-action-success"
                                    onClick={() => { setActionMenuId(null); unarchiveGuest(g.id); }}
                                    disabled={archivingId === g.id}
                                  >
                                    {archivingId === g.id ? "Restoring..." : "Unarchive"}
                                  </button>
                                )}
                                <button
                                  className="resident-action-button resident-action-danger"
                                  onClick={() => { setActionMenuId(null); removeGuest(g.id); }}
                                  title="Delete"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                      {editingId === g.id ? (
                        <form className="guest-detail-section guest-inline-form" onSubmit={submit}>
                          <div className="guest-detail-section-title">Edit Appointment</div>
                          <div className="guest-form-grid guest-inline-grid">
                            {renderGuestFormFields("inline")}
                          </div>
                          <div className="guest-inline-actions">
                            <button className="btn-primary guest-form-submit" type="submit" disabled={saving}>
                              {saving ? "Saving..." : "Update Appointment"}
                            </button>
                            <button className="guest-form-cancel" type="button" onClick={resetForm}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="guest-detail-section">
                          <div className="guest-detail-section-title">Visit Details</div>
                          <div className="guest-detail-grid guest-detail-grid-compact">
                            <Info label="Purpose" value={g.purpose || "-"} />
                            <Info label="Organization" value={g.organization_company || "-"} />
                            <Info label="Appointment" value={appointmentParts.date} subvalue={appointmentParts.time} />
                            <Info label="Participants" value={g.no_of_participants ?? 1} />
                            <Info label="Check In" value={checkInParts.date} subvalue={checkInParts.time} />
                            <Info label="Check Out" value={checkOutParts.date} subvalue={checkOutParts.time} />
                            <Info label="QR Access" value={g.qr_ready ? "Ready" : "Unavailable"} />
                            <Info label="Status" value={getGuestStatusMeta(g.status, g.is_archived).label} />
                          </div>
                          <div className="guest-detail-notes">
                            <div className="guest-detail-section-title">Notes</div>
                            <div className="guest-detail-notes-body">{g.notes || "No notes added"}</div>
                          </div>
                        </div>
                      )}
                      {g.is_archived && (
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
                          Archived {g.archived_at ? new Date(g.archived_at).toLocaleString() : ""}
                        </div>
                      )}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Info({ label, value, subvalue = "" }) {
  return (
    <div className="guest-info-item">
      <div className="guest-info-label">{label}</div>
      <div className="guest-info-value">{value}</div>
      {subvalue ? <div className="guest-info-subvalue">{subvalue}</div> : null}
    </div>
  );
}
