import { useMemo, useState } from "react";
import MonthMultiSelect from "../common/MonthMultiSelect";
import ConfirmModal from "../common/ConfirmModal";
import type { ClassGroup, FeeStructure, Invoice, Student, StudentAdditionalCharge, StudentFeeOverride } from "../../types";
import { CALENDAR_MONTH_NAMES } from "../../utils/academicYear";
import { formatBillingPeriodLabel, sortBillingMonths } from "../../utils/billingMonths";
import { billingDefaultsFromInvoiceDate, syncBillingFromInvoiceDate, todayYmd } from "../../utils/invoiceDates";
import { buildInvoiceItems } from "../../utils/buildInvoiceItems";
import {
  BATCH_ELIGIBILITY_LABELS,
  getBatchStudentEligibility,
  type BatchStudentEligibility,
} from "../../utils/batchInvoiceEligibility";
import { suggestInvoiceNumber } from "../../utils/suggestInvoiceNumber";
import { useAddInvoiceMutation } from "../../services/api";
import { useAppSelector } from "../../app/hooks";
import BatchStudentExtrasToggles from "./BatchStudentExtrasToggles";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type BatchResultRow = {
  studentId: number;
  studentName: string;
  rollNo: string;
  status: "created" | "skipped" | "failed";
  message: string;
  invoiceNo?: string;
  amount?: number;
};

type Props = {
  students: Student[];
  feeStructures: FeeStructure[];
  classGroups: ClassGroup[];
  invoices: Invoice[];
  onNotify: (message: string, type: "error" | "warning" | "success" | "info") => void;
  onComplete: () => void;
};

