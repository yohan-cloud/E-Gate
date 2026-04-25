import { useEffect, useState } from "react";
import { fetchJson } from "../../api";

const CARD_COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ef4444"];

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState({
    active_residents: 0,
    inactive_residents: 0,
    active_events: 0,
    total_registrations: 0,
    verified_ids: 0,
    registrations_recent: 0,
    registrations_prev: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [expiringSoon, setExpiringSoon] = useState([]);
  const [attendanceSeries, setAttendanceSeries] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchJson("/events/metrics/summary/");
        setKpis((prev) => ({
          ...prev,
          active_residents: data.kpis?.active_residents ?? 0,
          inactive_residents: data.kpis?.inactive_residents ?? 0,
          active_events: data.kpis?.events_this_year ?? 0,
          total_registrations: data.kpis?.total_registrations ?? 0,
          verified_ids: data.kpis?.verified_ids ?? 0,
          registrations_recent: Array.isArray(data.kpis?.registrations_recent)
            ? data.kpis?.registrations_recent?.length
            : data.kpis?.registrations_recent ?? 0,
          registrations_prev: Array.isArray(data.kpis?.registrations_prev)
            ? data.kpis?.registrations_prev?.length
            : data.kpis?.registrations_prev ?? 0,
        }));
        setUpcomingEvents(data.upcoming_events || []);
        setRecentActivity(data.recent_activity || []);
        setExpiringSoon(data.expiring_soon || []);
        setAttendanceSeries(data.timeseries || []);
      } catch (e) {
        setError(
          e?.response?.data?.error ||
          e?.response?.data?.detail ||
          e?.message ||
          "Failed to load overview."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    {
      label: "Active Residents",
      value: kpis.active_residents,
      change: "valid IDs",
      color: CARD_COLORS[0],
      icon: "👥",
    },
    {
      label: "Inactive / Expired",
      value: kpis.inactive_residents,
      change: "needs review",
      color: CARD_COLORS[4],
      icon: "⚠️",
    },
    {
      label: "Total Events This Year",
      value: kpis.active_events,
      change: "+",
      color: CARD_COLORS[1],
      icon: "📅",
    },
    {
      label: "Event Registrations",
      value: kpis.total_registrations,
      change: pct(kpis.registrations_recent, kpis.registrations_prev),
      color: CARD_COLORS[2],
      icon: "📝",
    },
    {
      label: "Verified IDs",
      value: kpis.verified_ids,
      change: "+",
      color: CARD_COLORS[3],
      icon: "✅",
    },
  ];
  const latestActivity = recentActivity.slice(0, 5);
  const weeklyAttendance = buildWeeklyAttendance(attendanceSeries);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
        <div style={{ color: "var(--muted)" }}>Welcome to Barangay 663 A Admin Portal</div>
      </div>

      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <p>Loading overview...</p>
      ) : (
        <>
          <div className="admin-overview-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
            {cards.map((c) => (
              <div className="admin-overview-stat-card" key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#475569", fontSize: 13 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: c.color }}>{c.change}</div>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}22`, display: "grid", placeItems: "center", color: c.color, fontSize: 18, fontWeight: 800 }}>
                  {c.icon}
                </div>
              </div>
            ))}
          </div>

          <div className="admin-overview-panels" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 16 }}>
            <Panel title="Attendance This Week">
              <MiniBarList
                items={weeklyAttendance.map((item) => ({ label: item.label, value: item.count }))}
                emptyMessage="No attendance recorded this week."
              />
            </Panel>

            <Panel title="Expiring Soon (next 30 days)">
              {expiringSoon.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No resident IDs expiring soon.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {expiringSoon.slice(0, 5).map((resident, idx) => (
                    <div key={resident.id || resident.username} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: idx === Math.min(expiringSoon.length, 5) - 1 ? "none" : "1px solid #edf2ef", paddingBottom: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{resident.full_name || resident.username}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>{resident.username}</div>
                      </div>
                      <div style={{ color: "#92400e", fontSize: 12, whiteSpace: "nowrap", fontWeight: 700 }}>
                        {formatDate(resident.expiry_date)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="admin-overview-panels" style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr", gap: 12 }}>
            <Panel title="Recent Activity" className="admin-overview-activity-card">
              {latestActivity.length === 0 && <div style={{ color: "#6b7280" }}>No recent activity.</div>}
              {latestActivity.map((item, idx) => (
                <div className="admin-overview-activity-item" key={idx} style={{ padding: "8px 0", borderBottom: idx === latestActivity.length - 1 ? "none" : "1px solid #e5e7eb" }}>
                  <div className="admin-overview-activity-type" style={{ fontWeight: 600, textTransform: "capitalize" }}>{item.type || "update"}</div>
                  <div className="admin-overview-activity-copy" style={{ color: "#475569", fontSize: 13 }}>
                    {item.username ? `${item.username} - ` : ""}
                    {item.title}
                  </div>
                  <div className="admin-overview-activity-time" style={{ color: "#6b7280", fontSize: 12 }}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}</div>
                </div>
              ))}
            </Panel>

            <Panel title="Upcoming Events">
              {upcomingEvents.length === 0 && <div style={{ color: "#6b7280" }}>No upcoming events.</div>}
              {upcomingEvents.map((ev, idx) => (
                <div key={idx} style={{ padding: "8px 0", borderBottom: idx === upcomingEvents.length - 1 ? "none" : "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{ev.date ? new Date(ev.date).toLocaleDateString() : ""}</div>
                  </div>
                  <div style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap" }}>
                    {ev.registrations_count ?? ev.attendance_count ?? 0} registered
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, children, className = "", style }) {
  return (
    <div className={`admin-overview-feed-card ${className}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, ...style }}>
      <h4 style={{ margin: "0 0 10px 0" }}>{title}</h4>
      {children}
    </div>
  );
}

function MiniBarList({ items, emptyMessage }) {
  const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 0);
  const hasData = items.some((item) => (Number(item.value) || 0) > 0);

  if (!hasData) {
    return <div style={{ color: "#6b7280" }}>{emptyMessage}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const value = Number(item.value) || 0;
        const width = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 8 : 0) : 0;
        return (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.label}>
              {item.label}
            </div>
            <div style={{ height: 12, borderRadius: 999, background: "#edf7f0", overflow: "hidden" }}>
              <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #22c55e, #0ea5e9)" }} />
            </div>
            <div style={{ minWidth: 70, textAlign: "right", fontSize: 12, color: "#475569" }}>
              <strong style={{ color: "#0f172a" }}>{value}</strong>{item.meta ? ` / ${item.meta}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildWeeklyAttendance(series) {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset);

  const counts = new Map();
  for (const item of series || []) {
    if (!item?.date) continue;
    counts.set(item.date, Number(item.count) || 0);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = toDateKey(date);
    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      date: key,
      count: counts.get(key) || 0,
    };
  });
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return value;
  }
}

function pct(current, prev) {
  if (!prev && !current) return "+0% from last month";
  if (!prev) return `+${current}% from last month`;
  const delta = ((current - prev) / prev) * 100;
  const formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% from last month`;
  return formatted;
}
