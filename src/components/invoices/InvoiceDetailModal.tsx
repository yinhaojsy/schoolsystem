import { useEffect, useState } from "react";
import type { Invoice } from "../../types";
import { formatBillingPeriodLabel } from "../../utils/billingMonths";
import { invoiceDateForDisplay } from "../../utils/invoiceDates";
import {
  invoiceAmountDueNow,
  invoiceBroughtForwardInHeader,
  invoicePeriodSubtotal,
} from "../../utils/invoiceBalance";
import {
  formatCollectionPaymentHint,
  getInvoiceCollectionTier,
} from "../../utils/invoiceCollection";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type InvoiceReceipt = {
  id: number;
  paymentDate: string;
  totalAmount: number;
  remarks?: string;
};

export type InvoiceDetailModalProps = {
  isOpen: boolean;
  invoice: Invoice | null;
  variant: "tuition" | "event";
  pdfDownloading?: boolean;
  onClose: () => void;
  onDownload: (invoice: Invoice) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onForceClose?: (invoice: Invoice) => void;
  onInvoiceUpdated?: (invoice: Invoice) => void;
};

export default function InvoiceDetailModal({
  isOpen,
  invoice,
  variant,
  pdfDownloading = false,
  onClose,
  onDownload,
  onRecordPayment,
  onMarkAsPaid,
  onForceClose,
  onInvoiceUpdated,
}: InvoiceDetailModalProps) {
  const [viewReceipts, setViewReceipts] = useState<InvoiceReceipt[]>([]);
  const [viewReceiptsLoading, setViewReceiptsLoading] = useState(false);
  const [viewReceiptsKey, setViewReceiptsKey] = useState(0);
  const [editingReceiptRemarksId, setEditingReceiptRemarksId] = useState<number | null>(null);
  const [editingReceiptRemarksText, setEditingReceiptRemarksText] = useState("");
  const [savingReceiptRemarksId, setSavingReceiptRemarksId] = useState<number | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !invoice?.id) {
      setViewReceipts([]);
      return;
    }
    let cancelled = false;
    setViewReceiptsLoading(true);
    fetch(`/api/invoices/${invoice.id}/payments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setViewReceipts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setViewReceipts([]);
      })
      .finally(() => {
        if (!cancelled) setViewReceiptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, invoice?.id, viewReceiptsKey]);

  const cancelEditingReceiptRemarks = () => {
    setEditingReceiptRemarksId(null);
    setEditingReceiptRemarksText("");
  };

  const startEditingReceiptRemarks = (receipt: InvoiceReceipt) => {
    setEditingReceiptRemarksId(receipt.id);
    setEditingReceiptRemarksText(receipt.remarks ?? "");
  };

  const handleSaveReceiptRemarks = async (feePaymentId: number) => {
    setSavingReceiptRemarksId(feePaymentId);
    try {
      const res = await fetch(`/api/fee-payments/${feePaymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: editingReceiptRemarksText }),
      });
      if (!res.ok) throw new Error("Failed to save remarks");
      setViewReceiptsKey((k) => k + 1);
      cancelEditingReceiptRemarks();
    } catch {
      /* parent may show alert */
    } finally {
      setSavingReceiptRemarksId(null);
    }
  };

  const handleDeleteReceipt = async (feePaymentId: number) => {
    if (!invoice) return;
    setDeletingReceiptId(feePaymentId);
    try {
      const res = await fetch(`/api/fee-payments/${feePaymentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete receipt");
      setViewReceiptsKey((k) => k + 1);
      const detailRes = await fetch(`/api/invoices/${invoice.id}`, { cache: "no-store" });
      if (detailRes.ok) {
        const updated = (await detailRes.json()) as Invoice;
        onInvoiceUpdated?.(updated);
      }
    } catch {
      /* parent may show alert */
    } finally {
      setDeletingReceiptId(null);
    }
  };

  const handleClose = () => {
    cancelEditingReceiptRemarks();
    onClose();
  };

  if (!isOpen) return null;

  const showPaidColumn = (invoice?.items ?? []).some((x) => x.paidAmount != null && x.paidAmount > 0);
  const broughtForward = invoice ? invoiceBroughtForwardInHeader(invoice) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="rounded-xl border border-slate-200 bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Invoice details</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="p-5">
          {!invoice ? (
            <p className="text-center text-slate-500 py-10">Loading invoice…</p>
          ) : (
            <>
              <div className="space-y-1 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">{invoice.invoiceNo}</span>
                  {variant === "tuition" ? (
                    <span className="text-slate-500">
                      {" "}
                      · {formatBillingPeriodLabel(invoice.month, invoice.year)}
                    </span>
                  ) : invoice.eventName ? (
                    <span className="text-slate-500"> · {invoice.eventName}</span>
                  ) : null}
                </p>
                <p>
                  Due {new Date(invoice.dueDate).toLocaleDateString()} ·{" "}
                  <span className="capitalize font-medium">{invoice.status}</span>
                </p>
                {variant === "event" ? (
                  <p>{invoice.billingName ?? invoice.studentName}</p>
                ) : (
                  <p>
                    {invoice.studentName} ({invoice.studentRollNo})
                    {invoice.classGroupName ? ` · ${invoice.classGroupName}` : ""}
                  </p>
                )}
                {variant === "event" && (
                  <p className="text-slate-600">Invoice date: {invoiceDateForDisplay(invoice)}</p>
                )}
                {invoice.parentsName && (
                  <p className="text-slate-600">Parents: {invoice.parentsName}</p>
                )}
                {invoice.contactNo && (
                  <p className="text-slate-600">Contact: {invoice.contactNo}</p>
                )}
                {invoice.remarks && (
                  <p className="text-slate-600 mt-2">Remarks: {invoice.remarks}</p>
                )}
              </div>

              <table className="w-full mt-6 text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium text-right">Type</th>
                    {showPaidColumn && (
                      <th className="px-3 py-2 font-medium text-right">Paid</th>
                    )}
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items ?? []).map((line) => (
                    <tr key={line.id ?? `${line.description}-${line.amount}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-900">{line.description}</td>
                      <td className="px-3 py-2 text-right text-slate-500 capitalize">{line.type}</td>
                      {showPaidColumn && (
                        <td className="px-3 py-2 text-right text-slate-600">
                          {line.paidAmount != null && line.paidAmount > 0
                            ? formatMoney(line.paidAmount)
                            : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {line.type === "discount" ? "−" : ""}
                        {formatMoney(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-1 text-sm text-right">
                <div className="flex justify-end gap-6 text-slate-600">
                  <span>{variant === "event" ? "Subtotal" : "This period"}</span>
                  <span className="tabular-nums w-28">{formatMoney(invoicePeriodSubtotal(invoice))}</span>
                </div>
                {broughtForward > 0.009 && (
                  <div className="flex justify-end gap-6 text-amber-900">
                    <span>Brought forward</span>
                    <span className="tabular-nums w-28 font-medium">{formatMoney(broughtForward)}</span>
                  </div>
                )}
                <div className="flex justify-end gap-6 text-base font-semibold text-slate-900 pt-1 border-t border-slate-200">
                  <span>Amount due now</span>
                  <span className="tabular-nums w-28">{formatMoney(invoiceAmountDueNow(invoice))}</span>
                </div>
                {variant === "tuition" &&
                  Math.abs(invoice.amount - invoiceAmountDueNow(invoice)) > 0.02 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Invoice total at issue was {formatMoney(invoice.amount)}; it updates when earlier periods are paid
                      or written off.
                    </p>
                  )}
              </div>

              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Fee receipts</h4>
                {viewReceiptsLoading ? (
                  <p className="text-sm text-slate-600">Loading receipts…</p>
                ) : viewReceipts.length === 0 ? (
                  <p className="text-sm text-slate-600">No receipts recorded against this invoice.</p>
                ) : (
                  <ul className="space-y-2">
                    {viewReceipts.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-900">Receipt #{r.id}</span>
                            <span className="text-slate-500">
                              {" "}
                              · {r.paymentDate} · {formatMoney(r.totalAmount)}
                            </span>
                            {editingReceiptRemarksId !== r.id && r.remarks ? (
                              <span className="block text-xs text-slate-500 mt-0.5">{r.remarks}</span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {editingReceiptRemarksId === r.id ? null : (
                              <button
                                type="button"
                                onClick={() => startEditingReceiptRemarks(r)}
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {r.remarks ? "Edit remarks" : "Add remarks"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteReceipt(r.id)}
                              disabled={deletingReceiptId === r.id || editingReceiptRemarksId === r.id}
                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                            >
                              {deletingReceiptId === r.id ? "Removing…" : "Delete receipt"}
                            </button>
                          </div>
                        </div>
                        {editingReceiptRemarksId === r.id ? (
                          <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                            <label className="block text-xs font-medium text-slate-600">
                              Remarks (optional)
                            </label>
                            <textarea
                              value={editingReceiptRemarksText}
                              onChange={(e) => setEditingReceiptRemarksText(e.target.value)}
                              rows={2}
                              placeholder="e.g. cash, cheque #, parent name…"
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSaveReceiptRemarks(r.id)}
                                disabled={savingReceiptRemarksId === r.id}
                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingReceiptRemarksId === r.id ? "Saving…" : "Save remarks"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingReceiptRemarks}
                                disabled={savingReceiptRemarksId === r.id}
                                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {variant === "tuition" && invoice.paymentProof && (
                <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                  <h4 className="text-sm font-semibold text-sky-950">Parent payment screenshot</h4>
                  <p className="mt-1 text-xs text-sky-800">
                    Submitted {new Date(invoice.paymentProof.submittedAt).toLocaleString()}
                    {invoice.paymentProof.parentName ? ` · ${invoice.paymentProof.parentName}` : ""}
                  </p>
                  <a
                    href={invoice.paymentProof.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block"
                  >
                    <img
                      src={invoice.paymentProof.imageUrl}
                      alt="Payment proof"
                      className="max-h-64 rounded-lg border border-sky-200 object-contain bg-white"
                    />
                  </a>
                </div>
              )}

              {invoice.status === "pending" && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <h4 className="text-sm font-semibold text-emerald-950">Record payment</h4>
                  {getInvoiceCollectionTier(invoice) === "partial" ? (
                    <p className="mt-1 text-xs text-emerald-800">
                      {formatCollectionPaymentHint(invoice)} ·{" "}
                      {formatMoney(invoiceAmountDueNow(invoice))} still due
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-emerald-800">
                      {formatMoney(invoiceAmountDueNow(invoice))} due — mark paid after verifying payment, or record a
                      partial amount.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRecordPayment(invoice)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Record payment
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkAsPaid(invoice)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Mark as paid
                    </button>
                    {variant === "tuition" && onForceClose && (
                      <button
                        type="button"
                        onClick={() => onForceClose(invoice)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Close remaining balance
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onDownload(invoice)}
                  disabled={pdfDownloading}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {pdfDownloading ? "Preparing…" : "Download PDF"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
