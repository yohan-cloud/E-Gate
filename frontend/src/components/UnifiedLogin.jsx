import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { clearStoredAuth, notifyAuthChanged } from "../api";

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

  return (
    <div className="login-shell valo-login-shell">
      <div className="valo-login-frame">
        <section className="valo-login-panel">
          <div className="valo-login-card">
            <div className="valo-login-brand-row">
              <img className="valo-login-logo" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
              <div className="valo-login-brand-copy">
                <div className="valo-login-kicker">Unified Access</div>
                <div className="valo-login-brand">E-Gate Portal Login</div>
              </div>
            </div>

            <div className="valo-login-header">
              <h1 className="valo-login-title">Welcome</h1>
              <p className="valo-login-subtitle">
                Sign in once with your username and password. We&apos;ll send you to the correct dashboard automatically.
              </p>
            </div>

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

            <div className={`valo-login-message${message ? " visible" : ""}`} aria-live="polite">
              {message || " "}
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
