import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearStoredAuth } from "../api";

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
  const navigate = useNavigate();

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

  return (
    <div className="login-shell valo-login-shell">
      <div className="valo-login-frame">
        <section className="valo-login-panel">
          <Link className="valo-login-gate-link" to="/gate">
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
              <h1 className="valo-login-title">{title}</h1>
              <p className="valo-login-subtitle">{helper}</p>
            </div>

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
                autoComplete="current-password"
              />

              <button className="valo-login-submit" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className={`valo-login-message${message ? " visible" : ""}`} aria-live="polite">
              {message || " "}
            </div>

            <div className="valo-login-footer">
              <span>Switch portal</span>
              <Link to={backLinkTo}>{backLinkLabel}</Link>
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
