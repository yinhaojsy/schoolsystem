import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import StudentExtraChargesPanel from "../components/students/StudentExtraChargesPanel";
import type {
  Student,
  StudentFeeOverride,
  StudentFeeVersion,
  StudentLedgerResponse,
  CreateStudentFeeVersionPayload,
} from "../types";
import {
  useGetStudentsQuery,
  useGetFeeStructuresQuery,
  useDeleteStudentMutation,
  useGetStudentLedgerQuery,
  useGetStudentFeeVersionsQuery,
  useCreateStudentFeeVersionMutation,
} from "../services/api";

function formatRs(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function downloadLedgerCsv(ledger: StudentLedgerResponse) {
  const { student, lines, summary } = ledger;
  const rows: (string | number)[][] = [
    ["Student fee ledger"],
    ["Student", student.name],
    ["Roll no.", student.rollNo],
    ["Parents", student.parentsName || ""],
    ["Contact", student.contactNo || ""],
    ["Class", student.classGroupName || ""],
    [],
    ["Date", "Type", "Description", "Debit — charges (Rs)", "Credit — receipt / discount (Rs)", "Balance due (Rs)"],
    ...lines.map((L) => [
      L.date,
      L.transactionType === "invoice" ? "Invoice" : L.transactionType === "discount" ? "Discount" : "Receipt",
      L.description,
      L.invoiceDebit ?? "",
      L.paymentCredit ?? "",
      L.balanceAfter,
    ]),
    [],
    ["", "", "Net invoiced (all periods)", summary.totalInvoiced, "", ""],
    ["", "", "Total receipts (cash)", "", summary.totalPaid, ""],
    ["", "", "Balance due", "", "", summary.balance],
  ];
  const csv = "\ufeff" + rows.map((row) => (row.length ? row.map(csvCell).join(",") : "")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-${String(student.rollNo).replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StudentsListPage() {
  const navigate = useNavigate();
  const { data: students = [], isLoading } = useGetStudentsQuery();
  const { data: feeStructures = [] } = useGetFeeStructuresQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteStudent, { isLoading: isDeleting }] = useDeleteStudentMutation();

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: "error" | "warning" | "success" | "info" }>({ isOpen: false, message: "", type: "error" });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: "", studentId: null as number | null });
  const [showFeeOverrideModal, setShowFeeOverrideModal] = useState(false);
  const [ledgerStudentId, setLedgerStudentId] = useState<number | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [feeOverrides, setFeeOverrides] = useState<StudentFeeOverride[]>([]);
  const [overrideForm, setOverrideForm] = useState({
    chargeType: "registration" as "registration" | "annual" | "monthly",
    amount: "",
    isExempt: false,
    notes: "",
  });
  const [feeVersionExtrasDetail, setFeeVersionExtrasDetail] = useState<StudentFeeVersion | null>(null);
  const feeVersionExtrasDetailRef = useRef<StudentFeeVersion | null>(null);
  feeVersionExtrasDetailRef.current = feeVersionExtrasDetail;

  const {
    data: ledgerData,
    isLoading: isLedgerLoading,
    isError: isLedgerError,
    error: ledgerError,
  } = useGetStudentLedgerQuery(ledgerStudentId!, { skip: ledgerStudentId == null });

  const feeVersionsStudentId = showFeeOverrideModal && selectedStudent ? selectedStudent.id : -1;
  const { data: feeVersions = [], isLoading: isFeeVersionsLoading } = useGetStudentFeeVersionsQuery(
    feeVersionsStudentId,
    {
      skip: !showFeeOverrideModal || selectedStudent == null,
    },
  );

  const [createFeeVersion, { isLoading: isSavingFeeVersion }] = useCreateStudentFeeVersionMutation();

  const versionFormBootRef = useRef(false);
  const [newVersionForm, setNewVersionForm] = useState({
    monthlyFee: "",
    registrationFee: "",
    annualCharges: "",
    meals: "",
    registrationFeeInstallments: "",
    annualChargesInstallments: "",
    effectiveFrom: "",
    notes: "",
  });

  const handleEdit = (studentId: number) => {
    navigate(`/students?edit=${studentId}`);
  };

  const handleDeleteClick = (student: Student) => {
    setConfirmModal({
      isOpen: true,
      message: `Are you sure you want to delete ${student.name}?`,
      studentId: student.id,
    });
  };

  const handleDeleteConfirm = async () => {
    if (confirmModal.studentId) {
      try {
        await deleteStudent(confirmModal.studentId).unwrap();
        setAlertModal({ isOpen: true, message: "Student deleted successfully!", type: "success" });
      } catch (err: any) {
        const message = err?.data?.error || "Failed to delete student.";
        setAlertModal({ isOpen: true, message, type: "error" });
      }
    }
    setConfirmModal({ isOpen: false, message: "", studentId: null });
  };

  const handleManageFeeOverrides = async (student: Student) => {
    setSelectedStudent(student);
    try {
      const response = await fetch(`/api/students/${student.id}/fee-overrides`);
      const overrides = await response.json();
      setFeeOverrides(overrides);
      setShowFeeOverrideModal(true);
    } catch (err) {
      setAlertModal({ isOpen: true, message: "Failed to load fee overrides.", type: "error" });
    }
  };

  const handleSaveFeeOverride = async () => {
    if (!selectedStudent) return;

    if (!overrideForm.isExempt && !overrideForm.amount) {
      setAlertModal({ isOpen: true, message: "Please enter an amount or mark as exempt.", type: "warning" });
      return;
    }

    try {
      const response = await fetch(`/api/students/${selectedStudent.id}/fee-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chargeType: overrideForm.chargeType,
          amount: overrideForm.isExempt ? null : parseFloat(overrideForm.amount),
          isExempt: overrideForm.isExempt,
          notes: overrideForm.notes.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save override');
      }

      const updatedOverrides = await (await fetch(`/api/students/${selectedStudent.id}/fee-overrides`)).json();
      setFeeOverrides(updatedOverrides);
      
      setOverrideForm({
        chargeType: "registration",
        amount: "",
        isExempt: false,
        notes: "",
      });

      setAlertModal({ isOpen: true, message: "Fee override saved successfully!", type: "success" });
    } catch (err: any) {
      const message = err?.message || "Failed to save fee override.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleDeleteFeeOverride = async (overrideId: number) => {
    if (!selectedStudent) return;

    try {
      const response = await fetch(`/api/students/${selectedStudent.id}/fee-overrides/${overrideId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete override');
      }

      const updatedOverrides = await (await fetch(`/api/students/${selectedStudent.id}/fee-overrides`)).json();
      setFeeOverrides(updatedOverrides);

      setAlertModal({ isOpen: true, message: "Fee override removed successfully!", type: "success" });
    } catch (err: any) {
      const message = err?.message || "Failed to delete fee override.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleSaveNewFeeVersion = async () => {
    if (!selectedStudent) return;
    const monthly = Number(newVersionForm.monthlyFee);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      setAlertModal({
        isOpen: true,
        message: "Enter a valid monthly tuition amount greater than 0.",
        type: "warning",
      });
      return;
    }

    const parseOptionalMoney = (raw: string): number | null | "bad" => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n <= 0) return "bad";
      return n;
    };

    const parseOptionalInst = (raw: string): number | null | "bad" => {
      const t = raw.trim();
      if (t === "") return null;
      const n = parseInt(t, 10);
      if (!Number.isFinite(n) || n < 1) return "bad";
      return n;
    };

    const reg = parseOptionalMoney(newVersionForm.registrationFee);
    const ann = parseOptionalMoney(newVersionForm.annualCharges);
    const meals = parseOptionalMoney(newVersionForm.meals);
    const regInst = parseOptionalInst(newVersionForm.registrationFeeInstallments);
    const annInst = parseOptionalInst(newVersionForm.annualChargesInstallments);
    if (reg === "bad" || ann === "bad" || meals === "bad" || regInst === "bad" || annInst === "bad") {
      setAlertModal({
        isOpen: true,
        message: "Enter positive numbers only, or leave optional fields blank.",
        type: "warning",
      });
      return;
    }

    const eff = newVersionForm.effectiveFrom.trim();
    if (eff && !/^\d{4}-\d{2}-\d{2}$/.test(eff)) {
      setAlertModal({
        isOpen: true,
        message: "Effective date must be YYYY-MM-DD or left blank for today.",
        type: "warning",
      });
      return;
    }

    const body: CreateStudentFeeVersionPayload = {
      monthlyFee: monthly,
      registrationFee: reg,
      annualCharges: ann,
      meals,
      registrationFeeInstallments: regInst,
      annualChargesInstallments: annInst,
      effectiveFrom: eff || undefined,
      notes: newVersionForm.notes.trim() || undefined,
    };

    try {
      const { versions } = await createFeeVersion({ studentId: selectedStudent.id, body }).unwrap();
      setFeeOverrides([]);
      const last = versions[versions.length - 1];
      if (last) {
        setNewVersionForm({
          monthlyFee: String(last.monthlyFee ?? ""),
          registrationFee: last.registrationFee != null ? String(last.registrationFee) : "",
          annualCharges: last.annualCharges != null ? String(last.annualCharges) : "",
          meals: last.meals != null ? String(last.meals) : "",
          registrationFeeInstallments:
            last.registrationFeeInstallments != null ? String(last.registrationFeeInstallments) : "",
          annualChargesInstallments:
            last.annualChargesInstallments != null ? String(last.annualChargesInstallments) : "",
          effectiveFrom: new Date().toISOString().slice(0, 10),
          notes: "",
        });
      }
      setAlertModal({
        isOpen: true,
        message: "New fee agreement saved. Previous terms are kept in history below.",
        type: "success",
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save fee agreement.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const getDefaultAmount = (chargeType: string) => {
    if (!selectedStudent) return 0;
    const feeStructure = feeStructures.find(fs => fs.id === selectedStudent.feeStructureId);
    if (!feeStructure) return 0;

    switch (chargeType) {
      case 'registration': return feeStructure.registrationFee || 0;
      case 'annual': return feeStructure.annualCharges || 0;
      case 'monthly': return feeStructure.monthlyFee || 0;
      default: return 0;
    }
  };

  const feePlanForOverrideModal =
    showFeeOverrideModal && selectedStudent
      ? feeStructures.find((fs) => fs.id === selectedStudent.feeStructureId)
      : undefined;

  const closeFeeOverrideModal = useCallback(() => {
    setFeeVersionExtrasDetail(null);
    setShowFeeOverrideModal(false);
    setSelectedStudent(null);
    setFeeOverrides([]);
    versionFormBootRef.current = false;
    setOverrideForm({
      chargeType: "registration",
      amount: "",
      isExempt: false,
      notes: "",
    });
  }, []);

  useEffect(() => {
    if (!showFeeOverrideModal || !selectedStudent) return;
    if (versionFormBootRef.current) return;
    const fs = feeStructures.find((f) => f.id === selectedStudent.feeStructureId);
    if (!fs) return;
    versionFormBootRef.current = true;
    setNewVersionForm({
      monthlyFee: String(fs.monthlyFee ?? ""),
      registrationFee: fs.registrationFee != null ? String(fs.registrationFee) : "",
      annualCharges: fs.annualCharges != null ? String(fs.annualCharges) : "",
      meals: fs.meals != null ? String(fs.meals) : "",
      registrationFeeInstallments:
        fs.registrationFeeInstallments != null ? String(fs.registrationFeeInstallments) : "",
      annualChargesInstallments:
        fs.annualChargesInstallments != null ? String(fs.annualChargesInstallments) : "",
      effectiveFrom: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  }, [showFeeOverrideModal, selectedStudent, feeStructures]);

  useEffect(() => {
    if (!showFeeOverrideModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (feeVersionExtrasDetailRef.current) {
        setFeeVersionExtrasDetail(null);
        return;
      }
      closeFeeOverrideModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFeeOverrideModal, closeFeeOverrideModal]);

  const filteredStudents = [...students]
    .sort((a, b) => a.id - b.id)
    .filter((s) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        String(s.rollNo).toLowerCase().includes(q)
      );
    });

  if (isLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Students List">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate("/students")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Add New Student
          </button>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or roll no…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {searchQuery && (
            <span className="text-xs text-slate-500">
              {filteredStudents.length} result{filteredStudents.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-600">
                <th className="pb-3">Roll No.</th>
                <th className="pb-3">Name</th>
                <th className="pb-3">Parents Name</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Class Group</th>
                <th className="pb-3">Household</th>
                <th className="pb-3">Fee Structure</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                    {searchQuery ? "No students match your search." : "No students found. Add your first student."}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100 text-sm">
                    <td className="py-3">{student.rollNo}</td>
                    <td className="py-3 font-medium">{student.name}</td>
                    <td className="py-3">{student.parentsName || "-"}</td>
                    <td className="py-3">{student.contactNo || "-"}</td>
                    <td className="py-3">{student.classGroupName}</td>
                    <td className="py-3 max-w-[10rem] truncate text-slate-600" title={student.householdLabel || undefined}>
                      {student.householdLabel?.trim() || (student.householdId != null ? `#${student.householdId}` : "—")}
                    </td>
                    <td className="py-3">{student.feeStructureName} (Rs {student.monthlyFee})</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                          student.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-2 items-start">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleEdit(student.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleManageFeeOverrides(student)}
                            className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                          >
                            Manage Fees
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(student)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            disabled={isDeleting}
                          >
                            Delete
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLedgerStudentId(student.id)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Ledger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {ledgerStudentId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Fee ledger</h3>
                {ledgerData && (
                  <p className="mt-1 text-sm text-slate-600">
                    {ledgerData.student.name} · Roll {ledgerData.student.rollNo}
                    {ledgerData.student.classGroupName ? ` · ${ledgerData.student.classGroupName}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {ledgerData && (
                  <button
                    type="button"
                    onClick={() => downloadLedgerCsv(ledgerData)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Export CSV (Excel)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLedgerStudentId(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              {isLedgerLoading && <p className="text-sm text-slate-600">Loading ledger…</p>}
              {isLedgerError && (
                <p className="text-sm text-red-600">
                  {(ledgerError as { data?: { error?: string } })?.data?.error ?? "Could not load ledger."}
                </p>
              )}
              {!isLedgerLoading && !isLedgerError && ledgerData && (
                <>
                  {ledgerData.lines.length === 0 ? (
                    <p className="text-sm text-slate-600">No invoices or payments yet for this student.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="pb-2 pr-3 font-medium">Date</th>
                          <th className="pb-2 pr-3 font-medium">Type</th>
                          <th className="pb-2 pr-3 font-medium">Details</th>
                          <th className="pb-2 pr-3 text-right font-medium">Debit (Rs)</th>
                          <th className="pb-2 pr-3 text-right font-medium">Credit (Rs)</th>
                          <th className="pb-2 text-right font-medium">Balance due (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.lines.map((line, idx) => (
                          <tr key={`${line.transactionType}-${line.invoiceId}-${idx}`} className="border-b border-slate-100">
                            <td className="py-2 pr-3 whitespace-nowrap text-slate-800">{line.date}</td>
                            <td className="py-2 pr-3">
                              {line.transactionType === "invoice"
                                ? "Invoice"
                                : line.transactionType === "discount"
                                  ? "Discount"
                                  : "Receipt"}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">{line.description}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                              {line.invoiceDebit != null ? formatRs(line.invoiceDebit) : "—"}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">
                              {line.paymentCredit != null ? formatRs(line.paymentCredit) : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                              {formatRs(line.balanceAfter)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="mt-4 flex flex-wrap gap-6 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <div>
                      <span className="text-slate-600">Total invoiced: </span>
                      <span className="font-semibold text-slate-900">{formatRs(ledgerData.summary.totalInvoiced)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Total receipts: </span>
                      <span className="font-semibold text-emerald-800">{formatRs(ledgerData.summary.totalPaid)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Balance due: </span>
                      <span className="font-semibold text-slate-900">{formatRs(ledgerData.summary.balance)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showFeeOverrideModal && selectedStudent && (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-fees-modal-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <h3
                id="manage-fees-modal-title"
                className="min-w-0 flex-1 text-lg font-semibold text-slate-900 truncate"
              >
                Manage fees — {selectedStudent.name}
              </h3>
              <button
                type="button"
                onClick={closeFeeOverrideModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                aria-label="Close"
              >
                <span className="text-xl leading-none" aria-hidden>
                  ×
                </span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Default Fee Structure: {selectedStudent.feeStructureName}</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>Registration Fee: Rs {getDefaultAmount('registration').toLocaleString()}</div>
                <div>Annual Charges: Rs {getDefaultAmount('annual').toLocaleString()}</div>
                <div>Monthly Fee: Rs {getDefaultAmount('monthly').toLocaleString()}</div>
                <div className="col-span-2 text-slate-500 pt-1 border-t border-slate-200 mt-1">
                  Meals and similar add-ons are under <strong>Extra charges</strong> below (same block appears when
                  creating an invoice). Use <strong>Active / Inactive</strong> to pause a subscription without losing
                  the amount, or <strong>Remove</strong> to delete it.
                  {feePlanForOverrideModal?.meals != null && feePlanForOverrideModal.meals > 0 && (
                    <span className="block mt-1 text-slate-600">
                      Plan default meals rate: Rs {feePlanForOverrideModal.meals.toLocaleString()}.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Raise or change fee agreement</h4>
              <p className="text-xs text-slate-600 mb-4">
                When you save, a new version is stored, this student&apos;s active fee record is updated for future
                invoices, any per-component overrides are cleared, and the current list of extra charges is snapshotted
                on that version for your records.
              </p>
              {feeOverrides.length > 0 && (
                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Overrides are in effect. Saving here removes them—enter the full agreed amounts you want going
                  forward.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Monthly tuition (Rs) *</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={newVersionForm.monthlyFee}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, monthlyFee: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Meals plan default (Rs / month)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={newVersionForm.meals}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, meals: e.target.value })}
                    placeholder="Leave blank if none"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Registration (Rs total)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={newVersionForm.registrationFee}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, registrationFee: e.target.value })}
                    placeholder="Blank = none"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Registration installments</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={newVersionForm.registrationFeeInstallments}
                    onChange={(e) =>
                      setNewVersionForm({ ...newVersionForm, registrationFeeInstallments: e.target.value })
                    }
                    placeholder="Blank = single payment"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Annual charges (Rs total)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={newVersionForm.annualCharges}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, annualCharges: e.target.value })}
                    placeholder="Blank = none"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Annual installments</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={newVersionForm.annualChargesInstallments}
                    onChange={(e) =>
                      setNewVersionForm({ ...newVersionForm, annualChargesInstallments: e.target.value })
                    }
                    placeholder="Blank = single payment"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Effective from (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    value={newVersionForm.effectiveFrom}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, effectiveFrom: e.target.value })}
                    className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={newVersionForm.notes}
                    onChange={(e) => setNewVersionForm({ ...newVersionForm, notes: e.target.value })}
                    rows={2}
                    placeholder="e.g. annual increase agreed with parents"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveNewFeeVersion}
                disabled={isSavingFeeVersion}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSavingFeeVersion ? "Saving…" : "Save as new fee version"}
              </button>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Fee agreement history</h4>
              {isFeeVersionsLoading ? (
                <p className="text-sm text-slate-500">Loading history…</p>
              ) : feeVersions.length === 0 ? (
                <p className="text-sm text-slate-500">No versions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="px-2 py-2 font-medium">From</th>
                        <th className="px-2 py-2 font-medium text-right">Monthly</th>
                        <th className="px-2 py-2 font-medium text-right">Annual</th>
                        <th className="px-2 py-2 font-medium text-right">Reg.</th>
                        <th className="px-2 py-2 font-medium text-right">Meals</th>
                        <th className="px-2 py-2 font-medium">Extras</th>
                        <th className="px-2 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...feeVersions].reverse().map((v) => (
                        <tr key={v.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-2 whitespace-nowrap text-slate-800">{v.effectiveFrom}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatRs(v.monthlyFee)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {v.annualCharges != null ? formatRs(v.annualCharges) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {v.registrationFee != null ? formatRs(v.registrationFee) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {v.meals != null ? formatRs(v.meals) : "—"}
                          </td>
                          <td className="px-2 py-2 text-slate-600">
                            {(v.extras ?? []).length ? (
                              <button
                                type="button"
                                className="text-left text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 font-medium"
                                onClick={() => setFeeVersionExtrasDetail(v)}
                              >
                                {(v.extras ?? []).length} extra{(v.extras ?? []).length === 1 ? "" : "s"} — view
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-600 max-w-[10rem] truncate" title={v.notes || ""}>
                            {v.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Current Overrides</h4>
              {feeOverrides.length === 0 ? (
                <p className="text-sm text-slate-500">No fee overrides set. Using default fee structure.</p>
              ) : (
                <div className="space-y-2">
                  {feeOverrides.map((override) => (
                    <div key={override.id} className="flex justify-between items-center p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div>
                        <div className="font-medium text-sm capitalize">{override.chargeType} Fee</div>
                        <div className="text-xs text-slate-600">
                          {override.isExempt ? (
                            <span className="text-red-600 font-semibold">EXEMPTED</span>
                          ) : (
                            <>Custom Amount: Rs {override.amount?.toLocaleString()}</>
                          )}
                        </div>
                        {override.notes && (
                          <div className="text-xs text-slate-500 mt-1">{override.notes}</div>
                        )}
                      </div>
                      <button
                        onClick={() => override.id && handleDeleteFeeOverride(override.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4 mb-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Add/Update Override</h4>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Charge Type</label>
                    <select
                      value={overrideForm.chargeType}
                      onChange={(e) => setOverrideForm({ ...overrideForm, chargeType: e.target.value as any })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="registration">Registration Fee</option>
                      <option value="annual">Annual Charges</option>
                      <option value="monthly">Monthly Fee</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Custom Amount</label>
                    <input
                      type="number"
                      value={overrideForm.amount}
                      onChange={(e) => setOverrideForm({ ...overrideForm, amount: e.target.value })}
                      placeholder={`Default: ${getDefaultAmount(overrideForm.chargeType)}`}
                      disabled={overrideForm.isExempt}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isExempt"
                    checked={overrideForm.isExempt}
                    onChange={(e) => setOverrideForm({ ...overrideForm, isExempt: e.target.checked, amount: "" })}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isExempt" className="ml-2 text-sm text-slate-700">
                    Exempt this student from this charge
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={overrideForm.notes}
                    onChange={(e) => setOverrideForm({ ...overrideForm, notes: e.target.value })}
                    rows={2}
                    placeholder="Reason for override..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={handleSaveFeeOverride}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition-colors"
                >
                  Save Override
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6 mb-4">
              <StudentExtraChargesPanel
                studentId={selectedStudent.id}
                planMealsDefault={
                  feePlanForOverrideModal?.meals != null && feePlanForOverrideModal.meals > 0
                    ? feePlanForOverrideModal.meals
                    : 0
                }
                onNotify={(message, type) => setAlertModal({ isOpen: true, message, type })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeFeeOverrideModal}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>

        {feeVersionExtrasDetail && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-version-extras-title"
            onClick={() => setFeeVersionExtrasDetail(null)}
          >
            <div
              className="max-h-[min(70vh,28rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 id="fee-version-extras-title" className="text-base font-semibold text-slate-900">
                    Extra charges snapshot
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Version effective {feeVersionExtrasDetail.effectiveFrom} · recorded{" "}
                    {feeVersionExtrasDetail.createdAt?.slice(0, 10) ?? ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setFeeVersionExtrasDetail(null)}
                >
                  Close
                </button>
              </div>
              <ul className="space-y-3">
                {(feeVersionExtrasDetail.extras ?? []).map((ex, idx) => (
                  <li
                    key={`${ex.description}-${idx}`}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-slate-900">{ex.description}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>Rs {formatRs(ex.amount)}</span>
                      <span>{Number(ex.recurring) === 1 ? "Recurring" : "One-time"}</span>
                      <span>{Number(ex.active) === 1 ? "Active" : "Inactive"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        </>
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
        onCancel={() => setConfirmModal({ isOpen: false, message: "", studentId: null })}
      />
    </div>
  );
}
