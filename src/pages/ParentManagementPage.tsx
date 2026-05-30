import { useMemo, useState, FormEvent } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { ParentAccount } from "../types";
import {
  useGetParentAccountsQuery,
  useCreateParentAccountMutation,
  useUpdateParentAccountMutation,
  useResetParentPasswordMutation,
  useDeleteParentAccountMutation,
  useGetHouseholdsQuery,
  useGetStudentsQuery,
} from "../services/api";

type AlertType = "error" | "warning" | "success" | "info";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyIconButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  );
}

export default function ParentManagementPage() {
  const { data: parents = [], isLoading } = useGetParentAccountsQuery();
  const { data: households = [] } = useGetHouseholdsQuery();
  const { data: students = [] } = useGetStudentsQuery();
  const activeStudents = useMemo(() => students.filter((s) => s.status === "active"), [students]);
  const [createParent, { isLoading: isCreating }] = useCreateParentAccountMutation();
  const [updateParent, { isLoading: isUpdating }] = useUpdateParentAccountMutation();
  const [resetPassword, { isLoading: isResetting }] = useResetParentPasswordMutation();
  const [deleteParent, { isLoading: isDeleting }] = useDeleteParentAccountMutation();

  const [editing, setEditing] = useState<ParentAccount | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    householdQuickFill: "",
    status: "active" as "active" | "inactive",
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: AlertType }>({
    isOpen: false,
    message: "",
    type: "info",
  });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; parentId: number | null }>({
    isOpen: false,
    message: "",
    parentId: null,
  });

  const resetForm = () => {
    setForm({ name: "", email: "", password: "", householdQuickFill: "", status: "active" });
    setSelectedStudentIds([]);
    setStudentSearch("");
    setEditing(null);
  };

  const toggleStudent = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const applyHouseholdQuickFill = (householdId: string) => {
    setForm((f) => ({ ...f, householdQuickFill: householdId }));
    if (!householdId) return;
    const ids = activeStudents.filter((s) => String(s.householdId) === householdId).map((s) => s.id);
    setSelectedStudentIds(ids);
  };

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return activeStudents;
    return activeStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rollNo.toLowerCase().includes(q) ||
        (s.parentsName ?? "").toLowerCase().includes(q),
    );
  }, [activeStudents, studentSearch]);

  const handleEdit = (parent: ParentAccount) => {
    setEditing(parent);
    setForm({
      name: parent.name,
      email: parent.email,
      password: "",
      householdQuickFill: parent.householdId != null ? String(parent.householdId) : "",
      status: parent.status === "inactive" ? "inactive" : "active",
    });
    setSelectedStudentIds(parent.studentIds ?? []);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setAlertModal({ isOpen: true, message: "Name and email are required.", type: "warning" });
      return;
    }
    if (selectedStudentIds.length === 0) {
      setAlertModal({ isOpen: true, message: "Select at least one student.", type: "warning" });
      return;
    }

    try {
      const householdId = form.householdQuickFill ? parseInt(form.householdQuickFill, 10) : null;
      if (editing) {
        await updateParent({
          id: editing.id,
          data: {
            name: form.name.trim(),
            email: form.email.trim(),
            householdId,
            studentIds: selectedStudentIds,
            status: form.status,
            ...(form.password.trim() ? { password: form.password.trim() } : {}),
          },
        }).unwrap();
        setAlertModal({ isOpen: true, message: "Parent account updated.", type: "success" });
      } else {
        await createParent({
          name: form.name.trim(),
          email: form.email.trim(),
          studentIds: selectedStudentIds,
          householdId,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        }).unwrap();
        setAlertModal({
          isOpen: true,
          message: "Parent account created. Copy credentials below to share privately.",
          type: "success",
        });
      }
      resetForm();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setAlertModal({ isOpen: true, message: message || "Failed to save parent account.", type: "error" });
    }
  };

  const handleResetPassword = async (parent: ParentAccount) => {
    try {
      const updated = await resetPassword(parent.id).unwrap();
      setAlertModal({
        isOpen: true,
        message: `New password for ${updated.email}: ${updated.invitePassword ?? "(hidden)"}`,
        type: "success",
      });
    } catch {
      setAlertModal({ isOpen: true, message: "Failed to reset password.", type: "error" });
    }
  };

  const handleCopyCredentials = async (parent: ParentAccount) => {
    const password = parent.invitePassword ?? "";
    const text = `Sprouts Valley Parent Portal\nEmail: ${parent.email}\nPassword: ${password}\nLogin: ${window.location.origin}/parents/`;
    const ok = await copyText(text);
    setAlertModal({
      isOpen: true,
      message: ok ? "Username and password copied to clipboard." : "Could not copy to clipboard.",
      type: ok ? "success" : "error",
    });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmModal.parentId) return;
    try {
      await deleteParent(confirmModal.parentId).unwrap();
      setAlertModal({ isOpen: true, message: "Parent account deleted.", type: "success" });
      if (editing?.id === confirmModal.parentId) resetForm();
    } catch {
      setAlertModal({ isOpen: true, message: "Failed to delete parent account.", type: "error" });
    }
    setConfirmModal({ isOpen: false, message: "", parentId: null });
  };

  if (isLoading) {
    return <div className="py-10 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title={editing ? "Edit Parent Account" : "Create Parent Account"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Parent name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email (username)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password {editing ? "(leave blank to keep)" : "(auto-generated if blank)"}
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Quick fill from household <span className="font-normal text-slate-500">(optional, for siblings)</span>
              </label>
              <select
                value={form.householdQuickFill}
                onChange={(e) => applyHouseholdQuickFill(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select household to auto-check children</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label || `Household #${h.id}`} ({h.activeMemberCount ?? 0} active)
                  </option>
                ))}
              </select>
            </div>
            {editing && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive (login suspended)</option>
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-800">
                Linked students <span className="text-red-500">*</span>
                <span className="ml-2 font-normal text-slate-500">({selectedStudentIds.length} selected)</span>
              </label>
              <input
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by name, roll no, parent…"
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:w-64"
              />
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-slate-500">No active students found.</p>
              ) : (
                filteredStudents.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                      className="mt-1"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      <span className="block text-slate-500">
                        {s.rollNo}
                        {s.classGroupName ? ` · ${s.classGroupName}` : ""}
                        {s.householdLabel ? ` · ${s.householdLabel}` : s.householdId ? ` · Household #${s.householdId}` : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isCreating || isUpdating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editing ? (isUpdating ? "Saving…" : "Update") : isCreating ? "Creating…" : "Create"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Parent Accounts">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-600">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Password</th>
                <th className="pb-3">Linked students</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No parent accounts yet.
                  </td>
                </tr>
              ) : (
                parents.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 text-sm">
                    <td className="py-3 font-medium">{p.name}</td>
                    <td className="py-3">{p.email}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.invitePassword || "—"}</code>
                        <CopyIconButton onClick={() => void handleCopyCredentials(p)} title="Copy username & password" />
                      </div>
                    </td>
                    <td className="py-3 max-w-xs">
                      {(p.studentNames ?? []).length > 0 ? (
                        <span className="text-slate-700">{(p.studentNames ?? []).join(", ")}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 font-medium">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(p)}
                          disabled={isResetting}
                          className="text-amber-700 hover:text-amber-900 font-medium"
                        >
                          Reset pwd
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmModal({
                              isOpen: true,
                              message: `Delete parent account for ${p.email}?`,
                              parentId: p.id,
                            })
                          }
                          disabled={isDeleting}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden space-y-3">
          {parents.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-500">No parent accounts yet.</li>
          ) : (
            parents.map((p) => (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                    <p className="text-sm text-slate-600 truncate">{p.email}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                      p.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Password</span>
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.invitePassword || "—"}</code>
                  <CopyIconButton onClick={() => void handleCopyCredentials(p)} title="Copy username & password" />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="text-slate-500">Students: </span>
                  {(p.studentNames ?? []).length > 0 ? (p.studentNames ?? []).join(", ") : "—"}
                </p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(p)}
                    className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white"
                  >
                    Edit
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResetPassword(p)}
                      disabled={isResetting}
                      className="rounded-lg border border-amber-200 bg-amber-50 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                    >
                      Reset pwd
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          message: `Delete parent account for ${p.email}?`,
                          parentId: p.id,
                        })
                      }
                      disabled={isDeleting}
                      className="rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </SectionCard>

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false, message: "", type: "info" })}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, message: "", parentId: null })}
      />
    </div>
  );
}
