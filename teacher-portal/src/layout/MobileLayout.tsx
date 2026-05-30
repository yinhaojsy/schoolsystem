import { NavLink, Outlet } from "react-router-dom";

export default function MobileLayout() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-sm font-bold text-white">SV</div>
          <div>
            <p className="text-xs font-medium text-brand-700">Sprouts Valley</p>
            <h1 className="text-base font-bold text-slate-900">Teacher Portal</h1>
          </div>
        </div>
      </header>
      <main className="px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-2 px-2 pb-2 pt-1">
          <NavLink to="/" end className="flex flex-col items-center py-2 text-[11px] font-medium text-slate-500">
            {({ isActive }) => (
              <>
                <span className={`text-lg ${isActive ? "text-brand-700" : ""}`}>📋</span>
                <span className={isActive ? "font-semibold text-brand-700" : ""}>Today</span>
              </>
            )}
          </NavLink>
          <NavLink to="/account" className="flex flex-col items-center py-2 text-[11px] font-medium text-slate-500">
            {({ isActive }) => (
              <>
                <span className={`text-lg ${isActive ? "text-brand-700" : ""}`}>👤</span>
                <span className={isActive ? "font-semibold text-brand-700" : ""}>Account</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
