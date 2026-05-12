import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../../api";
import toast from "../../lib/toast";

export default function AttendanceTable({ eventId }) {
  const [attendance, setAttendance] = useState([]);
  const [eventTitle, setEventTitle] = useState("");
  const [sortBy, setSortBy] = useState("resident_asc");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!eventId) return;
    const params = new URLSearchParams({
      page: String(page),
      ordering: sortBy,
    });
    if (searchDebounced) params.set("q", searchDebounced);
    api
      .get(`/events/${eventId}/attendance/?${params.toString()}`)
      .then((res) => {
        const data = res.data || {};
        setAttendance(data.results || []);
        setHasNext(!!data.next);
        setHasPrev(!!data.previous);
      })
      .catch((err) => console.error(err));
  }, [eventId, page, searchDebounced, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [eventId, searchDebounced, sortBy]);

  useEffect(() => {
    if (!eventId) return;
    api
      .get(`/events/${eventId}/`)
      .then((res) => setEventTitle(res.data?.title || ""))
      .catch(() => setEventTitle(""));
  }, [eventId]);

  const ordered = useMemo(() => {
    const list = [...attendance];
    switch (sortBy) {
      case "time_asc":
        list.sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
        break;
      case "resident_asc":
        list.sort((a, b) => (a.resident_username || "").localeCompare(b.resident_username || ""));
        break;
      case "resident_desc":
        list.sort((a, b) => (b.resident_username || "").localeCompare(a.resident_username || ""));
        break;
      case "verifier_asc":
        list.sort((a, b) => (a.verified_by || "").localeCompare(b.verified_by || ""));
        break;
      case "verifier_desc":
        list.sort((a, b) => (b.verified_by || "").localeCompare(a.verified_by || ""));
        break;
      case "time_desc":
      default:
        list.sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at));
    }
    return list;
  }, [attendance, sortBy]);

  const currentPage = page;
  const paged = ordered;

  const exportCsv = async () => {
    try {
      const res = await api.get(`/events/${eventId}/attendance/export/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `event_${eventId}_attendance.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export CSV");
    }
  };

  const fetchAllAttendanceRows = async () => {
    const rows = [];
    let nextPage = 1;

    while (nextPage) {
      const params = new URLSearchParams({
        page: String(nextPage),
        ordering: sortBy,
      });
      if (searchDebounced) params.set("q", searchDebounced);
      const res = await api.get(`/events/${eventId}/attendance/?${params.toString()}`);
      const data = res.data || {};
      rows.push(...(data.results || []));
      nextPage = data.next ? nextPage + 1 : null;
    }

    return rows;
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const rows = await fetchAllAttendanceRows();
      if (rows.length === 0) {
        toast.error("No attendance records to export");
        return;
      }

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });
      const generatedAt = new Date().toLocaleString();
      const title = eventTitle || `Event ${eventId}`;

      doc.setFontSize(16);
      doc.text("Attendance Report", 40, 48);
      doc.setFontSize(11);
      doc.text(`Event: ${title}`, 40, 70);
      doc.text(`Generated: ${generatedAt}`, 40, 88);
      doc.text(`Total Records: ${rows.length}`, 40, 106);

      autoTable(doc, {
        startY: 124,
        head: [["Resident", "Checked In At", "Verified By"]],
        body: rows.map((row) => [
          row.resident_username || "",
          row.checked_in_at ? new Date(row.checked_in_at).toLocaleString() : "",
          row.verified_by || "",
        ]),
        styles: {
          fontSize: 10,
          cellPadding: 6,
        },
        headStyles: {
          fillColor: [34, 139, 94],
        },
      });

      doc.save(`event_${eventId}_attendance.pdf`);
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Attendance Records</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void exportCsv()}>Export CSV</button>
          <button onClick={() => void exportPdf()} disabled={exportingPdf}>
            {exportingPdf ? "Exporting PDF..." : "Export PDF"}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ opacity: 0.8 }}>Total: {attendance.length}</span>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 10, alignItems: "end" }}>
          <div>
            <label className="sr-only" htmlFor={`attendance-search-${eventId}`}>Search attendance by name</label>
            <input
              id={`attendance-search-${eventId}`}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resident name"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #bbdfc8", background: "#fff" }}
            />
          </div>
          <div>
            <label htmlFor={`attendance-sort-${eventId}`} style={{ display: "block", marginBottom: 4 }}>Sort by:</label>
            <select
              id={`attendance-sort-${eventId}`}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: 190, padding: "9px 10px", borderRadius: 8, border: "1px solid #bbdfc8", background: "#fff" }}
            >
              <option value="resident_asc">Resident: A to Z</option>
              <option value="resident_desc">Resident: Z to A</option>
              <option value="time_desc">Time: Newest first</option>
              <option value="time_asc">Time: Oldest first</option>
              <option value="verifier_asc">Verifier: A to Z</option>
              <option value="verifier_desc">Verifier: Z to A</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPage((p) => (p > 1 && hasPrev ? p - 1 : p))} disabled={!hasPrev || currentPage === 1}>
              Prev
            </button>
            <span>Page {currentPage}</span>
            <button onClick={() => setPage((p) => (hasNext ? p + 1 : p))} disabled={!hasNext}>
              Next
            </button>
          </div>
        </div>
      </div>
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Resident</th>
            <th>Checked In At</th>
            <th>Verified By</th>
          </tr>
        </thead>
        <tbody>
          {paged.length === 0 ? (
            <tr>
              <td colSpan={3}>No attendance records match your search.</td>
            </tr>
          ) : (
            paged.map((a) => (
              <tr key={a.id}>
                <td>{a.resident_username}</td>
                <td>{new Date(a.checked_in_at).toLocaleString()}</td>
                <td>{a.verified_by}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

