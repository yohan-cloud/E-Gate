import { useEffect, useState } from "react";

import NightModeIconButton from "../common/NightModeIconButton";
import EventSelector from "../EventSelector";
import FaceScanner from "../FaceScanner";
import QrScanner from "../QrScanner";
import Analytics from "../dashboard/Analytics";
import AuditTrail from "../dashboard/AuditTrail";
import AdminOverview from "../dashboard/AdminOverview";
import CreateEventForm from "../dashboard/CreateEventForm";
import CreateResidentForm from "../dashboard/CreateResidentForm";
import DashboardHome from "../dashboard/DashboardHome";
import GateAccounts from "../dashboard/GateAccounts";
import Guests from "../dashboard/Guests";
import ResidentsTable from "../dashboard/ResidentsTable";
import Settings from "../dashboard/Settings";
import VenueManagement from "../dashboard/VenueManagement";
import VerificationRequests from "../dashboard/VerificationRequests";

const ADMIN_NAV_ITEMS = [
  { key: "overview", label: "Dashboard", eyebrow: "Home", icon: "home" },
  { key: "scanner", label: "Scanner", eyebrow: "Access", icon: "scan" },
  { key: "verifications", label: "Verifications", eyebrow: "Review", icon: "shield" },
  { key: "dashboard", label: "Manage Events", eyebrow: "Events", icon: "calendar" },
  { key: "venues", label: "Venues", eyebrow: "Facilities", icon: "building" },
  { key: "analytics", label: "Analytics", eyebrow: "Reports", icon: "chart" },
  { key: "residents", label: "Residents", eyebrow: "Records", icon: "users" },
  { key: "audit", label: "Audit Trail", eyebrow: "Security", icon: "shield" },
  { key: "createEvent", label: "Event Creation", eyebrow: "New", icon: "plus" },
  { key: "createResident", label: "Resident Registration", eyebrow: "Onboard", icon: "userPlus" },
  { key: "gateAccounts", label: "Gate Accounts", eyebrow: "Access", icon: "key" },
  { key: "guests", label: "Appointments", eyebrow: "Visitors", icon: "user" },
  { key: "settings", label: "Settings", eyebrow: "System", icon: "settings" },
];

function formatSchedule(start, end) {
  if (!start) return "TBD schedule";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "TBD schedule";
  const startLabel = startDate.toLocaleString();
  if (!end) return startLabel;
  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return startLabel;
  return `${startLabel} until ${endDate.toLocaleString()}`;
}

