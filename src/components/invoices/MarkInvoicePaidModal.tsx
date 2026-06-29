type MarkInvoicePaidModalProps = {
  paymentDate: string;
  remarks: string;
  isSaving: boolean;
  onPaymentDateChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function MarkInvoicePaidModal({
  paymentDate,
  remarks,
  isSaving,
  onPaymentDateChange,
  onRemarksChange,
  onCancel,
  onConfirm,
}: MarkInvoicePaidModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
      <div className="rounded-xl border border-slate-200 bg-white p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Mark Invoice as Paid</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => onPaymentDateChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
            <textarea
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
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
              onClick={onConfirm}
              disabled={isSaving}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Updating..." : "Confirm Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
