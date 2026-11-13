import { useEffect, useMemo, useState } from "react";
import SectionCard from "../common/SectionCard";
import AlertModal from "../common/AlertModal";
import ConfirmModal from "../common/ConfirmModal";
import IconActionButton from "../common/IconActionButton";
import InvoiceDetailModal from "./InvoiceDetailModal";
import MarkInvoicePaidModal from "./MarkInvoicePaidModal";
import RecordInvoicePaymentModal from "./RecordInvoicePaymentModal";
import {
  BanknotesIcon,
  CheckCircleIcon,
  DownloadIcon,
  EyeIcon,
  TrashIcon,
} from "./invoiceTableActionIcons";
import type { DropInBillingCandidate, Invoice } from "../../types";
import {
  useGetDropInBillingCandidatesQuery,
  useGetInvoicesQuery,
  useGenerateDropInInvoicesMutation,
  useDeleteInvoiceMutation,
  useUpdateInvoiceMutation,
} from "../../services/api";
import { useAppSelector } from "../../app/hooks";
import { downloadInvoicePdf } from "../../invoice/buildInvoicePdf";
import { fetchInvoiceTemplate } from "../../invoice/invoiceTemplate";
import { fetchInvoiceDetailById } from "../../utils/fetchInvoiceDetail";
import {
  COLLECTION_TIER_BADGE_CLASS,
  COLLECTION_TIER_LABELS,
  getInvoiceCollectionTier,
} from "../../utils/invoiceCollection";
import { invoiceDateForDisplay } from "../../utils/invoiceDates";
import { invoiceMatchesNameRollSearch } from "../../utils/invoiceSearch";
import InvoiceListSearchInput from "./InvoiceListSearchInput";
import { CALENDAR_MONTH_NAMES } from "../../utils/academicYear";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function suggestedDropInAmount(c: DropInBillingCandidate): number | null {
  if (c.dropInRate == null || !Number.isFinite(c.dropInRate) || c.presentDays <= 0) {
    return null;
  }
  return roundMoney(c.presentDays * c.dropInRate);
}

function parseDiscount(discounts: Record<number, string>, studentId: number): number {
  const raw = discounts[studentId]?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(n);
}

function sessionLabel(sessionType?: string | null): string {
  if (sessionType === "half") return "Half day";
  if (sessionType === "full") return "Full day";
  return "—";
}

type ExtraDraft = { key: string; description: string; amount: string };

type DropInGenerateItem = {
  studentId: number;
  discount?: number;
  extras?: { description: string; amount: number }[];
};

