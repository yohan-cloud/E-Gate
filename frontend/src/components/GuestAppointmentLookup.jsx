import { useEffect, useState } from "react";

import { api } from "../api";
import toast from "../lib/toast";

function nextDirection(appointment) {
  if (appointment?.checked_out_at || appointment?.status === "completed") return null;
  if (appointment?.checked_in_at && !appointment?.checked_out_at) return "time_out";
  return "time_in";
}

export default function GuestAppointmentLookup({ onScanResult }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState("Search today's and upcoming guest appointments by name, organization, contact, purpose, or appointment ID.");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/common/guests/gate/lookup/?q=${encodeURIComponent(query.trim())}`);
        if (!cancelled) {
          setResults(Array.isArray(res?.data) ? res.data : []);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setMessage(error?.response?.data?.error || "Failed to look up guest appointments.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timeoutId = window.setTimeout(load, query.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  async function handleManualMark(appointment) {
    if (appointment?.checked_out_at || appointment?.status === "completed") {
      return;
    }
    if (isFutureAppointment(appointment?.eta)) {
      const errorMessage = "This appointment is scheduled for a later date and cannot be checked in yet.";
      toast.error(errorMessage, "guest-scanner");
      onScanResult && onScanResult({
        mode: "guest_manual",
        timestamp: new Date().toISOString(),
        severity: "error",
        code: "scheduled_later",
        title: "Guest Lookup Failed",
        message: errorMessage,
      });
      return;
    }
    const direction = nextDirection(appointment);
    setActionLoadingId(appointment.id);
    try {
      const res = await api.post("/common/guests/gate/manual-scan/", {
        appointment_id: appointment.id,
        direction,
      });
      const successMessage = res?.data?.message || (direction === "time_out" ? "Guest check-out recorded." : "Guest check-in recorded.");
      toast.success(successMessage, "guest-scanner");
      onScanResult && onScanResult({
        mode: "guest_manual",
        timestamp: new Date().toISOString(),
        severity: "success",
        code: res?.data?.result_code || direction,
        title: direction === "time_out" ? "Guest Check Out Recorded" : "Guest Check In Recorded",
        message: successMessage,
        username: res?.data?.guest_name,
        contact: res?.data?.guest_contact,
        purpose: res?.data?.purpose,
        checkedInAt: res?.data?.checked_in_at || res?.data?.logged_at,
        checkedOutAt: res?.data?.checked_out_at,
      });
      setResults((current) => current.map((item) => (
        item.id === appointment.id
          ? {
              ...item,
              checked_in_at: res?.data?.checked_in_at || item.checked_in_at,
              checked_out_at: res?.data?.checked_out_at || item.checked_out_at,
              status: res?.data?.status || item.status,
            }
          : item
      )));
    } catch (error) {
      const errorMessage = error?.response?.data?.error || "Failed to update guest appointment.";
      toast.error(errorMessage, "guest-scanner");
      onScanResult && onScanResult({
        mode: "guest_manual",
        timestamp: new Date().toISOString(),
        severity: "error",
        code: error?.response?.data?.result_code || "failed",
        title: "Guest Lookup Failed",
        message: errorMessage,
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-head">
        <div>
          <h3 style={{ margin: 0 }}>Manual Guest Lookup</h3>
          <div style={{ color: "#64748b", fontSize: 13 }}>Search today's and upcoming appointments, while only allowing check-in on the scheduled date.</div>
        </div>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search guest name, organization, contact, purpose, or appointment ID"
        style={{ width: "100%", marginTop: 12 }}
      />
      {loading && <p style={{ marginTop: 12 }}>Searching appointments...</p>}
      {!loading && message && <p style={{ marginTop: 12 }}>{message}</p>}
      {!loading && results.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {results.map((appointment) => {
            const direction = nextDirection(appointment);
            const isFuture = isFutureAppointment(appointment.eta);
            const isCompleted = !direction;
            const isDisabled = actionLoadingId === appointment.id || isFuture || isCompleted;
            return (
              <div key={appointment.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{appointment.name}</div>
                    <div style={{ color: "#475569", fontSize: 13 }}>{appointment.purpose}</div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>Appointment #{appointment.id}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
                  <Info label="Organization / Company" value={appointment.organization_company || "N/A"} />
                  <Info label="No. of Participants" value={appointment.no_of_participants ?? 1} />
                  <Info label="Contact" value={appointment.contact || "N/A"} />
                  <Info label="ETA" value={formatDateTime(appointment.eta)} />
                  <Info label="Status" value={appointment.status} />
                  <Info label="Checked In" value={formatDateTime(appointment.checked_in_at) || "Not yet"} />
                  <Info label="Checked Out" value={formatDateTime(appointment.checked_out_at) || "Not yet"} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {isCompleted
                      ? "This guest appointment is already completed, so no further manual action is needed."
                      : isFuture
                      ? "This appointment is visible now, but check-in stays locked until its scheduled date."
                      : direction === "time_out"
                        ? "Latest record is check-in, so the next action will record check-out."
                        : "No open visit record yet, so the next action will record check-in."}
                  </div>
                  <button onClick={() => handleManualMark(appointment)} disabled={isDisabled}>
                    {actionLoadingId === appointment.id ? "Saving..." : isCompleted ? "Completed" : isFuture ? "Scheduled Later" : direction === "time_out" ? "Mark Check Out" : "Mark Check In"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
      <div style={{ color: "#64748b", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function isFutureAppointment(value) {
  if (!value) return false;
  const appointmentDate = new Date(value);
  if (Number.isNaN(appointmentDate.getTime())) return false;
  const now = new Date();
  return appointmentDate.toDateString() !== now.toDateString() && appointmentDate > now;
}
