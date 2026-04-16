import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import { api } from "../api";
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

function extractGuestToken(decodedText) {
  if (!decodedText) return "";
  try {
    const parsed = JSON.parse(decodedText);
    if (parsed?.type === "guest_appointment" && parsed?.token) {
      return String(parsed.token).trim();
    }
  } catch {
    return "";
  }
  return "";
}

export default function GuestQrScanner({ direction = "auto", onScanResult }) {
  const [message, setMessage] = useState("");
  const [flash, setFlash] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("environment");
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const lastTextRef = useRef("");
  const lastTimeRef = useRef(0);
  const resumeTimerRef = useRef(null);
  const readerIdRef = useRef(`guest-reader-${Math.random().toString(36).slice(2)}`);

  const emitResult = useCallback((payload) => {
    onScanResult && onScanResult({ mode: "guest_qr", timestamp: new Date().toISOString(), ...payload });
  }, [onScanResult]);

  const submitScan = useCallback(async (decodedText) => {
    const token = extractGuestToken(decodedText);
    if (!token) {
      setMessage("Invalid QR");
      toast.error("Invalid guest QR", "guest-scanner");
      setFlash("error");
      playBeep("error");
      emitResult({
        severity: "error",
        code: "invalid_qr",
        title: "Invalid Guest QR",
        message: "The scanned code is not a valid guest appointment QR.",
      });
      return;
    }

    try {
      const res = await api.post("/common/guests/gate/scan/", { token, direction }, { timeout: 12000 });
      const resultCode = res?.data?.result_code;
      const isTimeOut = resultCode === "checked_out";
      setMessage(isTimeOut ? "Guest checked out" : "Guest checked in");
      toast.success(isTimeOut ? "Guest check-out recorded" : "Guest check-in recorded", "guest-scanner");
      setFlash("success");
      playBeep("success");
      emitResult({
        severity: "success",
        code: resultCode || (isTimeOut ? "checked_out" : "checked_in"),
        title: isTimeOut ? "Guest Check Out Recorded" : "Guest Check In Recorded",
        message: res?.data?.message,
        username: res?.data?.guest_name,
        contact: res?.data?.guest_contact,
        purpose: res?.data?.purpose,
        checkedInAt: res?.data?.checked_in_at || res?.data?.logged_at,
        checkedOutAt: res?.data?.checked_out_at,
      });
    } catch (error) {
      const resultCode = error?.response?.data?.result_code || "failed";
      const em = error?.response?.data?.error || "Failed to validate guest appointment QR.";
      setMessage(em);
      toast.error(em, "guest-scanner");
      setFlash("error");
      playBeep("error");
      emitResult({
        severity: "error",
        code: resultCode,
        title: "Guest Scan Failed",
        message: em,
      });
    } finally {
      setTimeout(() => setFlash(""), 300);
    }
  }, [direction, emitResult]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera not supported");
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
        // Ignore stop errors while switching cameras.
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
          setMessage("Ready");
        }, 1200);
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
          toast.error("QR camera failed to start. Try Switch Camera or reload the page.", "guest-scanner");
        }
        return;
      }

      if (!cancelled) {
        setStreaming(true);
        setMessage("Ready");
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      setStreaming(false);
      stopScanner();
    };
  }, [cameraFacing, submitScan]);

  const borderColor = flash === "success" ? "#22c55e" : flash === "error" ? "#ef4444" : "#e5e7eb";
  return (
    <div className="card scanner-card" style={{ textAlign: "center", padding: 20, border: `3px solid ${borderColor}` }}>
      <ToastContainer scope="guest-scanner" position="bottom-center" />
      <h2 style={{ marginTop: 0 }}>Guest Appointment QR Scanner</h2>
      <div className="scanner-camera-shell">
        <div id={readerIdRef.current} style={{ width: 420, height: 420, margin: "12px auto" }} />
        <div className="scanner-frame-overlay" aria-hidden="true" />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setCameraFacing((current) => (current === "environment" ? "user" : "environment"))} disabled={!streaming}>
          Switch Camera
        </button>
      </div>
      <p style={{ marginTop: 8 }}><b>Status:</b> {message || "Ready for guest appointment scanning"}</p>
      <p style={{ fontSize: 12, opacity: 0.8 }}><b>Camera:</b> {cameraFacing === "environment" ? "Rear camera" : "Front camera"}</p>
      <p style={{ fontSize: 12, opacity: 0.7 }}>Scan the guest appointment QR. The portal will record check-in or check-out based on the latest appointment state.</p>
    </div>
  );
}
