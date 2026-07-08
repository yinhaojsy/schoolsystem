import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import SectionCard from "../components/common/SectionCard";
import StatCard from "../components/common/StatCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { Expense, ExpenseCategory } from "../types";
import {
  useGetExpenseCategoriesQuery,
  useAddExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  useGetExpensesQuery,
  useGetCurrentMonthExpenseTotalQuery,
  useAddExpenseMutation,
  useDeleteExpenseMutation,
} from "../services/api";

type AlertType = "error" | "warning" | "info" | "success";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const { data: categories = [], isLoading: categoriesLoading } = useGetExpenseCategoriesQuery();
  const { data: expenses = [], isLoading: expensesLoading } = useGetExpensesQuery({ limit: 100 });
  const { data: monthTotal } = useGetCurrentMonthExpenseTotalQuery();

  const [addExpenseCategory, { isLoading: isAddingCategory }] = useAddExpenseCategoryMutation();
  const [deleteExpenseCategory, { isLoading: isDeletingCategory }] = useDeleteExpenseCategoryMutation();
  const [addExpense, { isLoading: isSaving }] = useAddExpenseMutation();
  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation();

  const proofInputRef = useRef<HTMLInputElement>(null);
  const proofModalRef = useRef<HTMLDivElement>(null);

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: AlertType }>({
    isOpen: false,
    message: "",
    type: "error",
  });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    kind: "expense" | "category";
    id: number | null;
  }>({ isOpen: false, message: "", kind: "expense", id: null });

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const [form, setForm] = useState({
    expenseDate: todayDateString(),
    description: "",
    categoryId: "",
    amount: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showProofUploadModal, setShowProofUploadModal] = useState(false);
  const [isProofDragging, setIsProofDragging] = useState(false);

  const resetForm = () => {
    setForm({
      expenseDate: todayDateString(),
      description: "",
      categoryId: "",
      amount: "",
    });
    setProofFile(null);
    setProofPreview(null);
    if (proofInputRef.current) proofInputRef.current.value = "";
  };

  const handleProofChange = (file: File | null) => {
    setProofFile(file);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(file ? URL.createObjectURL(file) : null);
  };

  const acceptProofFile = (file: File | null, closeModal = false) => {
    if (!file) {
      handleProofChange(null);
      if (closeModal) setShowProofUploadModal(false);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setAlertModal({ isOpen: true, message: "Please upload an image file.", type: "warning" });
      return;
    }
    handleProofChange(file);
    if (closeModal) setShowProofUploadModal(false);
  };

  const handleProofDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProofDragging(true);
  };

  const handleProofDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProofDragging(false);
  };

  const handleProofDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProofDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    acceptProofFile(file, true);
  };

  useEffect(() => {
    if (!showProofUploadModal) return;
    proofModalRef.current?.focus();

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) acceptProofFile(file, true);
          return;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [showProofUploadModal]);

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setAlertModal({ isOpen: true, message: "Category name is required.", type: "warning" });
      return;
    }
    try {
      const created = await addExpenseCategory({ name }).unwrap();
      setCategoryName("");
      setShowCategoryForm(false);
      setForm((prev) => ({ ...prev, categoryId: String(created.id) }));
      setAlertModal({ isOpen: true, message: "Category added.", type: "success" });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to add category.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      setAlertModal({ isOpen: true, message: "Description is required.", type: "warning" });
      return;
    }
    if (!form.categoryId) {
      setAlertModal({ isOpen: true, message: "Please select a category.", type: "warning" });
      return;
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setAlertModal({ isOpen: true, message: "Amount must be greater than zero.", type: "warning" });
      return;
    }

    try {
      await addExpense({
        expenseDate: form.expenseDate,
        description: form.description.trim(),
        categoryId: parseInt(form.categoryId, 10),
        amount,
        proof: proofFile,
      }).unwrap();
      resetForm();
      setAlertModal({ isOpen: true, message: "Expense recorded.", type: "success" });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to record expense.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleDeleteExpenseClick = (expense: Expense) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete expense "${expense.description}" (${formatMoney(expense.amount)})?`,
      kind: "expense",
      id: expense.id,
    });
  };

  const handleDeleteCategoryClick = (category: ExpenseCategory) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete category "${category.name}"?`,
      kind: "category",
      id: category.id,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal.id) return;
    try {
      if (confirmModal.kind === "expense") {
        await deleteExpense(confirmModal.id).unwrap();
        setAlertModal({ isOpen: true, message: "Expense deleted.", type: "success" });
      } else {
        await deleteExpenseCategory(confirmModal.id).unwrap();
        setAlertModal({ isOpen: true, message: "Category deleted.", type: "success" });
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Delete failed.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
    setConfirmModal({ isOpen: false, message: "", kind: "expense", id: null });
  };

  const isLoading = categoriesLoading || expensesLoading;

  if (isLoading) {
    return <div className="py-10 text-center text-slate-600">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <StatCard
        title={`Total expenses — ${monthTotal?.month ?? ""} ${monthTotal?.year ?? ""}`}
        value={formatMoney(monthTotal?.totalAmount ?? 0)}
        className="border-rose-200 bg-rose-50"
      />

      <SectionCard title="Record Expense" subtitle="Log a new expense. Payment proof is optional.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What was this expense for?"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Category <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryForm((v) => !v)}
                  className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {showCategoryForm ? "Cancel" : "Add category"}
                </button>
              </div>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">
                  {categories.length === 0 ? "No categories — add one first" : "Select category…"}
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="mb-1 block text-sm font-medium text-slate-700">Payment proof (optional)</label>
              <div className="flex items-center gap-3">
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    acceptProofFile(e.target.files?.[0] ?? null, true);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowProofUploadModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {proofFile ? "Change image" : "Upload image"}
                </button>
                {proofFile && (
                  <button
                    type="button"
                    onClick={() => acceptProofFile(null)}
                    className="text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              {proofPreview && (
                <img src={proofPreview} alt="Proof preview" className="mt-2 h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              )}
            </div>
          </div>

          {showCategoryForm && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">New category name</label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g. Rent, Utilities, Salaries"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddCategory(e as unknown as FormEvent);
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => void handleAddCategory(e as unknown as FormEvent)}
                  disabled={isAddingCategory}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {isAddingCategory ? "Saving…" : "Save category"}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving || categories.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Record expense"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Expense Categories" subtitle="Manage categories available in the dropdown above.">
        {categories.length === 0 ? (
          <p className="text-sm text-slate-600">No categories yet. Add one when recording an expense.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
              >
                {cat.name}
                <button
                  type="button"
                  onClick={() => handleDeleteCategoryClick(cat)}
                  disabled={isDeletingCategory}
                  className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                  aria-label={`Delete ${cat.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Expenses">
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-600">No expenses recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Date</th>
                  <th className="py-3 pr-4 font-semibold">Description</th>
                  <th className="py-3 pr-4 font-semibold">Category</th>
                  <th className="py-3 pr-4 font-semibold text-right">Amount</th>
                  <th className="py-3 pr-4 font-semibold">Proof</th>
                  <th className="py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 text-slate-700">{expense.expenseDate}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">{expense.description}</td>
                    <td className="py-3 pr-4 text-slate-700">{expense.categoryName}</td>
                    <td className="py-3 pr-4 text-right tabular-nums font-medium text-rose-700">
                      {formatMoney(expense.amount)}
                    </td>
                    <td className="py-3 pr-4">
                      {expense.proofImageUrl ? (
                        <a
                          href={expense.proofImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          <img
                            src={expense.proofImageUrl}
                            alt="Payment proof"
                            className="h-10 w-10 rounded border border-slate-200 object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleDeleteExpenseClick(expense)}
                        disabled={isDeleting}
                        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showProofUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => {
            setShowProofUploadModal(false);
            setIsProofDragging(false);
          }}
        >
          <div
            ref={proofModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Upload payment proof"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Upload payment proof</h3>
            <p className="mt-1 text-sm text-slate-600">Add an image of your receipt or payment confirmation.</p>

            <div
              onDragOver={handleProofDragOver}
              onDragEnter={handleProofDragOver}
              onDragLeave={handleProofDragLeave}
              onDrop={handleProofDrop}
              className={`mt-4 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                isProofDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
              }`}
            >
              <svg className="mx-auto h-10 w-10 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {isProofDragging ? "Drop image here" : "Drag and drop an image here"}
              </p>
              <p className="mt-1 text-xs text-slate-500">or paste from clipboard (Ctrl+V / Cmd+V)</p>
              <button
                type="button"
                onClick={() => proofInputRef.current?.click()}
                className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Browse files
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowProofUploadModal(false);
                setIsProofDragging(false);
              }}
              className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
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
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ isOpen: false, message: "", kind: "expense", id: null })}
      />
    </div>
  );
}
