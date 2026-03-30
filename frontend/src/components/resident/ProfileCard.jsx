import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import FaceEnroll from "./FaceEnroll";

export default function ProfileCard() {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);

  const refreshProfile = async () => {
    const response = await api.get("/residents/profile/");
    setProfile(response.data);
    return response.data;
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshProfile();
      } catch (e) {
        setLoadError(e?.response?.data?.error || "Failed to load profile");
      }
    })();
  }, []);

  const displayName = useMemo(() => {
    const fn = (profile?.user?.first_name || "").trim();
    const ln = (profile?.user?.last_name || "").trim();
    const combined = `${fn} ${ln}`.trim();
    return combined || profile?.user?.username || "";
  }, [profile]);

  const payload = `Barangay ID: ${profile?.barangay_id || ""}\nName: ${displayName}`;

  const daysToExpiry = useMemo(() => {
    if (!profile?.expiry_date) return null;
    try {
      const today = new Date();
      const expiry = new Date(profile.expiry_date);
      const diffMs = expiry.setHours(23, 59, 59, 999) - today.getTime();
      return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }, [profile?.expiry_date]);

  const verificationBadge = useMemo(() => {
    if (profile?.is_verified) {
      return <span style={pill("#dcfce7", "#15803d")}>Verified ID</span>;
    }
    return <span style={pill("#fef9c3", "#854d0e")}>Not Verified</span>;
  }, [profile?.is_verified]);

  const copyBarangayId = async () => {
    try {
      await navigator.clipboard.writeText(String(profile?.barangay_id || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `virtual-id-${profile?.user?.username || "resident"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setUploadError("Use JPG, PNG, or WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Max 5MB image");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setUploadError("");
  };

  const uploadPhoto = async (input) => {
    const file = input?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await api.post("/residents/profile/photo/", form);
      const data = res?.data;
      if (data) {
        setProfile((prev) => ({ ...(prev || {}), ...data }));
        try {
          const userRaw = localStorage.getItem("user");
          const user = userRaw ? JSON.parse(userRaw) : {};
          localStorage.setItem("user", JSON.stringify({ ...user, profile: data }));
        } catch {
          return;
        }
      }
      setPreviewUrl("");
    } catch (e) {
      setUploadError(e?.response?.data?.error || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function gen() {
      try {
        let QRModule;
        try {
          QRModule = await import("qrcode");
        } catch {
          QRModule = await import(/* @vite-ignore */ "qrcode");
        }
        const QRCode = QRModule.default || QRModule;
        const url = await QRCode.toDataURL(payload, { width: 240, margin: 1 });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setQrDataUrl("");
      }
    }
    if (profile) gen();
    return () => {
      active = false;
    };
  }, [payload, profile]);

  if (loadError) return <p>{loadError}</p>;
  if (!profile) return <p>Loading profile...</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          {previewUrl || profile.photo_thumb || profile.photo ? (
            <img
              src={previewUrl || profile.photo_thumb || profile.photo}
              alt="Resident"
              style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid #e5e7eb" }}
            />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: 12, background: "#e5e7eb", display: "grid", placeItems: "center", color: "#374151", fontWeight: 700, fontSize: 28 }}>
              {String(profile.user?.username || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <label className="sr-only" htmlFor="photo-input">Upload profile photo</label>
          <input id="photo-input" type="file" accept="image/*" onChange={onFileChange} />
          {uploadError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{uploadError}</div>}
          {previewUrl && (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-primary" disabled={uploading} onClick={() => uploadPhoto(document.getElementById("photo-input"))}>
                {uploading ? "Uploading..." : "Save"}
              </button>
              <button onClick={() => { setPreviewUrl(""); const inp = document.getElementById("photo-input"); if (inp) inp.value = ""; }}>Cancel</button>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{displayName}</div>
            {verificationBadge}
            {typeof daysToExpiry === "number" && (
              <span style={pill(daysToExpiry <= 7 ? "#fee2e2" : "#dcfce7", daysToExpiry <= 7 ? "#991b1b" : "#065f46")}>
                {daysToExpiry >= 0 ? `${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"} left` : "Expired"}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <InfoRow label="Barangay ID" value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {profile.barangay_id}
                <button onClick={copyBarangayId} style={{ padding: "4px 8px" }}>{copied ? "Copied" : "Copy"}</button>
              </span>
            } />
            <InfoRow label="Email" value={profile.user?.email || "—"} />
            <InfoRow label="Address" value={profile.address || "—"} />
            <InfoRow label="Birthdate" value={profile.birthdate || "—"} />
            <InfoRow label="Expiry" value={profile.expiry_date || "—"} />
            <InfoRow label="Phone" value={profile.phone_number || "—"} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button onClick={downloadQr} disabled={!qrDataUrl} style={{ padding: "8px 12px" }}>Download QR</button>
            <button onClick={() => window.print()} style={{ padding: "8px 12px" }}>Print ID</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Face Recognition</h3>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Status: {profile?.has_face ? <span style={{ color: "#16a34a" }}>Enrolled</span> : <span style={{ color: "#991b1b" }}>Not Enrolled</span>}
          </span>
        </div>
        {!showFaceEnroll ? (
          <button onClick={() => setShowFaceEnroll(true)} className="btn-primary" style={{ width: "fit-content" }}>
            {profile?.has_face ? "Re-enroll Face" : "Enroll Face"}
          </button>
        ) : (
          <>
            <FaceEnroll
              onEnrolled={async () => {
                try {
                  await refreshProfile();
                } catch {
                  return;
                }
              }}
              onClose={() => setShowFaceEnroll(false)}
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowFaceEnroll(false)}>Close</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }} className="no-print">Barangay ID Card</h3>
        <div className="pvc-print">
          {/* Front */}
          <div style={pvcFrontStyle}>
            <div style={pvcHeader}>Barangay 663-A ID <span style={{ fontSize: "10px", opacity: 0.9 }}>Valid until {profile.expiry_date}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "26mm 1fr", gap: "3mm", padding: "3mm" }}>
              <div style={{ display: "grid", alignItems: "center", justifyItems: "center" }}>
                <div style={photoFrame}>
                  {profile.photo_thumb || profile.photo ? (
                    <img src={profile.photo_thumb || profile.photo} alt="Photo" style={{ width: "24mm", height: "30mm", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "8px", color: "#94a3b8" }}>No Photo</span>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", rowGap: "1.5mm" }}>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{displayName}</div>
                <LabelRow label="Barangay ID" value={profile.barangay_id} />
                <LabelRow label="Address" value={profile.address} />
                <div style={{ fontSize: "9px", color: "#64748b" }}>
                  The bearer, whose picture appear hereon, is a bonafide resident of this barangay. This identification card is being issued for barangay events and identification purposes.
                </div>
              </div>
            </div>
          </div>
          <div className="page-break" />
          {/* Back */}
          <div style={pvcBackStyle}>
            <div style={pvcHeader}>Barangay 663-A – Back</div>
            <div style={{ display: "grid", justifyItems: "center", alignItems: "center" }}>
              <div style={qrFrame}>
                {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width: "30mm", height: "30mm" }} /> : <span style={{ fontSize: "8px", color: "#94a3b8" }}>QR unavailable</span>}
              </div>
              <div style={{ fontSize: "8px", color: "#64748b", marginTop: "2mm" }}>Scan for attendance</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}

function LabelRow({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16mm 1fr", columnGap: "2mm", alignItems: "baseline", fontSize: "10px" }}>
      <div style={{ color: "#475569" }}>{label}:</div>
      <div style={{ wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

const pvcFrontStyle = {
  width: "85.6mm",
  height: "54mm",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  display: "grid",
  gridTemplateRows: "12mm 1fr",
  marginBottom: 12,
};

const pvcBackStyle = {
  width: "85.6mm",
  height: "54mm",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  display: "grid",
  gridTemplateRows: "10mm 1fr",
};

const pvcHeader = {
  background: "#0ea5e9",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2mm 3mm",
  fontWeight: 700,
};

const photoFrame = {
  width: "24mm",
  height: "30mm",
  border: "1px solid #e5e7eb",
  borderRadius: 2,
  overflow: "hidden",
  background: "#f8fafc",
  display: "grid",
  placeItems: "center",
};

const qrFrame = {
  width: "32mm",
  height: "32mm",
  border: "1px solid #e5e7eb",
  display: "grid",
  placeItems: "center",
  background: "#fff",
};

function pill(bg, color) {
  return {
    background: bg,
    color,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
