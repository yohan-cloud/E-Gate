import { useEffect, useMemo, useState } from "react";
import { api, fetchJson } from "../../api";

const STATUSES = [
  { key: "pending", label: "Pending", color: "#d97706", pillBg: "#fef3c7", pillColor: "#92400e" },
  { key: "approved", label: "Approved", color: "#22c55e", pillBg: "#dcfce7", pillColor: "#166534" },
  { key: "rejected", label: "Rejected", color: "#f87171", pillBg: "#fee2e2", pillColor: "#991b1b" },
];
const FILTERS = [
  { key: "all", label: "All" },
  ...STATUSES.map(({ key, label }) => ({ key, label })),
];

const statusChip = (status) => {
  const meta = STATUSES.find((s) => s.key === status) || {};
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        background: meta.pillBg || "#e5e7eb",
        color: meta.pillColor || "#111827",
        fontSize: 13,
        textTransform: "capitalize",
        }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: meta.color || "#6b7280", display: "inline-block" }} />
      {meta.label || status}
    </span>
  );
};

export default function VerificationRequests() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const totalRequests = useMemo(
    () => counts.pending + counts.approved + counts.rejected,
    [counts]
  );

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (tab && tab !== "all") params.set("status", tab);
      if (searchDebounced.trim()) params.set("q", searchDebounced.trim());
      const suffix = params.toString();
      const data = await fetchJson(`/residents/verification/admin/${suffix ? `?${suffix}` : ""}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setError(error?.response?.data?.error || "Failed to load verification requests.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const data = await fetchJson("/residents/verification/admin/");
      const arr = Array.isArray(data) ? data : [];
      const base = { pending: 0, approved: 0, rejected: 0 };
      for (const item of arr) {
        if (base[item.status] !== undefined) base[item.status] += 1;
      }
      setCounts(base);
    } catch {
      // ignore count errors
    }
  };

  useEffect(() => {
    fetchData();
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchDebounced]);

  const act = async (id, action) => {
    setBusyId(id);
    setError("");
    try {
      const admin_note =
        action === "rejected"
          ? "Please contact the admin and upload a new ID document for verification."
          : "";
      await api.post(`/residents/verification/admin/${id}/`, { action, admin_note });
      await fetchData();
      await fetchCounts();
    } catch (error) {
      setError(error?.response?.data?.error || "Failed to update request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Verification Requests</h3>
          <div style={{ color: "#475569" }}>Review and approve resident ID verification requests</div>
        </div>
      <div style={{ color: "#475569" }}>Total Requests: <b>{totalRequests}</b></div>
      </div>

      <div className="verification-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <div className="verification-stat-card" key={s.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "#475569", fontSize: 13 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{counts[s.key] ?? 0}</div>
            </div>
            <div className="verification-stat-icon" style={{ width: 40, height: 40, borderRadius: 999, background: `${s.pillBg || "#e5e7eb"}`, display: "grid", placeItems: "center" }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: s.color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="verification-search-shell" style={{ marginBottom: 16 }}>
        <div className="verification-search-box" style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
          <input
            className="verification-search-input"
            type="search"
            placeholder="Search by name, username, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          />
        </div>
      </div>

      <div className="verification-filter-bar" style={{ display: "inline-flex", gap: 8, marginBottom: 12, flexWrap: "wrap", padding: 4, background: "#f8fafc", borderRadius: 12 }}>
        {FILTERS.map((s) => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className="verification-filter-chip"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: tab === s.key ? "2px solid #94a3b8" : "1px solid #e5e7eb",
              background: tab === s.key ? "#fff" : "#e2e8f0",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: tab === s.key ? "0 4px 10px rgba(0,0,0,0.06)" : "none",
            }}
          >
            <span>{s.label}</span>
            <span style={{ background: "#e5e7eb", borderRadius: 999, padding: "0 8px", fontSize: 12 }}>
              {s.key === "all" ? totalRequests : (counts[s.key] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>
          No {tab === "all" ? "" : `${tab} `}verification requests.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((req) => (
            <div className="verification-request-card" key={req.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "stretch" }}>
              <div className="verification-request-main" style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 12, alignItems: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 24, color: "#6b7280" }}>V</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>
                      {req.full_name || req?.user?.username || "N/A"}
                    </div>
                    {statusChip(req.status)}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                    Request ID: VR-{String(req.id).padStart(4, "0")}
                  </div>
                  <div className="verification-request-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginTop: 10 }}>
                    <Info label="Email" value={req?.user?.email || "N/A"} />
                    <Info label="Contact" value={req.phone_number || "N/A"} />
                    <Info label="Submitted" value={req.created_at ? new Date(req.created_at).toLocaleDateString() : "N/A"} />
                    <Info label="Status" value={(STATUSES.find((s) => s.key === req.status)?.label) || req.status} />
                  </div>
                  {req.admin_note && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>Admin note</div>
                      <div style={{ fontSize: 14 }}>{req.admin_note}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="verification-request-actions" style={{ display: "grid", justifyItems: "end", alignContent: "center", gap: 10, minWidth: 180 }}>
                {req.document_url && (
                  <a className="verification-request-view-link" href={req.document_url} target="_blank" rel="noreferrer">
                    View
                  </a>
                )}
                {req.status === "pending" && (
                  <div className="verification-request-button-stack" style={{ display: "grid", gap: 8, width: "100%" }}>
                    <button
                      className="btn-primary"
                      disabled={busyId === req.id}
                      onClick={() => act(req.id, "approved")}
                      style={{ width: "100%" }}
                    >
                      {busyId === req.id ? "Updating..." : "Approve"}
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busyId === req.id}
                      onClick={() => act(req.id, "rejected")}
                      style={{ width: "100%" }}
                    >
                      {busyId === req.id ? "Updating..." : "Reject"}
                    </button>
                  </div>
                )}
                {req.status === "approved" && (
                  <button
                    className="verification-request-upload-button"
                    disabled={busyId === req.id}
                    onClick={() => act(req.id, "rejected")}
                    style={{ minWidth: 180 }}
                  >
                    {busyId === req.id ? "Updating..." : "Request New Upload"}
                  </button>
                )}
              </div>
            </div>
          ))}
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
