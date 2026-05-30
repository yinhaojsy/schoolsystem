import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import MobileLayout from "../layout/MobileLayout";
import LoginPage from "../pages/LoginPage";
import HomePage from "../pages/HomePage";
import FeesPage from "../pages/FeesPage";
import InboxPage from "../pages/InboxPage";
import AccountPage from "../pages/AccountPage";
import ChildDiaryPage from "../pages/ChildDiaryPage";
import ChildNoticesPage from "../pages/ChildNoticesPage";
import ChildGalleryPage from "../pages/ChildGalleryPage";
import InvoiceDetailPage from "../pages/InvoiceDetailPage";
import { useAppSelector } from "../app/hooks";

function RequireAuth({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function GuestOnly({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AppRoutes() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          element={
            <RequireAuth>
              <MobileLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="fees" element={<FeesPage />} />
          <Route path="fees/:id" element={<InvoiceDetailPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="children/:id/diary" element={<ChildDiaryPage />} />
          <Route path="children/:id/notices" element={<ChildNoticesPage />} />
          <Route path="children/:id/gallery" element={<ChildGalleryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
