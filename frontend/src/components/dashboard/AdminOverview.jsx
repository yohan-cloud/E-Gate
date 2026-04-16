import { useEffect, useState } from "react";
import { fetchJson } from "../../api";

const CARD_COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316"];

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState({
    total_residents: 0,
    active_events: 0,
    total_registrations: 0,
    verified_ids: 0,
    registrations_recent: 0,
    registrations_prev: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchJson("/events/metrics/summary/");
        setKpis((prev) => ({
          ...prev,
          total_residents: data.kpis?.active_residents ?? 0,
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
      label: "Total Residents",
      value: kpis.total_residents,
      change: pct(kpis.registrations_recent, kpis.registrations_prev),
      color: CARD_COLORS[0],
      icon: "👥",
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
      icon: "🧑‍🤝‍🧑",
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
          <div className="admin-overview-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
            {cards.map((c) => (
              <div className="admin-overview-stat-card" key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#475569", fontSize: 13 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: "#16a34a" }}>{c.change}</div>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}22`, display: "grid", placeItems: "center", color: c.color, fontSize: 20 }}>
                  {c.icon}
                </div>
              </div>
            ))}
          </div>

          <div className="admin-overview-panels" style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr", gap: 12 }}>
              <div className="admin-overview-feed-card admin-overview-activity-card" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <h4 style={{ margin: "0 0 8px 0" }}>Recent Activity</h4>
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
              </div>

            <div className="admin-overview-feed-card" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <h4 style={{ margin: "0 0 8px 0" }}>Upcoming Events</h4>
              {upcomingEvents.length === 0 && <div style={{ color: "#6b7280" }}>No upcoming events.</div>}
              {upcomingEvents.map((ev, idx) => (
                <div key={idx} style={{ padding: "8px 0", borderBottom: idx === upcomingEvents.length - 1 ? "none" : "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{ev.title}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{ev.date ? new Date(ev.date).toLocaleDateString() : ""}</div>
                  </div>
                  <div style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                    {ev.registrations_count ?? ev.attendance_count ?? 0} registered
                  </div>
                </div>
              ))}
              </div>
          </div>
        </>
      )}
    </div>
  );
}

function pct(current, prev) {
  if (!prev && !current) return "+0% from last month";
  if (!prev) return `+${current}% from last month`;
  const delta = ((current - prev) / prev) * 100;
  const formatted = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% from last month`;
  return formatted;
}
