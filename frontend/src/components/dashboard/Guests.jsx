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

  const heading = useMemo(() => {
    if (filter === "all") return "All guest appointments";
    if (filter === "archived") return "Archived guest appointments";
    return "Guests scheduled for today";
  }, [filter]);

  const totalGuests = useMemo(() => guests.length, [guests]);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      setError("");
      const endpoint = filter === "today" ? "/common/guests/today/" : "/common/guests/";
      const params = {};
      if (filter === "all" && search.trim()) params.q = search.trim();
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
  }, [filter]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        no_of_participants: Number(form.no_of_participants || 1),
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

      {filter !== "archived" && (
      <div style={{ marginTop: 12, marginBottom: 12, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f8fafc" }}>
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", columnGap: 20, rowGap: 16, alignItems: "start" }}>
        <input name="name" placeholder="Guest name" value={form.name} onChange={onChange} required />
        <input name="organization_company" placeholder="Organization / Company" value={form.organization_company} onChange={onChange} />
        <input name="contact" placeholder="Contact number" value={form.contact} onChange={onChange} />
        <input name="purpose" placeholder="Purpose of visit" value={form.purpose} onChange={onChange} required />
        <DateTimeField
          id="guest-eta"
          name="eta"
          label=""
          value={form.eta}
          onChange={onChange}
          required
          placeholder="Appointment Time"
        />
        <input
          type="number"
          min="1"
          step="1"
          name="no_of_participants"
          placeholder="No. of participants"
          value={form.no_of_participants}
          onChange={onChange}
          required
        />
        <select name="status" value={form.status} onChange={onChange}>
          {STATUS_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <input name="notes" placeholder="Notes" value={form.notes} onChange={onChange} />
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update Appointment" : "Add Appointment"}
          </button>
          {editingId && <button type="button" onClick={resetForm}>Cancel Edit</button>}
        </div>
      </form>
      </div>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb", maxWidth: 360 }}>
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
          {guests.length === 0 ? (
            <p style={{ color: "#475569" }}>No guest appointments found.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {guests.map((g) => (
                <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 22, color: "#6b7280" }}>G</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{g.name}</div>
                        <span style={{ background: g.is_archived ? "#64748b" : "#0f172a", color: "#fff", padding: "2px 8px", borderRadius: 999, fontSize: 12, textTransform: "capitalize" }}>
                          {g.is_archived ? "archived" : (g.status || "expected")}
                        </span>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                        {g.contact || "No contact number"}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 8 }}>
                        <Info label="Organization / Company" value={g.organization_company || "-"} />
                        <Info label="No. of Participants" value={g.no_of_participants ?? 1} />
                        <Info label="Purpose" value={g.purpose || "-"} />
                        <Info label="Appointment" value={g.eta ? new Date(g.eta).toLocaleString() : "-"} />
                        <Info label="Status" value={g.status || "expected"} />
                        <Info label="Check In" value={g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : "-"} />
                        <Info label="Check Out" value={g.checked_out_at ? new Date(g.checked_out_at).toLocaleString() : "-"} />
                        <Info label="QR" value={g.qr_ready ? "Ready" : "Unavailable"} />
                        <Info label="Notes" value={g.notes || "-"} />
                      </div>
                      {g.is_archived && (
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
                          Archived {g.archived_at ? new Date(g.archived_at).toLocaleString() : ""}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                    {!g.is_archived && <button onClick={() => editGuest(g)} title="Edit">Edit</button>}
                    {!g.is_archived && (
                      <button onClick={() => downloadGuestQr(g)} disabled={!g.qr_ready || qrBusyId === String(g.id)}>
                        {qrBusyId === String(g.id) ? "Preparing QR..." : "Download QR"}
                      </button>
                    )}
                    {!g.is_archived && !g.checked_in_at && (
                      <button onClick={() => manualScan(g.id, "time_in")} disabled={manualActionId === `${g.id}:time_in`}>
                        {manualActionId === `${g.id}:time_in` ? "Checking In..." : "Manual Check In"}
                      </button>
                    )}
                    {!g.is_archived && g.checked_in_at && !g.checked_out_at && (
                      <button onClick={() => manualScan(g.id, "time_out")} disabled={manualActionId === `${g.id}:time_out`}>
                        {manualActionId === `${g.id}:time_out` ? "Checking Out..." : "Manual Check Out"}
                      </button>
                    )}
                    {!g.is_archived && g.status !== "cancelled" && <button onClick={() => updateGuestStatus(g.id, "cancelled")}>Cancel</button>}
                    {!g.is_archived && (
                      <button onClick={() => archiveGuest(g.id)} disabled={archivingId === g.id}>
                        {archivingId === g.id ? "Archiving..." : "Archive"}
                      </button>
                    )}
                    {g.is_archived && (
                      <button onClick={() => unarchiveGuest(g.id)} disabled={archivingId === g.id}>
                        {archivingId === g.id ? "Restoring..." : "Unarchive"}
                      </button>
                    )}
                    <button onClick={() => removeGuest(g.id)} style={{ color: "#b91c1c" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ minHeight: 58, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>{value}</div>
    </div>
  );
}
