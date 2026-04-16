import { useEffect, useState } from "react";
import { api } from "../../api";

export default function TopBar({ onLogout, onViewProfile, currentView, onNavigate }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  });
  const [role, setRole] = useState(() => localStorage.getItem("role") || "");

  useEffect(() => {
    // keep role in sync
    setRole(localStorage.getItem("role") || "");
  }, []);

  useEffect(() => {
    // For residents, fetch profile to get photo if not present
    if (role === "Resident") {
      (async () => {
        try {
          const res = await api.get("/residents/profile/");
          const profile = res?.data || {};
          setUser((prev) => {
            const nextUser = { ...(prev || {}), profile };
            try {
              localStorage.setItem("user", JSON.stringify(nextUser));
            } catch {
              return nextUser;
            }
            return nextUser;
          });
        } catch {
          // ignore
        }
      })();
    }
  }, [role]);

  const name = user?.username || user?.user?.username || "";

  const navItems = [
    { key: "browse", label: "Browse Events" },
    { key: "mine", label: "My Registrations" },
    { key: "verification", label: "Verify Account" },
    { key: "profile", label: "Profile" },
  ];

  return (
    <div className="header-shell">
      <div className="brand-chip">
        <div className="brand-icon">B</div>
        <div className="brand-meta">
          <div style={{ fontWeight: 700 }}>Barangay 663-A</div>
          <div className="muted" style={{ fontSize: 12 }}>Resident Portal</div>
        </div>
        <div className="nav-scroll" style={{ marginLeft: 12 }}>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                onNavigate && onNavigate(item.key);
                if (item.key === 'profile' && onViewProfile) onViewProfile();
              }}
              className={`pill ${currentView === item.key ? "active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="stack-row" style={{ gap: 12 }}>
        <div className="user-meta">
          <div style={{ fontWeight: 600 }}>{name || "Resident"}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{role || "Resident"}</div>
        </div>
        <button onClick={() => onLogout && onLogout()} className="pill-light">
          <span aria-hidden>{'>'}</span>
          Logout
        </button>
      </div>
    </div>
  );
}
