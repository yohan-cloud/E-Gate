import { useEffect, useState } from "react";
import { subscribe } from "../../lib/toast";

export default function ToastContainer({ scope = "global", position = "top-right" }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribe((t) => {
      if (t.scope && t.scope !== scope) return;
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 2500);
    });
    return () => unsub();
  }, [scope]);

  const wrapStyle =
    position === "bottom-center"
      ? {
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "center",
          gap: 8,
          maxWidth: "92vw",
        }
      : {
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "flex-end",
          gap: 8,
          maxWidth: "92vw",
        };

  return (
    <div style={wrapStyle}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "12px 16px",
            background: t.type === "error" ? "#ef4444" : t.type === "success" ? "#22c55e" : "#334155",
            color: "#fff",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            minWidth: 260,
            maxWidth: 520,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
