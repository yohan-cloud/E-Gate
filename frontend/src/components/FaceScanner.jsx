import { useCallback, useEffect, useRef, useState } from "react";

import { api, getAuthHeaders } from "../api";
import toast from "../lib/toast";
import ToastContainer from "./common/ToastContainer";

function playBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = type === "success" ? 880 : 220;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    o.start();
    const d = 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    o.stop(ctx.currentTime + d + 0.01);
  } catch {
    return;
  }
}

export default function FaceScanner({
  eventId,
  onScanResult,
  basePath = "/events",
  direction = "time_in",
  requireEvent = true,
  detectPath,
  submitPath,
  buildFormData,
  title = "Face Scanner",
  readyMessage,
  actionLabel,
  tip = "Tip: ensure good lighting and face fully visible.",
  scope = "scanner",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanInFlightRef = useRef(false);
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [tolerance, setTolerance] = useState(0.5);
  const [flash, setFlash] = useState("");
  const [armed, setArmed] = useState(true);
  const [fallbackUsername, setFallbackUsername] = useState("");
  const [faceState, setFaceState] = useState("idle");
  const [cameraFacing, setCameraFacing] = useState("environment");

  const emitResult = useCallback((payload) => {
    onScanResult && onScanResult({ mode: "face", timestamp: new Date().toISOString(), ...payload });
  }, [onScanResult]);

  useEffect(() => {
    let stream;
    let cancelled = false;

    const stopStream = () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      setStreaming(false);
    };

    async function startWithConstraints(videoConstraint) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });
      if (!videoRef.current || cancelled) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStreaming(true);
      setMessage("Ready");
      setFaceState("ready");
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("Camera not supported");
        setFaceState("idle");
        return;
      }
      try {
        stopStream();
        await startWithConstraints({
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        });
      } catch {
        try {
          stopStream();
          await startWithConstraints(true);
        } catch {
          setMessage("Camera blocked");
          setFaceState("idle");
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraFacing]);

  const buildFrameBlob = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    if (!c.width || !c.height) return null;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return new Promise((resolve) => {
      c.toBlob((blob) => resolve(blob || null), "image/jpeg");
    });
  }, []);

  const detectSingleFace = useCallback(async (blob) => {
    const form = new FormData();
    form.append("image", blob, "frame.jpg");
    const res = await api.post(detectPath || `${basePath}/attendance/detect-face/`, form, {
      headers: { ...getAuthHeaders() },
    });
    return {
      facesDetected: res?.data?.faces_detected ?? 0,
      hasSingleFace: !!res?.data?.has_single_face,
    };
  }, [basePath, detectPath]);

  const captureAndSend = useCallback(async () => {
    if (requireEvent && !eventId) {
      setMessage("Select event");
      return;
    }
    if (!armed || scanInFlightRef.current) return;
    scanInFlightRef.current = true;

    try {
      const blob = await buildFrameBlob();
      if (!blob) {
        setMessage("Camera not ready");
        setFaceState("idle");
        return;
      }

      const detection = await detectSingleFace(blob);
      if (!detection.hasSingleFace) {
        if (detection.facesDetected > 1) {
          setMessage("Multiple faces detected");
          setFaceState("multiple_faces");
        } else {
          setMessage("No face detected");
          setFaceState("no_face");
        }
        return;
      }

      setFaceState("scanning");
      setMessage("Scanning face...");

      const form = buildFormData
        ? buildFormData({ blob, eventId, direction, tolerance, fallbackUsername })
        : (() => {
            const defaultForm = new FormData();
            defaultForm.append("event_id", String(eventId));
            defaultForm.append("image", blob, "frame.jpg");
            defaultForm.append("tolerance", String(tolerance));
            defaultForm.append("direction", direction);
            if (fallbackUsername.trim()) defaultForm.append("username", fallbackUsername.trim());
            return defaultForm;
          })();

      const res = await api.post(submitPath || `${basePath}/attendance/mark-face/`, form, {
        headers: { ...getAuthHeaders() },
      });
      const resultCode = res?.data?.result_code;
      if (resultCode === "duplicate") {
        const duplicateMessage = res?.data?.message || "Attendance was already marked for this resident.";
        setMessage(duplicateMessage);
        setFaceState("ready");
        toast.error(duplicateMessage, scope);
        setFlash("error");
        playBeep("error");
        emitResult({
          severity: "warning",
          code: "duplicate",
          title: "Already Marked",
          message: duplicateMessage,
          username: res?.data?.resident_username || res?.data?.username,
          barangayId: res?.data?.barangay_id,
          eventTitle: res?.data?.event_title,
          checkedInAt: res?.data?.checked_in_at || res?.data?.created_at || res?.data?.logged_at,
          residentAddress: res?.data?.resident_address,
          residentZone: res?.data?.resident_zone,
          residentVerified: res?.data?.resident_verified,
          residentBirthdate: res?.data?.resident_birthdate,
          residentExpiryDate: res?.data?.resident_expiry_date,
        });
        return;
      }
      const successMessage = resultCode === "time_out"
        ? "Time out recorded"
        : resultCode === "time_in"
          ? "Time in recorded"
          : "Attendance marked";

      setMessage(res?.data?.message || successMessage);
      toast.success(res?.data?.message || successMessage, scope);
      setFlash("success");
      playBeep("success");
      emitResult({
        severity: "success",
        code: resultCode || "success",
        title:
          resultCode === "time_out"
            ? "Time Out Recorded"
            : resultCode === "time_in"
              ? "Time In Recorded"
              : "Face Match Successful",
        message: res?.data?.message || successMessage,
        username: res?.data?.resident_username || res?.data?.username,
        barangayId: res?.data?.barangay_id,
        checkedInAt: res?.data?.checked_in_at || res?.data?.created_at || res?.data?.logged_at,
        distance: res?.data?.match_distance,
        eventTitle: res?.data?.event_title,
        residentAddress: res?.data?.resident_address,
        residentZone: res?.data?.resident_zone,
        residentVerified: res?.data?.resident_verified,
        residentBirthdate: res?.data?.resident_birthdate,
        residentExpiryDate: res?.data?.resident_expiry_date,
      });
      setArmed(false);
      setTimeout(() => {
        setArmed(true);
        setFaceState("ready");
        setMessage("Ready");
      }, 3000);
    } catch (error) {
      const err = error?.response?.data;
      const resultCode = err?.result_code;
      const errorMessage = err?.error || "Failed to process face scan";
      setMessage("Failed");
      setFaceState("ready");
      toast.error(errorMessage, scope);
      setFlash("error");
      playBeep("error");
      emitResult({
        severity: "error",
        code: resultCode || "failed",
        title:
          resultCode === "not_verified"
            ? "Not Verified"
            : resultCode === "expired_id"
              ? "Expired ID"
              : "Face Scan Failed",
        message: errorMessage,
      });
    } finally {
      scanInFlightRef.current = false;
      setTimeout(() => setFlash(""), 300);
    }
  }, [
    armed,
    basePath,
    buildFormData,
    buildFrameBlob,
    detectSingleFace,
    direction,
    emitResult,
    eventId,
    fallbackUsername,
    requireEvent,
    scope,
    submitPath,
    tolerance,
  ]);

  const borderColor = flash === "success" ? "#22c55e" : flash === "error" ? "#ef4444" : "#e5e7eb";
  return (
    <div className="card scanner-card" style={{ textAlign: "center", padding: 20, border: `3px solid ${borderColor}` }}>
      <ToastContainer scope={scope} position="bottom-center" />
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="scanner-camera-shell face-shell">
        <video ref={videoRef} playsInline muted style={{ width: 420, height: 320, background: "#000", borderRadius: 12, objectFit: "cover" }} />
        <div className="scanner-frame-overlay" aria-hidden="true" />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={captureAndSend} disabled={!streaming || !armed}>
            {armed ? (actionLabel || "Capture & Scan") : "Hold - awaiting next resident"}
          </button>
          <button
            type="button"
            onClick={() => setCameraFacing((current) => (current === "environment" ? "user" : "environment"))}
            disabled={!streaming}
          >
            Switch Camera
          </button>
        </div>
        <AutoLoop onTick={captureAndSend} enabled={streaming && (!requireEvent || !!eventId) && armed} />
        {!armed && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { setArmed(true); setFlash(""); setMessage("Ready"); }} style={{ padding: "6px 12px" }}>
              Scan Another
            </button>
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 12, alignItems: "center" }}>
          <label>Tolerance:</label>
          <input type="range" min="0.4" max="0.6" step="0.01" value={tolerance} onChange={(e) => setTolerance(parseFloat(e.target.value))} />
          <span style={{ width: 40, textAlign: "left" }}>{tolerance.toFixed(2)}</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="fallback-username" style={{ fontSize: 12, opacity: 0.8 }}>Fallback username:</label>
          <input id="fallback-username" type="text" value={fallbackUsername} onChange={(e) => setFallbackUsername(e.target.value)} placeholder="username" style={{ maxWidth: 180 }} />
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <p style={{ marginTop: 8 }}><b>Status:</b> {message || readyMessage || "Ready"}</p>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        <b>Face Check:</b> {faceState === "multiple_faces" ? "Multiple faces detected" : faceState === "no_face" ? "No face detected" : faceState === "scanning" ? "Scanning..." : "Ready"}
      </p>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        <b>Camera:</b> {cameraFacing === "environment" ? "Rear camera" : "Front camera"}
      </p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>{tip}</p>
    </div>
  );
}

function AutoLoop({ onTick, enabled }) {
  const rafRef = useRef(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const loop = (t) => {
      if (!enabled) return;
      if (t - lastRef.current > 3000) {
        lastRef.current = t;
        onTick?.();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [enabled, onTick]);

  return null;
}
