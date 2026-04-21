import { useState } from "react";
import { api } from "../../api";
import toast from "../../lib/toast";
import FaceCaptureField from "../common/FaceCaptureField";
import SegmentedPillSelect from "../common/SegmentedPillSelect";
import { DateField } from "./PickerField";

const RESIDENT_CATEGORY_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "resident", label: "Resident" },
  { value: "client", label: "Client" },
];

const VOTER_STATUS_OPTIONS = [
  { value: "registered_voter", label: "Registered Voter" },
  { value: "not_yet_voter", label: "Not Yet Voter" },
  { value: "other_area_voter", label: "Voter in Other Barangay / Other Area" },
];

const INITIAL = {
  username: "",
  full_name: "",
  password: "",
  email: "",
  address: "",
  birthdate: "",
  phone_number: "",
  gender: "unspecified",
  resident_category: "resident",
  voter_status: "not_yet_voter",
  photo: null,
  face_image: null,
  face_samples: [],
};

function RequiredLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="required-field-label">
      <span className="required-marker">*</span>
      <span>{children}</span>
      <span className="required-text">Required</span>
    </label>
  );
}

export default function CreateResidentForm({ onCreated }) {
  const [form, setForm] = useState(INITIAL);
  const [busy, setBusy] = useState(false);
  const [captureLabel, setCaptureLabel] = useState("");

  const update = (e) => {
    const { name, value, files } = e.target;
    if (files) {
      setForm((prev) => ({
        ...prev,
        [name]: files[0],
        ...(name === "face_image" ? { face_samples: [] } : {}),
      }));
      if (name === "face_image") {
        setCaptureLabel(files[0] ? `Selected upload: ${files[0].name}` : "");
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleCameraCapture = (file, samples = []) => {
    setForm((prev) => ({
      ...prev,
      face_image: file,
      face_samples: Array.isArray(samples) ? samples : [],
    }));
    setCaptureLabel(`Captured from camera: ${file.name}`);
  };

  const handleCameraClear = () => {
    setForm((prev) => ({ ...prev, face_image: null, face_samples: [] }));
    setCaptureLabel("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      if (form.username) fd.append("username", form.username);
      if (form.full_name) fd.append("full_name", form.full_name);
      fd.append("password", form.password);
      fd.append("email", form.email);
      fd.append("address", form.address);
      fd.append("birthdate", form.birthdate);
      fd.append("phone_number", form.phone_number);
      if (form.gender) fd.append("gender", form.gender);
      if (form.resident_category) fd.append("resident_category", form.resident_category);
      if (form.voter_status) fd.append("voter_status", form.voter_status);
      if (form.photo) fd.append("photo", form.photo);
      if (form.face_samples.length) {
        form.face_samples.forEach((sample, index) => {
          fd.append("face_images", sample, `camera_face_${index + 1}.jpg`);
        });
      } else if (form.face_image) {
        fd.append("face_image", form.face_image);
      }

      const res = await api.post("/accounts/register/resident/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Resident account created");
      setForm(INITIAL);
      setCaptureLabel("");
      onCreated?.(res.data?.user);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to create resident";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="event-create-shell" style={{ marginBottom: 12 }}>
      <div className="event-create-card">
        <div className="event-create-head">
          <h3 style={{ margin: 0 }}>Create Resident Account</h3>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Register a new resident profile and capture face data during onboarding.</p>
        </div>
      <form
        onSubmit={submit}
        className="form-grid"
        style={{ gridTemplateColumns: "1fr", maxWidth: 520, margin: "0 auto" }}
      >
        <div className="form-group">
          <label htmlFor="res-username">Username (optional)</label>
          <input id="res-username" name="username" value={form.username} onChange={update} placeholder="Leave blank to auto-generate" />
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="res-fullname">Full Name</RequiredLabel>
          <input id="res-fullname" name="full_name" value={form.full_name} onChange={update} placeholder="e.g., Juan Dela Cruz" required />
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="res-password">Password</RequiredLabel>
          <input id="res-password" name="password" type="password" value={form.password} onChange={update} required />
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="res-email">Email</RequiredLabel>
          <input id="res-email" name="email" type="email" value={form.email} onChange={update} required />
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="res-phone">Phone Number</RequiredLabel>
          <input id="res-phone" name="phone_number" value={form.phone_number} onChange={update} placeholder="e.g., 09XXXXXXXXX" required />
        </div>
        <div className="form-group">
          <label htmlFor="res-gender">Sex</label>
          <select id="res-gender" name="gender" value={form.gender} onChange={update}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unspecified">Prefer not to say</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="res-category">Resident Type / Status</label>
          <SegmentedPillSelect
            id="res-category"
            name="resident_category"
            value={form.resident_category}
            options={RESIDENT_CATEGORY_OPTIONS}
            onChange={update}
          />
          <small>Classify whether this profile is an employee, resident, or client.</small>
        </div>
        <div className="form-group">
          <label htmlFor="res-voter-status">Voter Status</label>
          <SegmentedPillSelect
            id="res-voter-status"
            name="voter_status"
            value={form.voter_status}
            options={VOTER_STATUS_OPTIONS}
            onChange={update}
          />
          <small>Select whether the resident is not yet a voter, registered here, or registered in another area.</small>
        </div>
        <div className="form-group">
          <RequiredLabel htmlFor="res-address">Address</RequiredLabel>
          <input id="res-address" name="address" value={form.address} onChange={update} placeholder="Complete address" required />
        </div>
        <DateField
          id="res-birthdate"
          name="birthdate"
          label="Birthdate"
          value={form.birthdate}
          onChange={update}
          required
          placeholder="Select birthdate"
          panelInFlow
        />
        <div className="form-group">
          <label htmlFor="res-photo">Profile Photo (optional)</label>
          <input id="res-photo" name="photo" type="file" accept="image/*" onChange={update} />
          <small>This photo appears in the resident portal and ID views.</small>
        </div>
        <FaceCaptureField
          label="Face Enroll"
          onCapture={handleCameraCapture}
          onClear={handleCameraClear}
        />
        <div className="form-group">
          <label htmlFor="res-face">Face Image Upload</label>
          <input id="res-face" name="face_image" type="file" accept="image/*" onChange={update} />
          <small>Upload a face image if you prefer not to use the camera face-enroll flow above.</small>
          {captureLabel ? <small style={{ display: "block", marginTop: 6 }}>{captureLabel}</small> : null}
        </div>
        <div style={{ gridColumn: "1 / -1", textAlign: "right" }}>
          <button type="submit" disabled={busy} className="event-create-submit" style={{ padding: "10px 16px" }}>
            {busy ? "Creating..." : "Create Resident"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
