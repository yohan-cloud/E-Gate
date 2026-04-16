import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import { api, getAuthHeaders } from "../api";
import toast from "../lib/toast";
import ToastContainer from "./common/ToastContainer";

function pickPreferredCamera(cameras, facing) {
  if (!Array.isArray(cameras) || cameras.length === 0) return null;
  const rearPattern = /(back|rear|environment|wide|ultra)/i;
  const frontPattern = /(front|user|selfie|face)/i;
  const preferredPattern = facing === "user" ? frontPattern : rearPattern;
  const fallbackPattern = facing === "user" ? rearPattern : frontPattern;

  return (
    cameras.find((camera) => preferredPattern.test(camera.label || "")) ||
    cameras.find((camera) => fallbackPattern.test(camera.label || "")) ||
    cameras[0]
  );
}

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

function parseResidentBarangayId(decodedText) {
  const text = String(decodedText || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === "resident" && parsed?.barangay_id) {
      return String(parsed.barangay_id).trim();
    }
  } catch {
    // Keep supporting the older plain-text QR format below.
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return text;
  }
  return text.split("Barangay ID: ")[1]?.split("\n")[0]?.trim() || "";
}

export default function QrScanner({
  eventId,
  onScanResult,
  basePath = "/events",
  direction = "time_in",
  requireEvent = true,
  submitPath,
  buildPayload,
  title = "Barangay 663-A QR Scanner",
  readyMessage,
  tip = "Tip: Allow camera permission and ensure lighting is adequate.",
  scope = "scanner",
}) {
  const resumeDelayMs = 1800;
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("environment");
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const lastTextRef = useRef("");
  const lastTimeRef = useRef(0);
  const readerIdRef = useRef(`reader-${Math.random().toString(36).slice(2)}`);

  const emitResult = useCallback((payload) => {
    onScanResult && onScanResult({ mode: "qr", timestamp: new Date().toISOString(), ...payload });
  }, [onScanResult]);

  const submitScan = useCallback(async (decodedText) => {
    const barangayId = parseResidentBarangayId(decodedText);
    if (!barangayId) {
      setMessage("Invalid QR");
      toast.error("Invalid QR format", scope);
      setFlash("error");
      playBeep("error");
      emitResult({
        severity: "error",
        code: "invalid_qr",
        title: "Invalid QR",
        message: "The QR code format is not recognized.",
      });
      setTimeout(() => setFlash(""), 300);
      return;
    }

    const payload = buildPayload
      ? buildPayload({ barangayId, eventId, direction, decodedText })
      : { barangay_id: barangayId, event_id: eventId, direction };

    try {
      const res = await api.post(
        submitPath || `${basePath}/attendance/mark/`,
        payload,
        {
          headers: getAuthHeaders(),
          timeout: 12000,
        },
      );
      const resultCode = res?.data?.result_code;
      if (resultCode === "duplicate") {
        const duplicateMessage = res?.data?.message || "Attendance was already marked for this resident.";
        setMessage(duplicateMessage);
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
        setTimeout(() => setFlash(""), 300);
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
              : "Scan Successful",
        message: res?.data?.message || successMessage,
        username: res?.data?.resident_username || res?.data?.username,
        barangayId: res?.data?.barangay_id,
        checkedInAt: res?.data?.checked_in_at || res?.data?.created_at || res?.data?.logged_at,
        eventTitle: res?.data?.event_title,
        residentAddress: res?.data?.resident_address,
        residentZone: res?.data?.resident_zone,
        residentVerified: res?.data?.resident_verified,
        residentBirthdate: res?.data?.resident_birthdate,
        residentExpiryDate: res?.data?.resident_expiry_date,
      });
    } catch (err) {
      const resultCode = err?.response?.data?.result_code;
      const errorMessage = err?.response?.data?.error || "Failed to process QR scan";
      setMessage(errorMessage);
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
              : "Scan Failed",
        message: errorMessage,
      });
    }
    setTimeout(() => setFlash(""), 300);
  }, [basePath, buildPayload, direction, emitResult, eventId, scope, submitPath]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera not supported");
      return undefined;
    }
    if (requireEvent && !eventId) {
      setMessage("Select an event");
      return undefined;
    }

    let cancelled = false;

    const stopScanner = async () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // Ignore stop errors during hot reload or fast camera switching.
      }
      try {
        await scanner.clear();
      } catch {
        // Ignore clear errors after a stop failure.
      }
    };

    const startScanner = async () => {
      await stopScanner();
      const scanner = new Html5Qrcode(readerIdRef.current, { verbose: false });
      scannerRef.current = scanner;
      setStreaming(false);
      setMessage("Starting camera...");

      const onScanSuccess = async (decodedText) => {
        const now = Date.now();
        if (scanLockRef.current) return;
        if (decodedText === lastTextRef.current && now - lastTimeRef.current < 1500) return;
        lastTextRef.current = decodedText;
        lastTimeRef.current = now;
        scanLockRef.current = true;
        setMessage("Processing scan...");
        await submitScan(decodedText);
        resumeTimerRef.current = window.setTimeout(() => {
          scanLockRef.current = false;
          setMessage(readyMessage || "Ready");
        }, resumeDelayMs);
      };

      const config = {
        fps: 15,
        qrbox: { width: 340, height: 340 },
        aspectRatio: 1,
        disableFlip: false,
      };

      let startError = null;
      try {
        const cameras = await Html5Qrcode.getCameras();
        const preferred = pickPreferredCamera(cameras, cameraFacing);
        const orderedIds = [
          preferred?.id,
          ...cameras.map((camera) => camera.id).filter((id) => id && id !== preferred?.id),
        ].filter(Boolean);

        for (const cameraId of orderedIds) {
          try {
            await scanner.start(
              cameraId,
              config,
              onScanSuccess,
              () => {},
            );
            startError = null;
            break;
          } catch (error) {
            startError = error;
          }
        }
      } catch (error) {
        startError = error;
      }

      if (startError) {
        try {
          await scanner.start(
            {
              facingMode: { ideal: cameraFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            config,
            onScanSuccess,
            () => {},
          );
          startError = null;
        } catch (error) {
          startError = error;
        }
      }

      if (startError) {
        if (!cancelled) {
          setMessage("QR camera failed to start");
          toast.error("QR camera failed to start. Try Switch Camera or reload the page.", scope);
        }
        return;
      }

      if (!cancelled) {
        setStreaming(true);
        setMessage(readyMessage || "Ready");
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      setStreaming(false);
      stopScanner();
    };
  }, [cameraFacing, eventId, readyMessage, requireEvent, scope, submitScan]);

  const borderColor = flash === "success" ? "#22c55e" : flash === "error" ? "#ef4444" : "#e5e7eb";
  return (
    <div className="card scanner-card" style={{ textAlign: "center", padding: 20, border: `3px solid ${borderColor}` }}>
      <ToastContainer scope={scope} position="bottom-center" />
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="scanner-camera-shell">
        <div id={readerIdRef.current} style={{ width: 420, height: 420, margin: "12px auto" }} />
        <div className="scanner-frame-overlay" aria-hidden="true" />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setCameraFacing((current) => (current === "environment" ? "user" : "environment"))} disabled={!streaming}>
          Switch Camera
        </button>
      </div>
      <p style={{ marginTop: 8 }}><b>Status:</b> {message || readyMessage || "Ready"}</p>
      <p style={{ fontSize: 12, opacity: 0.8 }}><b>Camera:</b> {cameraFacing === "environment" ? "Rear camera" : "Front camera"}</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>{tip}</p>
    </div>
  );
}
