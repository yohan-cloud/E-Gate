import { useEffect, useRef, useState } from "react";
import { api, getAuthHeaders } from "../../api";

// Use FaceDetector API if available; otherwise fallback to timed capture
const hasFaceDetector = typeof window !== 'undefined' && 'FaceDetector' in window;
const TARGET_SAMPLES = 3;

export default function FaceEnroll({ onEnrolled, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const captureActiveRef = useRef(false);
  const lastCaptureRef = useRef(0);
  const uploadedRef = useRef(false);
  const [message, setMessage] = useState("Initializing camera...");
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState([]); // Blob[]
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("booting"); // booting | ready | capturing | uploading | success | error
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setRunning(true);
        setPhase("ready");
        setMessage(hasFaceDetector ? "Camera ready. Click start and keep one face in frame." : "Camera ready. Click start and hold steady.");
      } catch {
        setPhase("error");
        setMessage('Unable to access camera.');
      }
    })();
    return () => {
      setRunning(false);
      captureActiveRef.current = false;
      setIsCapturing(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const intervalMs = 700;
    const det = hasFaceDetector ? new window.FaceDetector({ fastMode: true }) : null;

    const tick = async () => {
      if (!running || !captureActiveRef.current || !videoRef.current || !canvasRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 480;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, c.width, c.height);

      let hasFace = false;
      if (det) {
        try {
          const faces = await det.detect(c);
          hasFace = faces && faces.length === 1;
          if (!hasFace) {
            setMessage(faces?.length > 1 ? "Please keep only one face in frame." : "No face detected. Move into the frame.");
          }
          if (hasFace) {
            const now = performance.now();
            if (now - lastCaptureRef.current > intervalMs) {
              lastCaptureRef.current = now;
              await new Promise((resolve) => c.toBlob((b) => {
                if (b) {
                  setSamples((s) => {
                    if (s.length >= TARGET_SAMPLES) return s;
                    const next = [...s, b];
                    setProgress(Math.round((next.length / TARGET_SAMPLES) * 100));
                    setMessage(`Captured sample ${next.length} of ${TARGET_SAMPLES}.`);
                    return next;
                  });
                }
                resolve();
              }, 'image/jpeg'));
            }
          }
        } catch {
          // ignore detection errors
        }
      } else {
        const now = performance.now();
        if (now - lastCaptureRef.current > intervalMs) {
          lastCaptureRef.current = now;
          await new Promise((resolve) => c.toBlob((b) => {
            if (b) {
              setSamples((s) => {
                if (s.length >= TARGET_SAMPLES) return s;
                const next = [...s, b];
                setProgress(Math.round((next.length / TARGET_SAMPLES) * 100));
                setMessage(`Captured sample ${next.length} of ${TARGET_SAMPLES}.`);
                return next;
              });
            }
            resolve();
          }, 'image/jpeg'));
        }
      }

      if (captureActiveRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (running && isCapturing && captureActiveRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isCapturing, running]);

  useEffect(() => {
    (async () => {
      if (samples.length < TARGET_SAMPLES || uploadedRef.current) return;
      uploadedRef.current = true;
      captureActiveRef.current = false;
      setIsCapturing(false);
      setPhase("uploading");
      try {
        setMessage('Enrolling face...');
        const form = new FormData();
        samples.forEach((b, i) => form.append('images', b, `sample_${i}.jpg`));
        const res = await api.post('/residents/face/enroll/', form, { headers: { ...getAuthHeaders() } });
        setPhase("success");
        setMessage(res?.data?.message || 'Face enrolled.');
        onEnrolled?.();
      } catch (error) {
        uploadedRef.current = false;
        setPhase("error");
        setMessage(error?.response?.data?.error || 'Failed to enroll face.');
      }
    })();
  }, [onEnrolled, samples]);

  const startCapture = () => {
    if (!running || phase === "uploading") return;
    uploadedRef.current = false;
    captureActiveRef.current = true;
    lastCaptureRef.current = 0;
    setSamples([]);
    setProgress(0);
    setIsCapturing(true);
    setPhase("capturing");
    setMessage(hasFaceDetector ? "Capturing samples. Keep one face centered." : "Capturing samples. Hold steady.");
  };

  const canStart = running && !isCapturing && phase !== "uploading";
  const canRetry = phase === "error" || phase === "success";

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ marginTop: 0 }}>Face Enrollment</h3>
      <video ref={videoRef} playsInline muted style={{ width: 320, height: 240, background: '#000', borderRadius: 8 }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ marginTop: 8 }}>Progress: {progress}%</div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{message}</div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={startCapture}
          disabled={!canStart}
        >
          {phase === "capturing" ? "Capturing..." : phase === "success" ? "Capture Again" : "Start Capture"}
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={startCapture}
            disabled={!running}
          >
            Retry
          </button>
        )}
        <button type="button" onClick={() => onClose?.()}>
          {phase === "success" ? "Done" : "Close"}
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Tip: hold steady; good lighting helps.</div>
    </div>
  );
}

