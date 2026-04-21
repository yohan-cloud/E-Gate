import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fetchJson } from "../../api";
import toast from "../../lib/toast";
import ConfirmDialog from "../common/ConfirmDialog";
import SegmentedPillSelect from "../common/SegmentedPillSelect";

const GENDER_LABEL = {
  male: "Male",
  female: "Female",
  other: "Other",
  unspecified: "Unspecified",
};

const RESIDENT_CATEGORY_LABEL = {
  resident: "Resident",
  client: "Client",
};

const VOTER_STATUS_LABEL = {
  registered_voter: "Registered Voter",
  not_yet_voter: "Not Yet Voter",
  unspecified: "Not Set",
};

const DEACTIVATION_REASONS = [
  "Moved out of barangay",
  "Duplicate resident record",
  "Temporarily restricted pending verification",
  "Requested account deactivation",
  "Other",
];

function badgeStyle(background, color) {
  return {
    background,
    color,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  };
}

function calcAge(birthdate) {
  if (!birthdate) return null;
  try {
    const b = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

function getResidentAudiencePills(age, residentCategory, voterStatus) {
  const pills = [];

  if (age !== null) {
    if (age < 18) {
      pills.push({
        label: "kid/teen",
        background: "#dbeafe",
        color: "#1d4ed8",
      });
    } else if (age >= 60) {
      pills.push({
        label: "senior",
        background: "#fef3c7",
        color: "#92400e",
      });
    } else {
      pills.push({
        label: "adult",
        background: "#e2e8f0",
        color: "#334155",
      });
    }
  }

  if (residentCategory === "client") {
    pills.push({
      label: "client",
      background: "#fae8ff",
      color: "#86198f",
    });
  } else if (residentCategory === "resident") {
    pills.push({
      label: "resident",
      background: "#f1f5f9",
      color: "#475569",
    });
  }

  if (voterStatus === "registered_voter") {
    pills.push({
      label: "registered voter",
      background: "#dcfce7",
      color: "#166534",
    });
  } else if (voterStatus === "not_yet_voter") {
    pills.push({
      label: "not yet voter",
      background: "#fef3c7",
      color: "#92400e",
    });
  }

  return pills;
}

export default function ResidentsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [revealedById, setRevealedById] = useState({});
  const [filter, setFilter] = useState("active");
  const [archivingId, setArchivingId] = useState(null);
  const [deactivationActionId, setDeactivationActionId] = useState(null);
  const [resettingPasswordId, setResettingPasswordId] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [resetModal, setResetModal] = useState({
    open: false,
    resident: null,
    temporaryPassword: "",
    confirmTemporaryPassword: "",
    showPassword: false,
  });
  const [deactivateModal, setDeactivateModal] = useState({
    open: false,
    resident: null,
    reason: "",
    customReason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (filter === "archived") params.set("archived_only", "true");
      if (filter === "deactivated") params.set("deactivated_only", "true");
      const queryString = params.toString() ? `?${params.toString()}` : "";
      const data = await fetchJson(`/residents/list/${queryString}`);
      const results = Array.isArray(data) ? data : data?.results;
      setRows(results || []);
      setRevealedById({});
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load residents");
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => { load(); }, [load]);

  const startEdit = async (row) => {
    const userId = row.user?.id;
    if (!userId) return;
    setLoadingDetailId(userId);
    try {
      const res = await api.get(`/residents/admin/${userId}/`);
      const detail = res.data || {};
      setEditingId(userId);
      setForm({
        username: detail.user?.username || "",
        email: detail.user?.email || "",
        first_name: detail.user?.first_name || "",
        last_name: detail.user?.last_name || "",
        address: detail.address || "",
        birthdate: detail.birthdate || "",
        expiry_date: detail.expiry_date || "",
        phone_number: detail.phone_number || "",
        gender: detail.gender || "unspecified",
        resident_category: detail.resident_category || "resident",
        voter_status: detail.voter_status || "not_yet_voter",
      });
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to load resident details";
      toast.error(msg);
    } finally {
      setLoadingDetailId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  const toggleReveal = async (row) => {
    const userId = row.user?.id;
    if (!userId) return;

    if (revealedById[userId]) {
      setRevealedById((curr) => {
        const next = { ...curr };
        delete next[userId];
        return next;
      });
      return;
    }

    setLoadingDetailId(userId);
    try {
      const res = await api.get(`/residents/admin/${userId}/`, {
        params: { reason: "reveal_sensitive" },
      });
      setRevealedById((curr) => ({ ...curr, [userId]: res.data || {} }));
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to reveal resident details";
      toast.error(msg);
    } finally {
      setLoadingDetailId(null);
    }
  };

  const saveEdit = async (userId) => {
    try {
      await api.patch(`/residents/admin/${userId}/`, form);
      toast.success("Resident updated");
      cancelEdit();
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || JSON.stringify(e?.response?.data) || "Failed to update resident";
      toast.error(msg);
    }
  };

  const deleteResident = async (userId) => {
    try {
      await api.delete(`/residents/admin/${userId}/delete/`);
      toast.success("Resident deleted");
      setDeleteTargetId(null);
      if (editingId === userId) cancelEdit();
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || JSON.stringify(e?.response?.data) || "Failed to delete resident";
      toast.error(msg);
    }
  };

  const archiveResident = async (userId) => {
    setArchivingId(userId);
    try {
      await api.post(`/residents/admin/${userId}/archive/`);
      toast.success("Resident archived");
      if (editingId === userId) cancelEdit();
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to archive resident";
      toast.error(msg);
    } finally {
      setArchivingId(null);
    }
  };

  const unarchiveResident = async (userId) => {
    setArchivingId(userId);
    try {
      await api.post(`/residents/admin/${userId}/unarchive/`);
      toast.success("Resident restored");
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to restore resident";
      toast.error(msg);
    } finally {
      setArchivingId(null);
    }
  };

  const openDeactivateModal = (row) => {
    setDeactivateModal({
      open: true,
      resident: row,
      reason: "",
      customReason: "",
    });
  };

  const closeDeactivateModal = () => {
    if (deactivationActionId) return;
    setDeactivateModal({
      open: false,
      resident: null,
      reason: "",
      customReason: "",
    });
  };

  const submitDeactivation = async () => {
    const row = deactivateModal.resident;
    const userId = row?.user?.id;
    if (!userId) return;

    const reason = (deactivateModal.reason || "").trim();
    const customReason = (deactivateModal.customReason || "").trim();
    if (!reason) {
      toast.error("Please select a deactivation reason.");
      return;
    }
    if (reason === "Other" && !customReason) {
      toast.error("Please enter the custom deactivation reason.");
      return;
    }

    setDeactivationActionId(userId);
    try {
      await api.post(`/residents/admin/${userId}/deactivate/`, {
        reason,
        custom_reason: customReason,
      });
      toast.success("Resident deactivated");
      setDeactivateModal({
        open: false,
        resident: null,
        reason: "",
        customReason: "",
      });
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to deactivate resident";
      toast.error(msg);
    } finally {
      setDeactivationActionId(null);
    }
  };

  const reactivateResident = async (userId) => {
    setDeactivationActionId(userId);
    try {
      await api.post(`/residents/admin/${userId}/reactivate/`);
      toast.success("Resident reactivated");
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || "Failed to reactivate resident";
      toast.error(msg);
    } finally {
      setDeactivationActionId(null);
    }
  };

  const openResetModal = (row) => {
    setResetModal({
      open: true,
      resident: row,
      temporaryPassword: "",
      confirmTemporaryPassword: "",
      showPassword: false,
    });
  };

  const closeResetModal = () => {
    if (resettingPasswordId) return;
    setResetModal({
      open: false,
      resident: null,
      temporaryPassword: "",
      confirmTemporaryPassword: "",
      showPassword: false,
    });
  };

  const submitResidentPasswordReset = async () => {
    const row = resetModal.resident;
    const userId = row?.user?.id;
    if (!userId) return;

    const cleaned = resetModal.temporaryPassword.trim();
    if (!cleaned) {
      toast.error("Temporary password is required.");
      return;
    }
    if (cleaned !== resetModal.confirmTemporaryPassword.trim()) {
      toast.error("Temporary password and confirmation do not match.");
      return;
    }

    setResettingPasswordId(userId);
    try {
      await api.post(`/residents/admin/${userId}/reset-password/`, { temporary_password: cleaned });
      toast.success("Temporary password set. Resident must change it after login.");
      setResetModal({
        open: false,
        resident: null,
        temporaryPassword: "",
        confirmTemporaryPassword: "",
        showPassword: false,
      });
    } catch (e) {
      const apiError = e?.response?.data?.error;
      const msg = Array.isArray(apiError) ? apiError.join(", ") : apiError || "Failed to reset resident password";
      toast.error(msg);
    } finally {
      setResettingPasswordId(null);
    }
  };

  const totalResidents = useMemo(() => rows.length, [rows]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Residents</h3>
          <div style={{ color: "#475569" }}>Manage all registered barangay residents</div>
        </div>
        <div style={{ color: "#475569" }}>Total Residents: <b>{totalResidents}</b></div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("active")} className={`top-pill ${filter === "active" ? "active" : ""}`}>Active</button>
          <button onClick={() => setFilter("deactivated")} className={`top-pill ${filter === "deactivated" ? "active" : ""}`}>Deactivated</button>
          <button onClick={() => setFilter("archived")} className={`top-pill ${filter === "archived" ? "active" : ""}`}>Archived</button>
        </div>
        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
          <input
            type="search"
            placeholder="Search by name, ID, or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        </div>
      </div>

      {loading ? (
        <p>Loading residents...</p>
      ) : error ? (
        <p style={{ color: "#b91c1c" }}>{error}</p>
      ) : rows.length === 0 ? (
        <p>No residents found.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r, idx) => {
            const isEditing = editingId === r.user?.id;
            const revealed = revealedById[r.user?.id];
            const displayRow = revealed || r;
            const age = calcAge(r.birthdate);
            const residentAudiencePills = getResidentAudiencePills(age, r.resident_category, r.voter_status);
            const isVerified = Boolean(r.is_verified);
            const isDeactivated = Boolean(r.is_deactivated);
            const statusBadge = r.is_archived
              ? { label: "archived", background: "#64748b", color: "#fff" }
              : isDeactivated
                ? { label: "deactivated", background: "#fef2f2", color: "#b91c1c" }
                : { label: "active", background: "#0f172a", color: "#fff" };
            return (
              <div className={`admin-resident-row ${revealed || isEditing ? "resident-details-open" : "resident-details-closed"}`} key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center" }}>
                <div className="admin-resident-main" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 24, color: "#6b7280" }}>👤</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {isEditing ? (
                        <>
                          <input
                            value={form.first_name || ""}
                            placeholder="First name"
                            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                            style={{ maxWidth: 160 }}
                          />
                          <input
                            value={form.last_name || ""}
                            placeholder="Last name"
                            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                            style={{ maxWidth: 160 }}
                          />
                        </>
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: 18, minWidth: 0, overflowWrap: "anywhere" }}>
                          {`${r.user?.first_name || ""} ${r.user?.last_name || ""}`.trim() || r.user?.username}
                        </div>
                      )}
                      <span style={badgeStyle(statusBadge.background, statusBadge.color)}>{statusBadge.label}</span>
                      <span style={badgeStyle(isVerified ? "#dcfce7" : "#fee2e2", isVerified ? "#166534" : "#991b1b")}>
                        {isVerified ? "verified" : "not verified"}
                      </span>
                      {residentAudiencePills.map((pill) => (
                        <span key={pill.label} style={badgeStyle(pill.background, pill.color)}>
                          {pill.label}
                        </span>
                      ))}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                      ID: {r.barangay_id}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
                      Username: {r.user?.username || "—"}
                    </div>
                    {isDeactivated ? (
                      <div style={{ color: "#991b1b", fontSize: 13, marginTop: 6 }}>
                        Deactivated {r.deactivated_at ? new Date(r.deactivated_at).toLocaleString() : ""}
                        {r.deactivated_by_name ? ` by ${r.deactivated_by_name}` : ""}
                        {r.deactivation_reason ? ` • ${r.deactivation_reason}` : ""}
                      </div>
                    ) : null}
                    <div className="admin-resident-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginTop: 10, minWidth: 0 }}>
                      <Info label="Age" value={age !== null ? `${age} years` : "—"} />
                      <Info
                        label="Gender"
                        value={
                          isEditing ? (
                            <select value={form.gender || "unspecified"} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                              {Object.entries(GENDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          ) : (
                            GENDER_LABEL[r.gender] || "Unspecified"
                          )
                        }
                      />
                      <Info
                        label="Address"
                        value={
                          isEditing ? (
                            <input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                          ) : (
                            displayRow.address
                          )
                        }
                      />
                      <Info
                        label="Status"
                        value={
                          isEditing ? (
                            <SegmentedPillSelect
                              value={form.resident_category || "resident"}
                              name="resident_category"
                              options={Object.entries(RESIDENT_CATEGORY_LABEL).map(([k, v]) => ({ value: k, label: v }))}
                              onChange={(e) => setForm({ ...form, resident_category: e.target.value })}
                            />
                          ) : (
                            RESIDENT_CATEGORY_LABEL[r.resident_category] || "Resident"
                          )
                        }
                      />
                      <Info
                        label="Voter Status"
                        value={
                          isEditing ? (
                            <SegmentedPillSelect
                              value={form.voter_status || "not_yet_voter"}
                              name="voter_status"
                              options={[
                                { value: "registered_voter", label: "Registered Voter" },
                                { value: "not_yet_voter", label: "Not Yet Voter" },
                              ]}
                              onChange={(e) => setForm({ ...form, voter_status: e.target.value })}
                            />
                          ) : (
                            VOTER_STATUS_LABEL[r.voter_status] || "Not Set"
                          )
                        }
                      />
                      <Info
                        label="Email"
                        value={
                          isEditing ? (
                            <input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                          ) : (
                            displayRow.user?.email || "—"
                          )
                        }
                      />
                      <Info
                        label="Phone"
                        value={
                          isEditing ? (
                            <input value={form.phone_number || ""} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
                          ) : (
                            displayRow.phone_number || "—"
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-resident-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  {isEditing ? (
                    <>
                      <button className="btn-primary" onClick={() => saveEdit(r.user.id)}>Save</button>
                      <button onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => toggleReveal(r)} disabled={loadingDetailId === r.user?.id}>
                        {loadingDetailId === r.user?.id ? "Loading..." : revealed ? "Hide Details" : "Reveal Details"}
                      </button>
                      {!r.is_archived && !isDeactivated && <button onClick={() => startEdit(r)} title="Edit" disabled={loadingDetailId === r.user?.id}>
                        {loadingDetailId === r.user?.id ? "..." : "Edit"}
                      </button>}
                      {!r.is_archived && !isDeactivated && (
                        <button onClick={() => openResetModal(r)} disabled={resettingPasswordId === r.user?.id}>
                          {resettingPasswordId === r.user?.id ? "Resetting..." : "Reset Password"}
                        </button>
                      )}
                      {!r.is_archived && !isDeactivated && (
                        <button onClick={() => openDeactivateModal(r)} disabled={deactivationActionId === r.user?.id}>
                          {deactivationActionId === r.user?.id ? "Updating..." : "Deactivate"}
                        </button>
                      )}
                      {!r.is_archived && isDeactivated && (
                        <button onClick={() => reactivateResident(r.user?.id)} disabled={deactivationActionId === r.user?.id}>
                          {deactivationActionId === r.user?.id ? "Updating..." : "Reactivate"}
                        </button>
                      )}
                      {!r.is_archived ? (
                        <button onClick={() => archiveResident(r.user?.id)} disabled={archivingId === r.user?.id}>
                          {archivingId === r.user?.id ? "Archiving..." : "Archive"}
                        </button>
                      ) : (
                        <button onClick={() => unarchiveResident(r.user?.id)} disabled={archivingId === r.user?.id}>
                          {archivingId === r.user?.id ? "Restoring..." : "Unarchive"}
                        </button>
                      )}
                      {!r.is_archived && <button onClick={() => setDeleteTargetId(r.user?.id)} title="Delete" style={{ color: "#b91c1c" }}>Delete</button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deactivateModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resident-deactivate-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={closeDeactivateModal}
        >
          <div
            style={{
              width: "min(100%, 460px)",
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              border: "1px solid #dbe4ee",
              borderRadius: 18,
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#b91c1c" }}>
                  Resident Access
                </div>
                <h3 id="resident-deactivate-title" style={{ margin: "6px 0 4px", fontSize: 18, lineHeight: 1.2 }}>
                  Deactivate Resident
                </h3>
                <p style={{ margin: 0, color: "#475569", lineHeight: 1.5, fontSize: 14 }}>
                  Choose the reason for deactivating{" "}
                  <strong>
                    {`${deactivateModal.resident?.user?.first_name || ""} ${deactivateModal.resident?.user?.last_name || ""}`.trim()
                      || deactivateModal.resident?.user?.username
                      || "this resident"}
                  </strong>
                  . The resident will no longer be able to log in until reactivated.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeactivateModal}
                disabled={Boolean(deactivationActionId)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: 999,
                  width: 34,
                  height: 34,
                  cursor: deactivationActionId ? "not-allowed" : "pointer",
                }}
                aria-label="Close deactivate resident dialog"
              >
                X
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label htmlFor="resident-deactivate-reason" style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                Reason
              </label>
              <select
                id="resident-deactivate-reason"
                value={deactivateModal.reason}
                onChange={(e) => setDeactivateModal((current) => ({ ...current, reason: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  outline: "none",
                }}
              >
                <option value="">Select reason</option>
                {DEACTIVATION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              {deactivateModal.reason === "Other" ? (
                <textarea
                  value={deactivateModal.customReason}
                  onChange={(e) => setDeactivateModal((current) => ({ ...current, customReason: e.target.value }))}
                  rows={3}
                  placeholder="Enter the deactivation reason"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              ) : null}
              <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
                This reason will be saved for admin reference and audit history.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={closeDeactivateModal}
                disabled={Boolean(deactivationActionId)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  borderRadius: 999,
                  padding: "9px 16px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={submitDeactivation}
                disabled={Boolean(deactivationActionId)}
                style={{ borderRadius: 999, padding: "9px 16px" }}
              >
                {deactivationActionId ? "Deactivating..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resident-reset-password-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={closeResetModal}
        >
          <div
            style={{
              width: "min(100%, 460px)",
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              border: "1px solid #dbe4ee",
              borderRadius: 18,
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f766e" }}>
                  Resident Security
                </div>
                <h3 id="resident-reset-password-title" style={{ margin: "6px 0 4px", fontSize: 18, lineHeight: 1.2 }}>
                  Reset Resident Password
                </h3>
                <p style={{ margin: 0, color: "#475569", lineHeight: 1.5, fontSize: 14 }}>
                  Set a temporary password for{" "}
                  <strong>
                    {`${resetModal.resident?.user?.first_name || ""} ${resetModal.resident?.user?.last_name || ""}`.trim()
                      || resetModal.resident?.user?.username
                      || "this resident"}
                  </strong>
                  . They will be required to change it after login.
                </p>
              </div>
              <button
                type="button"
                onClick={closeResetModal}
                disabled={Boolean(resettingPasswordId)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: 999,
                  width: 34,
                  height: 34,
                  cursor: resettingPasswordId ? "not-allowed" : "pointer",
                }}
                aria-label="Close reset password dialog"
              >
                X
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label htmlFor="resident-temp-password" style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                Temporary Password
              </label>
              <input
                id="resident-temp-password"
                type={resetModal.showPassword ? "text" : "password"}
                value={resetModal.temporaryPassword}
                onChange={(e) => setResetModal((current) => ({ ...current, temporaryPassword: e.target.value }))}
                placeholder="Enter temporary password"
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitResidentPasswordReset();
                  }
                }}
              />
              <input
                type={resetModal.showPassword ? "text" : "password"}
                value={resetModal.confirmTemporaryPassword}
                onChange={(e) => setResetModal((current) => ({ ...current, confirmTemporaryPassword: e.target.value }))}
                placeholder="Confirm temporary password"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitResidentPasswordReset();
                  }
                }}
              />
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifySelf: "start",
                  gap: 8,
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                <input
                  type="checkbox"
                  checked={resetModal.showPassword}
                  onChange={(e) => setResetModal((current) => ({ ...current, showPassword: e.target.checked }))}
                  style={{ margin: 0 }}
                />
                Show password
              </label>
              <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
                Use a strong temporary password so the resident can log in once and immediately replace it.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={closeResetModal}
                disabled={Boolean(resettingPasswordId)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  borderRadius: 999,
                  padding: "9px 16px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={submitResidentPasswordReset}
                disabled={Boolean(resettingPasswordId)}
                style={{ borderRadius: 999, padding: "9px 16px" }}
              >
                {resettingPasswordId ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Delete Resident"
        message="Delete this resident account? This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => deleteResident(deleteTargetId)}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
