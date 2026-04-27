import { useEffect, useState } from "react";

const UI_SETTINGS_KEY = "admin_ui_settings";

function readUiSettings() {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function readNightModeSetting() {
  return Boolean(readUiSettings().nightMode);
}

export default function NightModeIconButton() {
  const [nightMode, setNightMode] = useState(() => readNightModeSetting());

  useEffect(() => {
    const syncNightMode = () => setNightMode(readNightModeSetting());
    window.addEventListener("storage", syncNightMode);
    window.addEventListener("admin-ui-settings-changed", syncNightMode);
    return () => {
      window.removeEventListener("storage", syncNightMode);
      window.removeEventListener("admin-ui-settings-changed", syncNightMode);
    };
  }, []);

  const toggleNightMode = () => {
    const nextNightMode = !nightMode;
    const nextSettings = { ...readUiSettings(), nightMode: nextNightMode };
    setNightMode(nextNightMode);
    try {
      localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(nextSettings));
    } catch {
      // The current page can still switch theme even if local storage is full or blocked.
    }
    document.documentElement.dataset.theme = nextNightMode ? "dark" : "light";
    window.dispatchEvent(new Event("admin-ui-settings-changed"));
  };

  return (
    <button
      type="button"
      className="night-mode-icon-button"
      onClick={toggleNightMode}
      aria-label={nightMode ? "Switch to day mode" : "Switch to night mode"}
      title={nightMode ? "Day mode" : "Night mode"}
    >
      {nightMode ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 15.4A8.4 8.4 0 0 1 8.6 3.8 8.6 8.6 0 1 0 20.2 15.4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