function newExtraDraft(): ExtraDraft {
  return {
    key: `x_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    amount: "",
  };
}

function classifyExtra(row: ExtraDraft): "blank" | "invalid" | { description: string; amount: number } {
  const description = row.description.trim();
  const raw = row.amount.trim();
  if (!description && !raw) return "blank";
  const amount = Number(raw);
  if (!description || !Number.isFinite(amount) || amount <= 0) return "invalid";
  return { description, amount: roundMoney(amount) };
}

function completeExtras(lines: ExtraDraft[] | undefined): { description: string; amount: number }[] {
  const extras: { description: string; amount: number }[] = [];
  for (const row of lines ?? []) {
    const classified = classifyExtra(row);
    if (classified !== "blank" && classified !== "invalid") extras.push(classified);
  }
  return extras;
}

function extrasAreIncomplete(lines: ExtraDraft[] | undefined): boolean {
  return (lines ?? []).some((row) => classifyExtra(row) === "invalid");
}

function extrasSum(lines: ExtraDraft[] | undefined): number {
  return roundMoney(completeExtras(lines).reduce((sum, line) => sum + line.amount, 0));
}

function billableDropInAmount(c: DropInBillingCandidate, lines: ExtraDraft[] | undefined): number | null {
  const attendance = suggestedDropInAmount(c);
  if (attendance == null) return null;
  return roundMoney(attendance + extrasSum(lines));
}

function DropInExtraLinesEditor({
  lines,
  onChange,
}: {
  lines: ExtraDraft[];
  onChange: (lines: ExtraDraft[]) => void;
}) {
  return (
    <div className="min-w-[240px] space-y-1.5">
      <p className="text-[11px] leading-tight text-slate-400">This invoice only</p>
      {lines.map((row) => (
        <div key={row.key} className="flex items-center gap-1">
          <input
            type="text"
            value={row.description}
            placeholder="Description"
            onChange={(e) =>
              onChange(lines.map((line) => (line.key === row.key ? { ...line, description: e.target.value } : line)))
            }
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={row.amount}
            placeholder="Rs"
            onChange={(e) =>
              onChange(lines.map((line) => (line.key === row.key ? { ...line, amount: e.target.value } : line)))
            }
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={() => onChange(lines.filter((line) => line.key !== row.key))}
            className="shrink-0 px-1 text-xs font-medium text-red-600 hover:text-red-800"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, newExtraDraft()])}
        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
      >
        + Add extra
      </button>
    </div>
  );
}

export default function DropInInvoicesPanel() {
  const user = useAppSelector((s) => s.auth.user);
  const now = new Date();
  const [billingYear, setBillingYear] = useState(now.getFullYear());
  const [billingMonthIndex, setBillingMonthIndex] = useState(now.getMonth());
  const billingMonth = CALENDAR_MONTH_NAMES[billingMonthIndex];
  const calendarMonth = billingMonthIndex + 1;

  const { data: candidatesData, isLoading: candidatesLoading, refetch: refetchCandidates } =
    useGetDropInBillingCandidatesQuery({ year: billingYear, month: calendarMonth });
  const candidates = candidatesData?.candidates ?? [];

  const { data: dropInInvoices = [], refetch: refetchInvoices } = useGetInvoicesQuery({
    invoiceKind: "drop_in",
  });

  const [generateInvoices, { isLoading: isGenerating }] = useGenerateDropInInvoicesMutation();
  const [deleteInvoice, { isLoading: isDeleting }] = useDeleteInvoiceMutation();
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation();

  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [extrasByStudent, setExtrasByStudent] = useState<Record<number, ExtraDraft[]>>({});
  const [summaryLine, setSummaryLine] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(now.toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(now.toISOString().slice(0, 10));
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  useEffect(() => {
    setDiscounts({});
    setExtrasByStudent({});
  }, [billingYear, billingMonthIndex]);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    type: "error" | "warning" | "success" | "info";
  }>({ isOpen: false, message: "", type: "error" });

  const [showViewInvoiceModal, setShowViewInvoiceModal] = useState(false);
  const [viewInvoiceDetail, setViewInvoiceDetail] = useState<Invoice | null>(null);
  const [viewInvoiceLoadingId, setViewInvoiceLoadingId] = useState<number | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<number | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [markPaidForm, setMarkPaidForm] = useState({
    paymentDate: now.toISOString().slice(0, 10),
    remarks: "",
  });
  const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false);
  const [partialPaymentForm, setPartialPaymentForm] = useState({
    amount: "",
    paymentDate: now.toISOString().slice(0, 10),
    remarks: "",
  });
  const [partialPaymentSaving, setPartialPaymentSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null);
  const [invoiceListSearch, setInvoiceListSearch] = useState("");

  const pendingCandidates = useMemo(
    () => candidates.filter((c) => !c.existingInvoiceId),
    [candidates],
  );

  const sortedInvoices = useMemo(
    () => [...dropInInvoices].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
    [dropInInvoices],
  );

  const filteredInvoices = useMemo(
    () => sortedInvoices.filter((inv) => invoiceMatchesNameRollSearch(inv, invoiceListSearch)),
    [sortedInvoices, invoiceListSearch],
  );

  const notify = (message: string, type: "error" | "warning" | "success" | "info" = "error") => {
    setAlertModal({ isOpen: true, message, type });
  };

  const refreshViewDetail = async (invoiceId: number) => {
    try {
      const detail = await fetchInvoiceDetailById(invoiceId);
      setViewInvoiceDetail(detail);
    } catch {
      /* modal may be closed */
    }
  };

  const clearStudentDrafts = (studentIds: number[]) => {
    setDiscounts((prev) => {
      const next = { ...prev };
      for (const id of studentIds) delete next[id];
      return next;
    });
    setExtrasByStudent((prev) => {
      const next = { ...prev };
      for (const id of studentIds) delete next[id];
      return next;
    });
  };

  const prepareGenerateItem = (
    c: DropInBillingCandidate,
  ): { status: "skip" } | { status: "error"; message: string } | { status: "ready"; item: DropInGenerateItem } => {
    const lines = extrasByStudent[c.studentId];
    const total = billableDropInAmount(c, lines);
    if (total == null) return { status: "skip" };
    if (extrasAreIncomplete(lines)) {
      return {
        status: "error",
        message: `Finish or remove the extra charge for ${c.name}. Each extra needs a description and an amount.`,
      };
    }
    const discount = parseDiscount(discounts, c.studentId);
    if (discount >= total) {
      return {
        status: "error",
        message: `Discount for ${c.name} must be less than ${formatMoney(total)}.`,
      };
    }
    const extras = completeExtras(lines);
    return {
      status: "ready",
      item: {
        studentId: c.studentId,
        discount: discount > 0 ? discount : undefined,
        extras: extras.length > 0 ? extras : undefined,
      },
    };
  };

  const handleGenerate = async (items: DropInGenerateItem[]) => {
    if (items.length === 0) {
      notify("No billable students for the selected month.", "warning");
      return;
    }
    try {
      const result = await generateInvoices({
        items,
        billingMonth,
        billingYear,
        invoiceDate,
        dueDate,
        createdBy: user?.id,
        summaryLine,
      }).unwrap();
      clearStudentDrafts(items.map((item) => item.studentId));
      await Promise.all([refetchCandidates(), refetchInvoices()]);
      notify(
        result.count === 1
          ? `Invoice ${result.invoices[0]?.invoiceNo ?? ""} created.`
          : `${result.count} invoices created.`,
        "success",
      );
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to generate invoice.";
      notify(message);
    }
  };

  const handleGenerateOne = async (c: DropInBillingCandidate) => {
    const prepared = prepareGenerateItem(c);
    if (prepared.status === "skip") {
      notify(`${c.name} has no present days or daily rate to bill this month.`, "warning");
      return;
    }
    if (prepared.status === "error") {
      notify(prepared.message, "warning");
      return;
    }
    setGeneratingId(c.studentId);
    try {
      await handleGenerate([prepared.item]);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAllWithAmounts = async () => {
    const items: DropInGenerateItem[] = [];
    for (const c of pendingCandidates) {
      const prepared = prepareGenerateItem(c);
      if (prepared.status === "skip") continue;
      if (prepared.status === "error") {
        notify(prepared.message, "warning");
        return;
      }
      items.push(prepared.item);
    }
    await handleGenerate(items);
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    setShowViewInvoiceModal(true);
    setViewInvoiceDetail(null);
    setViewInvoiceLoadingId(invoice.id);
    try {
      const detail = await fetchInvoiceDetailById(invoice.id);
      setViewInvoiceDetail(detail);
    } catch (err: unknown) {
      setShowViewInvoiceModal(false);
      notify(err instanceof Error ? err.message : "Failed to load invoice.");
    } finally {
      setViewInvoiceLoadingId(null);
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    setPdfDownloadingId(invoice.id);
    try {
      const [detail, template] = await Promise.all([
        fetchInvoiceDetailById(invoice.id),
        fetchInvoiceTemplate(),
      ]);
      await downloadInvoicePdf(detail, template);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setPdfDownloadingId(null);
    }
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setMarkPaidForm({
      paymentDate: new Date().toISOString().split("T")[0],
      remarks: "",
    });
    setShowMarkPaidModal(true);
  };

  const handleMarkPaidSubmit = async () => {
    if (!selectedInvoice) return;
    try {
      await updateInvoice({
        id: selectedInvoice.id,
        data: {
          status: "paid",
          paymentDate: markPaidForm.paymentDate,
          remarks: markPaidForm.remarks.trim() || selectedInvoice.remarks,
          createdBy: user?.id,
        },
      }).unwrap();
      notify("Invoice marked as paid!", "success");
      const paidId = selectedInvoice.id;
      setShowMarkPaidModal(false);
      setSelectedInvoice(null);
      await Promise.all([refetchInvoices(), refetchCandidates()]);
      if (viewInvoiceDetail?.id === paidId) {
        await refreshViewDetail(paidId);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to update invoice.";
      notify(message);
    }
  };

  const handleRecordPayment = async (invoice: Invoice) => {
    try {
      const detail = await fetchInvoiceDetailById(invoice.id);
      setSelectedInvoice(detail);
      setPartialPaymentForm({
        amount: "",
        paymentDate: new Date().toISOString().split("T")[0],
        remarks: "",
      });
      setShowPartialPaymentModal(true);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to load invoice.");
    }
  };

  const handlePartialPaymentSubmit = async () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(partialPaymentForm.amount);
    if (!amount || amount <= 0) {
      notify("Please enter a valid payment amount.", "warning");
      return;
    }
    setPartialPaymentSaving(true);
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          paymentDate: partialPaymentForm.paymentDate,
          remarks: partialPaymentForm.remarks.trim(),
          createdBy: user?.id,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to record payment");
      }
      notify("Payment recorded successfully!", "success");
      const invoiceId = selectedInvoice.id;
      setShowPartialPaymentModal(false);
      setSelectedInvoice(null);
      await Promise.all([refetchInvoices(), refetchCandidates()]);
      if (viewInvoiceDetail?.id === invoiceId) {
        await refreshViewDetail(invoiceId);
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setPartialPaymentSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteInvoice(deleteConfirm.id).unwrap();
      if (viewInvoiceDetail?.id === deleteConfirm.id) {
        setShowViewInvoiceModal(false);
        setViewInvoiceDetail(null);
      }
      await Promise.all([refetchInvoices(), refetchCandidates()]);
      notify("Invoice deleted.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to delete invoice.";
      notify(message);
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Generate drop-in invoices"
        subtitle="Pick the billing month and review present days. The charge is present days × the agreed daily rate. Add a one-off extra or a discount for this invoice before generating."
      >
        <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Billing month</span>
            <select
              value={billingMonthIndex}
              onChange={(e) => setBillingMonthIndex(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {CALENDAR_MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Billing year</span>
            <input
              type="number"
              value={billingYear}
              onChange={(e) => setBillingYear(parseInt(e.target.value, 10) || billingYear)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Invoice date</span>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={summaryLine}
              onChange={(e) => setSummaryLine(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>Summarize as one line</span>
          </label>
          {!candidatesLoading && pendingCandidates.length > 0 && (
            <button
              type="button"
              onClick={() => void handleGenerateAllWithAmounts()}
              disabled={isGenerating}
              className="w-full sm:ml-auto sm:w-auto self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? "Generating…" : "Generate all"}
            </button>
          )}
        </div>

        {candidatesLoading ? (
          <p className="text-sm text-slate-500">Loading drop-in students…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No drop-in students enrolled yet. Admit students as Drop-in on the Students page.
          </p>
        ) : pendingCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">
            All drop-in students already have an invoice for {billingMonth} {billingYear}.
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-4">Roll</th>
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Session</th>
                    <th className="py-3 pr-4">Agreed rate</th>
                    <th className="py-3 pr-4">Present days</th>
                    <th className="py-3 pr-4">Extra charges</th>
                    <th className="py-3 pr-4">Amount to charge</th>
                    <th className="py-3 pr-4">Discount</th>
                    <th className="py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCandidates.map((c) => {
                    const extraLines = extrasByStudent[c.studentId] ?? [];
                    const extraAmount = extrasSum(extraLines);
                    const chargeTotal = billableDropInAmount(c, extraLines);
                    return (
                    <tr key={c.studentId} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 align-top font-medium text-slate-700">{c.rollNo}</td>
                      <td className="py-3 pr-4 align-top font-medium text-slate-900">{c.name}</td>
                      <td className="py-3 pr-4 align-top text-slate-600">{sessionLabel(c.dropInSessionType)}</td>
                      <td className="py-3 pr-4 align-top tabular-nums text-slate-600">
                        {c.dropInRate != null ? formatMoney(c.dropInRate) : "—"}
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums">{c.presentDays}</td>
                      <td className="py-3 pr-4 align-top">
                        <DropInExtraLinesEditor
                          lines={extraLines}
                          onChange={(lines) =>
                            setExtrasByStudent((prev) => ({ ...prev, [c.studentId]: lines }))
                          }
                        />
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums font-medium text-slate-900">
                        {chargeTotal != null ? formatMoney(chargeTotal) : "—"}
                        {extraAmount > 0 && (
                          <span className="block text-xs font-normal text-slate-500">
                            includes {formatMoney(extraAmount)} extra
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0"
                          value={discounts[c.studentId] ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setDiscounts((prev) => {
                              if (value === "") {
                                const next = { ...prev };
                                delete next[c.studentId];
                                return next;
                              }
                              return { ...prev, [c.studentId]: value };
                            });
                          }}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums"
                        />
                      </td>
                      <td className="py-3 align-top">
                        <button
                          type="button"
                          onClick={() => void handleGenerateOne(c)}
                          disabled={isGenerating && generatingId === c.studentId}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {generatingId === c.studentId ? "…" : "Generate"}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-3">
              {pendingCandidates.map((c) => {
                const extraLines = extrasByStudent[c.studentId] ?? [];
                const extraAmount = extrasSum(extraLines);
                const chargeTotal = billableDropInAmount(c, extraLines);
                return (
                <li
                  key={c.studentId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500">Roll {c.rollNo}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {sessionLabel(c.dropInSessionType)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
                    <p>Agreed rate</p>
                    <p className="text-right tabular-nums">
                      {c.dropInRate != null ? formatMoney(c.dropInRate) : "—"}
                    </p>
                    <p>Present days</p>
                    <p className="text-right tabular-nums">{c.presentDays}</p>
                    <p className="font-medium text-slate-900">Amount to charge</p>
                    <p className="text-right tabular-nums font-semibold text-slate-900">
                      {chargeTotal != null ? formatMoney(chargeTotal) : "—"}
                      {extraAmount > 0 && (
                        <span className="block text-xs font-normal text-slate-500">
                          includes {formatMoney(extraAmount)} extra
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium text-slate-700">Extra charges</p>
                    <DropInExtraLinesEditor
                      lines={extraLines}
                      onChange={(lines) =>
                        setExtrasByStudent((prev) => ({ ...prev, [c.studentId]: lines }))
                      }
                    />
                  </div>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Discount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={discounts[c.studentId] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDiscounts((prev) => {
                          if (value === "") {
                            const next = { ...prev };
                            delete next[c.studentId];
                            return next;
                          }
                          return { ...prev, [c.studentId]: value };
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateOne(c)}
                    disabled={isGenerating && generatingId === c.studentId}
                    className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {generatingId === c.studentId ? "Generating…" : "Generate"}
                  </button>
                </li>
                );
              })}
            </ul>
          </>
        )}

        {candidates.some((c) => c.existingInvoiceId) && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Already invoiced this month
            </p>
            <ul className="space-y-1 text-sm text-slate-600">
              {candidates
                .filter((c) => c.existingInvoiceId)
                .map((c) => (
                  <li key={c.studentId}>
                    {c.rollNo} {c.name} — {c.existingInvoiceNo} ({c.existingInvoiceStatus})
                  </li>
                ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Drop-in invoices">
        {sortedInvoices.length === 0 ? (
          <p className="text-sm text-slate-500">No drop-in invoices yet.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <InvoiceListSearchInput value={invoiceListSearch} onChange={setInvoiceListSearch} />
              {invoiceListSearch.trim() && (
                <span className="text-xs text-slate-500 pb-2">
                  {filteredInvoices.length} of {sortedInvoices.length} shown
                </span>
              )}
            </div>
            {filteredInvoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices match your search.</p>
            ) : (
              <>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Student</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const tier = inv.collectionTier ?? getInvoiceCollectionTier(inv);
                  return (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-900">{inv.invoiceNo}</div>
                        <div className="text-xs text-slate-500">{invoiceDateForDisplay(inv)}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-900">{inv.studentName}</div>
                        <div className="text-xs text-slate-500">Roll {inv.studentRollNo}</div>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{formatMoney(inv.amount)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COLLECTION_TIER_BADGE_CLASS[tier]}`}
                        >
                          {COLLECTION_TIER_LABELS[tier]}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          <IconActionButton
                            label="View invoice"
                            icon={<EyeIcon />}
                            onClick={() => void handleViewInvoice(inv)}
                            loading={viewInvoiceLoadingId === inv.id}
                          />
                          <IconActionButton
                            label="Download PDF"
                            icon={<DownloadIcon />}
                            onClick={() => void handleDownloadInvoice(inv)}
                            loading={pdfDownloadingId === inv.id}
                          />
                          {tier !== "paid" && tier !== "cancelled" && (
                            <>
                              <IconActionButton
                                label="Record payment"
                                icon={<BanknotesIcon />}
                                onClick={() => void handleRecordPayment(inv)}
                              />
                              <IconActionButton
                                label="Mark as paid"
                                icon={<CheckCircleIcon />}
                                onClick={() => handleMarkAsPaid(inv)}
                              />
                            </>
                          )}
                          <IconActionButton
                            label="Delete invoice"
                            icon={<TrashIcon />}
                            onClick={() => setDeleteConfirm(inv)}
                            disabled={isDeleting}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <ul className="md:hidden space-y-3">
              {filteredInvoices.map((inv) => {
                const tier = inv.collectionTier ?? getInvoiceCollectionTier(inv);
                return (
                  <li
                    key={inv.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{inv.studentName}</p>
                        <p className="text-xs text-slate-500">
                          Roll {inv.studentRollNo} · {inv.invoiceNo}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COLLECTION_TIER_BADGE_CLASS[tier]}`}
                      >
                        {COLLECTION_TIER_LABELS[tier]}
                      </span>
                    </div>
                    <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                      <p>{invoiceDateForDisplay(inv)}</p>
                      <p className="font-semibold text-slate-900 tabular-nums">{formatMoney(inv.amount)}</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => void handleViewInvoice(inv)}
                        disabled={viewInvoiceLoadingId === inv.id}
                        className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {viewInvoiceLoadingId === inv.id ? "Loading…" : "View invoice"}
                      </button>
                      {tier !== "paid" && tier !== "cancelled" && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRecordPayment(inv)}
                            className="rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-semibold text-blue-800"
                          >
                            Record payment
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkAsPaid(inv)}
                            className="rounded-lg border border-green-200 bg-green-50 py-2 text-sm font-semibold text-green-800"
                          >
                            Mark as paid
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDownloadInvoice(inv)}
                          disabled={pdfDownloadingId === inv.id}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                        >
                          {pdfDownloadingId === inv.id ? "PDF…" : "Download PDF"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(inv)}
                          disabled={isDeleting}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
              </>
            )}
          </>
        )}
      </SectionCard>

      <InvoiceDetailModal
        isOpen={showViewInvoiceModal}
        invoice={viewInvoiceDetail}
        variant="tuition"
        pdfDownloading={viewInvoiceDetail != null && pdfDownloadingId === viewInvoiceDetail.id}
        onClose={() => {
          setShowViewInvoiceModal(false);
          setViewInvoiceDetail(null);
        }}
        onDownload={(invoice) => void handleDownloadInvoice(invoice)}
        onRecordPayment={(invoice) => void handleRecordPayment(invoice)}
        onMarkAsPaid={handleMarkAsPaid}
        onInvoiceUpdated={setViewInvoiceDetail}
      />

      {showMarkPaidModal && selectedInvoice && (
        <MarkInvoicePaidModal
          paymentDate={markPaidForm.paymentDate}
          remarks={markPaidForm.remarks}
          isSaving={isUpdating}
          onPaymentDateChange={(value) => setMarkPaidForm((f) => ({ ...f, paymentDate: value }))}
          onRemarksChange={(value) => setMarkPaidForm((f) => ({ ...f, remarks: value }))}
          onCancel={() => {
            setShowMarkPaidModal(false);
            setSelectedInvoice(null);
          }}
          onConfirm={() => void handleMarkPaidSubmit()}
        />
      )}

      {showPartialPaymentModal && selectedInvoice && (
        <RecordInvoicePaymentModal
          invoice={selectedInvoice}
          variant="tuition"
          amount={partialPaymentForm.amount}
          paymentDate={partialPaymentForm.paymentDate}
          remarks={partialPaymentForm.remarks}
          allocations={[]}
          onAmountChange={(value) => setPartialPaymentForm((f) => ({ ...f, amount: value }))}
          onPaymentDateChange={(value) => setPartialPaymentForm((f) => ({ ...f, paymentDate: value }))}
          onRemarksChange={(value) => setPartialPaymentForm((f) => ({ ...f, remarks: value }))}
          onCancel={() => {
            setShowPartialPaymentModal(false);
            setSelectedInvoice(null);
          }}
          onSubmit={() => void handlePartialPaymentSubmit()}
        />
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false, message: "", type: "error" })}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        message={`Delete invoice ${deleteConfirm?.invoiceNo ?? ""}? This cannot be undone.`}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
