import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "../../api";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "resident_update", label: "Resident Edit" },
  { value: "attendance_mark", label: "Attendance Approval" },
  { value: "verification_review", label: "Verification Approval" },
];

function isRelevantAuditRow(row) {
  if (!row) return false;
  if (row.action === "resident_update") return true;
  if (row.action === "attendance_mark") return true;
  if (row.action === "verification_review") {
    return (row.metadata?.status || "").toLowerCase() === "approved";
  }
  return false;
}

export default function AuditTrail() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    actor: "",
    resident: "",
    action: "",
    date_from: "",
    date_to: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const searchParams = new URLSearchParams(params).toString();
      const payload = await fetchJson(`/common/audit-logs/${searchParams ? `?${searchParams}` : ""}`);
      const data = Array.isArray(payload) ? payload : payload?.results || [];
      setRows(data.filter(isRelevantAuditRow));
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const uniqueActors = new Set(rows.map((row) => row.actor_username).filter(Boolean));
    return {
      total: rows.length,
      actors: uniqueActors.size,
    };
  }, [rows]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="section-head">
        <div>
          <h3 style={{ margin: 0 }}>Audit Trail</h3>
          <div className="muted">Show only who edited residents, approved attendance, and approved verification.</div>
        </div>
        <div className="stack-row">
          <div className="pill-light">Records: <b>{summary.total}</b></div>
          <div className="pill-light">Editors/Actors: <b>{summary.actors}</b></div>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="audit-filter-grid">
        <input
          type="search"
          placeholder="Search action, actor, or resident"
          value={filters.q}
          onChange={(e) => setFilters((curr) => ({ ...curr, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <input
          placeholder="Who edited / actor"
          value={filters.actor}
          onChange={(e) => setFilters((curr) => ({ ...curr, actor: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <input
          placeholder="Resident"
          value={filters.resident}
          onChange={(e) => setFilters((curr) => ({ ...curr, resident: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <select value={filters.action} onChange={(e) => setFilters((curr) => ({ ...curr, action: e.target.value }))}>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters((curr) => ({ ...curr, date_from: e.target.value }))}
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters((curr) => ({ ...curr, date_to: e.target.value }))}
        />
      </div>

      <div className="stack-row" style={{ marginTop: 10 }}>
        <button className="btn-primary" onClick={load}>Apply Filters</button>
        <button
          onClick={() => {
            setFilters({ q: "", actor: "", resident: "", action: "", date_from: "", date_to: "" });
            setTimeout(load, 0);
          }}
        >
          Clear
        </button>
      </div>

      {loading ? (
        <p style={{ marginTop: 14 }}>Loading audit logs...</p>
      ) : error ? (
        <p style={{ color: "#b91c1c", marginTop: 14 }}>{error}</p>
      ) : rows.length === 0 ? (
        <p style={{ marginTop: 14 }}>No audit records found for the current filters.</p>
      ) : (
        <div className="audit-list">
          {rows.map((row) => (
            <div key={row.id} className="audit-item">
              <div className="audit-item-head">
                <div>
                  <div className="audit-item-title">{formatAction(row)}</div>
                  <div className="audit-item-meta">
                    <span>{row.actor_username || "System"}</span>
                    <span>{row.actor_role || "Unknown role"}</span>
                    <span>{formatDate(row.created_at)}</span>
                  </div>
                </div>
                <span className="audit-badge">{row.target_type}</span>
              </div>

              <div className="audit-detail-grid">
                <AuditField label="Actor" value={row.actor_username || "System"} />
                <AuditField label="Resident" value={row.resident_name || row.target_label || "N/A"} />
                <AuditField label="Action" value={formatAction(row)} />
                <AuditField label="Status" value={formatStatus(row)} />
              </div>

              {row.action === "resident_update" && row.metadata?.changed_fields && Object.keys(row.metadata.changed_fields).length > 0 ? (
                <div className="audit-change-block">
                  <div className="audit-change-title">Changed Fields</div>
                  <div className="audit-change-list">
                    {Object.entries(row.metadata.changed_fields).map(([field, diff]) => (
                      <div key={field} className="audit-change-item">
                        <b>{field}</b>: {diff?.from || "empty"} {"->"} {diff?.to || "empty"}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditField({ label, value }) {
  return (
    <div>
      <div className="audit-field-label">{label}</div>
      <div className="audit-field-value">{value}</div>
    </div>
  );
}

function formatAction(row) {
  if (!row) return "Unknown";
  if (row.action === "resident_update") return "Resident Edited";
  if (row.action === "attendance_mark") return "Attendance Approved";
  if (row.action === "verification_review") return "Verification Approved";
  return (row.action || "unknown")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(row) {
  if (!row) return "N/A";
  if (row.action === "resident_update") return "Edited";
  if (row.action === "attendance_mark") {
    return row.metadata?.direction === "time_out" ? "Time Out Approved" : "Time In Approved";
  }
  if (row.action === "verification_review") {
    return (row.metadata?.status || "approved")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "N/A";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
