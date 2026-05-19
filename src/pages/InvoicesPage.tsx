import { useState, FormEvent, useEffect, useMemo } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { Invoice, StudentAdditionalCharge, StudentFeeOverride } from "../types";
import BatchInvoicePanel from "../components/invoices/BatchInvoicePanel";
import {
  useGetInvoicesQuery,
  useGetStudentsQuery,
  useGetFeeStructuresQuery,
  useGetClassGroupsQuery,
  useAddInvoiceMutation,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useForceCloseInvoiceMutation,
} from "../services/api";
import { useAppSelector } from "../app/hooks";
import StudentExtraChargesPanel from "../components/students/StudentExtraChargesPanel";
import { buildInvoiceItems } from "../utils/buildInvoiceItems";
import { downloadInvoicePdf } from "../invoice/buildInvoicePdf";
import MonthMultiSelect from "../components/common/MonthMultiSelect";
import SearchableSelect from "../components/common/SearchableSelect";
import { academicYearStart, academicYearLabel, CALENDAR_MONTH_NAMES } from "../utils/academicYear";
import { formatBillingPeriodLabel, parseBillingMonths, sortBillingMonths } from "../utils/billingMonths";
import { getInitialCreateInvoiceForm, syncBillingFromInvoiceDate } from "../utils/invoiceDates";
import { suggestInvoiceNumber } from "../utils/suggestInvoiceNumber";
import {
  invoiceAmountDueNow,
  invoiceBroughtForwardInHeader,
  invoicePeriodSubtotal,
} from "../utils/invoiceBalance";
import { compareInvoicesByRollNo, compareRollNo } from "../utils/rollNo";

const INVOICE_LIST_PAGE_SIZE = 50;

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function invoiceMatchesMonthFilter(invoice: Invoice, selectedMonths: string[]): boolean {
  if (selectedMonths.length === 0) return true;
  const selected = new Set(selectedMonths.map((m) => m.toLowerCase()));
  return parseBillingMonths(invoice.month).some((m) => selected.has(m.toLowerCase()));
}

async function fetchInvoiceDetailById(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load invoice");
  }
  return res.json() as Promise<Invoice>;
}

