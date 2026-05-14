import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import AppLayout from "../layout/AppLayout";
import DashboardPage from "../pages/DashboardPage";
import StudentsPage from "../pages/StudentsPage";
import StudentsListPage from "../pages/StudentsListPage";
import FeeStructuresPage from "../pages/FeeStructuresPage";
import ClassGroupsPage from "../pages/ClassGroupsPage";
import InvoicesPage from "../pages/InvoicesPage";
import InvoiceTemplatePage from "../pages/InvoiceTemplatePage";
import LoginPage from "../pages/LoginPage";
import { useAppSelector } from "../app/hooks";

function RequireAuth({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="students"
            element={
              <RequireAuth>
                <StudentsPage />
              </RequireAuth>
            }
          />
          <Route
            path="students-list"
            element={
              <RequireAuth>
                <StudentsListPage />
              </RequireAuth>
            }
          />
          <Route
            path="fee-structures"
            element={
              <RequireAuth>
                <FeeStructuresPage />
              </RequireAuth>
            }
          />
          <Route
            path="class-groups"
            element={
              <RequireAuth>
                <ClassGroupsPage />
              </RequireAuth>
            }
          />
          <Route
            path="invoices"
            element={
              <RequireAuth>
                <InvoicesPage />
              </RequireAuth>
            }
          />
          <Route
            path="invoice-template"
            element={
              <RequireAuth>
                <InvoiceTemplatePage />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
