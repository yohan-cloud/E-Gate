import { useEffect, useState } from "react";

import EventSelector from "../EventSelector";
import FaceScanner from "../FaceScanner";
import QrScanner from "../QrScanner";
import Analytics from "../dashboard/Analytics";
import AuditTrail from "../dashboard/AuditTrail";
import AdminOverview from "../dashboard/AdminOverview";
import CreateEventForm from "../dashboard/CreateEventForm";
import CreateResidentForm from "../dashboard/CreateResidentForm";
import DashboardHome from "../dashboard/DashboardHome";
import Guests from "../dashboard/Guests";
import ResidentsTable from "../dashboard/ResidentsTable";
import Settings from "../dashboard/Settings";
import VenueManagement from "../dashboard/VenueManagement";
import VerificationRequests from "../dashboard/VerificationRequests";

const ADMIN_NAV_ITEMS = [
  { key: "overview", label: "Dashboard", eyebrow: "Home" },
  { key: "scanner", label: "Scanner", eyebrow: "Access" },
  { key: "verifications", label: "Verifications", eyebrow: "Review" },
  { key: "dashboard", label: "Manage Events", eyebrow: "Events" },
  { key: "venues", label: "Venues", eyebrow: "Facilities" },
  { key: "analytics", label: "Analytics", eyebrow: "Reports" },
  { key: "residents", label: "Residents", eyebrow: "Records" },
  { key: "audit", label: "Audit Trail", eyebrow: "Security" },
  { key: "createEvent", label: "Event Creation", eyebrow: "New" },
  { key: "createResident", label: "Resident Registration", eyebrow: "Onboard" },
  { key: "guests", label: "Guest Appointment", eyebrow: "Visitors" },
  { key: "settings", label: "Settings", eyebrow: "System" },
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
            <div className="user-name">Admin User</div>
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
            <div className="user-chip">
              <div className="user-name">Admin User</div>
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
  return (
    <div className={`card scanner-result-card scanner-result-${getScanTone(lastScan)}`} style={{ padding: 16, minHeight: 320 }}>
      <h3 style={{ marginTop: 0 }}>{lastScan ? lastScan.title || "Scan Result" : "Awaiting scan"}</h3>
      {lastScan ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="scanner-result-icon">{getScanIcon(lastScan)}</div>
            <div>
              <div className="scanner-result-name">{lastScan.username || "Resident"}</div>
              <div style={{ color: "#475569" }}>{lastScan.message || "Waiting for the next scan."}</div>
            </div>
          </div>
          <InfoRow label="Result" value={<span className={`scanner-status-pill scanner-status-${getScanTone(lastScan)}`}>{lastScan.code || "pending"}</span>} />
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
                <div style={{ fontWeight: 700 }}>{item.username || item.title || "Unknown resident"}</div>
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
