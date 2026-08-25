import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getToken } from "./api";
import LandingPage from "./pages/LandingPage";
import RegisterPage from "./pages/RegisterPage";
import LoginPage from "./pages/LoginPage";
import ForgotPage from "./pages/ForgotPage";
import ResetPage from "./pages/ResetPage";
import DashboardPage from "./pages/DashboardPage";
import EnrollPage from "./pages/EnrollPage";
import AccountPage from "./pages/AccountPage";
import CheckoutReturnPage from "./pages/CheckoutReturnPage";
import TermsPage from "./pages/TermsPage";

function Private({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

function RouteFade({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [location.pathname]);

  return (
    <div className="route-fade" key={tick}>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <RouteFade>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route
          path="/dashboard"
          element={
            <Private>
              <DashboardPage />
            </Private>
          }
        />
        <Route
          path="/account"
          element={
            <Private>
              <AccountPage />
            </Private>
          }
        />
        <Route
          path="/enroll"
          element={
            <Private>
              <EnrollPage />
            </Private>
          }
        />
        <Route
          path="/checkout/return"
          element={
            <Private>
              <CheckoutReturnPage />
            </Private>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteFade>
  );
}
