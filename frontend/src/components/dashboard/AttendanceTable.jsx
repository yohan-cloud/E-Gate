import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../../api";
import toast from "../../lib/toast";

export default function AttendanceTable({ eventId }) {
  const [attendance, setAttendance] = useState([]);
  const [eventTitle, setEventTitle] = useState("");
  const [sortBy, setSortBy] = useState("time_desc");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    api
      .get(`/events/${eventId}/attendance/?page=${page}`)
      .then((res) => {
        const data = res.data || {};
        setAttendance(data.results || []);
        setHasNext(!!data.next);
        setHasPrev(!!data.previous);
      })
      .catch((err) => console.error(err));
  }, [eventId, page]);

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
      const res = await api.get(`/events/${eventId}/attendance/?page=${nextPage}`);
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
        <div>
          <label style={{ marginRight: 6 }}>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="time_desc">Time: Newest first</option>
            <option value="time_asc">Time: Oldest first</option>
            <option value="resident_asc">Resident: A to Z</option>
            <option value="resident_desc">Resident: Z to A</option>
            <option value="verifier_asc">Verifier: A to Z</option>
            <option value="verifier_desc">Verifier: Z to A</option>
          </select>
          <button onClick={() => setPage((p) => (p > 1 && hasPrev ? p - 1 : p))} disabled={!hasPrev || currentPage === 1} style={{ marginLeft: 10 }}>
            Prev
          </button>
          <span style={{ margin: "0 6px" }}>Page {currentPage}</span>
          <button onClick={() => setPage((p) => (hasNext ? p + 1 : p))} disabled={!hasNext}>
            Next
          </button>
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
          {paged.map((a) => (
            <tr key={a.id}>
              <td>{a.resident_username}</td>
              <td>{new Date(a.checked_in_at).toLocaleString()}</td>
              <td>{a.verified_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

