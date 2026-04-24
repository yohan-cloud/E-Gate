import { useEffect, useState } from "react";

import ConfirmDialog from "../common/ConfirmDialog";
import { api } from "../../api";
import toast, { formatApiError } from "../../lib/toast";
import userAddIcon from "../../assets/user-add.png";

const DEFAULT_FORM = {
  full_name: "",
  username: "",
  email: "",
  contact_number: "",
  password: "",
};

const DEACTIVATION_REASONS = [
  "Resigned from gate operations",
  "Temporary account suspension",
  "Access no longer needed",
  "Security concern",
  "Other",
];

export default function GateAccounts() {
  const [gateForm, setGateForm] = useState(DEFAULT_FORM);
  const [isCreatingGateOperator, setIsCreatingGateOperator] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetModal, setResetModal] = useState({
    open: false,
    account: null,
    temporaryPassword: "",
    confirmTemporaryPassword: "",
    showPassword: false,
  });
  const [deactivateModal, setDeactivateModal] = useState({
    open: false,
    account: null,
    reason: "",
    customReason: "",
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadAccounts = async (query = "") => {
    setLoadingAccounts(true);
    setAccountsError("");
    try {
      const response = await api.get("/accounts/gate-operators/", {
        params: query.trim() ? { q: query.trim() } : undefined,
      });
      setAccounts(response?.data || []);
    } catch (error) {
      setAccountsError(formatApiError(error, "Failed to load gate operator accounts."));
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const updateGateForm = (event) => {
    const { name, value } = event.target;
    setGateForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const createGateOperator = async (event) => {
    event.preventDefault();
    setIsCreatingGateOperator(true);

    try {
      const response = await api.post("/accounts/register/gate-operator/", {
        full_name: gateForm.full_name.trim(),
        username: gateForm.username.trim(),
        email: gateForm.email.trim(),
        contact_number: gateForm.contact_number.trim(),
        password: gateForm.password,
        is_active: true,
      });

      const createdName = response?.data?.user?.full_name || response?.data?.user?.username || gateForm.username.trim();
      setGateForm(DEFAULT_FORM);
      setShowPassword(false);
      setIsCreateFormOpen(false);
      toast.success(`Account for "${createdName}" created successfully.`);
      await loadAccounts(search);
    } catch (error) {
      toast.error(formatApiError(error, "Failed to create account."));
    } finally {
      setIsCreatingGateOperator(false);
    }
  };

  const runAccountAction = async (accountId, request, successMessage) => {
    setBusyId(accountId);
    setAccountsError("");
    try {
      await request();
      toast.success(successMessage);
      await loadAccounts(search);
    } catch (error) {
      const message = formatApiError(error, "Failed to update gate operator account.");
      setAccountsError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const openResetModal = (account) => {
    setResetModal({
      open: true,
      account,
      temporaryPassword: "",
      confirmTemporaryPassword: "",
      showPassword: false,
    });
  };

  const closeResetModal = () => {
    if (busyId) return;
    setResetModal({
      open: false,
      account: null,
      temporaryPassword: "",
      confirmTemporaryPassword: "",
      showPassword: false,
    });
  };

  const submitPasswordReset = async () => {
    const account = resetModal.account;
    if (!account?.id) return;
    const temporaryPassword = resetModal.temporaryPassword.trim();
    const confirmPassword = resetModal.confirmTemporaryPassword.trim();
    if (!temporaryPassword) {
      toast.error("Temporary password is required.");
      return;
    }
    if (temporaryPassword !== confirmPassword) {
      toast.error("Temporary password and confirmation do not match.");
      return;
    }
    await runAccountAction(
      account.id,
      () => api.post(`/accounts/gate-operators/${account.id}/reset-password/`, { temporary_password: temporaryPassword }),
      `Temporary password updated for "${account.username}".`
    );
    closeResetModal();
  };

  const openDeactivateModal = (account) => {
    setDeactivateModal({
      open: true,
      account,
      reason: "",
      customReason: "",
    });
  };

  const closeDeactivateModal = () => {
    if (busyId) return;
    setDeactivateModal({
      open: false,
      account: null,
      reason: "",
      customReason: "",
    });
  };

  const submitDeactivate = async () => {
    const account = deactivateModal.account;
    if (!account?.id) return;
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
    const finalReason = reason === "Other" ? customReason : reason;
    await runAccountAction(
      account.id,
      () => api.post(`/accounts/gate-operators/${account.id}/set-active/`, { is_active: false, reason: finalReason }),
      `Deactivated "${account.username}".`
    );
    closeDeactivateModal();
  };

  const reactivateAccount = async (account) => {
    await runAccountAction(
      account.id,
      () => api.post(`/accounts/gate-operators/${account.id}/set-active/`, { is_active: true }),
      `Reactivated "${account.username}".`
    );
  };

  const deleteAccount = async (accountId) => {
    const account = deleteTarget;
    if (!accountId || !account) return;
    await runAccountAction(
      accountId,
      () => api.delete(`/accounts/gate-operators/${accountId}/delete/`),
      `Deleted "${account.username}".`
    );
    setDeleteTarget(null);
  };

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    await loadAccounts(search);
  };

  return (
    <div className="card gate-account-card">
      <div className="gate-account-header">
        <div>
          <div className="gate-account-kicker">Access</div>
          <h2 style={{ margin: 0 }}>Gate Portal Accounts</h2>
          <div className="gate-account-copy">
            Create and manage dedicated gate operator accounts for scanners and entrance workflows. Administrator accounts will still work on the gate portal too.
          </div>
        </div>
      </div>

      <section className="gate-account-list-section">
        <div className="gate-account-list-header">
          <div>
            <h3 style={{ margin: 0 }}>Manage Gate Accounts</h3>
            <div className="gate-account-hint">
              Search existing gate operators and manage their access.
              {!loadingAccounts ? ` ${accounts.length} account${accounts.length === 1 ? "" : "s"} shown.` : ""}
            </div>
          </div>
          <div className="gate-account-toolbar">
            <form onSubmit={handleSearchSubmit} className="gate-account-search">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, username, email, or number"
              />
              <button type="submit">Search</button>
            </form>
            <button
              type="button"
              className={`gate-account-add-toggle ${isCreateFormOpen ? "open" : ""}`}
              onClick={() => {
                setIsCreateFormOpen((current) => !current);
                setShowPassword(false);
              }}
            >
              <span className="gate-account-add-icon" aria-hidden="true">
                <img src={userAddIcon} alt="" />
              </span>
              <span>{isCreateFormOpen ? "Close Form" : "Add Account"}</span>
            </button>
          </div>
        </div>

        {isCreateFormOpen ? (
          <form onSubmit={createGateOperator} className="gate-account-form gate-account-form-compact gate-account-form-collapsible">
            <div className="gate-account-form-head">
              <div>
                <h4 style={{ margin: 0 }}>Create Gate Account</h4>
                <div className="gate-account-hint">Only opens when needed, so the account list stays easier to scan.</div>
              </div>
            </div>

            <div className="gate-account-grid">
              <label className="gate-account-field">
                <span className="gate-account-label">Full Name</span>
                <input name="full_name" value={gateForm.full_name} onChange={updateGateForm} required placeholder="Juan Dela Cruz" />
              </label>

              <label className="gate-account-field">
                <span className="gate-account-label">Username</span>
                <input name="username" value={gateForm.username} onChange={updateGateForm} autoComplete="username" required placeholder="gate_operator_01" />
              </label>

              <label className="gate-account-field">
                <span className="gate-account-label">Email</span>
                <input name="email" type="email" value={gateForm.email} onChange={updateGateForm} autoComplete="email" placeholder="optional@example.com" />
              </label>

              <label className="gate-account-field">
                <span className="gate-account-label">Contact Number</span>
                <input name="contact_number" value={gateForm.contact_number} onChange={updateGateForm} inputMode="tel" placeholder="09171234567" />
              </label>

              <label className="gate-account-field gate-account-field-wide">
                <span className="gate-account-label">Password</span>
                <div className="gate-account-password-wrap">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={gateForm.password}
                    onChange={updateGateForm}
                    autoComplete="new-password"
                    required
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    className="gate-account-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>

            <div className="gate-account-hint">
              Optional fields. Email enables password reset.
            </div>

            <div className="gate-account-form-actions">
              <button
                type="button"
                className="gate-account-secondary"
                onClick={() => {
                  setIsCreateFormOpen(false);
                  setShowPassword(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={isCreatingGateOperator} className="gate-account-submit button-with-icon">
                {!isCreatingGateOperator ? (
                  <span className="button-icon-wrap gate-submit-icon" aria-hidden="true">
                    <img src={userAddIcon} alt="" />
                  </span>
                ) : null}
                <span>{isCreatingGateOperator ? "Creating..." : "Create Account"}</span>
              </button>
            </div>
          </form>
        ) : null}

        {accountsError ? <div className="gate-account-error">{accountsError}</div> : null}

        {loadingAccounts ? (
          <div className="gate-account-empty">Loading gate accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="gate-account-empty">No gate operator accounts found.</div>
        ) : (
          <div className="gate-account-table-wrap">
            <table className="gate-account-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.full_name || account.username}</td>
                    <td>{account.username}</td>
                    <td>{account.email || "No email"}</td>
                    <td>{account.contact_number || "No contact"}</td>
                    <td>
                      <span className={`gate-account-status ${account.is_active ? "active" : "inactive"}`}>
                        {account.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(account.date_joined)}</td>
                    <td>{account.last_login ? formatDate(account.last_login, true) : "Never"}</td>
                    <td>
                      <div className="gate-account-actions">
                        <button type="button" disabled={busyId === account.id} onClick={() => openResetModal(account)}>
                          Reset Password
                        </button>
                        {account.is_active ? (
                          <button type="button" disabled={busyId === account.id} onClick={() => openDeactivateModal(account)}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" disabled={busyId === account.id} onClick={() => reactivateAccount(account)}>
                            Activate
                          </button>
                        )}
                        <button type="button" disabled={busyId === account.id} className="danger" onClick={() => setDeleteTarget(account)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {resetModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-reset-password-title"
          style={overlayStyle}
          onClick={closeResetModal}
        >
          <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <div style={eyebrowStyle("#0f766e")}>Gate Security</div>
                <h3 id="gate-reset-password-title" style={titleStyle}>Reset Gate Password</h3>
                <p style={copyStyle}>
                  Set a temporary password for <strong>{resetModal.account?.full_name || resetModal.account?.username || "this account"}</strong>. They will be required to change it after login.
                </p>
              </div>
              <button type="button" onClick={closeResetModal} disabled={Boolean(busyId)} style={closeButtonStyle} aria-label="Close reset password dialog">X</button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label htmlFor="gate-temp-password" style={fieldLabelStyle}>Temporary Password</label>
              <input
                id="gate-temp-password"
                type={resetModal.showPassword ? "text" : "password"}
                value={resetModal.temporaryPassword}
                onChange={(event) => setResetModal((current) => ({ ...current, temporaryPassword: event.target.value }))}
                placeholder="Enter temporary password"
                autoFocus
                style={fieldInputStyle}
              />
              <input
                type={resetModal.showPassword ? "text" : "password"}
                value={resetModal.confirmTemporaryPassword}
                onChange={(event) => setResetModal((current) => ({ ...current, confirmTemporaryPassword: event.target.value }))}
                placeholder="Confirm temporary password"
                style={fieldInputStyle}
              />
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={resetModal.showPassword}
                  onChange={(event) => setResetModal((current) => ({ ...current, showPassword: event.target.checked }))}
                  style={{ margin: 0 }}
                />
                Show password
              </label>
              <div style={helperTextStyle}>
                Use a strong temporary password so the gate operator can log in once and immediately replace it.
              </div>
            </div>

            <div style={actionsStyle}>
              <button type="button" onClick={closeResetModal} disabled={Boolean(busyId)} style={secondaryButtonStyle}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitPasswordReset} disabled={Boolean(busyId)} style={primaryButtonStyle}>
                {busyId ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deactivateModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-deactivate-title"
          style={overlayStyle}
          onClick={closeDeactivateModal}
        >
          <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <div style={eyebrowStyle("#b91c1c")}>Gate Access</div>
                <h3 id="gate-deactivate-title" style={titleStyle}>Deactivate Gate Account</h3>
                <p style={copyStyle}>
                  Choose the reason for deactivating <strong>{deactivateModal.account?.full_name || deactivateModal.account?.username || "this account"}</strong>. They will no longer be able to log in until reactivated.
                </p>
              </div>
              <button type="button" onClick={closeDeactivateModal} disabled={Boolean(busyId)} style={closeButtonStyle} aria-label="Close deactivate gate account dialog">X</button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label htmlFor="gate-deactivate-reason" style={fieldLabelStyle}>Reason</label>
              <select
                id="gate-deactivate-reason"
                value={deactivateModal.reason}
                onChange={(event) => setDeactivateModal((current) => ({ ...current, reason: event.target.value }))}
                style={fieldInputStyle}
              >
                <option value="">Select reason</option>
                {DEACTIVATION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              {deactivateModal.reason === "Other" ? (
                <textarea
                  value={deactivateModal.customReason}
                  onChange={(event) => setDeactivateModal((current) => ({ ...current, customReason: event.target.value }))}
                  rows={3}
                  placeholder="Enter the deactivation reason"
                  style={{ ...fieldInputStyle, resize: "vertical" }}
                />
              ) : null}
              <div style={helperTextStyle}>
                This reason will be saved for admin reference and audit history.
              </div>
            </div>

            <div style={actionsStyle}>
              <button type="button" onClick={closeDeactivateModal} disabled={Boolean(busyId)} style={secondaryButtonStyle}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitDeactivate} disabled={Boolean(busyId)} style={primaryButtonStyle}>
                {busyId ? "Deactivating..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Gate Account"
        message={`Delete "${deleteTarget?.username || "this gate account"}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={Boolean(busyId)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteAccount(deleteTarget?.id)}
      />
    </div>
  );
}

function formatDate(value, includeTime = false) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, includeTime ? undefined : { year: "numeric", month: "short", day: "numeric" });
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 1000,
};

const panelStyle = {
  width: "min(100%, 460px)",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  border: "1px solid #dbe4ee",
  borderRadius: 18,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
  padding: 20,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const titleStyle = {
  margin: "6px 0 4px",
  fontSize: 18,
  lineHeight: 1.2,
};

const copyStyle = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
  fontSize: 14,
};

const closeButtonStyle = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 999,
  width: 34,
  height: 34,
  cursor: "pointer",
};

const fieldLabelStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
};

const fieldInputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  outline: "none",
};

const helperTextStyle = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifySelf: "start",
  gap: 8,
  color: "#334155",
  fontSize: 13,
  fontWeight: 600,
  marginTop: 2,
};

const actionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
};

const secondaryButtonStyle = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "9px 16px",
};

const primaryButtonStyle = {
  borderRadius: 999,
  padding: "9px 16px",
};

function eyebrowStyle(color) {
  return {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color,
  };
}
