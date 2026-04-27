import { useEffect, useMemo, useState } from "react";

import { api, fetchJson } from "../../api";
import { DateTimeField } from "./PickerField";

const DEFAULT_GUEST_FORM = {
  name: "",
  organization_company: "",
  no_of_participants: "",
  contact: "",
  purpose: "",
  eta: "",
  status: "expected",
  notes: "",
};

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "expected", label: "Expected" },
  { value: "approved", label: "Approved" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const GUEST_STATUS_OPTIONS = [
  { value: "expected", label: "Expected" },
  { value: "arrived", label: "Arrived" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const CONTACT_ALLOWED_PATTERN = /^[0-9+\-() ]*$/;

function toOffsetIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const tzMinutes = -date.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzMinutes);
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  return `${datePart}T${timePart}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateParts(value) {
  if (!value) return { date: "-", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "-", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function getAppointmentStatusMeta(item) {
  if (item.isArchived) return { key: "archived", label: "Archived", background: "#e2e8f0", color: "#475569" };
  if (item.raw.status === "cancelled") return { key: "cancelled", label: "Cancelled", background: "#fee2e2", color: "#991b1b" };
  if (item.raw.status === "expected") return { key: "expected", label: "Expected", background: "#fef3c7", color: "#92400e" };
  return { key: "approved", label: "Approved", background: "#dcfce7", color: "#166534" };
}

function getGateStatusMeta(status) {
  if (status === "arrived") return "Arrived";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Expected";
}

function getApiErrorMessage(error, fallback = "Failed to save appointment.") {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === "string") return data;
  if (data.error) return Array.isArray(data.error) ? data.error.join(" ") : data.error;
  if (data.detail) return Array.isArray(data.detail) ? data.detail.join(" ") : data.detail;

  const messages = Object.entries(data)
    .flatMap(([field, value]) => {
      const text = Array.isArray(value) ? value.join(" ") : String(value || "");
      if (!text) return [];
      if (field === "eta") return `Please choose a valid appointment schedule.`;
      if (field === "no_of_participants") return `Number of participants: ${text}`;
      return `${field.replaceAll("_", " ")}: ${text}`;
    });

  return messages[0] || fallback;
}

function matchesSearch(item, search) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    item.title,
    item.contact,
    item.purpose,
    item.organization,
    item.notes,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function sortAppointments(a, b) {
  const aTime = new Date(a.schedule).getTime();
  const bTime = new Date(b.schedule).getTime();
  const normalizedA = Number.isNaN(aTime) ? 0 : aTime;
  const normalizedB = Number.isNaN(bTime) ? 0 : bTime;
  if (normalizedA !== normalizedB) return normalizedB - normalizedA;
  return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: "base" });
}

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [manualActionId, setManualActionId] = useState("");
  const [qrBusyId, setQrBusyId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [guestForm, setGuestForm] = useState(DEFAULT_GUEST_FORM);
  const [modal, setModal] = useState({ open: false, mode: "create", type: "guest", item: null });
  const [actionMenuId, setActionMenuId] = useState(null);
  const [numericOnlyNotice, setNumericOnlyNotice] = useState({ contact: false, participants: false });

  const fetchAppointments = async () => {
    setLoading(true);
    setError("");
    try {
      const guestData = await fetchJson("/common/guests/?include_archived=true");
      setGuests(Array.isArray(guestData) ? guestData : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  useEffect(() => {
    if (!numericOnlyNotice.contact && !numericOnlyNotice.participants) return undefined;
    const timeout = window.setTimeout(() => {
      setNumericOnlyNotice({ contact: false, participants: false });
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [numericOnlyNotice]);

  const unifiedAppointments = useMemo(() => {
    return guests.map((guest) => ({
      key: `guest-${guest.id}`,
      id: guest.id,
      type: "guest",
      title: guest.name || "Guest",
      contact: guest.contact || "No contact number",
      organization: guest.organization_company || "",
      purpose: guest.purpose || "",
      schedule: guest.eta,
      notes: guest.notes || "",
      isArchived: Boolean(guest.is_archived || guest.archived_at),
      raw: guest,
    })).sort(sortAppointments);
  }, [guests]);

  const counts = useMemo(() => {
    return unifiedAppointments.reduce(
      (acc, item) => {
        const meta = getAppointmentStatusMeta(item);
        acc.all += item.isArchived ? 0 : 1;
        acc[meta.key] = (acc[meta.key] || 0) + 1;
        return acc;
      },
      { all: 0, expected: 0, approved: 0, cancelled: 0, archived: 0 },
    );
  }, [unifiedAppointments]);

  const visibleAppointments = useMemo(() => {
    return unifiedAppointments
      .filter((item) => {
        const meta = getAppointmentStatusMeta(item);
        if (filter === "all") return !item.isArchived;
        return meta.key === filter;
      })
      .filter((item) => matchesSearch(item, search));
  }, [filter, search, unifiedAppointments]);

  const openCreateModal = () => {
    setGuestForm(DEFAULT_GUEST_FORM);
    setModal({ open: true, mode: "create", type: "guest", item: null });
    setError("");
    setSuccess("");
  };

  const openGuestEditModal = (guest) => {
    if (guest.is_archived || guest.archived_at) return;
    setGuestForm({
      name: guest.name || "",
      organization_company: guest.organization_company || "",
      no_of_participants: guest.no_of_participants ? String(guest.no_of_participants) : "",
      contact: guest.contact || "",
      purpose: guest.purpose || "",
      eta: toLocalInputValue(guest.eta),
      status: guest.status || "expected",
      notes: guest.notes || "",
    });
    setModal({ open: true, mode: "edit", type: "guest", item: guest });
    setError("");
    setSuccess("");
  };

  const closeModal = (force = false) => {
    if (saving && !force) return;
    setModal({ open: false, mode: "create", type: "guest", item: null });
    setGuestForm(DEFAULT_GUEST_FORM);
  };

  const onGuestChange = (e) => {
    const { name, value } = e.target;
    if (name === "contact") {
      if (!CONTACT_ALLOWED_PATTERN.test(value)) {
        setNumericOnlyNotice((prev) => ({ ...prev, contact: true }));
        return;
      }
      setNumericOnlyNotice((prev) => ({ ...prev, contact: false }));
      setGuestForm((prev) => ({ ...prev, contact: value }));
      return;
    }
    if (name === "no_of_participants") {
      if (/\D/.test(value)) setNumericOnlyNotice((prev) => ({ ...prev, participants: true }));
      setGuestForm((prev) => ({ ...prev, no_of_participants: value.replace(/\D/g, "") }));
      return;
    }
    setGuestForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitGuest = async () => {
    const contact = guestForm.contact.trim();
    const participantCount = Number(guestForm.no_of_participants || 1);
    if (contact && !CONTACT_ALLOWED_PATTERN.test(contact)) {
      throw new Error("Contact number can only contain numbers and phone symbols.");
    }
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      throw new Error("Number of participants must be at least 1.");
    }
    const appointmentSchedule = toOffsetIso(guestForm.eta);
    if (!appointmentSchedule) {
      throw new Error("Please choose a valid appointment schedule.");
    }

    const payload = {
      ...guestForm,
      contact,
      no_of_participants: participantCount,
      eta: appointmentSchedule,
    };

    if (modal.mode === "edit" && modal.item?.id) {
      await api.patch(`/common/guests/${modal.item.id}/`, payload);
      setSuccess("Guest appointment updated.");
    } else {
      await api.post("/common/guests/", payload);
      setSuccess("Guest appointment created.");
    }
  };

  const submitModal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await submitGuest();
      closeModal(true);
      await fetchAppointments();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const removeGuest = async (guestId) => {
    setError("");
    setSuccess("");
    try {
      await api.delete(`/common/guests/${guestId}/`);
      setSuccess("Guest appointment deleted.");
      fetchAppointments();
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
      setSuccess("Guest appointment archived.");
      fetchAppointments();
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
      fetchAppointments();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to restore guest appointment.");
    } finally {
      setArchivingId(null);
    }
  };

  const updateGuestStatus = async (guestId, status) => {
    setError("");
    setSuccess("");
    try {
      await api.patch(`/common/guests/${guestId}/`, { status });
      setSuccess(status === "cancelled" ? "Guest appointment cancelled." : "Guest appointment updated.");
      fetchAppointments();
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
    setError("");
    try {
      const QRModule = await import("qrcode");
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
      fetchAppointments();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to record manual guest scan.");
    } finally {
      setManualActionId("");
    }
  };

  const renderGuestFields = () => (
    <>
      <input className="guest-form-input" name="name" placeholder="Guest name" value={guestForm.name} onChange={onGuestChange} required />
      <input className="guest-form-input" name="organization_company" placeholder="Organization / Company" value={guestForm.organization_company} onChange={onGuestChange} />
      <div className="guest-input-shell">
        <input className="guest-form-input" name="contact" placeholder="Contact number" value={guestForm.contact} onChange={onGuestChange} inputMode="tel" />
        {numericOnlyNotice.contact ? <InputNotice text="You can only type a number here." /> : null}
      </div>
      <input className="guest-form-input" name="purpose" placeholder="Purpose of visit" value={guestForm.purpose} onChange={onGuestChange} required />
      <DateTimeField id="appointment-guest-eta" name="eta" label="" value={guestForm.eta} onChange={onGuestChange} required placeholder="Appointment schedule" panelInFlow disablePastDates />
      <div className="guest-input-shell">
        <input className="guest-form-input" name="no_of_participants" placeholder="No. of participants" value={guestForm.no_of_participants} onChange={onGuestChange} inputMode="numeric" />
        {numericOnlyNotice.participants ? <InputNotice text="Participants must be numeric." /> : null}
      </div>
      <select className="guest-form-input" name="status" value={guestForm.status} onChange={onGuestChange}>
        {GUEST_STATUS_OPTIONS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
      <textarea className="guest-form-input guest-form-textarea" name="notes" placeholder="Internal notes" value={guestForm.notes} onChange={onGuestChange} />
    </>
  );

  const modalTitle = modal.mode === "edit"
    ? "Edit Guest Appointment"
    : "Create Guest Appointment";

  return (
    <div className="guest-card-shell">
      <div className="guest-card-panel appointment-module">
        <div className="guest-card-head appointment-module-head">
          <div>
            <h3 style={{ margin: 0 }}>Appointments</h3>
            <div style={{ color: "#4f6b5d", marginTop: 4 }}>Guest visits and appointment schedules</div>
          </div>
          <button className="btn-primary" type="button" onClick={openCreateModal}>Create Appointment</button>
        </div>

        <div className="appointment-toolbar">
          <div className="appointment-tabs" role="tablist" aria-label="Appointment filters">
            {FILTER_TABS.map((tab) => (
              <button key={tab.value} type="button" className={`top-pill ${filter === tab.value ? "active" : ""}`} onClick={() => setFilter(tab.value)}>
                {tab.label} <span className="appointment-tab-count">{counts[tab.value] || 0}</span>
              </button>
            ))}
          </div>
          <div className="appointment-search">
            <input
              type="search"
              placeholder="Search appointments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && !modal.open ? <div className="appointment-alert appointment-alert-error">{error}</div> : null}
        {success ? <div className="appointment-alert appointment-alert-success">{success}</div> : null}
        {loading ? <p style={{ color: "#475569" }}>Loading appointments...</p> : null}

        {!loading && visibleAppointments.length === 0 ? (
          <p style={{ color: "#475569" }}>No appointments found.</p>
        ) : null}

        {!loading && visibleAppointments.length > 0 ? (
          <div className="appointment-list">
            {visibleAppointments.map((item) => (
              <AppointmentRow
                key={item.key}
                item={item}
                actionMenuId={actionMenuId}
                setActionMenuId={setActionMenuId}
                archivingId={archivingId}
                manualActionId={manualActionId}
                qrBusyId={qrBusyId}
                onEditGuest={openGuestEditModal}
                onManualScan={manualScan}
                onDownloadQr={downloadGuestQr}
                onArchiveGuest={archiveGuest}
                onUnarchiveGuest={unarchiveGuest}
                onCancelGuest={(guestId) => updateGuestStatus(guestId, "cancelled")}
                onRemoveGuest={removeGuest}
              />
            ))}
          </div>
        ) : null}
      </div>

      {modal.open ? (
        <div className="appointment-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className={`appointment-modal-panel ${error ? "has-error" : ""}`} role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
            <div className="appointment-modal-head">
              <div>
                <div className="appointment-modal-eyebrow">Guest</div>
                <h3 id="appointment-modal-title">{modalTitle}</h3>
              </div>
              <button type="button" className="appointment-modal-close" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {error ? <div className="appointment-alert appointment-alert-error appointment-modal-error" role="alert">{error}</div> : null}

            <form className="guest-form-grid appointment-modal-form" onSubmit={submitModal}>
              {renderGuestFields()}
              <div className="guest-form-actions">
                <button className="guest-form-cancel" type="button" onClick={closeModal}>Cancel</button>
                <button className="btn-primary guest-form-submit" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppointmentRow({
  item,
  actionMenuId,
  setActionMenuId,
  archivingId,
  manualActionId,
  qrBusyId,
  onEditGuest,
  onManualScan,
  onDownloadQr,
  onArchiveGuest,
  onUnarchiveGuest,
  onCancelGuest,
  onRemoveGuest,
}) {
  const statusMeta = getAppointmentStatusMeta(item);
  const schedule = formatDateParts(item.schedule);
  const checkIn = formatDateParts(item.raw.checked_in_at);
  const checkOut = formatDateParts(item.raw.checked_out_at);
  const isMenuOpen = actionMenuId === item.key;
  const guest = item.raw;

  return (
    <div className="admin-guest-row guest-detail-card appointment-row">
      <div className="guest-record-header">
        <div className="guest-record-identity">
          <div className="guest-record-avatar">G</div>
          <div className="guest-record-name-block">
            <div className="guest-record-title-line">
              <div className="guest-record-name">{item.title}</div>
            </div>
            <div className="guest-record-contact">{item.contact}</div>
          </div>
        </div>
        <div className="guest-record-controls appointment-row-controls">
          <StatusPill meta={statusMeta} />
          <GuestActions
            guest={guest}
            itemKey={item.key}
            isMenuOpen={isMenuOpen}
            setActionMenuId={setActionMenuId}
            archivingId={archivingId}
            manualActionId={manualActionId}
            qrBusyId={qrBusyId}
            onEditGuest={onEditGuest}
            onManualScan={onManualScan}
            onDownloadQr={onDownloadQr}
            onArchiveGuest={onArchiveGuest}
            onUnarchiveGuest={onUnarchiveGuest}
            onCancelGuest={onCancelGuest}
            onRemoveGuest={onRemoveGuest}
          />
        </div>
      </div>

      <div className="guest-detail-section">
        <div className="guest-detail-section-title">Appointment Details</div>
        <div className="guest-detail-grid guest-detail-grid-compact">
          <Info label="Type" value="Guest" />
          <Info label="Purpose" value={item.purpose || "-"} />
          <Info label="Schedule" value={schedule.date} subvalue={schedule.time} />
          <Info label="Organization" value={item.organization || "-"} />
          <Info label="Participants" value={guest.no_of_participants ?? 1} />
          <Info label="Gate Status" value={getGateStatusMeta(guest.status)} />
          <Info label="Check In" value={checkIn.date} subvalue={checkIn.time} />
          <Info label="Check Out" value={checkOut.date} subvalue={checkOut.time} />
        </div>
        <div className="guest-detail-notes">
          <div className="guest-detail-section-title">Notes</div>
          <div className="guest-detail-notes-body">{guest.notes || "No notes added"}</div>
        </div>
        {item.isArchived ? (
          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
            Archived {guest.archived_at ? new Date(guest.archived_at).toLocaleString() : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GuestActions({
  guest,
  itemKey,
  isMenuOpen,
  setActionMenuId,
  archivingId,
  manualActionId,
  qrBusyId,
  onEditGuest,
  onManualScan,
  onDownloadQr,
  onArchiveGuest,
  onUnarchiveGuest,
  onCancelGuest,
  onRemoveGuest,
}) {
  const isArchived = Boolean(guest.is_archived || guest.archived_at);
  const isCompleted = guest.status === "completed" || Boolean(guest.checked_out_at);
  return (
    <div className="admin-guest-actions guest-detail-actions">
      <div className="guest-action-group guest-action-primary">
        {!isArchived && !isCompleted ? <button className="btn-primary" type="button" onClick={() => onEditGuest(guest)}>Edit</button> : null}
        {!isArchived && !guest.checked_in_at ? (
          <button className="btn-primary" type="button" onClick={() => onManualScan(guest.id, "time_in")} disabled={manualActionId === `${guest.id}:time_in`}>
            {manualActionId === `${guest.id}:time_in` ? "Checking In..." : "Manual Check In"}
          </button>
        ) : null}
        {!isArchived && guest.checked_in_at && !guest.checked_out_at ? (
          <button className="btn-primary" type="button" onClick={() => onManualScan(guest.id, "time_out")} disabled={manualActionId === `${guest.id}:time_out`}>
            {manualActionId === `${guest.id}:time_out` ? "Checking Out..." : "Manual Check Out"}
          </button>
        ) : null}
      </div>
      <div className="resident-menu-wrap guest-menu-wrap">
        <button className="resident-action-button resident-action-neutral resident-more-button" type="button" aria-label="More guest appointment actions" aria-expanded={isMenuOpen} onClick={() => setActionMenuId(isMenuOpen ? null : itemKey)}>
          ...
        </button>
        {isMenuOpen ? (
          <div className="resident-action-menu guest-action-menu">
            {!isArchived ? (
              <button className="resident-action-button resident-action-neutral" type="button" onClick={() => { setActionMenuId(null); onDownloadQr(guest); }} disabled={!guest.qr_ready || qrBusyId === String(guest.id)}>
                {qrBusyId === String(guest.id) ? "Preparing QR..." : "Download QR"}
              </button>
            ) : null}
            {!isArchived && guest.status !== "cancelled" ? (
              <button className="resident-action-button resident-action-neutral" type="button" onClick={() => { setActionMenuId(null); onCancelGuest(guest.id); }}>
                Cancel Visit
              </button>
            ) : null}
            {!isArchived ? (
              <button className="resident-action-button resident-action-neutral" type="button" onClick={() => { setActionMenuId(null); onArchiveGuest(guest.id); }} disabled={archivingId === guest.id}>
                {archivingId === guest.id ? "Archiving..." : "Archive"}
              </button>
            ) : (
              <button className="resident-action-button resident-action-success" type="button" onClick={() => { setActionMenuId(null); onUnarchiveGuest(guest.id); }} disabled={archivingId === guest.id}>
                {archivingId === guest.id ? "Restoring..." : "Unarchive"}
              </button>
            )}
            <button className="resident-action-button resident-action-danger" type="button" onClick={() => { setActionMenuId(null); onRemoveGuest(guest.id); }}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ meta }) {
  return (
    <span className="guest-status-badge" style={{ background: meta.background, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function InputNotice({ text }) {
  return (
    <div className="guest-input-notice" role="alert">
      <span className="guest-input-notice-icon">!</span>
      <span>
        <strong>Unacceptable Character</strong>
        <span>{text}</span>
      </span>
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
