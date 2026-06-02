import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGetNotificationPreviewQuery, useMarkPaymentProofReadMutation } from "../../services/api";
import { useStaffNotificationStream } from "../../hooks/useStaffNotificationStream";
import { invoiceOpenNavigation } from "../../utils/invoiceOpenNavigation";
import type { PaymentProof, StaffNotificationItem, ContentStaffEvent } from "../../types";

const PREVIEW_LIMIT = 5;

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isPaymentProof(item: StaffNotificationItem): item is PaymentProof {
  return item.kind === "payment_proof" || "invoiceId" in item;
}

function isContentEvent(item: StaffNotificationItem): item is ContentStaffEvent {
  return item.kind === "content_event";
}

function contentEventLabel(item: ContentStaffEvent) {
  const label = item.contentLabel ?? "Teacher submission";
  if (item.eventType === "withdrawn") return `${label} withdrawn · ${item.teacherName}`;
  return `${label} submitted · ${item.teacherName}`;
}

function NotificationItem({
  item,
  onSelect,
}: {
  item: StaffNotificationItem;
  onSelect: (item: StaffNotificationItem) => void;
}) {
  const unread = isPaymentProof(item) ? !item.reviewedAt : isContentEvent(item) ? false : true;
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${unread ? "bg-blue-50/40" : ""}`}
    >
      {isPaymentProof(item) ? (
        <img
          src={item.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
        />
      ) : item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
          {item.contentType === "diary" ? "📔" : item.contentType === "notices" ? "📝" : "🖼️"}
        </div>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />}
          <span className={`block truncate text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
            {item.studentRollNo ? `Roll ${item.studentRollNo}` : "Student"} · {item.studentName}
          </span>
        </span>
        <span className="block truncate text-xs text-slate-500">
          {isPaymentProof(item)
            ? `Fees screenshot · ${item.invoiceNo}`
            : isContentEvent(item)
              ? contentEventLabel(item)
              : `${item.contentLabel ?? "Teacher submission"} · ${item.teacherName}`}
        </span>
        <span className="block text-[11px] text-slate-400">{formatWhen(item.submittedAt)}</span>
      </span>
    </button>
  );
}

export default function StaffNotificationBell() {
  const navigate = useNavigate();
  const { data, refetch, isLoading, isFetching } = useGetNotificationPreviewQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  useStaffNotificationStream(true);
  const [markRead] = useMarkPaymentProofReadMutation();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const openItem = (item: StaffNotificationItem) => {
    setOpen(false);
    if (isPaymentProof(item)) {
      if (!item.reviewedAt) void markRead(item.id);
      navigate(invoiceOpenNavigation(item.invoiceId));
      return;
    }
    navigate("/content-approvals");
  };

  const toggleOpen = () => {
    setOpen((wasOpen) => !wasOpen);
  };

  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
          </div>
          {isLoading && items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications.</p>
          ) : (
            <>
              {isFetching && (
                <p className="border-b border-slate-50 px-4 py-1 text-center text-[11px] text-slate-400">Updating…</p>
              )}
              <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={isPaymentProof(item) ? `proof-${item.id}` : item.id}>
                    <NotificationItem item={item} onSelect={openItem} />
                  </li>
                ))}
              </ul>
              {total > PREVIEW_LIMIT && (
                <div className="border-t border-slate-100 px-4 py-2">
                  <Link
                    to="/notifications"
                    onClick={() => setOpen(false)}
                    className="block rounded-lg py-2 text-center text-sm font-semibold text-blue-600 hover:bg-slate-50"
                  >
                    View all ({total})
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
