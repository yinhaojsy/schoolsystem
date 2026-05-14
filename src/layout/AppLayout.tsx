import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { setUser } from "../app/authSlice";

export default function AppLayout() {
  const location = useLocation();
  const pathname = location.pathname;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/students", label: "New Admission" },
    { to: "/students-list", label: "Students List" },
    { to: "/fee-structures", label: "Fee Structure" },
    { to: "/class-groups", label: "Class Groups" },
    { to: "/invoices", label: "Invoices" },
    { to: "/invoice-template", label: "Invoice Template" },
  ];

  const matched = navItems.find(item =>
    item.end
      ? pathname === item.to
      : pathname.startsWith(item.to) && item.to !== "/"
  );

  const logout = () => {
    dispatch(setUser(null));
    navigate("/login");
  };

  return (
    <div className={`relative grid min-h-screen bg-slate-50 text-slate-900 transition-all duration-300 ${
      isSidebarCollapsed ? 'lg:grid-cols-[0_1fr]' : 'lg:grid-cols-[240px_1fr]'
    }`}>
      {/* Mobile Hamburger Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed top-4 left-4 z-50 flex items-center justify-center w-10 h-10 bg-slate-900 text-slate-100 rounded-lg shadow-lg hover:bg-slate-800 transition-colors lg:hidden"
        aria-label="Toggle menu"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          {isMobileMenuOpen ? (
            <>
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </>
          ) : (
            <>
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile Menu Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Toggle Arrow Button - Desktop only */}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={`fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-8 h-24 bg-slate-800 hover:bg-slate-700 text-slate-100 shadow-lg transition-all duration-300 hidden lg:flex ${
          isSidebarCollapsed 
            ? 'left-0 rounded-r-lg border-l-0' 
            : 'left-[240px] -ml-px rounded-r-lg border-l-0'
        }`}
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          className="w-5 h-5 transition-transform duration-300"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          {isSidebarCollapsed ? (
            <path d="M9 18l6-6-6-6" />
          ) : (
            <path d="M15 18l-6-6 6-6" />
          )}
        </svg>
      </button>

      <aside className={`fixed lg:sticky lg:top-0 top-0 left-0 h-screen flex flex-col gap-6 border-b border-slate-200 bg-slate-900 text-slate-50 lg:border-b-0 lg:border-r transition-all duration-300 z-40 ${
        isSidebarCollapsed ? 'lg:w-0 lg:px-0 lg:overflow-visible lg:border-r-0' : 'px-6 py-6 overflow-y-auto'
      } ${
        isMobileMenuOpen 
          ? 'w-64 translate-x-0' 
          : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className={`transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 lg:w-0 lg:overflow-hidden' : 'opacity-100'}`}>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-300">School Management</div>
            <div className="text-lg font-semibold">Education System</div>
          </div>
          <nav className="flex flex-wrap gap-2 lg:flex-col mt-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm"
                      : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <div>
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10 pt-16 lg:pt-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {matched ? matched.label : "School Management"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="text-sm text-slate-600">{user.email} ({user.role})</div>
                <button
                  onClick={logout}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
        <main className="p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
