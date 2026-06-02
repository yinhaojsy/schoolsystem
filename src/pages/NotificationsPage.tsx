import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import { useGetNotificationsQuery, useMarkPaymentProofReadMutation } from "../services/api";
import { useStaffNotificationStream } from "../hooks/useStaffNotificationStream";
import { invoiceOpenNavigation } from "../utils/invoiceOpenNavigation";
import type { PaymentProof, StaffNotificationItem, ContentStaffEvent } from "../types";

const PAGE_SIZE = 20;

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
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
  if (item.eventType === "withdrawn") return `${label} withdrawn · by ${item.teacherName}`;
  return `${label} submitted for approval · by ${item.teacherName}`;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  useStaffNotificationStream(true);
  const { data, isLoading, isFetching } = useGetNotificationsQuery(
    { page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );
  const [markRead] = useMarkPaymentProofReadMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openItem = (item: StaffNotificationItem) => {
    if (isPaymentProof(item)) {
      if (!item.reviewedAt) void markRead(item.id);
      navigate(invoiceOpenNavigation(item.invoiceId));
      return;
    }
    navigate("/content-approvals");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fee payment screenshots from parents, teacher submissions pending approval, and submit/withdraw activity.
        </p>
      </div>

      <SectionCard title={`All notifications${total ? ` (${total})` : ""}`}>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No notifications.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const unread = isPaymentProof(item) ? !item.reviewedAt : isContentEvent(item) ? false : true;
              return (
                <li key={isPaymentProof(item) ? `proof-${item.id}` : item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`flex w-full gap-4 px-1 py-4 text-left hover:bg-slate-50 rounded-lg ${unread ? "bg-blue-50/30" : ""}`}
                  >
                    {isPaymentProof(item) ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover"
                      />
                    ) : item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                        {item.contentType === "diary" ? "📔" : item.contentType === "notices" ? "📝" : "🖼️"}
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
                        <span className={`block text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                          {item.studentRollNo ? `Roll ${item.studentRollNo}` : "Student"} · {item.studentName}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-600">
                        {isPaymentProof(item)
                          ? `Fees screenshot submitted · ${item.invoiceNo} · ${item.month} ${item.year}`
                          : isContentEvent(item)
                            ? contentEventLabel(item)
                            : `${item.contentLabel ?? "Teacher submission"} · by ${item.teacherName}`}
                      </span>
                      {isPaymentProof(item) && item.parentName && (
                        <span className="mt-0.5 block text-xs text-slate-500">Parent: {item.parentName}</span>
                      )}
                      {!isPaymentProof(item) && item.preview && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{item.preview}</span>
                      )}
                      <span className="mt-1 block text-xs text-slate-400">{formatWhen(item.submittedAt)}</span>
                    </span>
                    <span className="shrink-0 self-center text-sm font-medium text-blue-600">
                      {isPaymentProof(item) ? "View invoice →" : isContentEvent(item) ? "View →" : "Review →"}
                    </span>
                  </button>
                </li>
              );
            })}
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

      <p className="text-xs text-slate-500">
        Fee notifications are removed when the invoice is marked paid.{" "}
        <Link to="/content-approvals" className="font-medium text-blue-600 hover:text-blue-800">
          Content approvals
        </Link>
        {" · "}
        <Link to="/invoices" className="font-medium text-blue-600 hover:text-blue-800">
          Invoices
        </Link>
      </p>
    </div>
  );
}
