const listeners = new Set();

function humanizeKey(key) {
  const normalized = String(key || "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Error";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function flattenErrorParts(value) {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenErrorParts(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenErrorParts(item).map((text) => `${humanizeKey(key)}: ${text}`)
    );
  }
  return [];
}

export function formatApiError(error, fallback = "Something went wrong.") {
  const data = error?.response?.data;
  if (!data) return fallback;

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  if (typeof data?.detail === "string" && data.detail.trim()) {
    return data.detail.trim();
  }

  const parts = flattenErrorParts(data);
  return parts.length > 0 ? parts.join(" | ") : fallback;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message, type = "info", scope = "global") {
  let msg = message;
  let t = type;
  let sc = scope;

  if (typeof message === "object" && message !== null) {
    msg = message.message;
    t = message.type || "info";
    sc = message.scope || "global";
  }

  listeners.forEach((fn) =>
    fn({ id: Date.now() + Math.random(), message: msg, type: t, scope: sc })
  );
}

toast.success = (m, scope = "global") => toast(m, "success", scope);
toast.error = (m, scope = "global") => toast(m, "error", scope);

export default toast;
