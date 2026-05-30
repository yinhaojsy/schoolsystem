import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import PaymentProofUpload from "../components/PaymentProofUpload";
import { useGetInvoiceDetailQuery, useUploadPaymentProofMutation } from "../services/api";
import type { ParentInvoiceItem } from "../types";

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function lineAmount(item: ParentInvoiceItem) {
  if (item.type === "discount") return -Math.abs(item.amount);
  return item.amount;
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const invoiceId = parseInt(id ?? "", 10);
  const { data: invoice, isLoading, refetch } = useGetInvoiceDetailQuery(invoiceId, { skip: !invoiceId });
  const [uploadProof, { isLoading: uploading }] = useUploadPaymentProofMutation();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleUpload = async (file: File) => {
    setMessage(null);
    try {
      await uploadProof({ invoiceId, file }).unwrap();
      setMessage({ text: "Payment proof submitted. Thank you!", type: "success" });
      void refetch();
    } catch {
      setMessage({ text: "Could not upload payment proof. Try again.", type: "error" });
    }
  };

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link to="/fees" className="text-sm font-medium text-brand-700">
          ← Fees
        </Link>
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Invoice not found.</p>
        </div>
      </div>
    );
  }

  const total = invoice.periodNet ?? invoice.amount;
  const balanceDue = invoice.periodUnpaid ?? 0;
  const showPaidLine = invoice.status === "paid" || (invoice.periodPaid ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Link to="/fees" className="text-sm font-medium text-brand-700">
        ← Fees
      </Link>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{invoice.invoiceNo}</h2>
            <p className="text-sm text-slate-500">
              {invoice.month} {invoice.year} · Due {new Date(invoice.dueDate).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              invoice.status === "paid"
                ? "bg-emerald-100 text-emerald-800"
                : invoice.hasPaymentProof
                  ? "bg-sky-100 text-sky-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {invoice.status === "paid" ? "Paid" : invoice.hasPaymentProof ? "Proof sent" : "Pending"}
          </span>
        </div>

        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-800">{invoice.studentName}</span>
            {invoice.studentRollNo ? ` · ${invoice.studentRollNo}` : ""}
            {invoice.classGroupName ? ` · ${invoice.classGroupName}` : ""}
          </p>
          {invoice.parentsName && <p>Parents: {invoice.parentsName}</p>}
          {invoice.contactNo && <p>Contact: {invoice.contactNo}</p>}
          {invoice.remarks && <p className="text-slate-500">Remarks: {invoice.remarks}</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Line items</h3>
        </div>
        {(invoice.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No line items on this invoice.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(invoice.items ?? []).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{item.description}</p>
                  {item.type === "discount" && <p className="text-xs text-emerald-700">Discount</p>}
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${item.type === "discount" ? "text-emerald-700" : "text-slate-900"}`}>
                  {item.type === "discount" ? "−" : ""}Rs. {formatMoney(Math.abs(lineAmount(item)))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">This period</span>
            <span className="font-semibold tabular-nums text-slate-900">Rs. {formatMoney(total)}</span>
          </div>
          {(invoice.priorBalance ?? 0) > 0.009 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Brought forward</span>
              <span className="font-semibold tabular-nums text-slate-900">
                Rs. {formatMoney(invoice.priorBalance ?? 0)}
              </span>
            </div>
          )}
          {showPaidLine && (
            <div className="flex justify-between">
              <span className="text-slate-600">Paid</span>
              <span className="font-semibold tabular-nums text-emerald-700">
                Rs. {formatMoney(invoice.periodPaid ?? total)}
              </span>
            </div>
          )}
          {invoice.status !== "paid" && balanceDue > 0.009 && (
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="font-medium text-slate-800">Balance due</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">Rs. {formatMoney(balanceDue)}</span>
            </div>
          )}
          {invoice.status === "paid" && (
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="font-medium text-slate-800">Invoice total</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">Rs. {formatMoney(total)}</span>
            </div>
          )}
        </div>
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

      {invoice.status !== "paid" && (
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <PaymentProofUpload
            variant="primary"
            uploading={uploading}
            hasPaymentProof={invoice.hasPaymentProof}
            onUpload={handleUpload}
          />
        </div>
      )}
    </div>
  );
}
