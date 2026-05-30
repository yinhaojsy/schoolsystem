import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useGetInvoicesQuery, useUploadPaymentProofMutation } from "../services/api";
import type { ParentInvoice } from "../types";

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function invoiceTotal(inv: ParentInvoice) {
  return inv.periodNet ?? inv.amount;
}

function invoiceBalanceDue(inv: ParentInvoice) {
  if (inv.periodUnpaid != null) return inv.periodUnpaid;
  return Math.max(0, invoiceTotal(inv) - (inv.periodPaid ?? 0));
}

export default function FeesPage() {
  const { data: invoices = [], isLoading, refetch } = useGetInvoicesQuery();
  const [uploadProof, { isLoading: uploading }] = useUploadPaymentProofMutation();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Fees & Invoices</h2>
        <p className="text-sm text-slate-500">Tap an invoice to view details</p>
      </div>

      {message && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🧾</p>
          <p className="mt-2 text-sm text-slate-500">No invoices yet.</p>
        </div>
      ) : (
        invoices.map((inv) => {
          const total = invoiceTotal(inv);
          const balanceDue = invoiceBalanceDue(inv);

          return (
            <article key={inv.id} className="rounded-3xl bg-white shadow-sm">
              <Link to={`/fees/${inv.id}`} className="block p-4 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{inv.studentName}</p>
                    <p className="text-sm text-slate-500">
                      {inv.month} {inv.year} · {inv.invoiceNo}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      inv.status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : inv.hasPaymentProof
                          ? "bg-sky-100 text-sky-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {inv.status === "paid" ? "Paid" : inv.hasPaymentProof ? "Proof sent" : "Pending"}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">Rs. {formatMoney(total)}</p>
                    {inv.status !== "paid" && balanceDue > 0.009 && balanceDue < total - 0.009 && (
                      <p className="text-xs font-medium text-amber-700">Balance due Rs. {formatMoney(balanceDue)}</p>
                    )}
                    <p className="text-xs text-slate-500">Due {new Date(inv.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.unread && (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
                    )}
                    <span className="text-xs font-semibold text-brand-700">View →</span>
                  </div>
                </div>
              </Link>

              {inv.status !== "paid" && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  <input
                    ref={(el) => {
                      fileRefs.current[inv.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void uploadProof({ invoiceId: inv.id, file })
                          .unwrap()
                          .then(() => {
                            setMessage({ text: "Payment proof submitted. Thank you!", type: "success" });
                            void refetch();
                          })
                          .catch(() => {
                            setMessage({ text: "Could not upload payment proof. Try again.", type: "error" });
                          });
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      fileRefs.current[inv.id]?.click();
                    }}
                    className="w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-800 disabled:opacity-60"
                  >
                    {inv.hasPaymentProof ? "Replace payment screenshot" : "Upload payment screenshot"}
                  </button>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
