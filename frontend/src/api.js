import axios from "axios";

// Prefer explicit Vite env; otherwise use the same-origin Vite proxy path.
const API_BASE_URL = import.meta?.env?.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const AUTH_STATE_CHANGED_EVENT = "egate-auth-changed";

export function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_STATE_CHANGED_EVENT));
  }
}

function resolveApiUrl(path) {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_BASE_URL}${path}`;
  return `${API_BASE_URL}/${path}`;
}

// Get token from localStorage
export function getAuthHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Attach Authorization header automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token && !config.headers?.Authorization) {
    config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
  }
  return config;
});

// Attempt token refresh on 401 once
let isRefreshing = false;
let pendingRequests = [];

export function clearStoredAuth() {
  try {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("username");
    notifyAuthChanged();
  } catch {
    return;
  }
}

export async function logoutStoredSession() {
  const refreshToken = localStorage.getItem("refresh_token");
  try {
    if (refreshToken) {
      await api.post("/accounts/logout/", { refresh_token: refreshToken });
    }
  } catch {
    // Local logout should still complete even if the server already rejected the token.
  } finally {
    clearStoredAuth();
  }
}

async function refreshAccessTokenWithFetch() {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) {
    clearStoredAuth();
    return null;
  }

  const response = await fetch(resolveApiUrl("/accounts/token/refresh/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearStoredAuth();
    return null;
  }

  const data = await response.json().catch(() => ({}));
  const newAccess = data?.access;
  const newRefresh = data?.refresh;
  if (newAccess) localStorage.setItem("access_token", newAccess);
  if (newRefresh) localStorage.setItem("refresh_token", newRefresh);
  notifyAuthChanged();
  return newAccess || null;
}

export async function fetchJson(path, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    retryOn401 = true,
    timeoutMs = 15000,
  } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const token = localStorage.getItem("access_token");
  const requestHeaders = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...headers,
  };
  if (token && !requestHeaders.Authorization) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(resolveApiUrl(path), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 && retryOn401) {
      const newAccess = await refreshAccessTokenWithFetch();
      if (newAccess) {
        return fetchJson(path, {
          ...options,
          retryOn401: false,
          headers: {
            ...headers,
            Authorization: `Bearer ${newAccess}`,
          },
        });
      }
      const authError = new Error("Session expired. Please log in again.");
      authError.response = {
        status: 401,
        data: payload,
      };
      throw authError;
    }

    if (!response.ok) {
      const error = new Error(
        payload?.error || payload?.detail || payload?.message || `Request failed with status ${response.status}`
      );
      error.response = {
        status: response.status,
        data: payload,
      };
      throw error;
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function onRefreshed(newToken) {
  pendingRequests.forEach((cb) => cb(newToken));
  pendingRequests = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    const originalUrl = original?.url || "";

    // Never try to refresh while already refreshing the refresh endpoint itself.
    if (originalUrl.includes("/accounts/token/refresh/")) {
      clearStoredAuth();
      return Promise.reject(error);
    }

    if (status === 401 && original && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        clearStoredAuth();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((token) => {
            original.headers = { ...(original.headers || {}), Authorization: `Bearer ${token}` };
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const resp = await api.post("/accounts/token/refresh/", { refresh });
        const newAccess = resp?.data?.access;
        const newRefresh = resp?.data?.refresh; // when rotation is enabled
        if (newAccess) localStorage.setItem("access_token", newAccess);
        if (newRefresh) localStorage.setItem("refresh_token", newRefresh);
        isRefreshing = false;
        onRefreshed(newAccess);
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${newAccess}` };
        return api(original);
      } catch {
        isRefreshing = false;
        pendingRequests = [];
        clearStoredAuth();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
