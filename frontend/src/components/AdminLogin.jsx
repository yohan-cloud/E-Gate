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
    <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ marginTop: -4, color: "#64748b", fontSize: 14 }}>{helper}</p>
        <form onSubmit={handleLogin}>
          <label className="sr-only" htmlFor="admin-username">Admin Username</label>
          <input
            type="text"
            id="admin-username"
            name="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
            autoComplete="username"
          />
          <label className="sr-only" htmlFor="admin-password">Admin Password</label>
          <input
            type="password"
            id="admin-password"
            name="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", margin: "6px 0", padding: "10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", marginTop: 8 }}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <p>{message}</p>
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <Link to={backLinkTo}>{backLinkLabel}</Link>
        </div>
      </div>
    </div>
  );
}
