import type { Invoice } from "../../types";
import {
  invoiceAmountDueNow,
  invoiceBroughtForwardInHeader,
} from "../../utils/invoiceBalance";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type PaymentAllocation = {
  description: string;
  month?: string;
  year?: number;
  invoiceNo?: string;
  lineAmount?: number;
  amount?: number;
  paidBefore?: number;
  paidAmount?: number;
  allocated: number;
  remainingOnLine?: number;
  remaining?: number;
};

type RecordInvoicePaymentModalProps = {
  invoice: Invoice;
  variant: "tuition" | "event";
  amount: string;
  paymentDate: string;
  remarks: string;
  allocations: PaymentAllocation[];
  onAmountChange: (value: string) => void;
  onPaymentDateChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function RecordInvoicePaymentModal({
  invoice,
  variant,
  amount,
  paymentDate,
  remarks,
  allocations,
  onAmountChange,
  onPaymentDateChange,
  onRemarksChange,
  onCancel,
  onSubmit,
}: RecordInvoicePaymentModalProps) {
  const amountDue = invoiceAmountDueNow(invoice);
  const broughtForward = invoiceBroughtForwardInHeader(invoice);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
      <div className="rounded-xl border border-slate-200 bg-white p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Record Payment for Invoice {invoice.invoiceNo}
        </h3>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg space-y-1">
          <div className="text-sm text-slate-700">
            {variant === "event" ? (
              <>
                <div className="flex justify-between">
                  <span>Invoice total:</span>
                  <span className="font-semibold">{formatMoney(invoice.amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Amount due now:</span>
                  <span className="font-semibold">{formatMoney(amountDue)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Invoice total (incl. brought forward at issue):</span>
                  <span className="font-semibold">Rs {invoice.amount.toLocaleString()}</span>
                </div>
                {invoice.grandDue != null && (
                  <div className="flex justify-between text-slate-600">
                    <span>Amount due now (prior balance + this period unpaid):</span>
                    <span className="font-semibold">Rs {Number(invoice.grandDue).toLocaleString()}</span>
                  </div>
                )}
              </>
            )}
          </div>
          {variant === "tuition" ? (
            <p className="text-xs text-slate-600 leading-snug">
              Receipts apply to the <strong>oldest unpaid invoice first</strong>, then by fee priority (registration →
              annual → monthly → meals → other) within each invoice.
            </p>
          ) : (
            <p className="text-xs text-slate-600 leading-snug">
              Payment is applied to this event invoice only.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => onPaymentDateChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
            <textarea
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {variant === "tuition" && allocations.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Payment Allocation Preview</h4>
              <div className="space-y-2">
                {allocations.map((allocation, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <div className="font-medium text-slate-900">{allocation.description}</div>
                      <div className="text-xs text-slate-500">
                        {allocation.month} {allocation.year} · {allocation.invoiceNo}
                      </div>
                      <div className="text-xs text-slate-500">
                        Line: Rs {Number(allocation.lineAmount ?? allocation.amount ?? 0).toLocaleString()} | Already
                        paid: Rs {Number(allocation.paidBefore ?? allocation.paidAmount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-600">+Rs {Number(allocation.allocated).toLocaleString()}</div>
                      {(allocation.remainingOnLine ?? allocation.remaining ?? 0) > 0 && (
                        <div className="text-xs text-amber-600">
                          Remaining on line: Rs{" "}
                          {Number(allocation.remainingOnLine ?? allocation.remaining).toLocaleString()}
                        </div>
                      )}
                      {(allocation.remainingOnLine ?? allocation.remaining ?? 0) === 0 && (
                        <div className="text-xs text-green-600">Line cleared</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {variant === "event" && broughtForward > 0.009 && (
            <p className="text-xs text-amber-800">
              This invoice includes {formatMoney(broughtForward)} brought forward from other periods.
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Record Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
