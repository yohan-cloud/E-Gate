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

const DEFAULT_RESIDENT_FORM = {
  resident: "",
  purpose: "",
  appointment_at: "",
  status: "approved",
  admin_note: "",
};

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const APPOINTMENT_TYPES = [
  { value: "guest", label: "Guest" },
  { value: "resident", label: "Resident" },
];

const GUEST_STATUS_OPTIONS = [
  { value: "expected", label: "Expected" },
  { value: "arrived", label: "Arrived" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const RESIDENT_REVIEW_STATUS_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
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
  if (item.type === "guest") {
    if (item.raw.status === "cancelled") return { key: "rejected", label: "Cancelled", background: "#fee2e2", color: "#991b1b" };
    return { key: "approved", label: "Approved", background: "#dcfce7", color: "#166534" };
  }
  if (item.raw.status === "approved") return { key: "approved", label: "Approved", background: "#dcfce7", color: "#166534" };
  if (item.raw.status === "rejected") return { key: "rejected", label: "Rejected", background: "#fee2e2", color: "#991b1b" };
  if (item.raw.status === "cancelled") return { key: "rejected", label: "Cancelled", background: "#f1f5f9", color: "#475569" };
  return { key: "pending", label: "Pending", background: "#fef3c7", color: "#92400e" };
}

function getGateStatusMeta(status) {
  if (status === "arrived") return "Arrived";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Expected";
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
    item.raw.resident_note,
    item.raw.admin_note,
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
  const [residentAppointments, setResidentAppointments] = useState([]);
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [manualActionId, setManualActionId] = useState("");
  const [qrBusyId, setQrBusyId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [residentQuery, setResidentQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [guestForm, setGuestForm] = useState(DEFAULT_GUEST_FORM);
  const [residentForm, setResidentForm] = useState(DEFAULT_RESIDENT_FORM);
  const [modal, setModal] = useState({ open: false, mode: "create", type: "guest", item: null });
  const [residentReviewAction, setResidentReviewAction] = useState("review");
  const [actionMenuId, setActionMenuId] = useState(null);
  const [numericOnlyNotice, setNumericOnlyNotice] = useState({ contact: false, participants: false });

  const fetchAppointments = async () => {
    setLoading(true);
    setError("");
    try {
      const [guestData, residentRes] = await Promise.all([
        fetchJson("/common/guests/?include_archived=true"),
        api.get("/common/resident-appointments/"),
      ]);
      setGuests(Array.isArray(guestData) ? guestData : []);
      setResidentAppointments(Array.isArray(residentRes?.data) ? residentRes.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  };

  const fetchResidents = async () => {
    try {
      const params = {};
      if (residentQuery.trim()) params.q = residentQuery.trim();
      const res = await api.get("/residents/list/", { params });
      setResidents(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setResidents([]);
    }
  };

  useEffect(() => {
    fetchAppointments();
    fetchResidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(fetchResidents, 250);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentQuery]);

  useEffect(() => {
    if (!numericOnlyNotice.contact && !numericOnlyNotice.participants) return undefined;
    const timeout = window.setTimeout(() => {
      setNumericOnlyNotice({ contact: false, participants: false });
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [numericOnlyNotice]);

  const residentOptions = residents
    .map((profile) => {
      const user = profile?.user || {};
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
      return {
        id: user.id,
        label: fullName || user.username || `Resident #${user.id}`,
        detail: profile.phone_number || user.username || "",
      };
    })
    .filter((item) => item.id);

  const unifiedAppointments = useMemo(() => {
    const guestItems = guests.map((guest) => ({
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
    }));

    const residentItems = residentAppointments.map((appointment) => ({
      key: `resident-${appointment.id}`,
      id: appointment.id,
      type: "resident",
      title: appointment.resident_name || appointment.resident_username || "Resident",
      contact: appointment.resident_contact || appointment.resident_username || "No contact number",
      organization: "Resident request",
      purpose: appointment.purpose || "",
      schedule: appointment.appointment_at,
      notes: appointment.resident_note || "",
      isArchived: false,
      raw: appointment,
    }));

    return [...guestItems, ...residentItems].sort(sortAppointments);
  }, [guests, residentAppointments]);

  const counts = useMemo(() => {
    return unifiedAppointments.reduce(
      (acc, item) => {
        const meta = getAppointmentStatusMeta(item);
        acc.all += item.isArchived ? 0 : 1;
        acc[meta.key] = (acc[meta.key] || 0) + 1;
        return acc;
      },
      { all: 0, pending: 0, approved: 0, rejected: 0, archived: 0 },
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

  const openCreateModal = (type = "guest") => {
    setGuestForm(DEFAULT_GUEST_FORM);
    setResidentForm(DEFAULT_RESIDENT_FORM);
    setModal({ open: true, mode: "create", type, item: null });
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

  const openResidentReviewModal = (appointment, nextStatus = appointment.status || "approved") => {
    const normalizedStatus = nextStatus === "rejected" ? "rejected" : "approved";
    setResidentForm({
      resident: appointment.resident ? String(appointment.resident) : "",
      purpose: appointment.purpose || "",
      appointment_at: toLocalInputValue(appointment.appointment_at),
      status: normalizedStatus,
      admin_note: "",
    });
    setResidentReviewAction("review");
    setModal({ open: true, mode: "review", type: "resident", item: appointment });
    setError("");
    setSuccess("");
  };

  const startResidentReschedule = () => {
    setResidentReviewAction("reschedule");
    setResidentForm((prev) => ({ ...prev, status: "rescheduled" }));
  };

  const closeModal = (force = false) => {
    if (saving && !force) return;
    setModal({ open: false, mode: "create", type: "guest", item: null });
    setGuestForm(DEFAULT_GUEST_FORM);
    setResidentForm(DEFAULT_RESIDENT_FORM);
    setResidentReviewAction("review");
  };

  const setModalType = (type) => {
    if (modal.mode !== "create") return;
    setModal((current) => ({ ...current, type }));
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
      setError("Contact number can only contain numbers and phone symbols.");
      return;
    }
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      setError("Number of participants must be at least 1.");
      return;
    }

    const payload = {
      ...guestForm,
      contact,
      no_of_participants: participantCount,
      eta: toOffsetIso(guestForm.eta),
    };

    if (modal.mode === "edit" && modal.item?.id) {
      await api.patch(`/common/guests/${modal.item.id}/`, payload);
      setSuccess("Guest appointment updated.");
    } else {
      await api.post("/common/guests/", payload);
      setSuccess("Guest appointment created.");
    }
  };

  const submitResident = async () => {
    const adminNote = residentForm.admin_note.trim();

    if (modal.mode === "review" && modal.item?.id) {
      if (!adminNote) {
        throw new Error(residentReviewAction === "reschedule" ? "Admin note is required when rescheduling." : "Admin note is required when reviewing.");
      }
      const payload = {
        status: residentReviewAction === "reschedule" ? "rescheduled" : residentForm.status,
        admin_note: adminNote,
      };
      if (residentReviewAction === "reschedule") {
        payload.appointment_at = toOffsetIso(residentForm.appointment_at);
      }
      await api.patch(`/common/resident-appointments/${modal.item.id}/`, payload);
      setSuccess("Resident appointment review saved.");
      return;
    }

    const payload = {
      purpose: residentForm.purpose.trim(),
      appointment_at: toOffsetIso(residentForm.appointment_at),
      admin_note: adminNote,
    };

    if (!residentForm.resident) {
      throw new Error("Select a resident first.");
    }
    await api.post("/common/resident-appointments/", {
      ...payload,
      resident: residentForm.resident,
    });
    setSuccess("Resident appointment created and approved.");
  };

  const submitModal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (modal.type === "guest") {
        await submitGuest();
      } else {
        await submitResident();
      }
      closeModal(true);
      await fetchAppointments();
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.error || data?.detail || JSON.stringify(data) || e?.message || "Failed to save appointment.");
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

  const renderResidentFields = () => {
    const isReview = modal.mode === "review";
    const isRescheduling = isReview && residentReviewAction === "reschedule";
    const scheduleDisplay = modal.item?.appointment_at ? formatDateParts(modal.item.appointment_at) : null;
    return (
      <>
        {isReview ? (
          <input className="guest-form-input" value={modal.item?.resident_name || modal.item?.resident_username || "Resident"} disabled />
        ) : (
          <>
            <input className="guest-form-input" placeholder="Search resident..." value={residentQuery} onChange={(e) => setResidentQuery(e.target.value)} />
            <select className="guest-form-input" value={residentForm.resident} onChange={(e) => setResidentForm((prev) => ({ ...prev, resident: e.target.value }))} required>
              <option value="">Select resident</option>
              {residentOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}{item.detail ? ` - ${item.detail}` : ""}</option>
              ))}
            </select>
          </>
        )}
        <input className="guest-form-input" placeholder="Purpose" value={residentForm.purpose} onChange={(e) => setResidentForm((prev) => ({ ...prev, purpose: e.target.value }))} required disabled={isReview} />
        {isReview && !isRescheduling ? (
          <input className="guest-form-input" value={scheduleDisplay ? `${scheduleDisplay.date} ${scheduleDisplay.time}` : "No schedule"} disabled />
        ) : (
          <DateTimeField
            id={isReview ? "appointment-resident-review-at" : "appointment-resident-create-at"}
            name="appointment_at"
            label=""
            value={residentForm.appointment_at}
            onChange={(e) => setResidentForm((prev) => ({ ...prev, appointment_at: e.target.value }))}
            required
            placeholder="Appointment schedule"
            panelInFlow
            disablePastDates
          />
        )}
        {isReview ? (
          <select className="guest-form-input" value={residentForm.status} onChange={(e) => setResidentForm((prev) => ({ ...prev, status: e.target.value }))} disabled={isRescheduling}>
            {RESIDENT_REVIEW_STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        ) : null}
        {isReview ? (
          <div className="appointment-review-mode">
            <button type="button" className={residentReviewAction === "review" ? "active" : ""} onClick={() => { setResidentReviewAction("review"); setResidentForm((prev) => ({ ...prev, status: prev.status === "rejected" ? "rejected" : "approved", appointment_at: toLocalInputValue(modal.item?.appointment_at) })); }}>
              Review
            </button>
            <button type="button" className={isRescheduling ? "active" : ""} onClick={startResidentReschedule}>
              Reschedule
            </button>
          </div>
        ) : null}
        <textarea
          className="guest-form-input guest-form-textarea"
          placeholder={isRescheduling ? "Admin note is required when rescheduling" : isReview ? "Admin note is required for approval or rejection" : "Admin note"}
          value={residentForm.admin_note}
          onChange={(e) => setResidentForm((prev) => ({ ...prev, admin_note: e.target.value }))}
          required={isReview}
        />
      </>
    );
  };

  const modalTitle = modal.mode === "edit"
    ? "Edit Guest Appointment"
    : modal.mode === "review"
      ? "Review Resident Appointment"
      : "Create Appointment";

  return (
    <div className="guest-card-shell">
      <div className="guest-card-panel appointment-module">
        <div className="guest-card-head appointment-module-head">
          <div>
            <h3 style={{ margin: 0 }}>Appointments</h3>
            <div style={{ color: "#4f6b5d", marginTop: 4 }}>Guest visits and resident requests in one queue</div>
          </div>
          <button className="btn-primary" type="button" onClick={() => openCreateModal("guest")}>Create Appointment</button>
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

        {error ? <div className="appointment-alert appointment-alert-error">{error}</div> : null}
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
                onReviewResident={openResidentReviewModal}
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
          <div className="appointment-modal-panel" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
            <div className="appointment-modal-head">
              <div>
                <div className="appointment-modal-eyebrow">{modal.type === "guest" ? "Guest" : "Resident"}</div>
                <h3 id="appointment-modal-title">{modalTitle}</h3>
              </div>
              <button type="button" className="appointment-modal-close" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {modal.mode === "create" ? (
              <div className="appointment-type-switch" role="tablist" aria-label="Appointment type">
                {APPOINTMENT_TYPES.map((item) => (
                  <button key={item.value} type="button" className={`top-pill ${modal.type === item.value ? "active" : ""}`} onClick={() => setModalType(item.value)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}

            <form className="guest-form-grid appointment-modal-form" onSubmit={submitModal}>
              {modal.type === "guest" ? renderGuestFields() : renderResidentFields()}
              <div className="guest-form-actions">
                <button className="guest-form-cancel" type="button" onClick={closeModal}>Cancel</button>
                <button className="btn-primary guest-form-submit" type="submit" disabled={saving}>
                  {saving ? "Saving..." : modal.mode === "review" ? "Save Review" : "Save Appointment"}
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
  onReviewResident,
  onManualScan,
  onDownloadQr,
  onArchiveGuest,
  onUnarchiveGuest,
  onCancelGuest,
  onRemoveGuest,
}) {
  const statusMeta = getAppointmentStatusMeta(item);
  const schedule = formatDateParts(item.schedule);
  const created = formatDateParts(item.raw.created_at);
  const checkIn = formatDateParts(item.raw.checked_in_at);
  const checkOut = formatDateParts(item.raw.checked_out_at);
  const isMenuOpen = actionMenuId === item.key;
  const isGuest = item.type === "guest";
  const guest = item.raw;
  const resident = item.raw;

  return (
    <div className="admin-guest-row guest-detail-card appointment-row">
      <div className="guest-record-header">
        <div className="guest-record-identity">
          <div className="guest-record-avatar">{isGuest ? "G" : "R"}</div>
          <div className="guest-record-name-block">
            <div className="guest-record-title-line">
              <div className="guest-record-name">{item.title}</div>
            </div>
            <div className="guest-record-contact">{item.contact}</div>
          </div>
        </div>
        <div className="guest-record-controls appointment-row-controls">
          <StatusPill meta={statusMeta} />
          {isGuest ? (
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
          ) : (
            <ResidentActions
              appointment={resident}
              itemKey={item.key}
              isMenuOpen={isMenuOpen}
              setActionMenuId={setActionMenuId}
              onReviewResident={onReviewResident}
            />
          )}
        </div>
      </div>

      <div className="guest-detail-section">
        <div className="guest-detail-section-title">Appointment Details</div>
        <div className="guest-detail-grid guest-detail-grid-compact">
          <Info label="Type" value={isGuest ? "Guest" : "Resident"} />
          <Info label="Purpose" value={item.purpose || "-"} />
          <Info label="Schedule" value={schedule.date} subvalue={schedule.time} />
          {isGuest ? <Info label="Organization" value={item.organization || "-"} /> : <Info label="Requested" value={created.date} subvalue={created.time} />}
          {isGuest ? <Info label="Participants" value={guest.no_of_participants ?? 1} /> : <Info label="Reviewed By" value={resident.reviewed_by_name || "-"} />}
          {isGuest ? <Info label="Gate Status" value={getGateStatusMeta(guest.status)} /> : <Info label="Status" value={statusMeta.label} />}
          {isGuest ? <Info label="Check In" value={checkIn.date} subvalue={checkIn.time} /> : null}
          {isGuest ? <Info label="Check Out" value={checkOut.date} subvalue={checkOut.time} /> : null}
        </div>
        <div className="guest-detail-notes">
          <div className="guest-detail-section-title">{isGuest ? "Notes" : "Resident Note"}</div>
          <div className="guest-detail-notes-body">{isGuest ? guest.notes || "No notes added" : resident.resident_note || "No resident note"}</div>
        </div>
        {!isGuest ? (
          <div className="guest-detail-notes">
            <div className="guest-detail-section-title">Admin Note</div>
            <div className="guest-detail-notes-body">{resident.admin_note || "No admin note added"}</div>
          </div>
        ) : null}
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

function ResidentActions({ appointment, itemKey, isMenuOpen, setActionMenuId, onReviewResident }) {
  if (appointment.status !== "pending") {
    return (
      <div className="resident-menu-wrap guest-menu-wrap">
        <button
          className="resident-action-button resident-action-neutral resident-more-button"
          type="button"
          aria-label="More resident appointment actions"
          aria-expanded={isMenuOpen}
          onClick={() => setActionMenuId(isMenuOpen ? null : itemKey)}
        >
          ...
        </button>
        {isMenuOpen ? (
          <div className="resident-action-menu guest-action-menu">
            <button
              className="resident-action-button resident-action-neutral"
              type="button"
              onClick={() => {
                setActionMenuId(null);
                onReviewResident(appointment, appointment.status || "approved");
              }}
            >
              View Review
            </button>
            <button className="resident-action-button resident-action-neutral" type="button" disabled>
              {appointment.status === "approved" ? "Approved" : appointment.status === "rejected" ? "Rejected" : "Reviewed"}
            </button>
            <button className="resident-action-button resident-action-neutral" type="button" disabled>
              No further action
            </button>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="appointment-review-actions">
      <button className="btn-primary" type="button" onClick={() => onReviewResident(appointment, "approved")}>Approve</button>
      <button className="guest-form-cancel" type="button" onClick={() => onReviewResident(appointment, "rejected")}>Reject</button>
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
