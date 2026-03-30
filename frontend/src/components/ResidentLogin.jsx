import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearStoredAuth } from "../api";

export default function ResidentLogin({ onLogin, redirectTo = "/resident" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetStage, setResetStage] = useState("request"); // request | verify
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpJustSent, setOtpJustSent] = useState(false);
  const navigate = useNavigate();

  const resetFlowState = () => {
    setResetStage("request");
    setEmail("");
    setOtpCode("");
    setNewPassword("");
    setOtpJustSent(false);
  };

  const getApiErrorMessage = (err, fallback) => {
    const data = err?.response?.data;
    const formatMessage = (message) => {
      if (typeof message !== "string") return "";
      return message.replace(/Expected available in\s+(\d+)\s+seconds?/i, (_, rawSeconds) => {
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
      const res = await api.post("/accounts/login/resident/", { username, password });
      const access = res?.data?.tokens?.access;
      const refresh = res?.data?.tokens?.refresh;
      const user = res?.data?.user;
      if (access) localStorage.setItem("access_token", access);
      if (refresh) localStorage.setItem("refresh_token", refresh);
      const role = res?.data?.meta?.role || "Resident";
      localStorage.setItem("role", role);
      if (user) {
        try { localStorage.setItem("user", JSON.stringify(user)); } catch { return; }
        if (user?.username) localStorage.setItem("username", user.username);
      }
      setMessage(res?.data?.message || "Login successful!");
      onLogin?.(role);
      try { navigate(redirectTo); } catch { return; }
    } catch (err) {
      setMessage(err.response?.data?.error || "Login failed");
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
      await api.post("/accounts/password/otp/request/", { username, email });
      setPassword("");
      setOtpJustSent(true);
      setMessage("A reset code was sent to your email. Use the newest email code, then enter your new password.");
      setResetStage("verify");
    } catch (err) {
      setMessage(getApiErrorMessage(err, "Failed to send reset email"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      clearStoredAuth();
      await api.post("/accounts/password/otp/verify/", { username, code: otpCode, new_password: newPassword });
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

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginTop: 0 }}>Resident Login</h2>
        {!resetMode ? (
          <form onSubmit={handleLogin}>
            <label className="sr-only" htmlFor="resident-username">Resident Username</label>
            <input
              type="text"
              id="resident-username"
              name="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
              autoComplete="username"
            />
            <label className="sr-only" htmlFor="resident-password">Resident Password</label>
            <input
              type="password"
              id="resident-password"
              name="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
              autoComplete="current-password"
            />
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", marginTop: 8 }}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        ) : resetStage === "request" ? (
          <form onSubmit={handleRequestReset}>
            <label className="sr-only" htmlFor="reset-username">Resident Username</label>
            <input
              type="text"
              id="reset-username"
              name="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
              autoComplete="username"
            />
            <label className="sr-only" htmlFor="reset-email">Email</label>
            <input
              type="email"
              id="reset-email"
              name="email"
              placeholder="Registered email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
              autoComplete="email"
            />
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", marginTop: 8 }}>
              {loading ? "Sending email..." : "Send reset code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage("Enter the OTP from your latest email and choose a new password.");
                setResetStage("verify");
              }}
              style={{ width: "100%", padding: "10px 14px", marginTop: 8, background: "none", border: "1px solid #9cc8b8", borderRadius: 6, color: "#1f4d3f", cursor: "pointer" }}
            >
              I already have an OTP
            </button>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "#6b4f1d" }}>
              Requesting a new OTP immediately invalidates the previous code. Use only the latest OTP email.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyReset}>
            <label className="sr-only" htmlFor="verify-username">Resident Username</label>
            <input
              type="text"
              id="verify-username"
              name="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
              autoComplete="username"
            />
            <label className="sr-only" htmlFor="reset-code">One-time code</label>
            <input
              type="text"
              id="reset-code"
              name="code"
              placeholder="6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
            />
            <label className="sr-only" htmlFor="reset-newpass">New Password</label>
            <input
              type="password"
              id="reset-newpass"
              name="new_password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              required
            />
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", marginTop: 8 }}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setResetStage("request");
              }}
              disabled={loading || otpJustSent}
              style={{ width: "100%", padding: "10px 14px", marginTop: 8, background: "none", border: "1px solid #9cc8b8", borderRadius: 6, color: "#1f4d3f", cursor: loading || otpJustSent ? "not-allowed" : "pointer", opacity: loading || otpJustSent ? 0.6 : 1 }}
            >
              Back to request code
            </button>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "#6b4f1d" }}>
              {otpJustSent
                ? "Use the OTP from the email you just received. Going back to request another code will replace it."
                : "If you request another OTP, the code you already have will stop working."}
            </p>
          </form>
        )}
        <p>{message}</p>
        <div style={{ marginTop: 8, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/admin/login">Admin Login</Link>
          <button
            type="button"
            onClick={() => {
              setResetMode((v) => !v);
              resetFlowState();
              setPassword("");
              setMessage("");
            }}
            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}
          >
            {resetMode ? "Back to login" : "Forgot password?"}
          </button>
        </div>
      </div>
    </div>
  );
}
