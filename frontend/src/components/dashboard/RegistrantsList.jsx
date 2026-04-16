import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";

export default function RegistrantsList({ eventId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    api
      .get(`/events/${eventId}/registrants/`)
      .then((res) => setRows(res.data || []))
      .catch(() => setError("Failed to load registrants"))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const mark = async (registrationId) => {
    try {
      await api.post(`/events/attendance/mark/`, { registration_id: registrationId });
      toast.success("Attendance marked");
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to mark attendance";
      toast.error(msg);
    }
  };

  if (!eventId) return null;
  if (loading) return <div className="card">Loading registrants...</div>;
  if (error) return <div className="card">{error}</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Registrants</h3>
        <button onClick={async () => {
          try {
            const res = await api.get(`/events/${eventId}/registrants/export/`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `event_${eventId}_registrants.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
          } catch {
            toast.error('Failed to export CSV');
          }
        }}>Export CSV</button>
      </div>
      {rows.length === 0 ? (
        <p>No registrants yet.</p>
      ) : (
        <div className="table-container">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Registered At</th>
                <th>Checked In?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.resident_username}
                    {r.resident_has_face ? (
                      <span style={{ marginLeft: 6, fontSize: 12, color: '#16a34a' }} title="Has enrolled face">(Face ✓)</span>
                    ) : (
                      <span style={{ marginLeft: 6, fontSize: 12, color: '#6b7280' }} title="No face enrolled">(No Face)</span>
                    )}
                  </td>
                  <td>{new Date(r.registered_at).toLocaleString()}</td>
                  <td>
                    {r.attendance_confirmed ? (
                      "Yes"
                    ) : (
                      <button onClick={() => mark(r.id)} style={{ padding: "4px 10px" }}>Mark</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
