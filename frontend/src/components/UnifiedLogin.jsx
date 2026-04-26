import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, clearStoredAuth, notifyAuthChanged } from "../api";

function dashboardForRole(role) {
  if (role === "Resident") return "/resident/dashboard";
  if (role === "GateOperator") return "/gate/dashboard";
  return "/admin/dashboard";
}

export default function UnifiedLogin({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetStage, setResetStage] = useState("request");
  const [resetAccountType, setResetAccountType] = useState("resident");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpJustSent, setOtpJustSent] = useState(false);

  const resetFlowState = () => {
    setResetStage("request");
    setResetAccountType("resident");
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

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      clearStoredAuth();

      const response = await fetch("/api/accounts/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw {
          response: {
            data: payload,
            status: response.status,
          },
        };
      }

      const access = payload?.tokens?.access;
      const refresh = payload?.tokens?.refresh;
      const role = payload?.meta?.role || "";
      const user = payload?.user;

      if (access) localStorage.setItem("access_token", access);
      if (refresh) localStorage.setItem("refresh_token", refresh);
      if (role) localStorage.setItem("role", role);
      if (user) {
        try {
          localStorage.setItem("user", JSON.stringify(user));
        } catch {
          // Ignore storage serialization errors and continue with auth.
        }
        if (user?.username) localStorage.setItem("username", user.username);
      }

      notifyAuthChanged();
      onLogin?.(role);
      navigate(dashboardForRole(role), { replace: true });
    } catch (error) {
      setMessage(
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      clearStoredAuth();
      const cleanedUsername = username.trim();
      let detectedAccountType = "resident";

      try {
        await api.post("/accounts/password/otp/request/", {
          username: cleanedUsername,
          account_type: "resident",
        });
        detectedAccountType = "resident";
      } catch (residentError) {
        const residentStatus = residentError?.response?.status;
        if (residentStatus && residentStatus !== 404) {
          throw residentError;
        }

        await api.post("/accounts/password/otp/request/", {
          username: cleanedUsername,
          account_type: "admin",
        });
        detectedAccountType = "admin";
      }

      setResetAccountType(detectedAccountType);
      setPassword("");
      setOtpJustSent(true);
      setMessage("A reset code was sent to the email linked to this username. Use the newest email code, then enter your new password.");
      setResetStage("verify");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Failed to send reset email"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirm password must match.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      clearStoredAuth();
      await api.post("/accounts/password/otp/verify/", {
        username: username.trim(),
        account_type: resetAccountType,
        code: otpCode,
        new_password: newPassword,
      });
      setPassword("");
      setMessage("Password reset successful. Please log in with your new password.");
      setResetMode(false);
      resetFlowState();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Failed to reset password"));
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    if (!resetMode) {
      return (
        <form className="valo-login-form" onSubmit={handleLogin}>
          <label className="sr-only" htmlFor="unified-username">Username</label>
          <input
            className="valo-login-input"
            type="text"
            id="unified-username"
            name="username"
            placeholder="USERNAME"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoComplete="username"
          />

          <label className="sr-only" htmlFor="unified-password">Password</label>
          <input
            className="valo-login-input"
            type="password"
            id="unified-password"
            name="password"
            placeholder="PASSWORD"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          <label className="sr-only" htmlFor="unified-reset-username">Username</label>
          <input
            className="valo-login-input"
            type="text"
            id="unified-reset-username"
            name="username"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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
        <label className="sr-only" htmlFor="unified-verify-username">Username</label>
        <input
          className="valo-login-input"
          type="text"
          id="unified-verify-username"
          name="username"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoComplete="username"
        />

        <label className="sr-only" htmlFor="unified-reset-code">One-time code</label>
        <input
          className="valo-login-input"
          type="text"
          id="unified-reset-code"
          name="code"
          placeholder="ONE-TIME CODE"
          value={otpCode}
          onChange={(event) => setOtpCode(event.target.value)}
          required
        />

        <div className="valo-login-password-row">
          <div className="valo-login-password-field">
            <label className="sr-only" htmlFor="unified-reset-newpass">New Password</label>
            <input
              className="valo-login-input valo-login-input-compact"
              type="password"
              id="unified-reset-newpass"
              name="new_password"
              placeholder="NEW PASSWORD"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>
          <div className="valo-login-password-field">
            <label className="sr-only" htmlFor="unified-reset-confirmpass">Confirm Password</label>
            <input
              className="valo-login-input valo-login-input-compact"
              type="password"
              id="unified-reset-confirmpass"
              name="confirm_password"
              placeholder="CONFIRM PASSWORD"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
          <div className="valo-login-card">
            <div className="valo-login-brand-row valo-login-brand-row-unified-inline">
              <img className="valo-login-logo valo-login-logo-unified-inline" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
              <div className="valo-login-brand-copy valo-login-brand-copy-unified">
                <div className="valo-login-brand valo-login-brand-unified">Barangay 663-A</div>
              </div>
            </div>

            <div className="valo-login-header valo-login-header-unified">
              <h1 className="valo-login-title">{resetMode ? "Account Recovery" : "Welcome"}</h1>
            </div>

            {renderForm()}

            <div className={`valo-login-message${message ? " visible" : ""}`} aria-live="polite">
              {message || " "}
            </div>

            <div className="valo-login-footer">
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
                {resetMode ? "Back to login" : "Forgot password?"}
              </button>
            </div>
          </div>
        </section>

        <aside className="valo-login-visual">
          <div className="valo-login-visual-image" />
          <div className="valo-login-visual-overlay" />
        </aside>
      </div>
    </div>
  );
}
