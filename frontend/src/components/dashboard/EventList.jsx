import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

const EVENT_TYPE_LABELS = {
  mandatory_governance_meetings: "Mandatory Governance Meetings",
  health_and_social_services: "Health and Social Services",
  community_events: "Community Events",
  operations_and_compliance: "Operations and Compliance",
};

export default function EventList({ onSelectEvent, activeId, refreshKey = 0 }) {
  const [events, setEvents] = useState([]);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [page, setPage] = useState(1);
  const pageSize = 20; const [hasNext, setHasNext] = useState(false); const [hasPrev, setHasPrev] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setPage(1), 250);
    return () => clearTimeout(handler);
  }, [search, sortBy]);

  useEffect(() => {
    const orderingParam =
      sortBy === "date_asc" ? "date" :
      sortBy === "title_asc" ? "title" :
      sortBy === "title_desc" ? "-title" : "-date";
    const q = encodeURIComponent(search.trim());
    api
      .get(`/events/list/?page=${page}&page_size=${pageSize}&ordering=${orderingParam}${q ? `&q=${q}` : ""}`)
      .then((res) => {
        const data = res.data || {};
        setEvents(data.results || []);
        setHasNext(!!data.next);
        setHasPrev(!!data.previous);
      })
      .catch((err) => console.error(err));
  }, [page, search, sortBy, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = !q
      ? [...events]
      : events.filter(
          (e) =>
            e.title?.toLowerCase().includes(q) ||
            e.event_type?.toLowerCase().includes(q) ||
            e.venue?.toLowerCase().includes(q)
        );

    switch (sortBy) {
      case "date_asc":
        list.sort((a, b) => new Date(a.date) - new Date(b.date));
        break;
      case "title_asc":
        list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "title_desc":
        list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "date_desc":
      default:
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return list;
  }, [events, search, sortBy]);

  const currentPage = page;
  const paged = filtered; // already server-paginated

  const goPrev = () => setPage((p) => (p > 1 && hasPrev ? p - 1 : p));
  const goNext = () => hasNext && setPage((p) => p + 1);

  const btnStyle = {
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid rgba(229,231,235,0.5)',
    color: 'inherit',
    borderRadius: 6,
    cursor: 'pointer'
  };

  return (
    <div>
      <h3>Events</h3>
      <div style={{ marginBottom: 10 }}>
        <label className="sr-only" htmlFor="events-search">Search events</label>
        <input
          id="events-search"
          name="search"
          placeholder="Search by title/type/venue"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", background: 'transparent', color: 'inherit' }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <label className="sr-only" htmlFor="events-sort">Sort events</label>
          <select id="events-sort" name="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #e5e7eb', background: 'transparent', color: 'inherit' }}>
            <option style={{ background: 'transparent', color: '#111827' }} value="date_desc">Date: Newest first</option>
            <option style={{ background: 'transparent', color: '#111827' }} value="date_asc">Date: Oldest first</option>
            <option style={{ background: 'transparent', color: '#111827' }} value="title_asc">Title: A to Z</option>
            <option style={{ background: 'transparent', color: '#111827' }} value="title_desc">Title: Z to A</option>
          </select>
          <div>
            <button onClick={goPrev} disabled={!hasPrev || currentPage === 1} style={{ ...btnStyle, opacity: (!hasPrev || currentPage === 1) ? 0.6 : 1, marginRight: 6 }}>Prev</button>
            <span style={{ margin: '0 8px' }}>Page {currentPage}</span>
            <button onClick={goNext} disabled={!hasNext} style={{ ...btnStyle, opacity: (!hasNext) ? 0.6 : 1, marginLeft: 6 }}>Next</button>
          </div>
        </div>
      </div>
      <ul className="event-list">
        {paged.map((event) => {
          const isActive = activeId === event.id;
          return (
            <li
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              style={{
                cursor: "pointer",
                background: isActive ? "rgba(34,197,94,0.15)" : "transparent",
                color: 'inherit',
                margin: "6px 0",
                padding: "10px 12px",
                border: isActive ? '1px solid #22c55e' : '1px solid rgba(229,231,235,0.5)',
                borderRadius: "6px",
              }}
            >
              {event.title} - {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
            </li>
          );
        })}
      </ul>
    </div>
  );
}





