import { useCallback, useEffect, useState } from "react";

import { api } from "../../api";
import NightModeIconButton from "../common/NightModeIconButton";
import Appointments from "../resident/Appointments";
import BrowseEvents from "../resident/BrowseEvents";
import MyRegistrations from "../resident/MyRegistrations";
import ProfileCard from "../resident/ProfileCard";
import VerificationTab from "../resident/VerificationTab";

const RESIDENT_NAV_ITEMS = [
  { key: "browse", label: "Browse Events", eyebrow: "Explore", icon: "calendar" },
  { key: "mine", label: "My Registrations", eyebrow: "Activity", icon: "clipboard" },
  { key: "appointments", label: "Appointments", eyebrow: "Services", icon: "calendarCheck" },
  { key: "verification", label: "ID Reverification", eyebrow: "Identity", icon: "shield" },
  { key: "profile", label: "Profile", eyebrow: "Account", icon: "user" },
];

export default function ResidentPortal({ onLogout }) {
  const [viewMode, setViewMode] = useState("browse");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 920px)").matches;
  });
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const [role, setRole] = useState(() => localStorage.getItem("role") || "Resident");
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const activeItem = RESIDENT_NAV_ITEMS.find((item) => item.key === viewMode) || RESIDENT_NAV_ITEMS[0];

  useEffect(() => {
    setRole(localStorage.getItem("role") || "Resident");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 920px)");
    const syncMobileState = (event) => {
      const matches = typeof event?.matches === "boolean" ? event.matches : mediaQuery.matches;
      setIsMobileView(matches);
      if (!matches) {
        setIsMobileNavOpen(false);
      }
    };

    syncMobileState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMobileState);
      return () => mediaQuery.removeEventListener("change", syncMobileState);
    }

    mediaQuery.addListener(syncMobileState);
    return () => mediaQuery.removeListener(syncMobileState);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.get("/residents/profile/");
      const profile = res?.data || {};
      setUser((prev) => {
        const nextUser = {
          ...(prev || {}),
          ...(profile?.user || {}),
          profile,
        };
        try {
          localStorage.setItem("user", JSON.stringify(nextUser));
        } catch {
          return nextUser;
        }
        return nextUser;
      });
    } catch {
      // keep resident shell usable even if profile fetch fails
    }
  }, []);

  useEffect(() => {
    refreshProfile().catch(() => {
      // keep resident shell usable even if profile fetch fails
    });
  }, [refreshProfile]);

  const name = getPreferredName(user, "Resident");
  const greeting = getTimeGreeting();
  const expiryDate = user?.profile?.expiry_date ? new Date(`${user.profile.expiry_date}T00:00:00`) : null;
  const isExpired = !!(expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate < new Date(new Date().setHours(0, 0, 0, 0)));
  const isVerified = !!user?.profile?.is_verified && !isExpired;
  const mustChangePassword = Boolean(user?.must_change_password || user?.profile?.user?.must_change_password);

  useEffect(() => {
    if (mustChangePassword) {
      setViewMode("changePassword");
      setIsMobileNavOpen(false);
    }
  }, [mustChangePassword]);

  const handleForcedPasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordMessage("New password and confirmation do not match.");
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      const res = await api.post("/residents/change-password/", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setUser((prev) => {
        const nextUser = {
          ...(prev || {}),
          must_change_password: false,
          profile: prev?.profile
            ? {
                ...prev.profile,
                user: {
                  ...(prev.profile.user || {}),
                  must_change_password: false,
                },
              }
            : prev?.profile,
        };
        try {
          localStorage.setItem("user", JSON.stringify(nextUser));
        } catch {
          return nextUser;
        }
        return nextUser;
      });
      setPasswordMessage(res?.data?.message || "Password changed successfully.");
      setViewMode("browse");
      refreshProfile().catch(() => {});
    } catch (error) {
      const apiError = error?.response?.data?.error;
      setPasswordMessage(Array.isArray(apiError) ? apiError.join(", ") : apiError || "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="resident-layout">
      {isMobileView && isMobileNavOpen ? (
        <button
          type="button"
          className="resident-mobile-backdrop"
          aria-label="Close resident navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside className={`resident-sidebar ${isMobileView ? "mobile-drawer" : ""} ${isMobileNavOpen ? "mobile-open" : ""}`}>
        <div className="resident-sidebar-top">
          <div className="brand resident-brand">
            <img className="brand-logo" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
            <div>
              <div className="brand-title">Barangay 663-A</div>
              <div className="brand-sub">Resident Portal</div>
            </div>
          </div>
          <div className="resident-sidebar-note">
            Your personal event space for browsing, registrations, verification, and profile details.
          </div>
          <div
            id="resident-mobile-navigation"
            className="resident-side-nav"
            role="tablist"
            aria-label="Resident sections"
          >
            {mustChangePassword ? null : RESIDENT_NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`resident-side-link ${viewMode === item.key ? "active" : ""}`}
                onClick={() => {
                  setViewMode(item.key);
                  if (isMobileView) setIsMobileNavOpen(false);
                }}
                role="tab"
                aria-selected={viewMode === item.key}
              >
                <span className="resident-side-link-icon" aria-hidden="true">{renderPortalIcon(item.icon)}</span>
                <span className="resident-side-link-copy">
                  <span className="resident-side-link-eyebrow">{item.eyebrow}</span>
                  <span className="resident-side-link-label">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="resident-sidebar-bottom">
          <div className="resident-user-card">
            <div className="user-name">{name}</div>
            <div className="user-role">{role || "Resident"}</div>
          </div>
          <button className="logout-pill resident-logout" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <section className="resident-main">
        <div className="resident-main-header">
          <div>
            {isMobileView ? (
              <button
                type="button"
                className="resident-mobile-nav-toggle"
                aria-expanded={isMobileNavOpen}
                aria-controls="resident-mobile-navigation"
                onClick={() => setIsMobileNavOpen((current) => !current)}
              >
                <span className="resident-mobile-nav-toggle-icon" aria-hidden="true">
                  {isMobileNavOpen ? "X" : "☰"}
                </span>
                <span>{isMobileNavOpen ? "Close menu" : "Open menu"}</span>
              </button>
            ) : null}
            <div className="resident-main-kicker">{activeItem.eyebrow}</div>
            <div className="resident-main-title">{mustChangePassword ? "Change Password" : activeItem.label}</div>
          </div>
          <div className="resident-main-meta">
            <NightModeIconButton />
            <div className="user-chip">
              <div className="user-name">{greeting}, {name}</div>
              <div className="user-role">{role || "Resident"}</div>
            </div>
          </div>
        </div>

        <div className="main-content resident-main-content">
        {mustChangePassword ? (
          <div className="card" style={{ maxWidth: 560, padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Change Your Temporary Password</h3>
              <p style={{ color: "#475569", marginBottom: 0 }}>
                Your admin reset your password. Update it now before continuing to the resident portal.
              </p>
            </div>
            <form onSubmit={handleForcedPasswordChange} style={{ display: "grid", gap: 12 }}>
              <input
                type="password"
                placeholder="CURRENT TEMPORARY PASSWORD"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm((current) => ({ ...current, current_password: e.target.value }))}
                autoComplete="current-password"
                required
              />
              <input
                type="password"
                placeholder="NEW PASSWORD"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm((current) => ({ ...current, new_password: e.target.value }))}
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                placeholder="CONFIRM NEW PASSWORD"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm((current) => ({ ...current, confirm_password: e.target.value }))}
                autoComplete="new-password"
                required
              />
              <button className="btn-primary" type="submit" disabled={passwordSaving}>
                {passwordSaving ? "Saving..." : "Change Password"}
              </button>
            </form>
            {passwordMessage ? (
              <div style={{ marginTop: 12, color: passwordMessage.toLowerCase().includes("success") ? "#166534" : "#b91c1c" }}>
                {passwordMessage}
              </div>
            ) : null}
          </div>
        ) : null}
        {!mustChangePassword && viewMode === "browse" && (
          <BrowseEvents
            isVerified={isVerified}
            onRequestVerification={() => setViewMode("verification")}
          />
        )}
        {!mustChangePassword && viewMode === "mine" && <MyRegistrations />}
        {!mustChangePassword && viewMode === "appointments" && <Appointments />}
        {!mustChangePassword && viewMode === "profile" && <ProfileCard />}
        {!mustChangePassword && viewMode === "verification" && (
          <VerificationTab
            onStatusChange={refreshProfile}
            residentProfile={user?.profile || null}
          />
        )}
        </div>
      </section>
    </div>
  );
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getPreferredName(user, fallback) {
  const candidate =
    user?.profile?.user?.first_name ||
    user?.first_name ||
    user?.user?.first_name ||
    user?.profile?.full_name ||
    user?.full_name ||
    user?.user?.full_name ||
    user?.profile?.user?.username ||
    user?.username ||
    user?.user?.username ||
    "";
  return String(candidate || "").trim() || fallback;
}

function renderPortalIcon(name) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const icons = {
    calendar: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16" /></>,
    calendarCheck: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16" /><path d="m9 15 2 2 4-5" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5A2 2 0 0 1 11 3h2a2 2 0 0 1 2 1.5" /><path d="M9 10h6" /><path d="M9 14h6" /><path d="M9 18h4" /></>,
    shield: <><path d="M12 21s7-3.5 7-10V6l-7-3-7 3v5c0 6.5 7 10 7 10Z" /><path d="m9.5 12 1.7 1.7 3.5-4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  };
  return <svg {...common}>{icons[name] || icons.user}</svg>;
}
