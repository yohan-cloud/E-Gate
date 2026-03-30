import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fetchJson } from "../../api";
import toast from "../../lib/toast";

const GENDER_LABEL = {
  male: "Male",
  female: "Female",
  other: "Other",
  unspecified: "Unspecified",
};

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

export default function ResidentsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [revealedById, setRevealedById] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const queryString = query ? `?q=${encodeURIComponent(query)}` : "";
      const data = await fetchJson(`/residents/list/${queryString}`);
      const results = Array.isArray(data) ? data : data?.results;
      setRows(results || []);
      setRevealedById({});
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load residents");
    } finally {
      setLoading(false);
    }
  }, [query]);

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
    if (!window.confirm("Delete this resident account?")) return;
    try {
      await api.delete(`/residents/admin/${userId}/delete/`);
      toast.success("Resident deleted");
      if (editingId === userId) cancelEdit();
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || JSON.stringify(e?.response?.data) || "Failed to delete resident";
      toast.error(msg);
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
            const isVerified = Boolean(r.is_verified);
            return (
              <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 24, color: "#6b7280" }}>👤</div>
                  <div>
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
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {`${r.user?.first_name || ""} ${r.user?.last_name || ""}`.trim() || r.user?.username}
                        </div>
                      )}
                      <span style={badgeStyle("#0f172a", "#fff")}>active</span>
                      <span style={badgeStyle(isVerified ? "#dcfce7" : "#fee2e2", isVerified ? "#166534" : "#991b1b")}>
                        {isVerified ? "verified" : "not verified"}
                      </span>
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                      ID: {r.barangay_id}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
                      Username: {r.user?.username || "—"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginTop: 10 }}>
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
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
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
                      <button onClick={() => startEdit(r)} title="Edit" disabled={loadingDetailId === r.user?.id}>
                        {loadingDetailId === r.user?.id ? "..." : "Edit"}
                      </button>
                      <button onClick={() => deleteResident(r.user?.id)} title="Delete" style={{ color: "#b91c1c" }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
