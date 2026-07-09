import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import { StaffInboxNotificationItem } from "../components/notifications/StaffInboxNotificationItem";
import {
  useDismissNotificationMutation,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
} from "../services/api";
import { useStaffNotificationStream } from "../hooks/useStaffNotificationStream";
import type { StaffInboxNotification } from "../types";

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  useStaffNotificationStream(true);
  const { data, isLoading, isFetching } = useGetNotificationsQuery(
    { page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [dismissNotification, { isLoading: dismissing }] = useDismissNotificationMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openItem = (item: StaffInboxNotification) => {
    if (!item.readAt) void markRead(item.id);
    navigate(item.linkPath);
  };

  const removeItem = (item: StaffInboxNotification) => {
    void dismissNotification(item.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Updates from parents and teachers. Handled items stay here until you remove them.
          {unreadCount > 0 ? ` ${unreadCount} unread.` : ""}
        </p>
      </div>

      <SectionCard title={`All notifications${total ? ` (${total})` : ""}`}>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No notifications.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <StaffInboxNotificationItem
                  item={item}
                  onSelect={openItem}
                  onDismiss={dismissing ? undefined : removeItem}
                />
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              Page {page} of {totalPages}
              {isFetching ? " · Updating…" : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