export default function AdminPortal({ onLogout }) {
  const [adminUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [viewMode, setViewMode] = useState("overview");
  const [scannerMode, setScannerMode] = useState("qr");
  const [lastScan, setLastScan] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 920px)").matches;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const activeItem = ADMIN_NAV_ITEMS.find((item) => item.key === viewMode) || ADMIN_NAV_ITEMS[0];
  const adminName = getPreferredName(adminUser, "Admin User");
  const greeting = getTimeGreeting();

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

  const handleScanResult = (result) => {
    setLastScan(result);
    setScanHistory((curr) => [result, ...curr].slice(0, 5));
  };

  return (
    <div className="admin-layout">
      {isMobileView && isMobileNavOpen ? (
        <button
          type="button"
          className="admin-mobile-backdrop"
          aria-label="Close admin navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside className={`admin-sidebar ${isMobileView ? "mobile-drawer" : ""} ${isMobileNavOpen ? "mobile-open" : ""}`}>
        <div className="admin-sidebar-top">
          <div className="brand admin-brand">
            <img className="brand-logo" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
            <div>
              <div className="brand-title">Barangay 663-A</div>
              <div className="brand-sub">Admin Portal</div>
            </div>
          </div>
          <div className="admin-sidebar-note">
            Centralized dashboard for events, residents, verification, and gate operations.
          </div>
          <div
            id="admin-mobile-navigation"
            className="admin-side-nav"
            role="tablist"
            aria-label="Admin sections"
          >
            {ADMIN_NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`admin-side-link ${viewMode === item.key ? "active" : ""}`}
                onClick={() => {
                  setViewMode(item.key);
                  if (isMobileView) setIsMobileNavOpen(false);
                }}
                role="tab"
                aria-selected={viewMode === item.key}
              >
                <span className="admin-side-link-icon" aria-hidden="true">{renderAdminIcon(item.icon)}</span>
                <span className="admin-side-link-copy">
                  <span className="admin-side-link-eyebrow">{item.eyebrow}</span>
                  <span className="admin-side-link-label">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-sidebar-bottom">
          <div className="admin-user-card">
            <div className="user-name">{adminName}</div>
            <div className="user-role">Administrator</div>
          </div>
          <button className="logout-pill admin-logout" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <section className="admin-main">
        <div className="admin-main-header">
          <div>
            {isMobileView ? (
              <button
                type="button"
                className="admin-mobile-nav-toggle"
                aria-expanded={isMobileNavOpen}
                aria-controls="admin-mobile-navigation"
                onClick={() => setIsMobileNavOpen((current) => !current)}
              >
                <span className="admin-mobile-nav-toggle-icon" aria-hidden="true">
                  {isMobileNavOpen ? "X" : "="}
                </span>
                <span>{isMobileNavOpen ? "Close menu" : "Open menu"}</span>
              </button>
            ) : null}
            <div className="admin-main-kicker">{activeItem.eyebrow}</div>
            <div className="admin-main-title">{activeItem.label}</div>
          </div>
          <div className="admin-main-meta">
            <NightModeIconButton />
            <div className="user-chip">
              <div className="user-name">{greeting}, {adminName}</div>
              <div className="user-role">Administrator</div>
            </div>
          </div>
        </div>

        <div className="main-content admin-main-content">
          {viewMode === "overview" ? (
            <AdminOverview />
          ) : viewMode === "scanner" ? (
            <ScannerWorkspace
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              scannerMode={scannerMode}
              onScannerModeChange={setScannerMode}
              lastScan={lastScan}
              scanHistory={scanHistory}
              onScanResult={handleScanResult}
            />
          ) : viewMode === "dashboard" ? (
            <DashboardHome />
          ) : viewMode === "venues" ? (
            <VenueManagement />
          ) : viewMode === "analytics" ? (
            <Analytics />
          ) : viewMode === "residents" ? (
            <ResidentsTable />
          ) : viewMode === "audit" ? (
            <AuditTrail />
          ) : viewMode === "verifications" ? (
            <VerificationRequests />
          ) : viewMode === "createEvent" ? (
            <CreateEventForm onCreated={() => setViewMode("dashboard")} />
          ) : viewMode === "createResident" ? (
            <CreateResidentForm />
          ) : viewMode === "gateAccounts" ? (
            <GateAccounts />
          ) : viewMode === "guests" ? (
            <Guests />
          ) : viewMode === "settings" ? (
            <Settings />
          ) : (
            <div className="card"><p>Not authorized for this view.</p></div>
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
    user?.first_name ||
    user?.user?.first_name ||
    user?.full_name ||
    user?.user?.full_name ||
    user?.username ||
    user?.user?.username ||
    "";
  return String(candidate || "").trim() || fallback;
}

function renderAdminIcon(name) {
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
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-5h5v5" /></>,
    scan: <><path d="M7 4H5a1 1 0 0 0-1 1v2" /><path d="M17 4h2a1 1 0 0 1 1 1v2" /><path d="M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M17 20h2a1 1 0 0 0 1-1v-2" /><path d="M8 12h8" /><path d="M12 8v8" /></>,
    shield: <><path d="M12 21s7-3.5 7-10V6l-7-3-7 3v5c0 6.5 7 10 7 10Z" /><path d="m9.5 12 1.7 1.7 3.5-4" /></>,
    calendar: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16" /></>,
    building: <><path d="M4 21h16" /><path d="M6 21V7l7-3v17" /><path d="M13 9h5v12" /><path d="M8.5 10h1" /><path d="M8.5 14h1" /><path d="M15.5 13h1" /><path d="M15.5 17h1" /></>,
    chart: <><path d="M4 19h16" /><path d="M6 16a6 6 0 1 1 12 0" /><path d="m12 13 4-5" /></>,
    users: <><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M20 20v-1.2a3 3 0 0 0-2-2.8" /><path d="M17 5.3a3 3 0 0 1 0 5.4" /></>,
    plus: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8" /><path d="M8 12h8" /></>,
    userPlus: <><path d="M15 20v-1.5A3.5 3.5 0 0 0 11.5 15h-4A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="9.5" cy="8" r="3" /><path d="M18 8v6" /><path d="M15 11h6" /></>,
    key: <><circle cx="7.5" cy="14.5" r="3.5" /><path d="m10 12 8-8" /><path d="m15 7 2 2" /><path d="m13 9 2 2" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5A2 2 0 0 1 11 3h2a2 2 0 0 1 2 1.5" /><path d="M9 10h6" /><path d="M9 14h6" /><path d="M9 18h4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V22h-4v-.5a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7l2-3.4.2.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V2h4v.5a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  };
  return <svg {...common}>{icons[name] || icons.home}</svg>;
}

function ScannerWorkspace({
  selectedEvent,
  onSelectEvent,
  scannerMode,
  onScannerModeChange,
  lastScan,
  scanHistory,
  onScanResult,
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>ID Scanner</h2>
          <div style={{ color: "#475569" }}>Scan QR codes or verify faces for resident identification</div>
        </div>
        <EventSelector onSelect={onSelectEvent} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => onScannerModeChange("qr")} className={`top-pill ${scannerMode === "qr" ? "active" : ""}`} style={{ background: scannerMode === "qr" ? "#0f172a" : "#fff", color: scannerMode === "qr" ? "#fff" : "#000" }}>QR Code Scanner</button>
        <button onClick={() => onScannerModeChange("face")} className={`top-pill ${scannerMode === "face" ? "active" : ""}`} style={{ background: scannerMode === "face" ? "#0f172a" : "#fff", color: scannerMode === "face" ? "#fff" : "#000" }}>Face Recognition</button>
      </div>
      {selectedEvent ? (
        <div className="admin-scanner-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14, alignItems: "stretch" }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="scanner-event-banner">
              <div>
                <div className="scanner-event-kicker">Now Scanning For</div>
                <div className="scanner-event-title">{selectedEvent.title}</div>
                <div className="scanner-event-meta">
                  <span>{selectedEvent.venue || "TBD venue"}</span>
                  <span>{formatSchedule(selectedEvent.date, selectedEvent.end_date)}</span>
                </div>
              </div>
              <div className="scanner-capacity-box">
                <div>{selectedEvent.registrations_count || 0}/{selectedEvent.capacity || "ÃƒÂ¢Ã‹â€ Ã…Â¾"}</div>
                <small>checked in / capacity</small>
              </div>
            </div>
            <div className="scanner-capacity-track">
              <div
                className="scanner-capacity-fill"
                style={{
                  width: `${selectedEvent.capacity ? Math.min(100, Math.round(((selectedEvent.registrations_count || 0) / selectedEvent.capacity) * 100)) : 15}%`,
                }}
              />
            </div>
            {scannerMode === "qr" ? (
              <QrScanner eventId={selectedEvent.id} onScanResult={onScanResult} />
            ) : (
              <FaceScanner eventId={selectedEvent.id} onScanResult={onScanResult} />
            )}
          </div>
          <ScanSummaryCard lastScan={lastScan} scanHistory={scanHistory} />
        </div>
      ) : (
        <p>Please select an event to start scanning.</p>
      )}
    </div>
  );
}

function ScanSummaryCard({ lastScan, scanHistory }) {
  const residentLabel = lastScan?.residentFullName || lastScan?.username || "Resident";
  return (
    <div
      key={lastScan?.timestamp || "awaiting-scan"}
      className={`card scanner-result-card scanner-result-${getScanTone(lastScan)} ${lastScan ? "scanner-result-pop" : ""}`}
      style={{ padding: 16, minHeight: 320 }}
    >
      <h3 style={{ marginTop: 0 }}>{lastScan ? lastScan.title || "Scan Result" : "Awaiting scan"}</h3>
      {lastScan ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <ResidentPhotoAvatar src={lastScan.residentPhoto} name={residentLabel} />
            <div>
              <div className="scanner-result-name">{residentLabel}</div>
              {lastScan.username && lastScan.username !== residentLabel ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>@{lastScan.username}</div>
              ) : null}
              <div style={{ color: "#475569" }}>{lastScan.message || "Waiting for the next scan."}</div>
            </div>
            <div className="scanner-result-icon" style={{ marginLeft: "auto" }}>{getScanIcon(lastScan)}</div>
          </div>
          <InfoRow label="Result" value={<span className={`scanner-status-pill scanner-status-${getScanTone(lastScan)}`}>{lastScan.code || "pending"}</span>} />
          <InfoRow label="Full Name" value={lastScan.residentFullName || lastScan.username || "N/A"} />
          <InfoRow label="ID" value={lastScan.barangayId || "N/A"} />
          <InfoRow label="Birthdate" value={formatDateTime(lastScan.residentBirthdate, true) || "N/A"} />
          <InfoRow label="Verified" value={lastScan.residentVerified === true ? "Yes" : lastScan.residentVerified === false ? "No" : "N/A"} />
          <InfoRow label="Expiry" value={formatDateTime(lastScan.residentExpiryDate, true) || "N/A"} />
          <InfoRow label="Address / Zone" value={formatAddressZone(lastScan.residentAddress, lastScan.residentZone)} />
          <InfoRow label="Scanned At" value={lastScan.checkedInAt ? new Date(lastScan.checkedInAt).toLocaleString() : "Now"} />
        </div>
      ) : (
        <p style={{ color: "#6b7280" }}>Scan a resident to view details.</p>
      )}
      <div style={{ marginTop: 16 }}>
        <h4 style={{ margin: "0 0 10px" }}>Scan History (last 5)</h4>
        <div className="scanner-history-list">
          {scanHistory.length === 0 ? (
            <div className="scanner-history-empty">No recent scans yet.</div>
          ) : (
            scanHistory.map((item, index) => (
              <div key={`${item.timestamp}-${index}`} className={`scanner-history-item scanner-history-${getScanTone(item)}`}>
                <div style={{ fontWeight: 700 }}>{item.residentFullName || item.username || item.title || "Unknown resident"}</div>
                <div style={{ color: "#475569", fontSize: 13 }}>{item.title || item.message}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResidentPhotoAvatar({ src, name }) {
  const initials = String(name || "Resident")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";

  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#e8f4ed",
        border: "2px solid #b8dcc8",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        color: "#166534",
        fontWeight: 800,
      }}
      aria-label={`${name || "Resident"} profile photo`}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function getScanTone(scan) {
  if (!scan) return "idle";
  if (scan.severity === "success") return "success";
  if (scan.severity === "warning") return "warning";
  return "error";
}

function getScanIcon(scan) {
  if (!scan) return "...";
  if (scan.severity === "success") return "[OK]";
  if (scan.severity === "warning") return "[!]";
  return "[X]";
}

function formatDateTime(dt, dateOnly = false) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString(undefined, dateOnly ? { year: "numeric", month: "short", day: "numeric" } : undefined);
  } catch {
    return dt;
  }
}

function formatAddressZone(address, zone) {
  const parts = [address, zone].filter(Boolean);
  const uniqueParts = [...new Set(parts)];
  return uniqueParts.length ? uniqueParts.join(" - ") : "N/A";
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "6px 0" }}>
      <div style={{ color: "#475569" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
