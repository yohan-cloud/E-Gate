import { useEffect, useMemo, useRef, useState } from "react";
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
  const photoInputRef = useRef(null);

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
  const photoSource = previewUrl || profile?.photo_thumb || profile?.photo || "";
  const genderLabel = useMemo(() => {
    const value = String(profile?.gender || "").trim().toLowerCase();
    if (!value) return "Unspecified";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }, [profile?.gender]);
  const formattedBirthdate = useMemo(() => formatDisplayDate(profile?.birthdate), [profile?.birthdate]);
  const formattedExpiryDate = useMemo(() => formatDisplayDate(profile?.expiry_date), [profile?.expiry_date]);
  const residentCategoryLabel = useMemo(() => formatEnumLabel(profile?.resident_category, "Resident"), [profile?.resident_category]);
  const voterStatusLabel = useMemo(() => formatVoterStatusLabel(profile?.voter_status), [profile?.voter_status]);

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
        const url = await QRCode.toDataURL(payload, {
          width: 1200,
          margin: 2,
          errorCorrectionLevel: "H",
        });
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
    <div className="resident-profile-shell">
      <div className="card resident-profile-card">
        <div className="resident-profile-photo-panel">
          {photoSource ? (
            <img
              src={photoSource}
              alt="Resident"
              className="resident-profile-photo"
            />
          ) : (
            <div className="resident-profile-photo resident-profile-photo-placeholder">
              {String(profile.user?.username || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <label className="sr-only" htmlFor="photo-input">
            Upload profile photo
          </label>
          <input
            ref={photoInputRef}
            id="photo-input"
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={onFileChange}
          />
          <button
            type="button"
            className="resident-profile-upload-button"
            onClick={() => photoInputRef.current?.click()}
          >
            {photoSource ? "Change Photo" : "Upload Photo"}
          </button>
          {uploadError && <div className="resident-profile-upload-error">{uploadError}</div>}
          {previewUrl && (
            <div className="resident-profile-upload-actions">
              <button className="btn-primary" disabled={uploading} onClick={() => uploadPhoto(photoInputRef.current)}>
                {uploading ? "Uploading..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl("");
                  if (photoInputRef.current) photoInputRef.current.value = "";
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="resident-profile-main">
          <div className="resident-profile-header">
            <div className="resident-profile-name">{displayName}</div>
            {verificationBadge}
            {typeof daysToExpiry === "number" && (
              <span style={pill(daysToExpiry <= 7 ? "#fee2e2" : "#dcfce7", daysToExpiry <= 7 ? "#991b1b" : "#065f46")}>
                {daysToExpiry >= 0 ? `${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"} left` : "Expired"}
              </span>
            )}
          </div>
          <div className="resident-profile-id-row">
            <div className="resident-profile-id-block">
              <div className="resident-profile-field-label">Barangay ID</div>
              <div className="resident-profile-id-value">{profile.barangay_id || "—"}</div>
            </div>
            <button type="button" className="resident-profile-copy-button" onClick={copyBarangayId}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="resident-profile-details-grid">
            <InfoRow label="Email" value={profile.user?.email || "—"} />
            <InfoRow label="Phone" value={profile.phone_number || "—"} />
            <InfoRow label="Address" value={profile.address || "—"} />
            <InfoRow label="Gender" value={genderLabel} />
            <InfoRow label="Resident Type" value={residentCategoryLabel} />
            <InfoRow label="Voter Status" value={voterStatusLabel} />
            <InfoRow label="Birthdate" value={formattedBirthdate} />
            <InfoRow label="Expiry" value={formattedExpiryDate} />
          </div>
          <div className="resident-profile-actions">
            <button onClick={downloadQr} disabled={!qrDataUrl}>Download QR</button>
            <button onClick={() => window.print()}>Print ID</button>
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
          <div className="id-card pvc-card-face pvc-card-front" style={governmentFrontStyle}>
            <div style={idAccentTopStyle} />
            <div style={idAccentBottomStyle} />
            <div style={frontHeaderStyle}>
              <div style={{ display: "grid", gap: "0.5mm" }}>
                <div style={frontRepublicStyle}>Republic of the Philippines</div>
                <div style={frontHeaderTitleStyle}>Resident Identification Card</div>
                <div style={frontBarangayStyle}>Barangay 663-A, Zone 73, District 5, Manila</div>
              </div>
              <div style={frontHeaderMarkStyle}>
                <img src="/barangay-663a-logo.png" alt="Barangay 663-A logo" style={{ width: "8mm", height: "8mm", objectFit: "contain" }} />
                <div style={frontHeaderMarkTextStyle}>Barangay Identification Card</div>
              </div>
            </div>

            <div style={frontContentStyle}>
              <div style={frontPhotoColumnStyle}>
                <div style={governmentPhotoFrame}>
                  {photoSource ? (
                    <img src={photoSource} alt="Resident" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={photoPlaceholderStyle}>
                      <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em" }}>PHOTO</div>
                    </div>
                  )}
                </div>
                <div style={frontSignatureWrapStyle}>
                  <div style={signatureLineStyle} />
                  <div style={signatureLabelStyle}>Signature</div>
                </div>
              </div>

              <div style={frontDetailsColumnStyle}>
                <div style={frontResidentNameStyle}>{displayName}</div>
                <div style={frontPrimaryFieldStackStyle}>
                  <GovernmentField label="ID Number" value={profile.barangay_id} />
                </div>
                <div style={frontSecondaryFieldGridStyle}>
                  <GovernmentField label="Date of Birth" value={formattedBirthdate} />
                  <GovernmentField label="Gender" value={genderLabel} />
                </div>
                <div style={frontPrimaryFieldStackStyle}>
                  <GovernmentField label="Address" value={profile.address} />
                </div>
                <div style={frontPrimaryFieldStackStyle}>
                  <GovernmentField label="Validity Date" value={formattedExpiryDate} />
                </div>
                <div style={frontFooterNoticeStyle}>
                  This card certifies that the bearer is a registered resident of Barangay 663-A and may be used for identification and barangay services.
                </div>
              </div>
            </div>
          </div>

          <div className="page-break" />

          <div className="id-card pvc-card-face pvc-card-back" style={governmentBackStyle}>
            <div style={backAccentSideStyle} />
            <div style={backHeaderStyle}>
              <div style={{ display: "grid", gap: "0.6mm" }}>
                <div style={backTitleStyle}>Barangay 663-A Resident ID</div>
                <div style={backSubtitleStyle}>Official back panel for gate verification and attendance scanning</div>
              </div>
              <img src="/barangay-663a-logo.png" alt="Barangay 663-A seal" style={{ width: "9mm", height: "9mm", objectFit: "contain" }} />
            </div>

            <div style={backContentStyle}>
              <div style={backNoticeBlockStyle}>
                <div style={backSectionLabelStyle}>Instructions</div>
                <div style={backNoticeTextStyle}>Present this card to the scanner with the QR side facing outward.</div>
                <div style={backReturnStyle}>If lost, return to Barangay Office</div>
                <div style={backMetaStyle}>ID Number: {profile.barangay_id}</div>
                <div style={backMetaStyle}>Valid Until: {formattedExpiryDate}</div>
              </div>

              <div style={backQrColumnStyle}>
                <div style={qrQualityFrameStyle}>
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Resident QR"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        imageRendering: "pixelated",
                        display: "block",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: "8px", color: "#94a3b8" }}>QR unavailable</span>
                  )}
                </div>
                <div style={backQrCaptionStyle}>Scan for attendance and gate validation</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="resident-profile-info-row">
      <div className="resident-profile-field-label">{label}</div>
      <div className="resident-profile-field-value">{value || "—"}</div>
    </div>
  );
}

function GovernmentField({ label, value }) {
  return (
    <div style={{ display: "grid", gap: "0.5mm" }}>
      <div style={{ fontSize: "2.1mm", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#4b5563" }}>
        {label}
      </div>
      <div style={{ fontSize: "2.75mm", fontWeight: 700, color: "#0f172a", lineHeight: 1.1, wordBreak: "break-word" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function formatDisplayDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatEnumLabel(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatVoterStatusLabel(value) {
  if (!value || value === "unspecified") return "Not Set";
  if (value === "other_area_voter") return "Voter in Other Barangay / Other Area";
  return formatEnumLabel(value, "Not Set");
}

const governmentFrontStyle = {
  width: "85.6mm",
  height: "54mm",
  border: "0.35mm solid #d7e3db",
  borderRadius: "4mm",
  overflow: "hidden",
  background: "linear-gradient(145deg, #fdfefb 0%, #f3f8f2 55%, #eef6ed 100%)",
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  display: "grid",
  position: "relative",
  gridTemplateRows: "11.5mm 1fr",
  marginBottom: 12,
};

const governmentBackStyle = {
  width: "85.6mm",
  height: "54mm",
  border: "0.35mm solid #d7e3db",
  borderRadius: "4mm",
  overflow: "hidden",
  background: "linear-gradient(145deg, #fbfdfb 0%, #f1f8f1 55%, #e9f4e9 100%)",
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  display: "grid",
  position: "relative",
  gridTemplateRows: "11.5mm 1fr",
};

const idAccentTopStyle = {
  position: "absolute",
  top: "-8mm",
  right: "-7mm",
  width: "30mm",
  height: "20mm",
  background: "radial-gradient(circle at 20% 60%, rgba(110, 193, 133, 0.20), rgba(110, 193, 133, 0) 68%)",
  pointerEvents: "none",
};

const idAccentBottomStyle = {
  position: "absolute",
  left: "-10mm",
  bottom: "-8mm",
  width: "36mm",
  height: "22mm",
  background: "radial-gradient(circle at 60% 40%, rgba(116, 201, 152, 0.18), rgba(116, 201, 152, 0) 70%)",
  pointerEvents: "none",
};

const frontHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2.2mm 3.2mm 1.8mm",
  borderBottom: "0.35mm solid rgba(108, 147, 118, 0.28)",
};

const frontRepublicStyle = {
  fontSize: "2.15mm",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#1f2937",
};

const frontBarangayStyle = {
  fontSize: "1.9mm",
  color: "#475569",
};

const frontHeaderTitleStyle = {
  fontSize: "2.55mm",
  fontWeight: 800,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "#0f172a",
  lineHeight: 1,
};

const frontHeaderMarkStyle = {
  display: "flex",
  alignItems: "center",
  gap: "2mm",
};

const frontHeaderMarkTextStyle = {
  fontSize: "2.15mm",
  fontWeight: 700,
  color: "#166534",
  textAlign: "right",
  maxWidth: "18mm",
  lineHeight: 1.1,
};

const frontContentStyle = {
  display: "grid",
  gridTemplateColumns: "21mm 1fr",
  gap: "2.6mm",
  padding: "2.6mm 3.2mm 3mm",
};

const frontPhotoColumnStyle = {
  display: "grid",
  alignContent: "space-between",
  gap: "2.5mm",
};

const governmentPhotoFrame = {
  width: "100%",
  height: "24mm",
  border: "0.45mm solid #9ca3af",
  borderRadius: "2mm",
  overflow: "hidden",
  background: "#ffffff",
  display: "grid",
  placeItems: "center",
};

const photoPlaceholderStyle = {
  width: "100%",
  height: "100%",
  background: "linear-gradient(180deg, #f7faf8 0%, #eef5ef 100%)",
  color: "#6b7280",
  display: "grid",
  placeItems: "center",
};

const frontSignatureWrapStyle = {
  display: "grid",
  gap: "0.7mm",
};

const signatureLineStyle = {
  height: "0.35mm",
  background: "#374151",
  width: "100%",
};

const signatureLabelStyle = {
  fontSize: "2.2mm",
  textTransform: "uppercase",
  color: "#4b5563",
  letterSpacing: "0.08em",
};

const frontDetailsColumnStyle = {
  display: "grid",
  alignContent: "start",
  gap: "0.8mm",
};

const frontResidentNameStyle = {
  fontSize: "3.05mm",
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1,
};

const frontPrimaryFieldStackStyle = {
  display: "grid",
  gap: "0.6mm",
};

const frontSecondaryFieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1.2mm 2.2mm",
};

const frontFooterNoticeStyle = {
  marginTop: "0.1mm",
  paddingTop: "0.7mm",
  borderTop: "0.3mm solid rgba(100, 116, 139, 0.18)",
  fontSize: "1.65mm",
  lineHeight: 1.15,
  color: "#475569",
};

const backAccentSideStyle = {
  position: "absolute",
  right: "-8mm",
  top: "-4mm",
  width: "26mm",
  height: "62mm",
  background: "radial-gradient(circle at 30% 20%, rgba(110, 193, 133, 0.18), rgba(110, 193, 133, 0) 68%)",
  pointerEvents: "none",
};

const backHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2.4mm 3.2mm 1.8mm",
  borderBottom: "0.35mm solid rgba(108, 147, 118, 0.28)",
};

const backTitleStyle = {
  fontSize: "3mm",
  fontWeight: 800,
  color: "#14532d",
};

const backSubtitleStyle = {
  fontSize: "1.9mm",
  color: "#64748b",
};

const backContentStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 28mm",
  gap: "2.4mm",
  padding: "2.8mm 3.2mm 3.2mm",
  alignItems: "center",
};

const backNoticeBlockStyle = {
  display: "grid",
  gap: "0.8mm",
  alignContent: "start",
};

const backSectionLabelStyle = {
  fontSize: "2.1mm",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#166534",
};

const backNoticeTextStyle = {
  fontSize: "2mm",
  lineHeight: 1.2,
  color: "#334155",
};

const backReturnStyle = {
  marginTop: "0.2mm",
  fontSize: "2.2mm",
  fontWeight: 800,
  color: "#1f2937",
};

const backMetaStyle = {
  fontSize: "1.85mm",
  color: "#475569",
  lineHeight: 1.2,
};

const backQrColumnStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "1.2mm",
};

const qrQualityFrameStyle = {
  width: "26.5mm",
  height: "26.5mm",
  border: "0.3mm solid #cbd5e1",
  background: "#ffffff",
  padding: "0.5mm",
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  overflow: "hidden",
};

const backQrCaptionStyle = {
  fontSize: "1.5mm",
  color: "#64748b",
  textAlign: "center",
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
