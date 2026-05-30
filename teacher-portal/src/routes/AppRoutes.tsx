import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import MobileLayout from "../layout/MobileLayout";
import LoginPage from "../pages/LoginPage";
import TodayPage from "../pages/TodayPage";
import StudentHubPage from "../pages/StudentHubPage";
import AccountPage from "../pages/AccountPage";
import { useAppSelector } from "../app/hooks";

function RequireAuth({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  if (user) return <Navigate to="/" replace />;
  return children;
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AppRoutes() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route element={<RequireAuth><MobileLayout /></RequireAuth>}>
          <Route index element={<TodayPage />} />
          <Route path="students/:id" element={<StudentHubPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
