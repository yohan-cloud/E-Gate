import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { api } from "../../api";

const ADMIN_UI_SETTINGS_KEY = "admin_ui_settings";
const ANALYTICS_REFRESH_MS = 30000;
const EMPTY_ANALYTICS_DATA = {
  kpis: {},
  per_event: [],
  timeseries: [],
  demographics: { gender: {}, age_distribution: [] },
};
const DEFAULT_HEADER_STATS = [
  { label: "Growth Rate", value: "+0.0%", color: "#0ea5e9", icon: "GR" },
  { label: "Active Residents", value: "0", color: "#22c55e", icon: "AR" },
  { label: "Events This Year", value: "0", color: "#a855f7", icon: "EY" },
  { label: "Avg Attendance", value: "0%", color: "#f97316", icon: "AA" },
];

function toISODate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function toHeaderStats(data) {
  const growth = data?.kpis?.growth_rate ?? null;
  const activeResidents = data?.kpis?.active_residents ?? null;
  const eventsThisYear = data?.kpis?.events_this_year ?? null;
  const avgAttendance = data?.kpis?.avg_attendance ?? null;

  return [
    { label: "Growth Rate", value: growth !== null ? `${growth}%` : "+0.0%", color: "#0ea5e9", icon: "GR" },
    { label: "Active Residents", value: activeResidents ?? "0", color: "#22c55e", icon: "AR" },
    { label: "Events This Year", value: eventsThisYear ?? "0", color: "#a855f7", icon: "EY" },
    { label: "Avg Attendance", value: avgAttendance !== null ? `${avgAttendance}%` : "0%", color: "#f97316", icon: "AA" },
  ];
}

async function fetchAnalyticsSummary(dateFrom, dateTo) {
  const res = await api.get(`/events/metrics/summary/?date_from=${dateFrom}&date_to=${dateTo}`);
  return res.data || EMPTY_ANALYTICS_DATA;
}

async function fetchEventsList() {
  const res = await api.get("/events/list/?page=1&page_size=100&ordering=-date");
  return res?.data?.results || [];
}

async function fetchEventSummary(id) {
  const res = await api.get(`/events/metrics/event/${id}/summary/`);
  return res?.data || null;
}

async function fetchEventAttendees(id, page, ordering, q) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", "10");
  if (ordering) params.set("ordering", ordering);
  if (q.trim()) params.set("q", q.trim());
  return api.get(`/events/metrics/event/${id}/attendees/?${params.toString()}`);
}

