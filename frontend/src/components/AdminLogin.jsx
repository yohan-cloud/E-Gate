import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearStoredAuth } from "../api";

export default function AdminLogin({
  onLogin,
  title = "Admin Login",
  helper = "Use an authorized operations account to continue.",
  redirectTo = "/admin",
  backLinkTo = "/resident/login",
  backLinkLabel = "Resident Login",
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetStage, setResetStage] = useState("request");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpJustSent, setOtpJustSent] = useState(false);
  const navigate = useNavigate();

  const resetFlowState = () => {
    setResetStage("request");
    setOtpCode("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpJustSent(false);
  };

  const getApiErrorMessage = (err, fallback) => {
    const data = err?.response?.data;
    const formatMessage = (apiMessage) => {
      if (typeof apiMessage !== "string") return "";
      return apiMessage.replace(/Expected available in\s+(\d+)\s+seconds?/i, (_, rawSeconds) => {
        const seconds = Number(rawSeconds);
        if (!Number.isFinite(seconds) || seconds <= 0) return "Expected available soon";
        const minutes = Math.ceil(seconds / 60);
        return `Expected available in ${minutes} minute${minutes === 1 ? "" : "s"}`;
      });
    };

    if (Array.isArray(data?.error)) return formatMessage(data.error.join(", "));
    if (typeof data?.error === "string" && data.error.trim()) return formatMessage(data.error);
    if (typeof data?.detail === "string" && data.detail.trim()) return formatMessage(data.detail);
    return fallback;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      clearStoredAuth();
      const response = await fetch("/api/accounts/login/admin/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const res = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw {
          response: {
            data: res,
            status: response.status,
          },
        };
      }

      const access = res?.tokens?.access;
      const refresh = res?.tokens?.refresh;
      const user = res?.user;
      if (access) localStorage.setItem("access_token", access);
      if (refresh) localStorage.setItem("refresh_token", refresh);
      const role = res?.meta?.role || "Administrator";
      localStorage.setItem("role", role);
      if (user) {
        try { localStorage.setItem("user", JSON.stringify(user)); } catch { return; }
        if (user?.username) localStorage.setItem("username", user.username);
      }
      setMessage(res?.message || "Login successful!");
      onLogin?.(role);
      try { navigate(redirectTo); } catch { return; }
    } catch (err) {
      setMessage(
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        "Login failed",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      clearStoredAuth();
      await api.post("/accounts/password/otp/request/", { username, account_type: "admin" });
      setPassword("");
      setOtpJustSent(true);
      setMessage("A reset code was sent to the email linked to this operations account. Use the newest email code, then enter your new password.");
      setResetStage("verify");
    } catch (err) {
      setMessage(getApiErrorMessage(err, "Failed to send reset email"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirm password must match.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      clearStoredAuth();
      await api.post("/accounts/password/otp/verify/", {
        username,
        account_type: "admin",
        code: otpCode,
        new_password: newPassword,
      });
      setPassword("");
      setMessage("Password reset successful. Please log in with your new password.");
      setResetMode(false);
      resetFlowState();
    } catch (err) {
      setMessage(getApiErrorMessage(err, "Failed to reset password"));
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    if (!resetMode) {
      return (
        <form className="valo-login-form" onSubmit={handleLogin}>
          <label className="sr-only" htmlFor="admin-username">Admin Username</label>
          <input
            className="valo-login-input"
            type="text"
            id="admin-username"
            name="username"
            placeholder="USERNAME"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <label className="sr-only" htmlFor="admin-password">Admin Password</label>
          <input
            className="valo-login-input"
            type="password"
            id="admin-password"
            name="password"
            placeholder="PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <button className="valo-login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      );
    }

    if (resetStage === "request") {
      return (
        <form className="valo-login-form" onSubmit={handleRequestReset}>
          <label className="sr-only" htmlFor="admin-reset-username">Admin Username</label>
          <input
            className="valo-login-input"
            type="text"
            id="admin-reset-username"
            name="username"
            placeholder="USERNAME"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />

          <button className="valo-login-submit" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Code"}
          </button>

          <button
            type="button"
            className="valo-login-secondary"
            onClick={() => {
              setMessage("Enter the OTP from your latest email and choose a new password.");
              setResetStage("verify");
            }}
          >
            I already have an OTP
          </button>
        </form>
      );
    }

    return (
      <form className="valo-login-form" onSubmit={handleVerifyReset}>
        <label className="sr-only" htmlFor="admin-verify-username">Admin Username</label>
        <input
          className="valo-login-input"
          type="text"
          id="admin-verify-username"
          name="username"
          placeholder="USERNAME"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
        <label className="sr-only" htmlFor="admin-reset-code">One-time code</label>
        <input
          className="valo-login-input"
          type="text"
          id="admin-reset-code"
          name="code"
          placeholder="ONE-TIME CODE"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value)}
          required
        />
        <div className="valo-login-password-row">
          <div className="valo-login-password-field">
            <label className="sr-only" htmlFor="admin-reset-newpass">New Password</label>
            <input
              className="valo-login-input valo-login-input-compact"
              type="password"
              id="admin-reset-newpass"
              name="new_password"
              placeholder="NEW PASSWORD"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="valo-login-password-field">
            <label className="sr-only" htmlFor="admin-reset-confirmpass">Confirm Password</label>
            <input
              className="valo-login-input valo-login-input-compact"
              type="password"
              id="admin-reset-confirmpass"
              name="confirm_password"
              placeholder="CONFIRM PASSWORD"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button className="valo-login-submit" type="submit" disabled={loading}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>

        <button
          type="button"
          className="valo-login-secondary"
          onClick={() => {
            setMessage("");
            setResetStage("request");
          }}
          disabled={loading || otpJustSent}
        >
          Back to request code
        </button>
      </form>
    );
  };

  return (
    <div className="login-shell valo-login-shell">
      <div className="valo-login-frame">
        <section className="valo-login-panel">
          <Link className="valo-login-gate-link" to="/gate/login">
            <span>Gate Portal</span>
          </Link>

          <div className="valo-login-card">
            <div className="valo-login-brand-row">
              <img className="valo-login-logo" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
              <div className="valo-login-brand-copy">
                <div className="valo-login-kicker">Operations</div>
                <div className="valo-login-brand">Admin Portal</div>
              </div>
            </div>

            <div className="valo-login-header">
              <h1 className="valo-login-title">{resetMode ? "Account Recovery" : title}</h1>
              <p className="valo-login-subtitle">
                {resetMode
                  ? "Recover access using the email linked to your operations account."
                  : helper}
              </p>
            </div>

            {renderForm()}

            <div className={`valo-login-message${message ? " visible" : ""}`} aria-live="polite">
              {message || " "}
            </div>

            <div className="valo-login-footer">
              <div className="valo-login-footer-group">
                <span>Switch portal</span>
                <Link to={backLinkTo}>{backLinkLabel}</Link>
              </div>
              <button
                type="button"
                className="valo-login-link-button"
                onClick={() => {
                  setResetMode((value) => !value);
                  resetFlowState();
                  setPassword("");
                  setMessage("");
                }}
              >
                {resetMode ? "Back to login" : "Need account recovery?"}
              </button>
            </div>
          </div>
        </section>

        <aside className="valo-login-visual">
          <div className="valo-login-visual-image" />
          <div className="valo-login-visual-overlay" />
          <div className="valo-login-visual-content">
            <div className="valo-login-visual-tag">Barangay 663-A</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
