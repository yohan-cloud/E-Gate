import { useEffect, useState } from "react";
import { api } from "../../api";

const STORAGE_KEY = "admin_ui_settings";

const defaults = {
  autoRefreshAnalytics: true,
  compactTables: false,
  scannerSound: true,
  highlightPendingVerifications: true,
  rememberFilters: true,
};

function readCurrentNightMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const settings = raw ? JSON.parse(raw) : null;
    return Boolean(settings?.nightMode);
  } catch {
    return document.documentElement.dataset.theme === "dark";
  }
}

function withCurrentNightMode(value) {
  return {
    ...value,
    nightMode: readCurrentNightMode(),
  };
}

function saveLocalSettings(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new Event("admin-ui-settings-changed"));
    return true;
  } catch {
    return false;
  }
}

export default function Settings() {
  const [settings, setSettings] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("server");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await api.get("/common/settings/admin-ui/");
        if (!active) return;
        const next = withCurrentNightMode({ ...defaults, ...(resp?.data?.value || {}) });
        setSettings(next);
        saveLocalSettings(next);
        setSource("server");
      } catch {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw && active) {
            const next = { ...defaults, ...JSON.parse(raw) };
            setSettings(next);
          }
          if (active) {
            setSource("local");
            setError("Settings API unavailable. Using browser-local preferences.");
          }
        } catch {
          if (active) {
            setSource("local");
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const update = async (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveLocalSettings(next);
    try {
      await api.put("/common/settings/admin-ui/", { key: "admin_ui", value: next });
      setSource("server");
      setError("");
      flashSaved();
    } catch {
      setSource("local");
      setError("Could not save to the server. Kept locally in this browser.");
      flashSaved();
    }
  };

  const reset = async () => {
    const next = withCurrentNightMode(defaults);
    setSettings(next);
    saveLocalSettings(next);
    try {
      await api.put("/common/settings/admin-ui/", { key: "admin_ui", value: next });
      setSource("server");
      setError("");
    } catch {
      setSource("local");
      setError("Reset saved locally only.");
    }
    flashSaved();
  };

  const toggle = (key) => {
    update(key, !settings[key]);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Application Settings</h2>
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 2 }}>
            Admin preferences stored per account when the API is available.
          </div>
        </div>
        <button onClick={reset} style={{ padding: "8px 12px" }}>Reset to defaults</button>
      </div>

      <div style={{ marginTop: 8, color: source === "server" ? "var(--primary-600)" : "#b45309", fontSize: 14 }}>
        Storage: {source === "server" ? "Server-backed" : "Browser-local fallback"}
      </div>
      {error && <div style={{ marginTop: 4, color: "#ef4444", fontSize: 14 }}>{error}</div>}

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <SettingRow
          label="Auto-refresh analytics"
          description="Refresh dashboard numbers every few minutes."
          value={settings.autoRefreshAnalytics}
          onChange={() => toggle("autoRefreshAnalytics")}
        />
        <SettingRow
          label="Compact tables"
          description="Reduce row padding to fit more data on screen."
          value={settings.compactTables}
          onChange={() => toggle("compactTables")}
        />
        <SettingRow
          label="Scanner sound"
          description="Play a chime on successful QR/face scans."
          value={settings.scannerSound}
          onChange={() => toggle("scannerSound")}
        />
        <SettingRow
          label="Highlight pending verifications"
          description="Emphasize requests waiting for review."
          value={settings.highlightPendingVerifications}
          onChange={() => toggle("highlightPendingVerifications")}
        />
        <SettingRow
          label="Remember filters"
          description="Persist search/filter choices for events and residents."
          value={settings.rememberFilters}
          onChange={() => toggle("rememberFilters")}
        />
      </div>

      {saved && (
        <div style={{ marginTop: 8, color: "var(--primary-600)", fontSize: 14 }}>Saved</div>
      )}
    </div>
  );
}

function SettingRow({ label, description, value, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border)", padding: "0 0 8px" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            minWidth: 28,
            textAlign: "right",
            fontSize: 12,
            fontWeight: 700,
            color: value ? "var(--primary-600)" : "var(--muted)",
            letterSpacing: 0.4,
          }}
        >
          {value ? "ON" : "OFF"}
        </span>
        <label className="switch">
          <input type="checkbox" checked={value} onChange={onChange} />
          <span className="slider round"></span>
        </label>
      </div>
    </div>
  );
}