export default function Analytics() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISODate(d);
  });
  const [dateTo, setDateTo] = useState(() => toISODate(new Date()));
  const [data, setData] = useState(EMPTY_ANALYTICS_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const barRef = useRef(null);
  const lineRef = useRef(null);
  const genderRef = useRef(null);
  const ageRef = useRef(null);
  const chartInstances = useRef({ bar: null, line: null, gender: null, age: null });
  const initialDateRangeRef = useRef({ dateFrom, dateTo });

  const [eventsList, setEventsList] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [evSummary, setEvSummary] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [attCount, setAttCount] = useState(0);
  const [attPage, setAttPage] = useState(1);
  const [attOrdering, setAttOrdering] = useState("-checked_in_at");
  const [attQ, setAttQ] = useState("");
  const [attHasNext, setAttHasNext] = useState(false);
  const [attHasPrev, setAttHasPrev] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [headerStats, setHeaderStats] = useState(DEFAULT_HEADER_STATS);

  function exportPDF() {
    const barCanvas = barRef.current;
    const lineCanvas = lineRef.current;
    if (!barCanvas && !lineCanvas) return;
    const barImg = barCanvas ? barCanvas.toDataURL("image/png") : null;
    const lineImg = lineCanvas ? lineCanvas.toDataURL("image/png") : null;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write("<html><head><title>Analytics</title></head><body style='font-family:sans-serif;'>");
    win.document.write("<h2>Attendance Analytics</h2>");
    if (barImg) {
      win.document.write("<h3>Top Events by Attendance</h3>");
      win.document.write(`<img src="${barImg}" style="max-width:100%;"/>`);
    }
    if (lineImg) {
      win.document.write("<h3>Attendance Over Time</h3>");
      win.document.write(`<img src="${lineImg}" style="max-width:100%;"/>`);
    }
    win.document.write("</body></html>");
    win.document.close();
    win.focus();
    win.print();
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const analyticsData = await fetchAnalyticsSummary(dateFrom, dateTo);
      setData(analyticsData);
      setHeaderStats(toHeaderStats(analyticsData));
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Failed to load analytics";
      setError(msg);
      console.error("Analytics summary error:", e?.response?.status, e?.response?.data || e);
    } finally {
      setLoading(false);
    }
  }

  async function loadEventSummary(id) {
    if (!id) {
      setEvSummary(null);
      return;
    }
    try {
      setEvSummary(await fetchEventSummary(id));
    } catch (e) {
      setEvSummary(null);
      console.error("Event summary error:", e?.response?.status, e?.response?.data || e);
    }
  }

  async function loadEventAttendees(id, page = 1, ordering = attOrdering, q = attQ) {
    if (!id) {
      setAttendees([]);
      setAttCount(0);
      return;
    }
    try {
      const res = await fetchEventAttendees(id, page, ordering, q);
      setAttendees(res?.data?.results || []);
      setAttCount(res?.data?.count || 0);
      setAttHasNext(!!res?.data?.next);
      setAttHasPrev(!!res?.data?.previous);
      setAttPage(page);
    } catch (e) {
      setAttendees([]);
      setAttCount(0);
      setAttHasNext(false);
      setAttHasPrev(false);
      console.error("Event attendees error:", e?.response?.status, e?.response?.data || e);
    }
  }

  useEffect(() => {
    const { dateFrom: initialDateFrom, dateTo: initialDateTo } = initialDateRangeRef.current;

    const loadInitialAnalytics = async () => {
      setLoading(true);
      setError("");
      try {
        const analyticsData = await fetchAnalyticsSummary(initialDateFrom, initialDateTo);
        setData(analyticsData);
        setHeaderStats(toHeaderStats(analyticsData));
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || "Failed to load analytics";
        setError(msg);
        console.error("Analytics summary error:", e?.response?.status, e?.response?.data || e);
      } finally {
        setLoading(false);
      }
    };

    void loadInitialAnalytics();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_UI_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.autoRefreshAnalytics === "boolean") {
        setAutoRefreshEnabled(parsed.autoRefreshAnalytics);
      }
    } catch {
      // Ignore malformed settings and keep the default.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setEventsList(await fetchEventsList());
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const refreshAnalytics = async () => {
      setLoading(true);
      setError("");
      try {
        const analyticsData = await fetchAnalyticsSummary(dateFrom, dateTo);
        setData(analyticsData);
        setHeaderStats(toHeaderStats(analyticsData));
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || "Failed to load analytics";
        setError(msg);
        console.error("Analytics summary error:", e?.response?.status, e?.response?.data || e);
      } finally {
        setLoading(false);
      }

      if (selectedEventId) {
        try {
          setEvSummary(await fetchEventSummary(selectedEventId));
        } catch (e) {
          setEvSummary(null);
          console.error("Event summary error:", e?.response?.status, e?.response?.data || e);
        }

        try {
          const res = await fetchEventAttendees(selectedEventId, attPage, attOrdering, attQ);
          setAttendees(res?.data?.results || []);
          setAttCount(res?.data?.count || 0);
          setAttHasNext(!!res?.data?.next);
          setAttHasPrev(!!res?.data?.previous);
          setAttPage(attPage);
        } catch (e) {
          setAttendees([]);
          setAttCount(0);
          setAttHasNext(false);
          setAttHasPrev(false);
          console.error("Event attendees error:", e?.response?.status, e?.response?.data || e);
        }
      }
    };

    const onFocus = () => {
      void refreshAnalytics();
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refreshAnalytics();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!autoRefreshEnabled) {
      return () => {
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    const intervalId = window.setInterval(() => {
      void refreshAnalytics();
    }, ANALYTICS_REFRESH_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, dateFrom, dateTo, selectedEventId, attPage, attOrdering, attQ]);

  useEffect(() => {
    const currentCharts = chartInstances.current;
    const perEventPoints = (data.per_event || []).filter((item) => (item?.attendance_count || 0) > 0);
    const timeseriesPoints = (data.timeseries || []).filter((item) => (item?.count || 0) > 0);
    const hasPerEventData = perEventPoints.length > 0;
    const hasTimeseriesData = timeseriesPoints.length > 0;

    if (currentCharts.bar) {
      currentCharts.bar.destroy();
      currentCharts.bar = null;
    }
    if (currentCharts.line) {
      currentCharts.line.destroy();
      currentCharts.line = null;
    }
    if (currentCharts.gender) {
      currentCharts.gender.destroy();
      currentCharts.gender = null;
    }
    if (currentCharts.age) {
      currentCharts.age.destroy();
      currentCharts.age = null;
    }

    if (barRef.current && hasPerEventData) {
      const labels = perEventPoints.map((e) => e.title);
      const values = perEventPoints.map((e) => e.attendance_count || 0);
      const barCtx = barRef.current.getContext("2d");
      const barGradient = barCtx.createLinearGradient(0, 0, 0, 260);
      barGradient.addColorStop(0, "rgba(34, 197, 94, 0.95)");
      barGradient.addColorStop(1, "rgba(22, 163, 74, 0.65)");
      currentCharts.bar = new Chart(barRef.current.getContext("2d"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Attendance",
              data: values,
              backgroundColor: barGradient,
              borderRadius: 18,
              borderSkipped: false,
              maxBarThickness: 72,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#163226",
              titleColor: "#f8fffb",
              bodyColor: "#e6f6ec",
              displayColors: false,
              padding: 12,
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#4f6b5d", font: { weight: 600 } },
              border: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: "#4f6b5d", stepSize: 1 },
              grid: { color: "rgba(79,107,93,0.14)", drawBorder: false },
              border: { display: false },
            },
          },
        },
      });
    }

    if (lineRef.current && hasTimeseriesData) {
      const labels = timeseriesPoints.map((p) => p.date);
      const values = timeseriesPoints.map((p) => p.count || 0);
      const lineCtx = lineRef.current.getContext("2d");
      const lineGradient = lineCtx.createLinearGradient(0, 0, 0, 260);
      lineGradient.addColorStop(0, "rgba(46, 144, 95, 0.32)");
      lineGradient.addColorStop(1, "rgba(46, 144, 95, 0.02)");
      currentCharts.line = new Chart(lineRef.current.getContext("2d"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Attendance",
              data: values,
              borderColor: "#1f9d55",
              backgroundColor: lineGradient,
              fill: true,
              tension: 0.35,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: "#effdf4",
              pointBorderColor: "#1f9d55",
              pointBorderWidth: 2,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#163226",
              titleColor: "#f8fffb",
              bodyColor: "#e6f6ec",
              displayColors: false,
              padding: 12,
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#4f6b5d", maxRotation: 0 },
              border: { display: false },
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: "#4f6b5d", stepSize: 1 },
              grid: { color: "rgba(79,107,93,0.14)", drawBorder: false },
              border: { display: false },
            },
          },
        },
      });
    }

    if (genderRef.current) {
      const genderData = data.demographics?.gender || {};
      const labels = Object.keys(genderData);
      const values = labels.map((key) => genderData[key]);
      currentCharts.gender = new Chart(genderRef.current.getContext("2d"), {
        type: "pie",
        data: {
          labels,
          datasets: [
            {
              label: "Residents",
              data: values,
              backgroundColor: ["#22c55e", "#6366f1", "#f59e0b", "#94a3b8", "#ef4444"],
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
      });
    }

    if (ageRef.current) {
      const ageBuckets = data.demographics?.age_distribution || [];
      const labels = ageBuckets.map((a) => a.bucket);
      const values = ageBuckets.map((a) => a.count || 0);
      currentCharts.age = new Chart(ageRef.current.getContext("2d"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Residents",
              data: values,
              backgroundColor: "#60a5fa",
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      });
    }

    return () => {
      if (currentCharts.bar) {
        currentCharts.bar.destroy();
        currentCharts.bar = null;
      }
      if (currentCharts.line) {
        currentCharts.line.destroy();
        currentCharts.line = null;
      }
      if (currentCharts.gender) {
        currentCharts.gender.destroy();
        currentCharts.gender = null;
      }
      if (currentCharts.age) {
        currentCharts.age.destroy();
        currentCharts.age = null;
      }
    };
  }, [data]);

  const perEventPoints = (data.per_event || []).filter((item) => (item?.attendance_count || 0) > 0);
  const timeseriesPoints = (data.timeseries || []).filter((item) => (item?.count || 0) > 0);
  const hasPerEventData = perEventPoints.length > 0;
  const hasTimeseriesData = timeseriesPoints.length > 0;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
          <div style={{ color: "var(--muted)" }}>Insights and statistics for Barangay 663-A</div>
        </div>
        <div className="admin-analytics-toolbar" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="from" style={{ fontSize: 13, color: "#475569" }}>From</label>
            <input
              id="from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: 150, minWidth: 150, padding: "8px 10px" }}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="to" style={{ fontSize: 13, color: "#475569" }}>To</label>
            <input
              id="to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: 150, minWidth: 150, padding: "8px 10px" }}
            />
          </div>
          <button onClick={() => void load()} disabled={loading} style={{ padding: "10px 16px", fontWeight: 600 }}>Apply</button>
          <button onClick={exportPDF} disabled={loading} style={{ padding: "10px 16px", fontWeight: 600 }}>Download PDF</button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && !loading && <p>{error}</p>}

      {!loading && !error && (
        <>
          <div className="admin-analytics-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
            {headerStats.map((card) => (
              <div className="admin-analytics-stat-card" key={card.label} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
                <div>
                  <div style={{ color: "#475569", fontSize: 13 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{card.value}</div>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${card.color}22`, display: "grid", placeItems: "center", color: card.color, fontSize: 14, fontWeight: 700 }}>
                  {card.icon}
                </div>
              </div>
            ))}
          </div>

          <div className="admin-analytics-kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi label="Total Events" value={data.kpis?.total_events ?? 0} />
            <Kpi label="Registrations" value={data.kpis?.total_registrations ?? 0} />
            <Kpi label="Attendance" value={data.kpis?.total_attendance ?? 0} />
          </div>

          <div className="admin-analytics-chart-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Top Events by Attendance</h3>
              {hasPerEventData ? (
                <div style={{ height: 360 }}>
                  <canvas ref={barRef} height={200} />
                </div>
              ) : (
                <EmptyChartState message="No attendance records found for the selected date range." />
              )}
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Attendance Over Time</h3>
              {hasTimeseriesData ? (
                <div style={{ height: 360 }}>
                  <canvas ref={lineRef} height={200} />
                </div>
              ) : (
                <EmptyChartState message="No check-ins yet, so there is no attendance timeline to plot." />
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 12, marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Resident Demographics</h3>
            <div className="admin-analytics-demographics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <h4 style={{ marginTop: 0 }}>Gender</h4>
                <div style={{ height: 320 }}>
                  <canvas ref={genderRef} height={200} />
                </div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <h4 style={{ marginTop: 0 }}>Age Distribution</h4>
                <div style={{ height: 320 }}>
                  <canvas ref={ageRef} height={200} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 12, marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Per-Event Analytics</h3>
            <div className="admin-analytics-event-filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                <select
                  id="ev"
                  value={selectedEventId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setSelectedEventId(id);
                    await loadEventSummary(id);
                    await loadEventAttendees(id, 1);
                  }}
                  style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
                >
                  <option value="">Select event...</option>
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>
              {selectedEventId && (
                <>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                    <input id="attq" placeholder="Search attendee username..." value={attQ} onChange={(e) => setAttQ(e.target.value)} style={{ width: "100%", border: "none", outline: "none", background: "transparent" }} />
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                    <select id="ord" value={attOrdering} onChange={(e) => setAttOrdering(e.target.value)} style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}>
                      <option value="-checked_in_at">Newest check-in</option>
                      <option value="checked_in_at">Oldest check-in</option>
                      <option value="resident_username">Name A to Z</option>
                      <option value="-resident_username">Name Z to A</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button onClick={() => void loadEventAttendees(selectedEventId, 1)} style={{ padding: "10px 16px" }}>Apply</button>
                  </div>
                </>
              )}
            </div>

            {evSummary && (
              <div className="admin-analytics-kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
                <Kpi label="Registrations" value={evSummary.registrations_count || 0} />
                <Kpi label="Attendance" value={evSummary.attendance_count || 0} />
                <Kpi label="Rate" value={`${Math.round((evSummary.attendance_rate || 0) * 100)}%`} />
              </div>
            )}

            {selectedEventId && (
              <div>
                <div style={{ display: "grid", gap: 12 }}>
                  {attendees.map((a) => (
                    <div className="admin-analytics-attendee-row" key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 22, color: "#6b7280" }}>A</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{a.resident_username}</div>
                          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                            Verified by {a.verified_by || "(none)"}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginTop: 10 }}>
                            <Info label="Checked In At" value={new Date(a.checked_in_at).toLocaleString()} />
                            <Info label="Verifier" value={a.verified_by || "(none)"} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {attendees.length === 0 && <p>No attendees found.</p>}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <button onClick={() => void loadEventAttendees(selectedEventId, attPage - 1)} disabled={!attHasPrev}>Prev</button>
                  <span>Page {attPage} ({attCount} total)</span>
                  <button onClick={() => void loadEventAttendees(selectedEventId, attPage + 1)} disabled={!attHasNext}>Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div style={{ minHeight: 300, border: "1px dashed #cbd5e1", borderRadius: 16, background: "#f8fafc", color: "#475569", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 320, lineHeight: 1.5 }}>{message}</div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="admin-analytics-kpi-card" style={{ padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
