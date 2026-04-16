import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { AUTH_STATE_CHANGED_EVENT, clearStoredAuth } from "./api";
import AdminLogin from "./components/AdminLogin";
import ToastContainer from "./components/common/ToastContainer";
import ResidentLogin from "./components/ResidentLogin";
import AdminPortal from "./components/portals/AdminPortal";
import GatePortal from "./components/portals/GatePortal";
import ResidentPortal from "./components/portals/ResidentPortal";

function readStoredAuth() {
  return {
    token: localStorage.getItem("access_token") || "",
    role: localStorage.getItem("role") || "",
  };
}

function homeForRole(role) {
  if (role === "Resident") return "/resident";
  if (role === "GateOperator") return "/gate";
  return "/admin";
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
    } catch {
      return;
    } finally {
      setAuthState({ token: "", role: "" });
      navigate("/");
    }
  };

  const defaultHome = useMemo(() => homeForRole(role), [role]);

  return (
    <div className="app-wrapper">
      <ToastContainer />
      <Routes>
        <Route path="/" element={isLoggedIn ? <Navigate to={defaultHome} replace /> : <Navigate to="/resident/login" replace />} />
        <Route
          path="/admin/login"
          element={
            isLoggedIn ? (
              <Navigate to={role === "Administrator" ? "/admin" : defaultHome} replace />
            ) : (
              <AdminLogin
                onLogin={syncAuthState}
                redirectTo="/admin"
                title="Admin Login"
                helper="Use the administrator portal for events, analytics, and resident operations."
                backLinkTo="/resident/login"
                backLinkLabel="Resident Login"
              />
            )
          }
        />
        <Route
          path="/resident/login"
          element={
            isLoggedIn ? (
              <Navigate to={role === "Resident" ? "/resident" : defaultHome} replace />
            ) : (
              <ResidentLogin onLogin={syncAuthState} redirectTo="/resident" />
            )
          }
        />
        <Route
          path="/gate/login"
          element={<Navigate to="/gate" replace />}
        />
        <Route
          path="/admin"
          element={
            !isLoggedIn ? (
              <Navigate to="/admin/login" replace />
            ) : role !== "Administrator" ? (
              <Navigate to={defaultHome} replace />
            ) : (
              <AdminPortal onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/resident"
          element={
            !isLoggedIn ? (
              <Navigate to="/resident/login" replace />
            ) : role !== "Resident" ? (
              <Navigate to={defaultHome} replace />
            ) : (
              <ResidentPortal onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/gate"
          element={
            <GatePortal onExit={() => navigate("/")} />
          }
        />
        <Route path="*" element={<Navigate to={isLoggedIn ? defaultHome : "/resident/login"} replace />} />
      </Routes>
    </div>
  );
}
