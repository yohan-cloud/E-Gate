import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../api";

export const GATE_AUDIT_ACTIONS = [
  { value: "", label: "All actions" },
  { value: "login_success", label: "Successful Login" },
  { value: "login_failed", label: "Failed Login" },
  { value: "logout", label: "Logout" },
  { value: "qr_scan_success", label: "QR Scan Success" },
  { value: "qr_scan_denied", label: "QR Scan Denied" },
  { value: "manual_entry", label: "Manual Entry" },
  { value: "password_reset", label: "Password Reset" },
  { value: "account_created", label: "Account Created" },
  { value: "account_deactivated", label: "Account Deactivated" },
  { value: "account_reactivated", label: "Account Reactivated" },
  { value: "account_deleted", label: "Account Deleted" },
];

export const GATE_AUDIT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "denied", label: "Denied" },
  { value: "warning", label: "Account Changes" },
  { value: "info", label: "Info" },
];

export const DEFAULT_GATE_AUDIT_FILTERS = {
  q: "",
  account: "",
  performed_by: "",
  action_type: "",
  status: "",
  date_from: "",
  date_to: "",
};

export default function GateAuditLogs() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_GATE_AUDIT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await api.get("/accounts/gate-audit-logs/", { params });
      setRows(Array.isArray(response.data) ? response.data : response.data?.results || []);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to load gate audit logs.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const accounts = new Set(rows.map((row) => row.gate_username || row.gate_full_name).filter(Boolean));
    const denied = rows.filter((row) => row.status === "failed" || row.status === "denied").length;
    return { total: rows.length, accounts: accounts.size, denied };
  }, [rows]);

  return (
    <div className="card gate-account-card gate-audit-card">
      <div className="gate-account-header">
        <div>
          <div className="gate-account-kicker">Security</div>
          <h2 style={{ margin: 0 }}>Gate Audit Logs</h2>
          <div className="gate-account-copy">
            Search gate account logins, scans, manual entries, and account changes from one focused audit trail.
          </div>
        </div>
        <div className="stack-row gate-audit-summary">
          <div className="pill-light">Records: <b>{summary.total}</b></div>
          <div className="pill-light">Accounts: <b>{summary.accounts}</b></div>
          <div className="pill-light">Denied/Failed: <b>{summary.denied}</b></div>
        </div>
      </div>

      <div className="gate-audit-filter-grid">
        <input value={filters.q} onChange={(e) => updateFilter(setFilters, "q", e.target.value)} placeholder="Search message, IP, account, or action" />
        <input value={filters.account} onChange={(e) => updateFilter(setFilters, "account", e.target.value)} placeholder="Gate username or full name" />
        <input value={filters.performed_by} onChange={(e) => updateFilter(setFilters, "performed_by", e.target.value)} placeholder="Performed by" />
        <select value={filters.action_type} onChange={(e) => updateFilter(setFilters, "action_type", e.target.value)}>
          {GATE_AUDIT_ACTIONS.map((action) => <option key={action.value || "all"} value={action.value}>{action.label}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => updateFilter(setFilters, "status", e.target.value)}>
          {GATE_AUDIT_STATUS_OPTIONS.map((status) => <option key={status.value || "all"} value={status.value}>{status.label}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={(e) => updateFilter(setFilters, "date_from", e.target.value)} />
        <input type="date" value={filters.date_to} onChange={(e) => updateFilter(setFilters, "date_to", e.target.value)} />
      </div>

      <div className="stack-row">
        <button className="btn-primary gate-audit-apply" onClick={load}>Apply Filters</button>
        <button className="gate-account-secondary" onClick={() => setFilters(DEFAULT_GATE_AUDIT_FILTERS)}>Clear</button>
        <button className="gate-account-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="gate-account-empty">Loading gate audit logs...</div>
      ) : error ? (
        <div className="gate-account-error">{error}</div>
      ) : rows.length === 0 ? (
        <div className="gate-account-empty">No gate audit records found.</div>
      ) : (
        <GateAuditTable rows={rows} />
      )}
    </div>
  );
}

export function GateAuditTable({ rows, compact = false }) {
  return (
    <div className="gate-account-table-wrap gate-audit-table-wrap">
      <table className="gate-account-table gate-audit-table">
        <thead>
          <tr>
            <th>Date / Time</th>
            <th>Gate Account</th>
            <th>Action</th>
            <th>Status</th>
            <th>Performed By</th>
            <th>Details</th>
            {!compact ? <th>IP Address</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.created_at)}</td>
              <td>
                <div className="gate-audit-account-cell">
                  <strong>{row.gate_full_name || row.gate_username || "Unknown account"}</strong>
                  <span>{row.gate_username || "No username"}</span>
                </div>
              </td>
              <td>{row.action_label || formatAction(row.action_type)}</td>
              <td><span className={`gate-audit-status ${row.status || "info"}`}>{row.status_label || formatStatus(row.status)}</span></td>
              <td>{row.performed_by_label || row.performed_by_username || "System"}</td>
              <td>{row.details || detailFromMetadata(row)}</td>
              {!compact ? <td>{row.ip_address || "N/A"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function updateFilter(setFilters, key, value) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatAction(value = "") {
  return value.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Unknown";
}

function formatStatus(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1) || "Info";
}

function detailFromMetadata(row) {
  const result = row?.metadata?.result_code;
  const method = row?.metadata?.method;
  if (result && method) return `${formatAction(method)} result: ${result}`;
  if (result) return `Result: ${result}`;
  return "No details";
}
