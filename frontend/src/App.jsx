import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { AUTH_STATE_CHANGED_EVENT, clearStoredAuth } from "./api";
import ToastContainer from "./components/common/ToastContainer";
import AdminPortal from "./components/portals/AdminPortal";
import GatePortal from "./components/portals/GatePortal";
import ResidentPortal from "./components/portals/ResidentPortal";
import UnifiedLogin from "./components/UnifiedLogin";

function readStoredAuth() {
  return {
    token: localStorage.getItem("access_token") || "",
    role: localStorage.getItem("role") || "",
  };
}

function dashboardForRole(role) {
  if (role === "Resident") return "/resident/dashboard";
  if (role === "GateOperator") return "/gate/dashboard";
  return "/admin/dashboard";
}

function ProtectedRoute({ isLoggedIn, role, allowedRoles, children }) {
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={dashboardForRole(role)} replace />;
  }

  return children;
}

export default function App() {
  const navigate = useNavigate();
  const [{ token, role }, setAuthState] = useState(readStoredAuth);
  const isLoggedIn = !!token;

  const syncAuthState = () => {
    setAuthState(readStoredAuth());
  };

  useEffect(() => {
    const handleAuthChanged = () => {
      setAuthState(readStoredAuth());
    };

    window.addEventListener("storage", handleAuthChanged);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
    return () => {
      window.removeEventListener("storage", handleAuthChanged);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
    };
  }, []);

  const handleLogout = () => {
    clearStoredAuth();
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("username");
    } finally {
      setAuthState({ token: "", role: "" });
      navigate("/login", { replace: true });
    }
  };

  const defaultDashboard = useMemo(() => dashboardForRole(role), [role]);

  return (
    <div className="app-wrapper">
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Navigate to={isLoggedIn ? defaultDashboard : "/login"} replace />} />
        <Route
          path="/login"
          element={isLoggedIn ? <Navigate to={defaultDashboard} replace /> : <UnifiedLogin onLogin={syncAuthState} />}
        />

        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/resident/login" element={<Navigate to="/login" replace />} />
        <Route path="/gate/login" element={<Navigate to="/login" replace />} />

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/resident" element={<Navigate to="/resident/dashboard" replace />} />
        <Route path="/gate" element={<Navigate to="/gate/dashboard" replace />} />

        <Route
          path="/admin/dashboard"
          element={(
            <ProtectedRoute isLoggedIn={isLoggedIn} role={role} allowedRoles={["Administrator"]}>
              <AdminPortal onLogout={handleLogout} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/resident/dashboard"
          element={(
            <ProtectedRoute isLoggedIn={isLoggedIn} role={role} allowedRoles={["Resident"]}>
              <ResidentPortal onLogout={handleLogout} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/gate/dashboard"
          element={(
            <ProtectedRoute isLoggedIn={isLoggedIn} role={role} allowedRoles={["Administrator", "GateOperator"]}>
              <GatePortal onExit={handleLogout} />
            </ProtectedRoute>
          )}
        />

        <Route path="*" element={<Navigate to={isLoggedIn ? defaultDashboard : "/login"} replace />} />
      </Routes>
    </div>
  );
}