function shortenHtmlErrorMessage(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  const pre = t.match(/<pre>([^<]*)<\/pre>/i);
  if (pre) return pre[1].trim();
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

function forceCloseErrorMessage(err: unknown): string {
  const fallback = "Could not close this balance.";
  if (typeof err !== "object" || err === null || !("status" in err)) return fallback;
  const e = err as { status: unknown; data?: unknown; error?: string };
  if (e.status === "FETCH_ERROR" && typeof e.error === "string") return e.error;
  if (e.status === "PARSING_ERROR") {
    if (typeof e.data === "string" && e.data.trim()) {
      return shortenHtmlErrorMessage(e.data);
    }
    if (typeof e.error === "string") return e.error;
  }
  if (typeof e.status === "number") {
    if (typeof e.data === "object" && e.data !== null && "error" in e.data) {
      return String((e.data as { error: string }).error);
    }
    if (typeof e.data === "string" && e.data.trim()) {
      return shortenHtmlErrorMessage(e.data);
    }
    if (e.status === 404) {
      return "Not found (404). Stop npm run dev, start it again (server now uses --watch so route changes apply). Confirm only one process uses port 4000.";
    }
    return `Request failed (${e.status}). ${fallback}`;
  }
  return fallback;
}

export default function InvoicesPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { data: invoices = [], isLoading, refetch: refetchInvoices } = useGetInvoicesQuery({});
  const sortedInvoices = useMemo(
    () => [...invoices].sort(compareInvoicesByRollNo),
    [invoices],
  );
  const [invoiceListSearch, setInvoiceListSearch] = useState("");
  const [invoiceListMonthFilter, setInvoiceListMonthFilter] = useState<string[]>([]);
  const [invoiceListPage, setInvoiceListPage] = useState(1);
  const filteredInvoices = useMemo(() => {
    const q = invoiceListSearch.trim().toLowerCase();
    return sortedInvoices.filter((inv) => {
      if (q) {
        const matchesSearch =
          (inv.studentName ?? "").toLowerCase().includes(q) ||
          String(inv.studentRollNo ?? "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      return invoiceMatchesMonthFilter(inv, invoiceListMonthFilter);
    });
  }, [sortedInvoices, invoiceListSearch, invoiceListMonthFilter]);
  const invoiceListTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / INVOICE_LIST_PAGE_SIZE));
  const invoiceListSafePage = Math.min(invoiceListPage, invoiceListTotalPages);
  const paginatedInvoices = useMemo(() => {
    const start = (invoiceListSafePage - 1) * INVOICE_LIST_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICE_LIST_PAGE_SIZE);
  }, [filteredInvoices, invoiceListSafePage]);
  const invoiceListHasFilters = Boolean(invoiceListSearch.trim() || invoiceListMonthFilter.length > 0);

  useEffect(() => {
    setInvoiceListPage(1);
  }, [invoiceListSearch, invoiceListMonthFilter]);

  useEffect(() => {
    if (invoiceListPage > invoiceListTotalPages) {
      setInvoiceListPage(invoiceListTotalPages);
    }
  }, [invoiceListPage, invoiceListTotalPages]);
  const { data: students = [] } = useGetStudentsQuery();
  const { data: feeStructures = [] } = useGetFeeStructuresQuery();
  const { data: classGroups = [] } = useGetClassGroupsQuery();
  const [invoiceMode, setInvoiceMode] = useState<"single" | "batch">("single");
  const [addInvoice, { isLoading: isSaving }] = useAddInvoiceMutation();
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation();
  const [deleteInvoice, { isLoading: isDeleting }] = useDeleteInvoiceMutation();
  const [forceCloseInvoice, { isLoading: isForceClosing }] = useForceCloseInvoiceMutation();

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: "error" | "warning" | "success" | "info" }>({ isOpen: false, message: "", type: "error" });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    invoiceId: null as number | null,
    invoiceIds: null as number[] | null,
  });
  const [batchDeleteMode, setBatchDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(new Set());
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState<any[]>([]);
  const [showViewInvoiceModal, setShowViewInvoiceModal] = useState(false);
  const [viewInvoiceDetail, setViewInvoiceDetail] = useState<Invoice | null>(null);
  const [viewInvoiceLoadingId, setViewInvoiceLoadingId] = useState<number | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<number | null>(null);
  const [viewReceipts, setViewReceipts] = useState<
    { id: number; totalAmount: number; paymentDate: string; remarks?: string; createdAt: string }[]
  >([]);
  const [viewReceiptsKey, setViewReceiptsKey] = useState(0);
  const [viewReceiptsLoading, setViewReceiptsLoading] = useState(false);
  const [deletingReceiptId, setDeletingReceiptId] = useState<number | null>(null);
  const [createPriorBalance, setCreatePriorBalance] = useState<number | null>(null);
  const [createPriorBalanceLoading, setCreatePriorBalanceLoading] = useState(false);

  const [form, setForm] = useState(getInitialCreateInvoiceForm);

  const [manualInvoiceLines, setManualInvoiceLines] = useState<{ key: string; description: string; amount: string }[]>([]);
  const [discountForm, setDiscountForm] = useState({ description: "", amount: "" });

  const selectedStudentId = form.studentId ? parseInt(form.studentId, 10) : 0;

  useEffect(() => {
    setManualInvoiceLines([]);
    setDiscountForm({ description: "", amount: "" });
    setCreatePriorBalance(null);
  }, [form.studentId]);

  useEffect(() => {
    const sid = form.studentId ? parseInt(form.studentId, 10) : NaN;
    const year = parseInt(form.year, 10);
    if (form.months.length === 0 || Number.isNaN(sid) || Number.isNaN(year)) {
      setCreatePriorBalance(null);
      return;
    }
    const priorMonth = sortBillingMonths(form.months, year)[0];
    let cancelled = false;
    setCreatePriorBalanceLoading(true);
    fetch(
      `/api/students/${sid}/prior-balance?month=${encodeURIComponent(priorMonth)}&year=${encodeURIComponent(String(year))}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) {
          setCreatePriorBalance(
            body && typeof body.priorBalance === "number" ? body.priorBalance : 0,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCreatePriorBalance(null);
      })
      .finally(() => {
        if (!cancelled) setCreatePriorBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.studentId, form.months, form.year]);

  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    remarks: "",
  });

  const [partialPaymentForm, setPartialPaymentForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    remarks: "",
  });

  const [forceCloseModal, setForceCloseModal] = useState<Invoice | null>(null);
  const [forceCloseDetail, setForceCloseDetail] = useState<Invoice | null>(null);
  const [forceCloseDetailLoading, setForceCloseDetailLoading] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState<"waive" | "bad_debt" | "other">("waive");
  const [forceCloseCustom, setForceCloseCustom] = useState("");

  const resetForm = () => {
    setForm(getInitialCreateInvoiceForm());
    setManualInvoiceLines([]);
    setDiscountForm({ description: "", amount: "" });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.studentId || !form.invoiceDate || form.months.length === 0 || !form.year || !form.dueDate) {
      setAlertModal({ isOpen: true, message: "Please fill in all required fields.", type: "warning" });
      return;
    }

    const student = students.find((s) => s.id === parseInt(form.studentId));
    if (!student) {
      setAlertModal({ isOpen: true, message: "Selected student not found.", type: "error" });
      return;
    }

    const feeStructure = feeStructures.find((fs) => fs.id === student.feeStructureId);
    if (!feeStructure) {
      setAlertModal({ isOpen: true, message: "Fee structure not found for this student.", type: "error" });
      return;
    }

    try {
      const studentId = parseInt(form.studentId);
      const currentYear = parseInt(form.year);

      const feeOverridesRes = await fetch(`/api/students/${studentId}/fee-overrides`);
      let feeOverrides: StudentFeeOverride[] = [];
      if (feeOverridesRes.ok) {
        const body = await feeOverridesRes.json();
        feeOverrides = Array.isArray(body) ? body : [];
      }

      let pastInvoices: Invoice[] = [];
      const pastInvRes = await fetch(`/api/invoices?studentId=${studentId}&includeItems=true`);
      if (pastInvRes.ok) {
        const body = await pastInvRes.json();
        pastInvoices = Array.isArray(body) ? body : [];
      }

      const chRes = await fetch(`/api/students/${studentId}/additional-charges`);
      let pendingAdditionalCharges: StudentAdditionalCharge[] = [];
      if (chRes.ok) {
        const body = await chRes.json();
        pendingAdditionalCharges = Array.isArray(body) ? body : [];
      }

      const billingMonths = sortBillingMonths(form.months, currentYear);
      const discDesc = discountForm.description.trim();
      const discAmt = parseFloat(discountForm.amount);
      const built = buildInvoiceItems({
        student,
        allStudents: students,
        feeStructure,
        billingMonths,
        year: currentYear,
        pastInvoices,
        feeOverrides,
        additionalCharges: pendingAdditionalCharges,
        manualLines: manualInvoiceLines
          .map((row) => ({
            description: row.description.trim(),
            amount: parseFloat(row.amount),
          }))
          .filter((row) => row.description && !Number.isNaN(row.amount) && row.amount > 0),
        discount:
          discDesc && !Number.isNaN(discAmt) && discAmt > 0
            ? { description: discDesc, amount: discAmt }
            : null,
      });

      if (!built.ok) {
        setAlertModal({ isOpen: true, message: built.reason, type: "warning" });
        return;
      }

      const invoiceNo = await suggestInvoiceNumber(studentId, form.invoiceDate);

      const invoiceData = {
        studentId,
        invoiceNo,
        month: built.monthField,
        year: currentYear,
        amount: built.periodNet,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate,
        remarks: form.remarks.trim(),
        items: built.items,
        createdBy: user?.id,
      };

      const created = await addInvoice(invoiceData).unwrap();
      const bf =
        created.priorBalance != null && created.priorBalance > 0
          ? ` Includes ${formatMoney(created.priorBalance)} brought forward from earlier unpaid invoices.`
          : "";
      setAlertModal({
        isOpen: true,
        message: `Invoice created successfully! Total due: ${formatMoney(created.amount ?? built.periodNet)}.${bf}`,
        type: "success",
      });
      resetForm();
    } catch (err: any) {
      const message = err?.data?.error || "Failed to create invoice. Please try again.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm({
      paymentDate: new Date().toISOString().split("T")[0],
      remarks: "",
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedInvoice) return;

    try {
      await updateInvoice({
        id: selectedInvoice.id,
        data: {
          status: "paid",
          paymentDate: paymentForm.paymentDate,
          remarks: paymentForm.remarks.trim() || selectedInvoice.remarks,
          createdBy: user?.id,
        },
      }).unwrap();
      setAlertModal({ isOpen: true, message: "Invoice marked as paid!", type: "success" });
      setShowPaymentModal(false);
      setSelectedInvoice(null);
    } catch (err: any) {
      const message = err?.data?.error || "Failed to update invoice.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleRecordPayment = async (invoice: Invoice) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`);
      const data = await response.json();
      
      setSelectedInvoice({ ...invoice, ...data });
      setPartialPaymentForm({
        amount: "",
        paymentDate: new Date().toISOString().split("T")[0],
        remarks: "",
      });
      setPaymentAllocations([]);
      setShowPartialPaymentModal(true);
    } catch (err) {
      setAlertModal({ isOpen: true, message: "Failed to load invoice details.", type: "error" });
    }
  };

  const calculateAllocation = async (amount: number) => {
    const sid = selectedInvoice?.studentId;
    if (!amount || amount <= 0 || !sid) {
      setPaymentAllocations([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/students/${sid}/payment-allocation-preview?amount=${encodeURIComponent(String(amount))}`,
      );
      if (!res.ok) {
        setPaymentAllocations([]);
        return;
      }
      const body = await res.json();
      setPaymentAllocations(Array.isArray(body.allocations) ? body.allocations : []);
    } catch {
      setPaymentAllocations([]);
    }
  };

  const handlePartialPaymentSubmit = async () => {
    if (!selectedInvoice) return;

    const amount = parseFloat(partialPaymentForm.amount);
    if (!amount || amount <= 0) {
      setAlertModal({ isOpen: true, message: "Please enter a valid payment amount.", type: "warning" });
      return;
    }

    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentDate: partialPaymentForm.paymentDate,
          remarks: partialPaymentForm.remarks.trim(),
          createdBy: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record payment');
      }

      const result = await response.json();

      setAlertModal({
        isOpen: true,
        message:
          result.status === "paid"
            ? "Payment recorded. This invoice is fully paid."
            : `Payment recorded. Allocated Rs ${Number(result.totalAllocated ?? 0).toLocaleString()} across invoice line items (see preview rules).`,
        type: "success",
      });
      
      setShowPartialPaymentModal(false);
      setSelectedInvoice(null);
      setPaymentAllocations([]);
      void refetchInvoices();
      if (viewInvoiceDetail?.id === selectedInvoice.id) {
        try {
          const detail = await fetchInvoiceDetailById(selectedInvoice.id);
          setViewInvoiceDetail(detail);
          setViewReceiptsKey((k) => k + 1);
        } catch {
          /* view modal can be closed */
        }
      }
    } catch (err: any) {
      const message = err?.message || "Failed to record payment.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  useEffect(() => {
    if (!viewInvoiceDetail?.id) {
      setViewReceipts([]);
      return;
    }
    let cancelled = false;
    setViewReceiptsLoading(true);
    fetch(`/api/invoices/${viewInvoiceDetail.id}/payments`)
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
  }, [viewInvoiceDetail?.id, viewReceiptsKey]);

  useEffect(() => {
    if (!forceCloseModal) {
      setForceCloseDetail(null);
      setForceCloseDetailLoading(false);
      return;
    }
    setForceCloseReason("waive");
    setForceCloseCustom("");
    let cancelled = false;
    setForceCloseDetailLoading(true);
    fetchInvoiceDetailById(forceCloseModal.id)
      .then((d) => {
        if (!cancelled) setForceCloseDetail(d);
      })
      .catch(() => {
        if (!cancelled) setForceCloseDetail(null);
      })
      .finally(() => {
        if (!cancelled) setForceCloseDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forceCloseModal]);

  const unpaidOnThisInvoiceForForceClose =
    forceCloseDetail != null
      ? Math.round(((forceCloseDetail.grandDue ?? 0) - (forceCloseDetail.priorBalance ?? 0)) * 100) / 100
      : 0;

  const handleForceCloseSubmit = async () => {
    if (!forceCloseModal) return;
    if (forceCloseReason === "other" && !forceCloseCustom.trim()) {
      setAlertModal({ isOpen: true, message: 'Please enter a reason for "Other".', type: "warning" });
      return;
    }
    const closedId = forceCloseModal.id;
    try {
      await forceCloseInvoice({
        id: closedId,
        reasonCode: forceCloseReason,
        customReason: forceCloseReason === "other" ? forceCloseCustom.trim() : undefined,
        createdBy: user?.id ?? undefined,
      }).unwrap();
      setForceCloseModal(null);
      setAlertModal({
        isOpen: true,
        message:
          "Remaining balance on this invoice was closed. A discount line was added and will appear on the student fee ledger.",
        type: "success",
      });
      void refetchInvoices();
      if (viewInvoiceDetail?.id === closedId) {
        try {
          const d = await fetchInvoiceDetailById(closedId);
          setViewInvoiceDetail(d);
          setViewReceiptsKey((k) => k + 1);
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      setAlertModal({ isOpen: true, message: forceCloseErrorMessage(err), type: "error" });
    }
  };

  const closeConfirmModal = () => {
    setConfirmModal({ isOpen: false, message: "", invoiceId: null, invoiceIds: null });
  };

  const exitBatchDeleteMode = () => {
    setBatchDeleteMode(false);
    setSelectedDeleteIds(new Set());
  };

  const toggleDeleteSelection = (id: number) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllForDelete = () => {
    setSelectedDeleteIds(new Set(filteredInvoices.map((inv) => inv.id)));
  };

  const handleDeleteClick = (invoice: Invoice) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete invoice ${invoice.invoiceNo}? Any fee receipts applied to this invoice will have those amounts removed from the receipt (remaining parts stay on other invoices if the receipt was split). This cannot be undone.`,
      invoiceId: invoice.id,
      invoiceIds: null,
    });
  };

  const handleBatchDeleteClick = () => {
    const ids = [...selectedDeleteIds];
    if (ids.length === 0) return;
    const labels = invoices
      .filter((inv) => selectedDeleteIds.has(inv.id))
      .map((inv) => inv.invoiceNo)
      .slice(0, 5);
    const more = ids.length > 5 ? ` and ${ids.length - 5} more` : "";
    setConfirmModal({
      isOpen: true,
      message: `Delete ${ids.length} invoice(s) (${labels.join(", ")}${more})? Any linked receipt amounts will be adjusted. This cannot be undone.`,
      invoiceId: null,
      invoiceIds: ids,
    });
  };

  const handleDeleteConfirm = async () => {
    const batchIds = confirmModal.invoiceIds;
    if (batchIds && batchIds.length > 0) {
      let deleted = 0;
      const failed: string[] = [];
      for (const id of batchIds) {
        const inv = invoices.find((i) => i.id === id);
        try {
          await deleteInvoice(id).unwrap();
          deleted += 1;
        } catch (err: unknown) {
          const msg =
            err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
              ? String((err.data as { error?: string }).error)
              : "Failed";
          failed.push(inv ? `${inv.invoiceNo}: ${msg}` : `ID ${id}: ${msg}`);
        }
      }
      exitBatchDeleteMode();
      void refetchInvoices();
      if (failed.length === 0) {
        setAlertModal({
          isOpen: true,
          message: `Deleted ${deleted} invoice(s) successfully.`,
          type: "success",
        });
      } else {
        setAlertModal({
          isOpen: true,
          message: `Deleted ${deleted} invoice(s). ${failed.length} failed: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`,
          type: "warning",
        });
      }
    } else if (confirmModal.invoiceId) {
      try {
        await deleteInvoice(confirmModal.invoiceId).unwrap();
        setAlertModal({ isOpen: true, message: "Invoice deleted successfully!", type: "success" });
        void refetchInvoices();
      } catch (err: unknown) {
        const message =
          err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
            ? String((err.data as { error?: string }).error)
            : "Failed to delete invoice.";
        setAlertModal({ isOpen: true, message, type: "error" });
      }
    }
    closeConfirmModal();
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
      const message = err instanceof Error ? err.message : "Failed to load invoice.";
      setAlertModal({ isOpen: true, message, type: "error" });
    } finally {
      setViewInvoiceLoadingId(null);
    }
  };

  const handleDeleteReceiptFromView = async (feePaymentId: number) => {
    if (
      !window.confirm(
        "Delete this entire receipt? All allocations on every invoice linked to this receipt will be reversed.",
      )
    ) {
      return;
    }
    if (!viewInvoiceDetail?.id) return;
    setDeletingReceiptId(feePaymentId);
    try {
      const res = await fetch(`/api/fee-payments/${feePaymentId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to delete receipt");
      }
      const detail = await fetchInvoiceDetailById(viewInvoiceDetail.id);
      setViewInvoiceDetail(detail);
      setViewReceiptsKey((k) => k + 1);
      void refetchInvoices();
      setAlertModal({ isOpen: true, message: "Receipt deleted. Balances updated.", type: "success" });
    } catch (e: unknown) {
      setAlertModal({
        isOpen: true,
        message: e instanceof Error ? e.message : "Could not delete receipt.",
        type: "error",
      });
    } finally {
      setDeletingReceiptId(null);
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    setPdfDownloadingId(invoice.id);
    try {
      const detail = await fetchInvoiceDetailById(invoice.id);
      downloadInvoicePdf(detail);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to download invoice.";
      setAlertModal({ isOpen: true, message, type: "error" });
    } finally {
      setPdfDownloadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "bg-amber-100 text-amber-800",
      paid: "bg-green-100 text-green-800",
      overdue: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const months = [...CALENDAR_MONTH_NAMES];

  const activeStudentOptions = useMemo(() => {
    return [...students]
      .filter((s) => s.status === "active")
      .sort((a, b) => compareRollNo(a.rollNo, b.rollNo))
      .map((student) => {
        const feeStructure = feeStructures.find((fs) => fs.id === student.feeStructureId);
        let totalFee = feeStructure?.monthlyFee || 0;
        if (feeStructure?.registrationFee) {
          totalFee += feeStructure.registrationFeeInstallments
            ? feeStructure.registrationFee / feeStructure.registrationFeeInstallments
            : feeStructure.registrationFee;
        }
        if (feeStructure?.annualCharges) {
          totalFee += feeStructure.annualChargesInstallments
            ? feeStructure.annualCharges / feeStructure.annualChargesInstallments
            : feeStructure.annualCharges;
        }
        return {
          value: String(student.id),
          label: `${student.name} - ${student.rollNo} (Total: Rs ${totalFee.toLocaleString()})`,
          searchText: `${student.name} ${student.rollNo}`,
        };
      });
  }, [students, feeStructures]);

  const invoiceStudent = form.studentId ? students.find((s) => s.id === selectedStudentId) : undefined;
  const invoiceFeePlan = invoiceStudent ? feeStructures.find((f) => f.id === invoiceStudent.feeStructureId) : undefined;
  const planMealsDefault =
    invoiceFeePlan?.meals != null && invoiceFeePlan.meals > 0 ? invoiceFeePlan.meals : 0;

  const formYearNum = parseInt(form.year, 10);
  const invoicePeriodAcademicLabel =
    form.months.length > 0 && !Number.isNaN(formYearNum)
      ? academicYearLabel(academicYearStart(sortBillingMonths(form.months, formYearNum)[0], formYearNum))
      : null;

  if (isLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setInvoiceMode("single")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            invoiceMode === "single"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Single student
        </button>
        <button
          type="button"
          onClick={() => setInvoiceMode("batch")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            invoiceMode === "batch"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Batch billing
        </button>
      </div>

      {invoiceMode === "batch" ? (
        <SectionCard title="Batch billing" collapsible defaultCollapsed>
          <BatchInvoicePanel
            students={students}
            feeStructures={feeStructures}
            classGroups={classGroups}
            invoices={sortedInvoices}
            onNotify={(message, type) => setAlertModal({ isOpen: true, message, type })}
            onComplete={() => void refetchInvoices()}
          />
        </SectionCard>
      ) : (
      <SectionCard title="Create Invoice" collapsible defaultCollapsed>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong>Automatic rules:</strong> Monthly fee is added for each billing month you select.{" "}
            Students in the same household with sibling discount enabled get a fixed monthly rate (before/after lines)
            when at least two household members are active and the invoice period is on or after the configured start
            month.{" "}
            <strong>Registration</strong> is added only until the number of registration installment lines from your fee
            plan is reached (if installments = 1, only the first invoice gets it).{" "}
            <strong>Annual</strong> is once per <strong>August–July</strong> school year
            {invoicePeriodAcademicLabel ? (
              <>
                {" "}
                (this invoice falls in <strong>{invoicePeriodAcademicLabel}</strong>)
              </>
            ) : null}
            , with up to your plan’s annual installment count spread across invoices in that same year.{" "}
            <strong>Brought forward:</strong> if this student has unpaid amounts on invoices for earlier months, that
            balance is added to the new invoice total automatically.
          </p>
          {form.studentId && form.months.length > 0 && form.year && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                createPriorBalance != null && createPriorBalance > 0
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {createPriorBalanceLoading ? (
                <span>Checking prior balance…</span>
              ) : createPriorBalance != null && createPriorBalance > 0 ? (
                <span>
                  <strong>Brought forward:</strong> {formatMoney(createPriorBalance)} from earlier unpaid invoices will
                  be added to this invoice&apos;s total (on top of the charges below).
                </span>
              ) : createPriorBalance === 0 ? (
                <span>No brought forward — earlier invoices for this student are fully paid.</span>
              ) : null}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Student <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={form.studentId}
                onChange={(studentId) => setForm({ ...form, studentId })}
                options={activeStudentOptions}
                placeholder="Select student"
                searchPlaceholder="Search by name or roll no…"
                emptyMessage="No students match your search."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Invoice date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => {
                  const invoiceDate = e.target.value;
                  const synced = syncBillingFromInvoiceDate(invoiceDate, form);
                  setForm({
                    ...form,
                    invoiceDate,
                    ...(synced ?? {}),
                  });
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Sets billing month and due date (10th of that month). You can still add more billing months below.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Billing months <span className="text-red-500">*</span>
              </label>
              <MonthMultiSelect
                months={months}
                selected={form.months}
                onChange={(next) => {
                  const y = parseInt(form.year, 10);
                  setForm({
                    ...form,
                    months: Number.isNaN(y) ? next : sortBillingMonths(next, y),
                  });
                }}
                placeholder="Select month(s)"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Select one or more months; each month adds its monthly fee to this invoice.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Year <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {form.studentId && (
            <>
              <StudentExtraChargesPanel
                studentId={selectedStudentId}
                planMealsDefault={planMealsDefault}
                onNotify={(message, type) => setAlertModal({ isOpen: true, message, type })}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">One-off charges (this invoice only)</h3>
                <p className="text-xs text-slate-500">
                  For ad-hoc items you do not need to save on the student (e.g. a single picnic fee this month).
                </p>
                <div className="space-y-2">
                  {manualInvoiceLines.map((row) => (
                    <div key={row.key} className="flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) =>
                          setManualInvoiceLines((lines) =>
                            lines.map((l) => (l.key === row.key ? { ...l, description: e.target.value } : l)),
                          )
                        }
                        placeholder="Description"
                        className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          setManualInvoiceLines((lines) =>
                            lines.map((l) => (l.key === row.key ? { ...l, amount: e.target.value } : l)),
                          )
                        }
                        placeholder="Rs"
                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setManualInvoiceLines((lines) => lines.filter((l) => l.key !== row.key))}
                        className="text-xs text-red-600 font-medium px-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setManualInvoiceLines((lines) => [
                        ...lines,
                        { key: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, description: "", amount: "" },
                      ])
                    }
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    + Add one-off line
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Discount (this invoice only)</h3>
                <p className="text-xs text-slate-500">
                  Optional. Not saved on the student — only reduces this invoice&apos;s total.
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 items-end">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Reason / label</label>
                    <input
                      type="text"
                      value={discountForm.description}
                      onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. Sibling discount, Early payment"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amount (Rs)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountForm.amount}
                      onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Creating..." : "Create Invoice"}
          </button>
        </form>
      </SectionCard>
      )}

      <SectionCard title="Invoices List" subtitle="Sorted by roll number (low to high)">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by name or roll no…"
              value={invoiceListSearch}
              onChange={(e) => setInvoiceListSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {invoiceListSearch && (
              <button
                type="button"
                onClick={() => setInvoiceListSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="w-full min-w-[200px] max-w-xs sm:w-auto">
          
            <MonthMultiSelect
              months={months}
              selected={invoiceListMonthFilter}
              onChange={setInvoiceListMonthFilter}
              placeholder="All months"
            />
          </div>
          {invoiceListHasFilters && (
            <span className="text-xs text-slate-500 pb-2">
              {filteredInvoices.length} of {sortedInvoices.length} shown
            </span>
          )}
          </div>
          <div className="flex flex-wrap items-center gap-3 ml-auto shrink-0">
          {!batchDeleteMode ? (
            <button
              type="button"
              onClick={() => setBatchDeleteMode(true)}
              disabled={sortedInvoices.length === 0}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batch delete
            </button>
          ) : (
            <>
              <span className="text-sm text-slate-600">
                {selectedDeleteIds.size} of {filteredInvoices.length} selected
              </span>
              <button
                type="button"
                onClick={selectAllForDelete}
                className="text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedDeleteIds(new Set())}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={handleBatchDeleteClick}
                disabled={selectedDeleteIds.size === 0 || isDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting…" : `Delete selected (${selectedDeleteIds.size})`}
              </button>
              <button
                type="button"
                onClick={exitBatchDeleteMode}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-600">
                {batchDeleteMode && <th className="pb-3 w-10" />}
                <th className="pb-3">Invoice No.</th>
                <th className="pb-3">Student</th>
                <th className="pb-3">Roll No.</th>
                <th className="pb-3">Period</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Due Date</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={batchDeleteMode ? 9 : 8} className="py-8 text-center text-sm text-slate-500">
                    {invoiceListHasFilters
                      ? "No invoices match your filters."
                      : "No invoices found. Create your first invoice above."}
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={`border-b border-slate-100 text-sm ${
                      batchDeleteMode && selectedDeleteIds.has(invoice.id) ? "bg-red-50/50" : ""
                    }`}
                  >
                    {batchDeleteMode && (
                      <td className="py-3 pl-1">
                        <input
                          type="checkbox"
                          checked={selectedDeleteIds.has(invoice.id)}
                          onChange={() => toggleDeleteSelection(invoice.id)}
                          className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                          aria-label={`Select ${invoice.invoiceNo} for deletion`}
                        />
                      </td>
                    )}
                    <td className="py-3 font-medium">{invoice.invoiceNo}</td>
                    <td className="py-3">{invoice.studentName}</td>
                    <td className="py-3">{invoice.studentRollNo}</td>
                    <td className="py-3">{formatBillingPeriodLabel(invoice.month, invoice.year)}</td>
                    <td className="py-3">Rs {invoice.amount.toLocaleString()}</td>
                    <td className="py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadge(invoice.status)}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          type="button"
                          onClick={() => void handleViewInvoice(invoice)}
                          disabled={viewInvoiceLoadingId === invoice.id}
                          className="text-slate-700 hover:text-slate-900 text-sm font-medium disabled:opacity-50"
                        >
                          {viewInvoiceLoadingId === invoice.id ? "…" : "View"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadInvoice(invoice)}
                          disabled={pdfDownloadingId === invoice.id}
                          className="text-slate-700 hover:text-slate-900 text-sm font-medium disabled:opacity-50"
                        >
                          {pdfDownloadingId === invoice.id ? "…" : "Download PDF"}
                        </button>
                        {invoice.status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRecordPayment(invoice)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Record Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkAsPaid(invoice)}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Mark Paid
                            </button>
                            <button
                              type="button"
                              onClick={() => setForceCloseModal(invoice)}
                              className="text-amber-700 hover:text-amber-900 text-sm font-medium"
                            >
                              Close balance
                            </button>
                          </>
                        )}
                        {!batchDeleteMode && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(invoice)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            disabled={isDeleting}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredInvoices.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              Showing {(invoiceListSafePage - 1) * INVOICE_LIST_PAGE_SIZE + 1}–
              {Math.min(invoiceListSafePage * INVOICE_LIST_PAGE_SIZE, filteredInvoices.length)} of{" "}
              {filteredInvoices.length}
              {invoiceListHasFilters ? ` (filtered from ${sortedInvoices.length})` : ""}
            </p>
            {invoiceListTotalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceListPage((p) => Math.max(1, p - 1))}
                  disabled={invoiceListSafePage <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600 tabular-nums">
                  Page {invoiceListSafePage} of {invoiceListTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setInvoiceListPage((p) => Math.min(invoiceListTotalPages, p + 1))}
                  disabled={invoiceListSafePage >= invoiceListTotalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-xl border border-slate-200 bg-white p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Mark Invoice as Paid</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
                <textarea
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePaymentSubmit}
                  disabled={isUpdating}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdating ? "Updating..." : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPartialPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-xl border border-slate-200 bg-white p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Record Payment for Invoice {selectedInvoice.invoiceNo}</h3>
            
            <div className="mb-4 p-3 bg-blue-50 rounded-lg space-y-1">
              <div className="text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Invoice total (incl. brought forward at issue):</span>
                  <span className="font-semibold">Rs {selectedInvoice.amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.grandDue != null && (
                  <div className="flex justify-between text-slate-600">
                    <span>Amount due now (prior balance + this period unpaid):</span>
                    <span className="font-semibold">Rs {Number(selectedInvoice.grandDue).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-snug">
                Receipts apply to the <strong>oldest unpaid invoice first</strong>, then by fee priority (registration →
                annual → monthly → meals → other) within each invoice.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Payment Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={partialPaymentForm.amount}
                    onChange={(e) => {
                      setPartialPaymentForm({ ...partialPaymentForm, amount: e.target.value });
                      void calculateAllocation(parseFloat(e.target.value) || 0);
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={partialPaymentForm.paymentDate}
                    onChange={(e) => setPartialPaymentForm({ ...partialPaymentForm, paymentDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
                <textarea
                  value={partialPaymentForm.remarks}
                  onChange={(e) => setPartialPaymentForm({ ...partialPaymentForm, remarks: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {paymentAllocations.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Payment Allocation Preview</h4>
                  <div className="space-y-2">
                    {paymentAllocations.map((allocation, idx) => (
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
                          {(allocation.remainingOnLine ?? allocation.remaining) > 0 && (
                            <div className="text-xs text-amber-600">
                              Remaining on line: Rs{" "}
                              {Number(allocation.remainingOnLine ?? allocation.remaining).toLocaleString()}
                            </div>
                          )}
                          {(allocation.remainingOnLine ?? allocation.remaining) === 0 && (
                            <div className="text-xs text-green-600">Line cleared</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-600">
                    Oldest billing period is paid first; within each invoice, charges follow the priority above.
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPartialPaymentModal(false);
                    setPaymentAllocations([]);
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePartialPaymentSubmit}
                  disabled={!partialPaymentForm.amount || parseFloat(partialPaymentForm.amount) <= 0}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {forceCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Close remaining balance</h3>
            <p className="mt-1 text-sm text-slate-600">
              Invoice <span className="font-medium text-slate-900">{forceCloseModal.invoiceNo}</span> ·{" "}
              {formatBillingPeriodLabel(forceCloseModal.month, forceCloseModal.year)}
            </p>
            <p className="mt-3 text-sm text-slate-700">
              This records a <strong>discount</strong> for the full unpaid amount on <em>this invoice only</em> (no
              change to future fee rules). The student ledger will show a separate discount line.
            </p>
            {forceCloseDetailLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading invoice…</p>
            ) : forceCloseDetail == null ? (
              <p className="mt-4 text-sm text-red-600">Could not load invoice details.</p>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">Unpaid on this invoice</span>
                  <span className="font-semibold text-slate-900">{formatMoney(unpaidOnThisInvoiceForForceClose)}</span>
                </div>
                {unpaidOnThisInvoiceForForceClose <= 0.01 && (
                  <p className="mt-2 text-xs text-amber-800">Nothing to write off on this invoice.</p>
                )}
              </div>
            )}
            <div className="mt-5 space-y-3">
              <span className="text-sm font-medium text-slate-700">Reason</span>
              <div className="space-y-2 text-sm">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="fcReason"
                    checked={forceCloseReason === "waive"}
                    onChange={() => setForceCloseReason("waive")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Waiver / concession</span>
                    <span className="block text-slate-600 text-xs">Goodwill or agreed discount after billing.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="fcReason"
                    checked={forceCloseReason === "bad_debt"}
                    onChange={() => setForceCloseReason("bad_debt")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Bad debt</span>
                    <span className="block text-slate-600 text-xs">Student left or not expected to pay.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="fcReason"
                    checked={forceCloseReason === "other"}
                    onChange={() => setForceCloseReason("other")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Other</span>
                    <span className="block text-slate-600 text-xs">Describe the closure (shown on the ledger).</span>
                  </span>
                </label>
              </div>
              {forceCloseReason === "other" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    value={forceCloseCustom}
                    onChange={(e) => setForceCloseCustom(e.target.value)}
                    rows={2}
                    placeholder="e.g. Administrative adjustment"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setForceCloseModal(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleForceCloseSubmit()}
                disabled={
                  isForceClosing ||
                  forceCloseDetailLoading ||
                  !forceCloseDetail ||
                  unpaidOnThisInvoiceForForceClose <= 0.01
                }
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isForceClosing ? "Saving…" : "Confirm close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="rounded-xl border border-slate-200 bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Invoice details</h3>
              <button
                type="button"
                onClick={() => {
                  setShowViewInvoiceModal(false);
                  setViewInvoiceDetail(null);
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="p-5">
              {!viewInvoiceDetail ? (
                <p className="text-center text-slate-500 py-10">Loading invoice…</p>
              ) : (
                <>
                  <div className="space-y-1 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">{viewInvoiceDetail.invoiceNo}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {formatBillingPeriodLabel(viewInvoiceDetail.month, viewInvoiceDetail.year)}
                      </span>
                    </p>
                    <p>
                      Due {new Date(viewInvoiceDetail.dueDate).toLocaleDateString()} ·{" "}
                      <span className="capitalize font-medium">{viewInvoiceDetail.status}</span>
                    </p>
                    <p>
                      {viewInvoiceDetail.studentName} ({viewInvoiceDetail.studentRollNo})
                      {viewInvoiceDetail.classGroupName ? ` · ${viewInvoiceDetail.classGroupName}` : ""}
                    </p>
                    {viewInvoiceDetail.parentsName && (
                      <p className="text-slate-600">Parents: {viewInvoiceDetail.parentsName}</p>
                    )}
                    {viewInvoiceDetail.contactNo && (
                      <p className="text-slate-600">Contact: {viewInvoiceDetail.contactNo}</p>
                    )}
                    {viewInvoiceDetail.remarks && (
                      <p className="text-slate-600 mt-2">Remarks: {viewInvoiceDetail.remarks}</p>
                    )}
                  </div>
                  <table className="w-full mt-6 text-sm border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium text-right">Type</th>
                        {(viewInvoiceDetail.items ?? []).some((x) => x.paidAmount != null && x.paidAmount > 0) && (
                          <th className="px-3 py-2 font-medium text-right">Paid</th>
                        )}
                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewInvoiceDetail.items ?? []).map((line) => (
                        <tr key={line.id ?? `${line.description}-${line.amount}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900">{line.description}</td>
                          <td className="px-3 py-2 text-right text-slate-500 capitalize">{line.type}</td>
                          {(viewInvoiceDetail.items ?? []).some((x) => x.paidAmount != null && x.paidAmount > 0) && (
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
                      <span>This period</span>
                      <span className="tabular-nums w-28">{formatMoney(invoicePeriodSubtotal(viewInvoiceDetail))}</span>
                    </div>
                    {invoiceBroughtForwardInHeader(viewInvoiceDetail) > 0.009 && (
                      <div className="flex justify-end gap-6 text-amber-900">
                        <span>Brought forward</span>
                        <span className="tabular-nums w-28 font-medium">
                          {formatMoney(invoiceBroughtForwardInHeader(viewInvoiceDetail))}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-end gap-6 text-base font-semibold text-slate-900 pt-1 border-t border-slate-200">
                      <span>Amount due now</span>
                      <span className="tabular-nums w-28">{formatMoney(invoiceAmountDueNow(viewInvoiceDetail))}</span>
                    </div>
                    {Math.abs(viewInvoiceDetail.amount - invoiceAmountDueNow(viewInvoiceDetail)) > 0.02 && (
                      <p className="text-xs text-slate-500 mt-1">
                        Invoice total at issue was {formatMoney(viewInvoiceDetail.amount)}; it updates when earlier
                        periods are paid or written off.
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
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <div>
                              <span className="font-medium text-slate-900">Receipt #{r.id}</span>
                              <span className="text-slate-500">
                                {" "}
                                · {r.paymentDate} · {formatMoney(r.totalAmount)}
                              </span>
                              {r.remarks ? (
                                <span className="block text-xs text-slate-500 mt-0.5">{r.remarks}</span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteReceiptFromView(r.id)}
                              disabled={deletingReceiptId === r.id}
                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                            >
                              {deletingReceiptId === r.id ? "Removing…" : "Delete receipt"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Deleting a receipt reverses its full amount everywhere it was applied. To delete only this
                      invoice, use <strong>Delete invoice</strong> on the list — linked receipt portions are removed
                      automatically.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => void handleDownloadInvoice(viewInvoiceDetail)}
                      disabled={pdfDownloadingId === viewInvoiceDetail.id}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {pdfDownloadingId === viewInvoiceDetail.id ? "Preparing…" : "Download PDF"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    PDF uses your letterhead from{" "}
                    <code className="rounded bg-slate-100 px-1">src/invoice/schoolLetterhead.ts</code> — edit that file
                    to match your school.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false, message: "", type: "error" })}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleDeleteConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  );
}
