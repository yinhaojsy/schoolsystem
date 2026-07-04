import { useMemo, useState } from "react";
import SectionCard from "../../components/common/SectionCard";
import AlertModal from "../../components/common/AlertModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import IconActionButton from "../../components/common/IconActionButton";
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
import type { EventParticipant, Invoice } from "../../types";
import {
  useGetEventsQuery,
  useGetEventParticipantsQuery,
  useGetInvoicesQuery,
  useGenerateEventInvoicesMutation,
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

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function participantBillableTotal(p: EventParticipant): number {
  const extras = (p.extras ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return (Number(p.agreedAmount) || 0) + extras;
}

export default function EventInvoicesPanel() {
  const user = useAppSelector((s) => s.auth.user);
  const { data: events = [] } = useGetEventsQuery();
  const [eventFilter, setEventFilter] = useState<string>("");
  const eventId = eventFilter ? parseInt(eventFilter, 10) : undefined;

  const { data: participants = [], isLoading: participantsLoading, refetch: refetchParticipants } =
    useGetEventParticipantsQuery(eventId ? { eventId } : undefined);
  const { data: eventInvoices = [], refetch: refetchInvoices } = useGetInvoicesQuery({
    invoiceKind: "event",
  });
  const [generateInvoices, { isLoading: isGenerating }] = useGenerateEventInvoicesMutation();
  const [deleteInvoice, { isLoading: isDeleting }] = useDeleteInvoiceMutation();
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation();

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    type: "error" | "warning" | "success" | "info";
  }>({ isOpen: false, message: "", type: "error" });

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const [showViewInvoiceModal, setShowViewInvoiceModal] = useState(false);
  const [viewInvoiceDetail, setViewInvoiceDetail] = useState<Invoice | null>(null);
  const [viewInvoiceLoadingId, setViewInvoiceLoadingId] = useState<number | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<number | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [markPaidForm, setMarkPaidForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });

  const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false);
  const [partialPaymentForm, setPartialPaymentForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [partialPaymentSaving, setPartialPaymentSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null);
  const [invoiceListSearch, setInvoiceListSearch] = useState("");

  const pendingParticipants = useMemo(
    () => participants.filter((p) => !p.invoiceId),
    [participants],
  );

  const sortedEventInvoices = useMemo(() => {
    const filtered = eventId
      ? eventInvoices.filter((inv) => inv.eventId === eventId)
      : eventInvoices;
    return [...filtered].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [eventInvoices, eventId]);

  const filteredEventInvoices = useMemo(
    () => sortedEventInvoices.filter((inv) => invoiceMatchesNameRollSearch(inv, invoiceListSearch)),
    [sortedEventInvoices, invoiceListSearch],
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

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPending = () => {
    setSelectedIds(new Set(pendingParticipants.map((p) => p.id)));
  };

  const handleGenerate = async (participantIds: number[]) => {
    if (participantIds.length === 0) {
      notify("Select at least one participant.", "warning");
      return;
    }
    try {
      const result = await generateInvoices({
        participantIds,
        invoiceDate,
        dueDate,
        createdBy: user?.id,
      }).unwrap();
      setSelectedIds(new Set());
      await Promise.all([refetchParticipants(), refetchInvoices()]);
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

  const handleGenerateOne = async (p: EventParticipant) => {
    setGeneratingId(p.id);
    try {
      await handleGenerate([p.id]);
    } finally {
      setGeneratingId(null);
    }
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
      await Promise.all([refetchInvoices(), refetchParticipants()]);
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
    } catch {
      notify("Failed to load invoice details.");
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
      await Promise.all([refetchInvoices(), refetchParticipants()]);
      if (viewInvoiceDetail?.id === invoiceId) {
        await refreshViewDetail(invoiceId);
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setPartialPaymentSaving(false);
    }
  };

  const handleDeleteClick = (inv: Invoice) => {
    setDeleteConfirm(inv);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteInvoice(deleteConfirm.id).unwrap();
      if (viewInvoiceDetail?.id === deleteConfirm.id) {
        setShowViewInvoiceModal(false);
        setViewInvoiceDetail(null);
      }
      await Promise.all([refetchInvoices(), refetchParticipants()]);
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
        title="Generate event invoices"
        subtitle="Select participants, set invoice date, then generate. Each person gets one invoice with their custom description and amount."
      >
        <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Event</span>
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setSelectedIds(new Set());
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>
                  {ev.name}
                </option>
              ))}
            </select>
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

        {participantsLoading ? (
          <p className="text-sm text-slate-500">Loading participants…</p>
        ) : pendingParticipants.length === 0 ? (
          <p className="text-sm text-slate-500">
            {participants.length === 0
              ? "No participants yet. Add them on the Events page."
              : "All participants in this filter already have invoices."}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllPending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select all pending
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate([...selectedIds])}
                disabled={isGenerating || selectedIds.size === 0}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 md:ml-auto"
              >
                {isGenerating ? "Generating…" : `Generate selected (${selectedIds.size})`}
              </button>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-3 w-10" />
                    <th className="py-3 pr-4">Event</th>
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Description</th>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingParticipants.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{p.eventName}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">{p.participantName}</td>
                      <td className="py-3 pr-4 text-slate-600">{p.invoiceDescription}</td>
                      <td className="py-3 pr-4 tabular-nums">{formatMoney(participantBillableTotal(p))}</td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => void handleGenerateOne(p)}
                          disabled={isGenerating && generatingId === p.id}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {generatingId === p.id ? "…" : "Generate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-3">
              {pendingParticipants.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Select for batch generate
                  </label>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{p.participantName}</p>
                    <p className="text-xs text-slate-500">{p.eventName}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{p.invoiceDescription}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(participantBillableTotal(p))}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleGenerateOne(p)}
                    disabled={isGenerating && generatingId === p.id}
                    className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {generatingId === p.id ? "Generating…" : "Generate"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      <SectionCard title="Event invoices issued">
        {sortedEventInvoices.length === 0 ? (
          <p className="text-sm text-slate-500">No event invoices yet.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <InvoiceListSearchInput value={invoiceListSearch} onChange={setInvoiceListSearch} />
              {invoiceListSearch.trim() && (
                <span className="text-xs text-slate-500 pb-2">
                  {filteredEventInvoices.length} of {sortedEventInvoices.length} shown
                </span>
              )}
            </div>
            {filteredEventInvoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices match your search.</p>
            ) : (
              <>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Event</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEventInvoices.map((inv) => {
                  const tier = getInvoiceCollectionTier(inv);
                  return (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{inv.invoiceNo}</div>
                        <div className="text-xs text-slate-500">{invoiceDateForDisplay(inv)}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{inv.eventName ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {inv.billingName ?? inv.studentName ?? "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{formatMoney(inv.periodNet ?? inv.amount)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${COLLECTION_TIER_BADGE_CLASS[tier]}`}
                        >
                          {COLLECTION_TIER_LABELS[tier]}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-nowrap items-center justify-end gap-0.5">
                          <IconActionButton
                            label="View invoice"
                            icon={<EyeIcon />}
                            onClick={() => void handleViewInvoice(inv)}
                            loading={viewInvoiceLoadingId === inv.id}
                            className="text-slate-600 hover:text-slate-900"
                          />
                          <IconActionButton
                            label="Download PDF"
                            icon={<DownloadIcon />}
                            onClick={() => void handleDownloadInvoice(inv)}
                            loading={pdfDownloadingId === inv.id}
                            className="text-slate-600 hover:text-slate-900"
                          />
                          {inv.status === "pending" && (
                            <>
                              <IconActionButton
                                label="Record payment"
                                icon={<BanknotesIcon />}
                                onClick={() => void handleRecordPayment(inv)}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              />
                              <IconActionButton
                                label="Mark as paid"
                                icon={<CheckCircleIcon />}
                                onClick={() => handleMarkAsPaid(inv)}
                                className="text-green-600 hover:text-green-800 hover:bg-green-50"
                              />
                            </>
                          )}
                          <IconActionButton
                            label="Delete invoice"
                            icon={<TrashIcon />}
                            onClick={() => handleDeleteClick(inv)}
                            disabled={isDeleting}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
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
              {filteredEventInvoices.map((inv) => {
                const tier = getInvoiceCollectionTier(inv);
                return (
                  <li
                    key={inv.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {inv.billingName ?? inv.studentName ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {inv.eventName ?? "Event"} · {inv.invoiceNo}
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
                      <p className="font-semibold text-slate-900 tabular-nums">
                        {formatMoney(inv.periodNet ?? inv.amount)}
                      </p>
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
                      {inv.status === "pending" && (
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
                          onClick={() => handleDeleteClick(inv)}
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
        variant="event"
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
          variant="event"
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
        onClose={() => setAlertModal((s) => ({ ...s, isOpen: false }))}
      />
      <ConfirmModal
        isOpen={deleteConfirm != null}
        message={
          deleteConfirm
            ? `Delete invoice ${deleteConfirm.invoiceNo}? Any payments recorded against it will be removed. The participant can be invoiced again. This cannot be undone.`
            : ""
        }
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
