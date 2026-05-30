import { Outlet } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useGetChildrenQuery, useGetInboxQuery, useGetInvoicesQuery } from "../services/api";

export default function MobileLayout() {
  const { data: inbox } = useGetInboxQuery();
  const { data: invoices = [] } = useGetInvoicesQuery();
  useGetChildrenQuery();

  const feesUnread = invoices.filter((inv) => inv.unread).length;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-sm font-bold text-white">
            SV
          </div>
          <div>
            <p className="text-xs font-medium text-brand-700">Sprouts Valley</p>
            <h1 className="text-base font-bold text-slate-900">Parent Portal</h1>
          </div>
        </div>
      </header>

      <main className="px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <BottomNav inboxUnread={inbox?.unreadCount ?? 0} feesUnread={feesUnread} />
    </div>
  );
}