export default function BatchInvoicePanel({
  students,
  feeStructures,
  classGroups,
  invoices,
  onNotify,
  onComplete,
}: Props) {
  const user = useAppSelector((s) => s.auth.user);
  const [addInvoice] = useAddInvoiceMutation();

  const initialBilling = billingDefaultsFromInvoiceDate(todayYmd())!;
  const [invoiceDate, setInvoiceDate] = useState(todayYmd());
  const [months, setMonths] = useState<string[]>(initialBilling.months);
  const [year, setYear] = useState(String(initialBilling.year));
  const [dueDate, setDueDate] = useState(initialBilling.dueDate);
  const [remarks, setRemarks] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: "" });
  const [results, setResults] = useState<BatchResultRow[] | null>(null);

  const yearNum = parseInt(year, 10);
  const billingMonths = useMemo(
    () => (Number.isNaN(yearNum) ? months : sortBillingMonths(months, yearNum)),
    [months, yearNum],
  );
  const periodLabel =
    billingMonths.length > 0 && !Number.isNaN(yearNum)
      ? formatBillingPeriodLabel(billingMonths.join(", "), yearNum)
      : null;

  const invoicesByStudent = useMemo(() => {
    const map = new Map<number, Invoice[]>();
    for (const inv of invoices) {
      const list = map.get(inv.studentId) ?? [];
      list.push(inv);
      map.set(inv.studentId, list);
    }
    return map;
  }, [invoices]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => {
        if (classFilter && String(s.classGroupId) !== classFilter) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.rollNo.toLowerCase().includes(q) ||
          (s.classGroupName ?? "").toLowerCase().includes(q)
        );
      })
      .map((student) => {
        const eligibility: BatchStudentEligibility | null =
          billingMonths.length === 0 || Number.isNaN(yearNum)
            ? null
            : getBatchStudentEligibility(
                student,
                feeStructures,
                invoicesByStudent.get(student.id) ?? [],
                billingMonths,
                yearNum,
              );
        return { student, eligibility };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [students, classFilter, search, billingMonths, yearNum, feeStructures, invoicesByStudent]);

  const eligibleIds = useMemo(
    () => rows.filter((r) => r.eligibility === "ready").map((r) => r.student.id),
    [rows],
  );

  const stats = useMemo(() => {
    const counts = { ready: 0, already_billed: 0, no_fee_structure: 0, inactive: 0 };
    for (const r of rows) {
      if (r.eligibility) counts[r.eligibility] += 1;
    }
    return counts;
  }, [rows]);

  const toggleStudent = (id: number, eligibility: BatchStudentEligibility | null) => {
    if (eligibility !== "ready") return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEligible = () => setSelectedIds(new Set(eligibleIds));
  const clearSelection = () => setSelectedIds(new Set());

  const runBatch = async () => {
    setShowConfirm(false);
    if (selectedIds.size === 0 || !invoiceDate || billingMonths.length === 0 || !dueDate || Number.isNaN(yearNum))
      return;

    const ids = [...selectedIds];
    setIsRunning(true);
    setProgress({ done: 0, total: ids.length, currentName: "" });
    setResults(null);

    const batchResults: BatchResultRow[] = [];

    try {
      const prepared = await Promise.all(
        ids.map(async (studentId) => {
          const student = students.find((s) => s.id === studentId)!;
          const [overridesRes, chargesRes, pastRes] = await Promise.all([
            fetch(`/api/students/${studentId}/fee-overrides`),
            fetch(`/api/students/${studentId}/additional-charges`),
            fetch(`/api/invoices?studentId=${studentId}&includeItems=true`),
          ]);
          const feeOverrides: StudentFeeOverride[] = overridesRes.ok
            ? await overridesRes.json()
            : [];
          const additionalCharges: StudentAdditionalCharge[] = chargesRes.ok
            ? await chargesRes.json()
            : [];
          const pastInvoices: Invoice[] = pastRes.ok ? await pastRes.json() : [];
          return { student, feeOverrides, additionalCharges, pastInvoices };
        }),
      );

      for (let i = 0; i < prepared.length; i++) {
        const { student, feeOverrides, additionalCharges, pastInvoices } = prepared[i];
        setProgress({ done: i, total: ids.length, currentName: student.name });

        const feeStructure = feeStructures.find((f) => f.id === student.feeStructureId);
        if (!feeStructure) {
          batchResults.push({
            studentId: student.id,
            studentName: student.name,
            rollNo: student.rollNo,
            status: "skipped",
            message: "No fee structure assigned.",
          });
          continue;
        }

        const built = buildInvoiceItems({
          student,
          allStudents: students,
          feeStructure,
          billingMonths,
          year: yearNum,
          pastInvoices,
          feeOverrides,
          additionalCharges,
        });

        if (!built.ok) {
          batchResults.push({
            studentId: student.id,
            studentName: student.name,
            rollNo: student.rollNo,
            status: "skipped",
            message: built.reason,
          });
          continue;
        }

        try {
          const invoiceNo = await suggestInvoiceNumber(student.id, invoiceDate);
          const created = await addInvoice({
            studentId: student.id,
            invoiceNo,
            month: built.monthField,
            year: yearNum,
            amount: built.periodNet,
            invoiceDate,
            dueDate,
            remarks: remarks.trim(),
            items: built.items,
            createdBy: user?.id,
          }).unwrap();

          batchResults.push({
            studentId: student.id,
            studentName: student.name,
            rollNo: student.rollNo,
            status: "created",
            message: `Created — due ${formatMoney(created.amount ?? built.periodNet)}`,
            invoiceNo: created.invoiceNo,
            amount: created.amount ?? built.periodNet,
          });
        } catch (err: unknown) {
          const msg =
            err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
              ? String((err.data as { error?: string }).error)
              : "Failed to create invoice.";
          batchResults.push({
            studentId: student.id,
            studentName: student.name,
            rollNo: student.rollNo,
            status: "failed",
            message: msg,
          });
        }
      }

      setProgress({ done: ids.length, total: ids.length, currentName: "" });
      setResults(batchResults);
      onComplete();

      const created = batchResults.filter((r) => r.status === "created").length;
      const skipped = batchResults.filter((r) => r.status === "skipped").length;
      const failed = batchResults.filter((r) => r.status === "failed").length;
      onNotify(
        `Batch complete: ${created} created${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}.`,
        failed > 0 ? "warning" : created > 0 ? "success" : "info",
      );
      if (created > 0) clearSelection();
    } finally {
      setIsRunning(false);
    }
  };

  const eligibilityBadgeClass = (e: BatchStudentEligibility) => {
    switch (e) {
      case "ready":
        return "bg-emerald-100 text-emerald-800";
      case "already_billed":
        return "bg-amber-100 text-amber-800";
      case "no_fee_structure":
        return "bg-red-100 text-red-800";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const canSubmit =
    selectedIds.size > 0 &&
    invoiceDate &&
    billingMonths.length > 0 &&
    dueDate &&
    !Number.isNaN(yearNum) &&
    !isRunning;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 leading-relaxed">
        Generate invoices for many students in one run. Each student gets the same billing period and due date.
        Use the <strong>Extras</strong> toggles to include or pause monthly subscriptions (meals, therapy, etc.) before
        generating — same as single-student billing. Registration and annual charges follow the usual rules.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Invoice date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => {
              const nextDate = e.target.value;
              const synced = syncBillingFromInvoiceDate(nextDate, { months, year, dueDate });
              setInvoiceDate(nextDate);
              if (synced) {
                setMonths(synced.months);
                setYear(synced.year);
                setDueDate(synced.dueDate);
              }
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">Sets billing month and due date (10th of that month).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Billing months <span className="text-red-500">*</span>
          </label>
          <MonthMultiSelect
            months={CALENDAR_MONTH_NAMES}
            selected={months}
            onChange={(next) => {
              const y = parseInt(year, 10);
              setMonths(Number.isNaN(y) ? next : sortBillingMonths(next, y));
            }}
            placeholder="Select month(s)"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Year <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Due date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (all invoices)</label>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {periodLabel && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          Billing period: <strong>{periodLabel}</strong>
          <span className="text-blue-800 ml-2">
            · {stats.ready} ready · {stats.already_billed} already billed
            {stats.no_fee_structure > 0 ? ` · ${stats.no_fee_structure} no fee plan` : ""}
            {stats.inactive > 0 ? ` · ${stats.inactive} inactive` : ""}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or roll #…"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All classes</option>
          {classGroups.map((cg) => (
            <option key={cg.id} value={String(cg.id)}>
              {cg.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={selectAllEligible}
          disabled={eligibleIds.length === 0 || isRunning}
          className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
        >
          Select all ready ({eligibleIds.length})
        </button>
        <button
          type="button"
          onClick={clearSelection}
          disabled={selectedIds.size === 0 || isRunning}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          Clear selection
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="max-h-[min(420px,50vh)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="w-10 py-2.5 pl-3" />
                <th className="text-left py-2.5 font-semibold text-slate-700">Student</th>
                <th className="text-left py-2.5 font-semibold text-slate-700">Roll #</th>
                <th className="text-left py-2.5 font-semibold text-slate-700">Class</th>
                <th className="text-left py-2.5 font-semibold text-slate-700 min-w-[140px]">Extras</th>
                <th className="text-left py-2.5 pr-3 font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No students match your filters.
                  </td>
                </tr>
              ) : (
                rows.map(({ student, eligibility }) => {
                  const checked = selectedIds.has(student.id);
                  const canSelect = eligibility === "ready" && !isRunning;
                  return (
                    <tr
                      key={student.id}
                      className={`${checked ? "bg-blue-50/60" : ""} ${canSelect ? "hover:bg-slate-50 cursor-pointer" : "opacity-75"}`}
                      onClick={() => canSelect && toggleStudent(student.id, eligibility)}
                    >
                      <td className="py-2.5 pl-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canSelect}
                          onChange={() => toggleStudent(student.id, eligibility)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 font-medium text-slate-900">{student.name}</td>
                      <td className="py-2.5 text-slate-600">{student.rollNo}</td>
                      <td className="py-2.5 text-slate-600">{student.classGroupName ?? "—"}</td>
                      <td className="py-2.5 pr-1 align-top" onClick={(e) => e.stopPropagation()}>
                        <BatchStudentExtrasToggles
                          studentId={student.id}
                          disabled={isRunning}
                          onError={(message) => onNotify(message, "error")}
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        {eligibility ? (
                          <span
                            className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${eligibilityBadgeClass(eligibility)}`}
                          >
                            {BATCH_ELIGIBILITY_LABELS[eligibility]}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Set period above</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isRunning && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-700">
            <span>
              Generating… {progress.done} / {progress.total}
              {progress.currentName ? ` — ${progress.currentName}` : ""}
            </span>
            <span>{progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => setShowConfirm(true)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate {selectedIds.size} invoice{selectedIds.size === 1 ? "" : "s"}
        </button>
        <span className="text-sm text-slate-500">{selectedIds.size} selected</span>
      </div>

      {results && results.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900">Batch results</h3>
            <button
              type="button"
              onClick={() => setResults(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="text-left py-2 pl-4 font-medium text-slate-600">Student</th>
                  <th className="text-left py-2 font-medium text-slate-600">Outcome</th>
                  <th className="text-left py-2 pr-4 font-medium text-slate-600">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {results.map((r) => (
                  <tr key={r.studentId}>
                    <td className="py-2 pl-4">
                      {r.studentName}
                      <span className="text-slate-400 ml-1">({r.rollNo})</span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          r.status === "created"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {r.invoiceNo ? `${r.invoiceNo} · ` : ""}
                      {r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirm}
        message={
          periodLabel
            ? `Generate ${selectedIds.size} invoice(s) for ${periodLabel} with due date ${dueDate}? Students already billed or with no charges will be skipped during processing.`
            : `Generate ${selectedIds.size} invoice(s)?`
        }
        onConfirm={runBatch}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
