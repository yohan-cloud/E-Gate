import { useEffect, useRef, useState } from "react";

const hasFaceDetector = typeof window !== "undefined" && "FaceDetector" in window;
const TARGET_SAMPLES = 3;

export default function FaceCaptureField({ onCapture, onClear, label = "Camera Face Enroll" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const captureActiveRef = useRef(false);
  const lastCaptureRef = useRef(0);
  const mountedRef = useRef(true);

  const [isOpen, setIsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState("Use the camera to capture the resident face.");
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    captureActiveRef.current = false;
    if (mountedRef.current) {
      setIsCapturing(false);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (mountedRef.current) {
      setRunning(false);
    }
  };

  const openCamera = async () => {
    setIsOpen(true);
    setSamples([]);
    setProgress(0);
    setPhase("booting");
    setMessage("Initializing camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setRunning(true);
      setPhase("ready");
      setMessage(
        hasFaceDetector
          ? "Camera ready. Click start and keep one face in frame."
          : "Camera ready. Click start and hold steady."
      );
    } catch {
      setPhase("error");
      setMessage("Unable to access camera.");
    }
  };

  const closeCamera = () => {
    stopCamera();
    setIsOpen(false);
    setSamples([]);
    setProgress(0);
    setPhase("idle");
    setMessage("Use the camera to capture the resident face.");
  };

  useEffect(() => {
    if (!isOpen || !running || !isCapturing || !captureActiveRef.current) return undefined;
    const detector = hasFaceDetector ? new window.FaceDetector({ fastMode: true }) : null;
    const intervalMs = 700;

    const tick = async () => {
      if (!captureActiveRef.current || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (detector) {
        try {
          const faces = await detector.detect(canvas);
          const validFace = faces && faces.length === 1;
          if (!validFace) {
            setMessage(
              faces?.length > 1
                ? "Please keep only one face in frame."
                : "No face detected. Move into the frame."
            );
          } else {
            const now = performance.now();
            if (now - lastCaptureRef.current > intervalMs) {
              lastCaptureRef.current = now;
              await new Promise((resolve) =>
                canvas.toBlob((blob) => {
                  if (blob) {
                    setSamples((current) => {
                      if (current.length >= TARGET_SAMPLES) return current;
                      const next = [...current, blob];
                      setProgress(Math.round((next.length / TARGET_SAMPLES) * 100));
                      setMessage(`Captured sample ${next.length} of ${TARGET_SAMPLES}.`);
                      return next;
                    });
                  }
                  resolve();
                }, "image/jpeg")
              );
            }
          }
        } catch {
          // ignore detector errors and continue trying
        }
      } else {
        const now = performance.now();
        if (now - lastCaptureRef.current > intervalMs) {
          lastCaptureRef.current = now;
          await new Promise((resolve) =>
            canvas.toBlob((blob) => {
              if (blob) {
                setSamples((current) => {
                  if (current.length >= TARGET_SAMPLES) return current;
                  const next = [...current, blob];
                  setProgress(Math.round((next.length / TARGET_SAMPLES) * 100));
                  setMessage(`Captured sample ${next.length} of ${TARGET_SAMPLES}.`);
                  return next;
                });
              }
              resolve();
            }, "image/jpeg")
          );
        }
      }

      if (captureActiveRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isCapturing, isOpen, running]);

  useEffect(() => {
    if (samples.length < TARGET_SAMPLES) return;
    captureActiveRef.current = false;
    setIsCapturing(false);
    setPhase("success");
    setMessage("Face samples captured. This will be used as the resident face image for registration.");
    const capturedSamples = [...samples];
    const file = new File([capturedSamples[0]], "captured_face.jpg", { type: "image/jpeg" });
    onCapture?.(file, capturedSamples);
  }, [onCapture, samples]);

  const startCapture = () => {
    if (!running) return;
    setSamples([]);
    setProgress(0);
    setPhase("capturing");
    setMessage(
      hasFaceDetector
        ? "Capturing samples. Keep one face centered."
        : "Capturing samples. Hold steady."
    );
    lastCaptureRef.current = 0;
    captureActiveRef.current = true;
    setIsCapturing(true);
  };

  const clearCaptured = () => {
    captureActiveRef.current = false;
    setIsCapturing(false);
    setSamples([]);
    setProgress(0);
    setPhase(running ? "ready" : "idle");
    setMessage("Use the camera to capture the resident face.");
    onClear?.();
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      {!isOpen ? (
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={openCamera}>
            Open Camera Face Enroll
          </button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 0, textAlign: "center", padding: 16 }}>
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Face Enrollment</h4>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", maxWidth: 320, height: 240, background: "#000", borderRadius: 8 }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div style={{ marginTop: 8 }}>Progress: {progress}%</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{message}</div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={startCapture} disabled={!running || phase === "capturing"}>
              {phase === "capturing" ? "Capturing..." : phase === "success" ? "Capture Again" : "Start Capture"}
            </button>
            {(phase === "success" || phase === "error") && (
              <button type="button" onClick={startCapture} disabled={!running}>
                Retry
              </button>
            )}
            <button type="button" onClick={clearCaptured}>
              Clear
            </button>
            <button type="button" onClick={closeCamera}>
              Close
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Tip: hold steady; good lighting helps.</div>
        </div>
      )}
    </div>
  );
}
