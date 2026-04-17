import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

const statusColors = {
  pending: { bg: "#fef9c3", color: "#854d0e", icon: "Pending", title: "Pending Review" },
  approved: { bg: "#dcfce7", color: "#166534", icon: "Approved", title: "Verified" },
  rejected: { bg: "#fef3c7", color: "#92400e", icon: "Retry", title: "New Upload Requested" },
};

const allowedFileTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const maxFileSize = 5 * 1024 * 1024;

export default function VerificationTab({ onStatusChange, residentProfile = null }) {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [fileFeedback, setFileFeedback] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const expiryDate = useMemo(() => {
    if (!residentProfile?.expiry_date) return null;
    const parsed = new Date(`${residentProfile.expiry_date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [residentProfile?.expiry_date]);

  const isExpired = useMemo(() => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiryDate < today;
  }, [expiryDate]);

  const isCurrentlyVerified = Boolean(residentProfile?.is_verified) && !isExpired;
  const requestKind = isExpired ? "reverification" : "verification";

  const canSubmit = useMemo(() => {
    if (!file) return false;
    if (current?.status === "pending") return false;
    if (current?.status === "approved" && !isExpired) return false;
    return true;
  }, [file, current?.status, isExpired]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/residents/verification/");
      setCurrent(res?.data || null);
      await onStatusChange?.();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load ID review status.");
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      setFileFeedback(null);
      return;
    }
    if (!allowedFileTypes.includes(f.type)) {
      setError("Use JPG, PNG, WEBP, or PDF.");
      setFile(null);
      setFileFeedback({ tone: "#b91c1c", text: "Unsupported format. Use JPG, PNG, WEBP, or PDF." });
      return;
    }
    if (f.size > maxFileSize) {
      setError("Max file size is 5MB.");
      setFile(null);
      setFileFeedback({ tone: "#b91c1c", text: "File too large. Maximum size is 5MB." });
      return;
    }
    setError("");
    setFile(f);
    setFileFeedback({ tone: "#15803d", text: `Ready to upload: ${f.name}` });
  };

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError("");
    setSuccessMsg("");
    try {
      const form = new FormData();
      form.append("document", file);
      if (note.trim()) form.append("note", note.trim());
      const res = await api.post("/residents/verification/", form);
      setCurrent(res?.data || null);
      setFile(null);
      setNote("");
      setSuccessMsg(isExpired ? "Reverification request sent." : "Verification request sent.");
      await onStatusChange?.();
    } catch (e) {
      setError(e?.response?.data?.error || `Failed to submit ${requestKind}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const statusInfo = useMemo(() => {
    const status = current?.status;
    if (!status || status === "none") {
      if (isCurrentlyVerified) {
        return {
          bg: "#dcfce7",
          color: "#166534",
          icon: "OK",
          title: "ID Active",
          message: "Your resident ID is active. Reverification will only be needed after it expires.",
        };
      }
      if (residentProfile?.is_verified && isExpired) {
        return {
          bg: "#fef3c7",
          color: "#92400e",
          icon: "!",
          title: "Reverification Required",
          message: "Your resident ID has expired. Upload a new ID document so the admin can review and renew it.",
        };
      }
      return {
        bg: "#e2e8f0",
        color: "#334155",
        icon: "ID",
        title: "Verification Available",
        message: "Upload a clear copy of your Barangay ID if the admin asks you to complete identity review.",
      };
    }

    const meta = statusColors[status] || {};
    if (status === "approved") {
      const reviewedOn = current?.reviewed_at
        ? new Date(current.reviewed_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : null;
      return {
        ...meta,
        title: isExpired ? "Reverification Approved" : meta.title,
        message: reviewedOn
          ? `${isExpired ? "Your reverification request was approved" : "Your account was verified"} on ${reviewedOn}.`
          : isExpired
            ? "Your reverification request was approved."
            : "Your account has been successfully verified.",
      };
    }
    if (status === "pending") {
      return {
        ...meta,
        title: isExpired ? "Reverification Pending" : meta.title,
        message: `Your ${requestKind} request is under review. You do not need to upload again right now.`,
      };
    }
    return {
      ...meta,
      title: isExpired ? "New Reverification Upload Needed" : meta.title,
      message: `Please review the guidance below and submit a clearer document for ${requestKind}.`,
    };
  }, [current, isCurrentlyVerified, isExpired, requestKind, residentProfile?.is_verified]);

  if (loading) return <p>Loading ID review status...</p>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Resident ID Reverification</h3>
      <p style={{ marginTop: 0, color: "#475569" }}>
        Upload your current Barangay ID when your resident ID has expired or when the admin asks for a new review.
      </p>

      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>}
      {successMsg && <div style={{ color: "#15803d", marginBottom: 8 }}>{successMsg}</div>}

      <div
        style={{
          display: "grid",
          gap: 8,
          background: statusInfo.bg,
          color: statusInfo.color,
          borderRadius: 14,
          border: `1px solid ${statusInfo.color}22`,
          padding: "14px 16px",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ fontSize: 18, lineHeight: 1, fontWeight: 700, minWidth: 64 }}>{statusInfo.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{statusInfo.title}</div>
            <div style={{ fontSize: 14 }}>{statusInfo.message}</div>
          </div>
        </div>
        {residentProfile?.expiry_date && (
          <span style={{ fontSize: 12, color: statusInfo.color }}>
            Current expiry: {new Date(`${residentProfile.expiry_date}T00:00:00`).toLocaleDateString()}
          </span>
        )}
        {current?.reviewed_at && (
          <span style={{ fontSize: 12, color: statusInfo.color }}>
            Reviewed at: {new Date(current.reviewed_at).toLocaleString()}
          </span>
        )}
      </div>

      {current?.admin_note && (
        <div style={{ marginTop: 8, background: "#f8fafc", padding: 8, borderRadius: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Admin note</div>
          <div style={{ color: "#111827" }}>{current.admin_note}</div>
        </div>
      )}

      {current?.document_url && (
        <div style={{ marginTop: 8 }}>
          <a href={current.document_url} target="_blank" rel="noreferrer">
            View last uploaded document
          </a>
        </div>
      )}

      {current?.status === "approved" && !isExpired && (
        <div
          style={{
            marginTop: 12,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            padding: "12px 14px",
            color: "#166534",
          }}
        >
          Your resident ID is still active. Come back here when it expires and needs reverification.
        </div>
      )}

      {(current?.status !== "approved" || isExpired) && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Before you upload</div>
            <div style={{ color: "#475569", fontSize: 14 }}>
              <div>• Upload a clear photo of your Barangay ID</div>
              <div>• Make sure the ID is updated and readable</div>
              <div>• Ensure your name and photo are visible</div>
              <div>• Avoid blurry, dark, or cropped images</div>
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>
              {current?.status === "rejected" ? "Upload a new ID" : isExpired ? "Upload updated ID for reverification" : "Upload ID"}
            </label>
            <input type="file" accept="image/*,.pdf" onChange={onFileChange} />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Accepts JPG, PNG, WEBP, or PDF. Max 5MB.
            </div>
            {fileFeedback && (
              <div style={{ marginTop: 6, fontSize: 13, color: fileFeedback.tone }}>
                {fileFeedback.text}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={{ width: "100%", maxWidth: 560 }}
              placeholder="Add any additional details for the admin reviewer"
            />
          </div>
          <div>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={!canSubmit || submitting}
              style={{ padding: "8px 14px" }}
            >
              {submitting ? "Submitting..." : isExpired ? "Submit for Reverification" : "Submit for Verification"}
            </button>
            {current?.status === "pending" && (
              <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 12 }}>
                You already have a pending request.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
