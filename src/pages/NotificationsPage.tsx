import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import { useGetNotificationsQuery, useMarkPaymentProofReadMutation } from "../services/api";
import { invoiceOpenNavigation } from "../utils/invoiceOpenNavigation";
import type { PaymentProof } from "../types";

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

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useGetNotificationsQuery(
    { page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );
  const [markRead] = useMarkPaymentProofReadMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openInvoice = (proof: PaymentProof) => {
    if (!proof.reviewedAt) {
      void markRead(proof.id);
    }
    navigate(invoiceOpenNavigation(proof.invoiceId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fee payment screenshots from parents on unpaid invoices.
        </p>
      </div>

      <SectionCard title={`All notifications${total ? ` (${total})` : ""}`}>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No notifications.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((proof) => {
              const unread = !proof.reviewedAt;
              return (
              <li key={proof.id}>
                <button
                  type="button"
                  onClick={() => openInvoice(proof)}
                  className={`flex w-full gap-4 px-1 py-4 text-left hover:bg-slate-50 rounded-lg ${unread ? "bg-blue-50/30" : ""}`}
                >
                  <img
                    src={proof.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
                      <span className={`block text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {proof.studentRollNo ? `Roll ${proof.studentRollNo}` : "Student"} · {proof.studentName}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      Fees screenshot submitted · {proof.invoiceNo} · {proof.month} {proof.year}
                    </span>
                    {proof.parentName && (
                      <span className="mt-0.5 block text-xs text-slate-500">Parent: {proof.parentName}</span>
                    )}
                    <span className="mt-1 block text-xs text-slate-400">{formatWhen(proof.submittedAt)}</span>
                  </span>
                  <span className="shrink-0 self-center text-sm font-medium text-blue-600">View invoice →</span>
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
        Notifications are removed automatically when the invoice is marked paid.{" "}
        <Link to="/invoices" className="font-medium text-blue-600 hover:text-blue-800">
          Go to Invoices
        </Link>
      </p>
    </div>
  );
}
