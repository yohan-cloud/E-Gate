import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { api } from "../../api";
import EventSelector from "../EventSelector";
import FaceScanner from "../FaceScanner";
import GuestAppointmentLookup from "../GuestAppointmentLookup";
import GuestQrScanner from "../GuestQrScanner";
import QrScanner from "../QrScanner";

const LOG_REFRESH_MS = 15000;

const GATE_MODES = {
  RESIDENT: "resident_log",
  EVENT: "event_attendance",
  GUEST: "guest_appointment",
};

const GATE_NAV_ITEMS = [
  { key: GATE_MODES.RESIDENT, label: "Resident Log", eyebrow: "Access" },
  { key: GATE_MODES.EVENT, label: "Event Attendance", eyebrow: "Events" },
  { key: GATE_MODES.GUEST, label: "Guest Appointment", eyebrow: "Visitors" },
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

export default function GatePortal({ onExit }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [gateMode, setGateMode] = useState(GATE_MODES.RESIDENT);
  const [scannerMode, setScannerMode] = useState(null);
  const [residentDirection, setResidentDirection] = useState("time_in");
  const [entryLogs, setEntryLogs] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [logError, setLogError] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [historyView, setHistoryView] = useState("recent");
  const [residentSheetDate, setResidentSheetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [guestSheetDate, setGuestSheetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isMobileGateView, setIsMobileGateView] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const activeUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const activeRole = localStorage.getItem("role") || "";
  const activeUsername = localStorage.getItem("username") || "";
  const isAuthenticatedGateUser = activeRole === "Administrator" || activeRole === "GateOperator";
  const greeting = getTimeGreeting();
  const displayName = getPreferredName(activeUser, activeUsername || "Guard Desk");
  const activeItem = GATE_NAV_ITEMS.find((item) => item.key === gateMode) || GATE_NAV_ITEMS[0];

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 920px), (pointer: coarse)");
    const syncMobileState = () => {
      const matches = mediaQuery.matches;
      setIsMobileGateView(matches);
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

  useEffect(() => {
    setLastResult(null);
  }, [gateMode, scannerMode, selectedEvent?.id]);

  useEffect(() => {
    setHistoryView("recent");
    setScannerMode(null);
  }, [gateMode]);

  useEffect(() => {
    if (gateMode === GATE_MODES.GUEST && scannerMode === "face") {
      setScannerMode(null);
    }
    if ((gateMode === GATE_MODES.RESIDENT || gateMode === GATE_MODES.EVENT) && scannerMode === "manual") {
      setScannerMode(null);
    }
  }, [gateMode, scannerMode]);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      setLogLoading(true);
      setLogError("");
      try {
        const params = new URLSearchParams();
        if (logQuery.trim()) params.set("q", logQuery.trim());

        let res;
        if (gateMode === GATE_MODES.GUEST) {
          res = await api.get(`/common/guests/gate/logs/?${params.toString()}`);
        } else if (gateMode === GATE_MODES.EVENT) {
          params.set("page", "1");
          params.set("page_size", "20");
          if (selectedEvent?.id) params.set("event_id", String(selectedEvent.id));
          res = await api.get(`/events/gate/entry-logs/?${params.toString()}`);
        } else {
          params.set("page", "1");
          params.set("page_size", "20");
          res = await api.get(`/events/gate/resident-log/logs/?${params.toString()}`);
        }

        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : res?.data?.results || [];
        setEntryLogs(list);
      } catch (error) {
        if (cancelled) return;
        setLogError(error?.response?.data?.error || "Failed to load gate history");
      } finally {
        if (!cancelled) setLogLoading(false);
      }
    };

    loadLogs();
    const intervalId = window.setInterval(loadLogs, LOG_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [gateMode, logQuery, selectedEvent?.id]);

  const latestEntries = useMemo(() => entryLogs.slice(0, 10), [entryLogs]);
  const residentTimesheetRows = useMemo(
    () => buildResidentTimesheetRows(entryLogs, residentSheetDate),
    [entryLogs, residentSheetDate],
  );
  const guestTimesheetRows = useMemo(
    () => buildGuestTimesheetRows(entryLogs, guestSheetDate),
    [entryLogs, guestSheetDate],
  );

  const resultTone = lastResult?.severity === "success"
    ? "#166534"
    : lastResult?.severity === "error"
      ? "#991b1b"
      : "#334155";

  return (
    <div className="gate-layout">
      {isMobileGateView && isMobileNavOpen ? (
        <button
          type="button"
          className="gate-mobile-backdrop"
          aria-label="Close gate navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside className={`gate-sidebar ${isMobileGateView ? "mobile-drawer" : ""} ${isMobileNavOpen ? "mobile-open" : ""}`}>
        <div className="gate-sidebar-top">
          <div className="brand gate-brand">
            <img className="brand-logo" src="/barangay-663a-logo.png" alt="Barangay 663-A logo" />
            <div>
              <div className="brand-title">Barangay 663-A</div>
              <div className="brand-sub">Gate Portal</div>
            </div>
          </div>
          <div className="gate-sidebar-note">
            Gate workflows for resident logs, event attendance, and guest appointments in one place.
          </div>
          <div
            id="gate-mobile-navigation"
            className="gate-side-nav"
            role="tablist"
            aria-label="Gate sections"
          >
            {GATE_NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`gate-side-link ${gateMode === item.key ? "active" : ""}`}
                onClick={() => {
                  setGateMode(item.key);
                  if (isMobileGateView) setIsMobileNavOpen(false);
                }}
                role="tab"
                aria-selected={gateMode === item.key}
              >
                <span className="gate-side-link-copy">
                  <span className="gate-side-link-eyebrow">{item.eyebrow}</span>
                  <span className="gate-side-link-label">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="gate-sidebar-bottom">
          <div className="gate-user-card">
            <div className="user-name">{displayName}</div>
            <div className="user-role">{isAuthenticatedGateUser ? activeRole : "Public gate mode"}</div>
          </div>
          <button className="logout-pill gate-exit" onClick={onExit}>Logout</button>
        </div>
      </aside>

      <section className="gate-main-shell">
        <div className="gate-main-header">
          <div>
            {isMobileGateView ? (
              <button
                type="button"
                className="gate-mobile-nav-toggle"
                aria-expanded={isMobileNavOpen}
                aria-controls="gate-mobile-navigation"
                onClick={() => setIsMobileNavOpen((current) => !current)}
              >
                <span className="gate-mobile-nav-toggle-icon" aria-hidden="true">
                  {isMobileNavOpen ? "X" : "="}
                </span>
                <span>{isMobileNavOpen ? "Close menu" : "Open menu"}</span>
              </button>
            ) : null}
            <div className="gate-main-kicker">{activeItem.eyebrow}</div>
            <div className="gate-main-title">{activeItem.label}</div>
            <div className="gate-main-subtitle">
              Choose the workflow first, then scan or look up the person using the tools for that mode.
            </div>
          </div>
          <div className="gate-main-meta">
            <div className="user-chip">
              <div className="user-name">{greeting}, {displayName}</div>
              <div className="user-role">{isAuthenticatedGateUser ? activeRole : "Public gate mode"}</div>
            </div>
          </div>
        </div>

        <div className="main-content gate-main-content">
          <div className="card gate-shell">
            {gateMode === GATE_MODES.EVENT && (
              <div className="card gate-panel-card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="section-head">
                  <div>
                    <h3 style={{ margin: 0 }}>Active Event Required</h3>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      Event attendance mode only works when a current event is selected.
                    </div>
                  </div>
                </div>
                <EventSelector
                  onSelect={setSelectedEvent}
                  endpoint="/events/gate/events/?page=1&page_size=200&ordering=-date"
                />
              </div>
            )}

            <div className="gate-grid">
              <div className="gate-main">
                {gateMode === GATE_MODES.RESIDENT && (
                  <ModeShell
                    title="Resident Time In / Time Out"
                    subtitle="Choose the resident action first, then open QR or face scanning only when you're ready to use the camera."
                    latestEntries={latestEntries}
                    badgeLabel="Resident gate log mode"
                    metaItems={["QR and face supported", "Direction auto-detected from latest resident log"]}
                    controls={(
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <ModeButton label="Time In" active={residentDirection === "time_in"} onClick={() => setResidentDirection("time_in")} />
                        <ModeButton label="Time Out" active={residentDirection === "time_out"} onClick={() => setResidentDirection("time_out")} />
                        {!isMobileGateView && <ModeButton label="QR Scanner" active={scannerMode === "qr"} onClick={() => setScannerMode("qr")} />}
                        {!isMobileGateView && <ModeButton label="Face Scanner" active={scannerMode === "face"} onClick={() => setScannerMode("face")} />}
                      </div>
                    )}
                  >
                    {isMobileGateView ? (
                      <ScannerSelectionCard
                        title="Gate Scanner Requires Laptop/Desktop"
                        message="Resident gate QR and face scanning are disabled on phones. Use a laptop or desktop gate station for scanning, while mobile can still be used for viewing gate logs."
                      />
                    ) : scannerMode === "qr" ? (
                      <QrScanner
                        requireEvent={false}
                        submitPath="/events/gate/resident-log/mark/"
                        buildPayload={({ barangayId }) => ({ barangay_id: barangayId, direction: residentDirection })}
                        title="Resident Gate QR Scanner"
                        readyMessage={residentDirection === "time_out" ? "Ready for resident time out scanning" : "Ready for resident time in scanning"}
                        tip="Scan the resident QR and the selected resident time action will be recorded."
                        scope="scanner"
                        onScanResult={setLastResult}
                      />
                    ) : scannerMode === "face" ? (
                      <FaceScanner
                        requireEvent={false}
                        detectPath="/events/gate/attendance/detect-face/"
                        submitPath="/events/gate/resident-log/mark-face/"
                        buildFormData={({ blob, tolerance, fallbackUsername }) => {
                          const form = new FormData();
                          form.append("image", blob, "frame.jpg");
                          form.append("tolerance", String(tolerance));
                          form.append("direction", residentDirection);
                          if (fallbackUsername.trim()) form.append("username", fallbackUsername.trim());
                          return form;
                        }}
                        title="Resident Gate Face Scanner"
                        readyMessage={residentDirection === "time_out" ? "Ready for resident face time out" : "Ready for resident face time in"}
                        actionLabel={residentDirection === "time_out" ? "Capture & Record Time Out" : "Capture & Record Time In"}
                        scope="scanner"
                        onScanResult={setLastResult}
                      />
                    ) : (
                      <ScannerSelectionCard
                        title={residentDirection === "time_out" ? "Resident Time Out Selected" : "Resident Time In Selected"}
                        message="No camera is active yet. Pick QR Scanner or Face Scanner above when you want to start scanning."
                      />
                    )}
                  </ModeShell>
                )}

                {gateMode === GATE_MODES.EVENT && (
                  <ModeShell
                    title="Event Attendance"
                    subtitle="Select an event first, then choose whether to scan by QR or face."
                    latestEntries={latestEntries}
                    badgeLabel={selectedEvent ? selectedEvent.title : "Select an event first"}
                    metaItems={selectedEvent ? [selectedEvent.venue || "TBD venue", formatSchedule(selectedEvent.date, selectedEvent.end_date)] : ["Event selection required", "Duplicate attendance is blocked"]}
                    controls={(
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {!isMobileGateView && <ModeButton label="QR Scanner" active={scannerMode === "qr"} onClick={() => setScannerMode("qr")} />}
                        {!isMobileGateView && <ModeButton label="Face Scanner" active={scannerMode === "face"} onClick={() => setScannerMode("face")} />}
                      </div>
                    )}
                  >
                    {isMobileGateView ? (
                      <ScannerSelectionCard
                        title="Event Scanner Requires Laptop/Desktop"
                        message="Event attendance QR and face scanning are disabled on phones. Open the gate portal on a PC or laptop to scan attendees."
                      />
                    ) : selectedEvent ? (
                      scannerMode === "qr" ? (
                        <QrScanner
                          eventId={selectedEvent.id}
                          basePath="/events/gate"
                          direction="time_in"
                          title="Event Attendance QR Scanner"
                          readyMessage="Ready to mark event attendance"
                          tip="Scan a registered attendee QR for the selected active event."
                          scope="scanner"
                          onScanResult={setLastResult}
                        />
                      ) : scannerMode === "face" ? (
                        <FaceScanner
                          eventId={selectedEvent.id}
                          basePath="/events/gate"
                          direction="time_in"
                          title="Event Attendance Face Scanner"
                          readyMessage="Ready to mark event attendance"
                          actionLabel="Capture & Mark Attendance"
                          scope="scanner"
                          onScanResult={setLastResult}
                        />
                      ) : (
                        <ScannerSelectionCard
                          title="Scanner Not Started"
                          message="Choose QR Scanner or Face Scanner above to start event attendance scanning."
                        />
                      )
                    ) : (
                      <div className="card" style={{ padding: 18 }}>
                        <p>Select an active event before scanning attendees. This keeps event attendance isolated from resident gate logs.</p>
                      </div>
                    )}
                  </ModeShell>
                )}

                {gateMode === GATE_MODES.GUEST && (
                  <ModeShell
                    title="Guest / Visitor Appointment"
                    subtitle="Choose QR scanning or manual lookup depending on how the visitor will be processed."
                    latestEntries={latestEntries}
                    badgeLabel="Today's guest appointments"
                    metaItems={["QR scan and manual lookup supported", "Only today's appointments are shown in lookup"]}
                    controls={(
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {!isMobileGateView && <ModeButton label="QR Scanner" active={scannerMode === "qr"} onClick={() => setScannerMode("qr")} />}
                        <ModeButton label="Manual Lookup" active={scannerMode === "manual"} onClick={() => setScannerMode("manual")} />
                      </div>
                    )}
                  >
                    {scannerMode === "qr" && !isMobileGateView ? (
                      <GuestQrScanner onScanResult={setLastResult} />
                    ) : scannerMode === "manual" ? (
                      <GuestAppointmentLookup onScanResult={setLastResult} />
                    ) : (
                      <ScannerSelectionCard
                        title={isMobileGateView ? "Manual Lookup Only On Mobile" : "Choose Guest Tool"}
                        message={isMobileGateView
                          ? "Guest QR scanning is disabled on phones. Use Manual Lookup on mobile, or switch to a laptop/desktop gate station for QR scanning."
                          : "No camera is active yet. Pick QR Scanner for camera scanning or Manual Lookup to process the guest without the camera."}
                      />
                    )}
                  </ModeShell>
                )}
              </div>

              <div className="gate-side">
                <div className="card gate-panel-card" style={{ padding: 16 }}>
                  <div className="section-head">
                    <div>
                      <h3 style={{ margin: 0 }}>Latest Result</h3>
                      <div style={{ color: "#64748b", fontSize: 13 }}>
                        Clear success or error feedback for the active gate workflow.
                      </div>
                    </div>
                  </div>
                  {lastResult ? (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fff", marginTop: 12 }}>
                      <div style={{ color: resultTone, fontWeight: 700 }}>{lastResult.title || "Latest gate action"}</div>
                      <div style={{ marginTop: 6 }}>{lastResult.message}</div>
                      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                        <InfoRow label="Resident / Guest" value={lastResult.username || "N/A"} />
                        <InfoRow label="Barangay ID" value={lastResult.barangayId || "N/A"} />
                        <InfoRow label="Event" value={lastResult.eventTitle || "N/A"} />
                        <InfoRow label="Time" value={formatDateTime(lastResult.checkedInAt || lastResult.checkedOutAt || lastResult.timestamp)} />
                      </div>
                    </div>
                  ) : (
                    <div className="scanner-history-empty" style={{ marginTop: 12 }}>
                      No scan result yet for this mode.
                    </div>
                  )}
                </div>

                <div className="card gate-panel-card" style={{ padding: 16, marginTop: 16 }}>
                  <div className="section-head">
                    <div>
                      <h3 style={{ margin: 0 }}>Gate History</h3>
                    </div>
                    <input
                      type="search"
                      value={logQuery}
                      onChange={(e) => setLogQuery(e.target.value)}
                      placeholder={historyPlaceholder(gateMode)}
                      style={{ width: 220, maxWidth: "100%" }}
                    />
                  </div>
                  {(gateMode === GATE_MODES.RESIDENT || gateMode === GATE_MODES.GUEST) && (
                    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <ModeButton label="Recent Logs" active={historyView === "recent"} onClick={() => setHistoryView("recent")} />
                      <ModeButton label="Time Sheet" active={historyView === "timesheet"} onClick={() => setHistoryView("timesheet")} />
                    </div>
                  )}
                  {logLoading && <p>Loading gate history...</p>}
                  {logError && !logLoading && <p>{logError}</p>}
                  {!logLoading && !logError && (
                    gateMode === GATE_MODES.RESIDENT && historyView === "timesheet" ? (
                      <ResidentTimesheetTable
                        rows={residentTimesheetRows}
                        selectedDate={residentSheetDate}
                        onDateChange={setResidentSheetDate}
                      />
                    ) : gateMode === GATE_MODES.GUEST && historyView === "timesheet" ? (
                      <GuestTimesheetTable
                        rows={guestTimesheetRows}
                        selectedDate={guestSheetDate}
                        onDateChange={setGuestSheetDate}
                      />
                    ) : (
                      <div className="gate-log-list">
                        {latestEntries.length === 0 ? (
                          <div className="scanner-history-empty">No entry records found yet.</div>
                        ) : (
                          latestEntries.map((item) => (
                            <div key={item.id} className="gate-history-item">
                              <div className="gate-history-row">
                                <div>
                                  <div className="gate-history-name">{item.username || item.guest_name || "Unknown entry"}</div>
                                  <div className="gate-history-datetime">{formatDateTime(item.created_at)}</div>
                                </div>
                                <span className={`gate-history-type ${item.direction === "time_out" ? "time-out" : "time-in"}`}>
                                  {item.direction === "time_out" ? "Time Out" : "Time In"}
                                </span>
                              </div>
                              <div className="gate-history-subtle">
                                {gateMode === GATE_MODES.GUEST
                                  ? `${item.purpose || "Guest appointment"} - ${(item.method || "qr").toUpperCase()}`
                                  : gateMode === GATE_MODES.EVENT
                                    ? `${item.event_title || selectedEvent?.title || "Selected event"} - ${item.method?.toUpperCase() || "N/A"}`
                                    : `${item.resident_zone || item.resident_address || "Resident gate log"} - ${item.method?.toUpperCase() || "N/A"}`}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
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

function ModeShell({ title, subtitle, controls, badgeLabel, metaItems, latestEntries, children }) {
  return (
    <div className="card gate-mode-shell" style={{ padding: 16 }}>
      <div className="section-head">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div style={{ color: "#64748b", fontSize: 13 }}>{subtitle}</div>
        </div>
        {controls}
      </div>
      <div className="scanner-event-banner">
        <div>
          <div className="scanner-event-kicker">Gate Workflow</div>
          <div className="scanner-event-title">{badgeLabel}</div>
          <div className="scanner-event-meta">
            {metaItems.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="scanner-capacity-box">
          <div>{latestEntries.length}</div>
          <small>recent records</small>
        </div>
      </div>
      {children}
    </div>
  );
}

function ModeButton({ label, active, onClick }) {
  return (
    <button onClick={onClick} className={`top-pill ${active ? "active" : ""}`}>
      {label}
    </button>
  );
}

function ScannerSelectionCard({ title, message }) {
  return (
    <div className="card scanner-card gate-selection-card" style={{ textAlign: "center", padding: 24, border: "2px dashed #bfd7c8", background: "#f8fcf9" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ margin: "10px auto 0", maxWidth: 520 }}>{message}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ResidentTimesheetTable({ rows, selectedDate, onDateChange }) {
  const handleExportCsv = () => {
    const headers = ["Resident", "Time In", "Time Out", "Total Hours"];
    const lines = rows.map((row) => [
      row.resident || "",
      row.timeInFull || "",
      row.timeOutFull || "",
      row.totalHours || "",
    ]);
    const csv = [headers, ...lines]
      .map((cols) => cols.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `resident-timesheet-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    exportTimesheetPdf({
      title: "Resident Time Sheet",
      subtitle: selectedDate ? `Date: ${selectedDate}` : "",
      filenamePrefix: "resident-timesheet",
      headers: ["Resident", "Time In", "Time Out", "Total Hours"],
      rows: rows.map((row) => [
        row.resident || "",
        row.timeInFull || "",
        row.timeOutFull || "",
        row.totalHours || "",
      ]),
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="resident-sheet-date" style={{ fontSize: 13, color: "#475569" }}>Exact Date</label>
          <input
            id="resident-sheet-date"
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange?.(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleExportCsv} disabled={rows.length === 0}>
            Export CSV
          </button>
          <button onClick={handleExportPdf} disabled={rows.length === 0}>
            Export PDF
          </button>
        </div>
      </div>
      <div style={{ border: "1px solid #d7e5dc", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr 1fr 0.8fr",
            background: "linear-gradient(90deg, #cfead9 0%, #d9f0df 100%)",
            color: "#0f172a",
            fontWeight: 700,
          }}
        >
          <TableCell header>Resident</TableCell>
          <TableCell header>Time In</TableCell>
          <TableCell header>Time Out</TableCell>
          <TableCell header>Total Hours</TableCell>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 16, color: "#64748b" }}>No resident time logs found yet.</div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 1fr 0.8fr",
                background: index % 2 === 0 ? "#fdfefe" : "#f8fcf9",
                borderTop: "1px solid #e2ebe5",
              }}
            >
              <TableCell>{row.resident}</TableCell>
              <TableCell>{row.timeInFull}</TableCell>
              <TableCell>{row.timeOutFull}</TableCell>
              <TableCell>{row.totalHours}</TableCell>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GuestTimesheetTable({ rows, selectedDate, onDateChange }) {
  const handleExportCsv = () => {
    const headers = ["Guest", "Purpose", "Time In", "Time Out", "Total Hours"];
    const lines = rows.map((row) => [
      row.guest || "",
      row.purpose || "",
      row.timeInFull || "",
      row.timeOutFull || "",
      row.totalHours || "",
    ]);
    const csv = [headers, ...lines]
      .map((cols) => cols.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `guest-timesheet-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    exportTimesheetPdf({
      title: "Guest Time Sheet",
      subtitle: selectedDate ? `Date: ${selectedDate}` : "",
      filenamePrefix: "guest-timesheet",
      headers: ["Guest", "Purpose", "Time In", "Time Out", "Total Hours"],
      rows: rows.map((row) => [
        row.guest || "",
        row.purpose || "",
        row.timeInFull || "",
        row.timeOutFull || "",
        row.totalHours || "",
      ]),
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="guest-sheet-date" style={{ fontSize: 13, color: "#475569" }}>Exact Date</label>
          <input
            id="guest-sheet-date"
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange?.(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleExportCsv} disabled={rows.length === 0}>
            Export CSV
          </button>
          <button onClick={handleExportPdf} disabled={rows.length === 0}>
            Export PDF
          </button>
        </div>
      </div>
      <div style={{ border: "1px solid #d7e5dc", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1.1fr 1fr 1fr 0.8fr",
            background: "linear-gradient(90deg, #cfead9 0%, #d9f0df 100%)",
            color: "#0f172a",
            fontWeight: 700,
          }}
        >
          <TableCell header>Guest</TableCell>
          <TableCell header>Purpose</TableCell>
          <TableCell header>Time In</TableCell>
          <TableCell header>Time Out</TableCell>
          <TableCell header>Total Hours</TableCell>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 16, color: "#64748b" }}>No guest time logs found yet.</div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1.1fr 1fr 1fr 0.8fr",
                background: index % 2 === 0 ? "#fdfefe" : "#f8fcf9",
                borderTop: "1px solid #e2ebe5",
              }}
            >
              <TableCell>{row.guest}</TableCell>
              <TableCell>{row.purpose}</TableCell>
              <TableCell>{row.timeInFull}</TableCell>
              <TableCell>{row.timeOutFull}</TableCell>
              <TableCell>{row.totalHours}</TableCell>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TableCell({ children, header = false }) {
  return (
    <div style={{ padding: header ? "14px 16px" : "13px 16px", fontSize: 14 }}>
      {children || "--"}
    </div>
  );
}

function buildResidentTimesheetRows(entries, selectedDate) {
  const residentEntries = entries
    .filter((item) => item.username && !item.event)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const sessions = [];
  const openSessions = new Map();

  for (const entry of residentEntries) {
    const dt = new Date(entry.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    if (selectedDate) {
      const entryDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (entryDate !== selectedDate) continue;
    }

    const residentKey = entry.username;
    const activeSession = openSessions.get(residentKey);

    if (entry.direction === "time_in") {
      if (activeSession) {
        sessions.push({ ...activeSession });
      }
      openSessions.set(residentKey, {
        key: `${residentKey}-${dt.toISOString()}-in`,
        resident: entry.username,
        timeInDate: dt,
        timeOutDate: null,
      });
      continue;
    }

    if (activeSession) {
      activeSession.timeOutDate = dt;
      sessions.push({ ...activeSession, key: `${activeSession.key}-out` });
      openSessions.delete(residentKey);
    } else {
      sessions.push({
        key: `${residentKey}-${dt.toISOString()}-out-only`,
        resident: entry.username,
        timeInDate: null,
        timeOutDate: dt,
      });
    }
  }

  openSessions.forEach((session) => {
    sessions.push({ ...session });
  });

  return sessions
    .sort((a, b) => {
      const aTime = a.timeOutDate || a.timeInDate || 0;
      const bTime = b.timeOutDate || b.timeInDate || 0;
      return bTime - aTime;
    })
    .slice(0, 14)
    .map((session) => ({
      key: session.key,
      resident: session.resident,
      timeInFull: session.timeInDate ? session.timeInDate.toLocaleString() : "",
      timeOutFull: session.timeOutDate ? session.timeOutDate.toLocaleString() : "",
      totalHours: calculateTotalHours(session.timeInDate, session.timeOutDate),
    }));
}

function buildGuestTimesheetRows(entries, selectedDate) {
  const guestEntries = entries
    .filter((item) => item.guest_name)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const sessions = [];
  const openSessions = new Map();

  for (const entry of guestEntries) {
    const dt = new Date(entry.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    if (selectedDate) {
      const entryDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (entryDate !== selectedDate) continue;
    }

    const guestKey = `${entry.appointment || entry.guest_name}-${entry.guest_name}`;
    const activeSession = openSessions.get(guestKey);

    if (entry.direction === "time_in") {
      if (activeSession) {
        sessions.push({ ...activeSession });
      }
      openSessions.set(guestKey, {
        key: `${guestKey}-${dt.toISOString()}-in`,
        guest: entry.guest_name,
        purpose: entry.purpose || "Guest appointment",
        timeInDate: dt,
        timeOutDate: null,
      });
      continue;
    }

    if (activeSession) {
      activeSession.timeOutDate = dt;
      sessions.push({ ...activeSession, key: `${activeSession.key}-out` });
      openSessions.delete(guestKey);
    } else {
      sessions.push({
        key: `${guestKey}-${dt.toISOString()}-out-only`,
        guest: entry.guest_name,
        purpose: entry.purpose || "Guest appointment",
        timeInDate: null,
        timeOutDate: dt,
      });
    }
  }

  openSessions.forEach((session) => {
    sessions.push({ ...session });
  });

  return sessions
    .sort((a, b) => {
      const aTime = a.timeOutDate || a.timeInDate || 0;
      const bTime = b.timeOutDate || b.timeInDate || 0;
      return bTime - aTime;
    })
    .slice(0, 14)
    .map((session) => ({
      key: session.key,
      guest: session.guest,
      purpose: session.purpose,
      timeInFull: session.timeInDate ? session.timeInDate.toLocaleString() : "",
      timeOutFull: session.timeOutDate ? session.timeOutDate.toLocaleString() : "",
      totalHours: calculateTotalHours(session.timeInDate, session.timeOutDate),
    }));
}

function calculateTotalHours(timeInDate, timeOutDate) {
  if (!timeInDate || !timeOutDate) return "";
  const diffMs = timeOutDate - timeInDate;
  if (diffMs <= 0) return "";
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function exportTimesheetPdf({ title, subtitle = "", filenamePrefix, headers, rows }) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });
  const stamp = new Date();

  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  if (subtitle) {
    doc.text(subtitle, 40, 60);
  }
  doc.text(`Generated: ${stamp.toLocaleString()}`, 40, subtitle ? 76 : 60);
  doc.text(`Rows: ${rows.length}`, 40, subtitle ? 92 : 76);

  autoTable(doc, {
    startY: subtitle ? 110 : 94,
    head: [headers],
    body: rows,
    styles: {
      fontSize: 9,
      cellPadding: 6,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [34, 139, 94],
    },
  });

  doc.save(`${filenamePrefix}-${stamp.toISOString().slice(0, 10)}.pdf`);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function historyPlaceholder(mode) {
  if (mode === GATE_MODES.GUEST) return "Search guest or purpose";
  if (mode === GATE_MODES.EVENT) return "Search resident or event";
  return "Search resident or address";
}

function formatDateTime(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}
