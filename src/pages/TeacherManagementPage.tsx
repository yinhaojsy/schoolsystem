import { useState, FormEvent } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { TeacherAccount } from "../types";
import {
  useGetTeacherAccountsQuery,
  useCreateTeacherAccountMutation,
  useUpdateTeacherAccountMutation,
  useResetTeacherPasswordMutation,
  useDeleteTeacherAccountMutation,
  useGetClassGroupsQuery,
  useGetTeacherContentSettingsQuery,
  useUpdateTeacherContentSettingsMutation,
} from "../services/api";
import type { TeacherWithContentSettings } from "../types";

type Tab = "accounts" | "permissions";

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
    <button type="button" onClick={onClick} title={title} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  );
}

export default function TeacherManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("accounts");
  const { data: teachers = [], isLoading } = useGetTeacherAccountsQuery();
  const { data: classGroups = [] } = useGetClassGroupsQuery();
  const [createTeacher, { isLoading: isCreating }] = useCreateTeacherAccountMutation();
  const [updateTeacher, { isLoading: isUpdating }] = useUpdateTeacherAccountMutation();
  const [resetPassword, { isLoading: isResetting }] = useResetTeacherPasswordMutation();
  const [deleteTeacher, { isLoading: isDeleting }] = useDeleteTeacherAccountMutation();

  const [editing, setEditing] = useState<TeacherAccount | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    classGroupId: "",
    teacherScope: "class" as "class" | "school",
    canEditPublishedContent: false,
    status: "active" as "active" | "inactive",
  });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: AlertType }>({ isOpen: false, message: "", type: "info" });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; teacherId: number | null }>({ isOpen: false, message: "", teacherId: null });

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      classGroupId: "",
      teacherScope: "class",
      canEditPublishedContent: false,
      status: "active",
    });
    setEditing(null);
  };

  const handleEdit = (t: TeacherAccount) => {
    setEditing(t);
    setForm({
      name: t.name,
      email: t.email,
      password: "",
      classGroupId: t.classGroupId != null ? String(t.classGroupId) : "",
      teacherScope: t.teacherScope === "school" ? "school" : "class",
      canEditPublishedContent: !!t.canEditPublishedContent,
      status: t.status === "inactive" ? "inactive" : "active",
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setAlertModal({ isOpen: true, message: "Name and email are required.", type: "warning" });
      return;
    }
    if (form.teacherScope === "class" && !form.classGroupId) {
      setAlertModal({ isOpen: true, message: "Class group is required for classroom teachers.", type: "warning" });
      return;
    }
    try {
      const classGroupId =
        form.teacherScope === "class" ? parseInt(form.classGroupId, 10) : null;
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        teacherScope: form.teacherScope,
        classGroupId,
        canEditPublishedContent: form.canEditPublishedContent,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      };
      if (editing) {
        await updateTeacher({
          id: editing.id,
          data: {
            ...payload,
            status: form.status,
          },
        }).unwrap();
        setAlertModal({ isOpen: true, message: "Teacher account updated.", type: "success" });
      } else {
        await createTeacher(payload).unwrap();
        setAlertModal({ isOpen: true, message: "Teacher created. Copy credentials to share.", type: "success" });
      }
      resetForm();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "data" in err ? (err as { data?: { error?: string } }).data?.error : undefined;
      setAlertModal({ isOpen: true, message: message || "Failed to save.", type: "error" });
    }
  };

  const handleCopy = async (t: TeacherAccount) => {
    const text = `Sprouts Valley Teacher Portal\nEmail: ${t.email}\nPassword: ${t.invitePassword ?? ""}\nLogin: ${window.location.origin}/teacher/`;
    const ok = await copyText(text);
    setAlertModal({ isOpen: true, message: ok ? "Copied to clipboard." : "Copy failed.", type: ok ? "success" : "error" });
  };

  if (isLoading && activeTab === "accounts") return <div className="py-10 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("accounts")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "accounts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          Accounts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("permissions")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "permissions" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          Portal permissions
        </button>
      </div>

      {activeTab === "permissions" ? (
        <PortalPermissionsTab />
      ) : (
        <>
      <SectionCard title={editing ? "Edit Teacher" : "Create Teacher Account"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Password {editing && "(blank = keep)"}</label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" autoComplete="off" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Portal role</label>
              <select
                value={form.teacherScope}
                onChange={(e) =>
                  setForm({
                    ...form,
                    teacherScope: e.target.value as "class" | "school",
                  })
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="class">Classroom teacher</option>
                <option value="school">School admin (all students)</option>
              </select>
            </div>
            {form.teacherScope === "class" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Class group</label>
                <select
                  value={form.classGroupId}
                  onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select class</option>
                  {classGroups.map((cg) => (
                    <option key={cg.id} value={cg.id}>{cg.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <ToggleSwitch
                checked={form.canEditPublishedContent}
                onChange={(v) => setForm({ ...form, canEditPublishedContent: v })}
                label="Allow edit after publish (teacher portal)"
              />
            </div>
            {editing && (
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={isCreating || isUpdating} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {editing ? "Update" : "Create"}
            </button>
            {editing && <button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button>}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Teacher Accounts">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Password</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Class</th>
                <th className="pb-3">Students</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">No teachers yet.</td></tr>
              ) : (
                teachers.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{t.name}</td>
                    <td className="py-3">{t.email}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{t.invitePassword || "—"}</code>
                        <CopyIconButton onClick={() => void handleCopy(t)} title="Copy credentials" />
                      </div>
                    </td>
                    <td className="py-3">
                      {t.teacherScope === "school" ? "School admin" : "Classroom"}
                      {t.canEditPublishedContent ? (
                        <span className="ml-1 text-xs text-slate-500">· can edit</span>
                      ) : null}
                    </td>
                    <td className="py-3">{t.classGroupName || "—"}</td>
                    <td className="py-3">{t.daycareStudentCount ?? 0}</td>
                    <td className="py-3">{t.status}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleEdit(t)} className="text-blue-600 font-medium">Edit</button>
                        <button type="button" disabled={isResetting} onClick={async () => {
                          const u = await resetPassword(t.id).unwrap();
                          setAlertModal({ isOpen: true, message: `New password: ${u.invitePassword}`, type: "success" });
                        }} className="text-amber-700 font-medium">Reset pwd</button>
                        <button type="button" disabled={isDeleting} onClick={() => setConfirmModal({ isOpen: true, message: `Delete ${t.email}?`, teacherId: t.id })} className="text-red-600 font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden space-y-3">
          {teachers.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-500">No teachers yet.</li>
          ) : (
            teachers.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-sm text-slate-600 truncate">{t.email}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                      t.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Password</span>
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{t.invitePassword || "—"}</code>
                  <CopyIconButton onClick={() => void handleCopy(t)} title="Copy credentials" />
                </div>
                <dl className="mt-2 space-y-1 text-sm text-slate-600">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Class</dt>
                    <dd className="font-medium text-slate-800">{t.classGroupName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Students</dt>
                    <dd className="font-medium text-slate-800">{t.daycareStudentCount ?? 0}</dd>
                  </div>
                </dl>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(t)}
                    className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white"
                  >
                    Edit
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isResetting}
                      onClick={async () => {
                        const u = await resetPassword(t.id).unwrap();
                        setAlertModal({
                          isOpen: true,
                          message: `New password: ${u.invitePassword}`,
                          type: "success",
                        });
                      }}
                      className="rounded-lg border border-amber-200 bg-amber-50 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                    >
                      Reset pwd
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() =>
                        setConfirmModal({ isOpen: true, message: `Delete ${t.email}?`, teacherId: t.id })
                      }
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

      <AlertModal isOpen={alertModal.isOpen} message={alertModal.message} type={alertModal.type} onClose={() => setAlertModal({ isOpen: false, message: "", type: "info" })} />
      <ConfirmModal isOpen={confirmModal.isOpen} message={confirmModal.message} onConfirm={async () => {
        if (confirmModal.teacherId) {
          await deleteTeacher(confirmModal.teacherId);
          if (editing?.id === confirmModal.teacherId) resetForm();
        }
        setConfirmModal({ isOpen: false, message: "", teacherId: null });
      }} onCancel={() => setConfirmModal({ isOpen: false, message: "", teacherId: null })} />
        </>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-5" : "left-0.5"}`}
        />
      </button>
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

function PortalPermissionsTab() {
  const { data: teachers = [], isLoading } = useGetTeacherContentSettingsQuery();
  const [updateSettings] = useUpdateTeacherContentSettingsMutation();
  const [updateTeacher] = useUpdateTeacherAccountMutation();
  const [savingId, setSavingId] = useState<number | null>(null);

  const handleToggle = async (
    teacher: TeacherWithContentSettings,
    key: "diary" | "notices" | "gallery",
    value: boolean,
  ) => {
    setSavingId(teacher.id);
    try {
      await updateSettings({
        teacherId: teacher.id,
        settings: { ...teacher.settings, [key]: value },
      }).unwrap();
    } finally {
      setSavingId(null);
    }
  };

  const handleEditPublishedToggle = async (teacher: TeacherWithContentSettings, value: boolean) => {
    setSavingId(teacher.id);
    try {
      await updateTeacher({
        id: teacher.id,
        data: { canEditPublishedContent: value },
      }).unwrap();
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) return <div className="py-10 text-center">Loading...</div>;

  return (
    <SectionCard title="Portal permissions">
      <p className="mb-4 text-sm text-slate-600">
        When <strong>Approval required</strong> is on, that teacher&apos;s submissions go to Content Approvals before parents can see them.
        When off, submissions are visible to parents immediately.
      </p>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-600">
              <th className="pb-3 pr-4">Teacher</th>
              <th className="pb-3 pr-4">Class</th>
              <th className="pb-3 pr-4">Kids diary</th>
              <th className="pb-3 pr-4">Teacher notes</th>
              <th className="pb-3">Photo gallery</th>
              <th className="pb-3">Allow edit after publish</th>
            </tr>
          </thead>
          <tbody>
            {teachers.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No teachers yet.</td></tr>
            ) : (
              teachers.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{t.name}</td>
                  <td className="py-3 pr-4">{t.classGroupName || "—"}</td>
                  <td className="py-3 pr-4">
                    <ToggleSwitch
                      checked={t.settings.diary}
                      onChange={(v) => void handleToggle(t, "diary", v)}
                      label={t.settings.diary ? "Approval required" : "Direct publish"}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <ToggleSwitch
                      checked={t.settings.notices}
                      onChange={(v) => void handleToggle(t, "notices", v)}
                      label={t.settings.notices ? "Approval required" : "Direct publish"}
                    />
                  </td>
                  <td className="py-3">
                    <ToggleSwitch
                      checked={t.settings.gallery}
                      onChange={(v) => void handleToggle(t, "gallery", v)}
                      label={t.settings.gallery ? "Approval required" : "Direct publish"}
                    />
                  </td>
                  <td className="py-3">
                    <ToggleSwitch
                      checked={!!t.canEditPublishedContent}
                      onChange={(v) => void handleEditPublishedToggle(t, v)}
                      label={t.canEditPublishedContent ? "Can edit published" : "View only"}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {savingId != null && <p className="mt-2 text-xs text-slate-500">Saving…</p>}
      <ul className="md:hidden space-y-4">
        {teachers.map((t) => (
          <li key={t.id} className="rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">{t.name}</p>
            <p className="text-sm text-slate-500">{t.classGroupName || "No class"}</p>
            <div className="mt-3 space-y-3">
              <ToggleSwitch checked={t.settings.diary} onChange={(v) => void handleToggle(t, "diary", v)} label={`Kids diary — ${t.settings.diary ? "approval required" : "direct publish"}`} />
              <ToggleSwitch checked={t.settings.notices} onChange={(v) => void handleToggle(t, "notices", v)} label={`Teacher notes — ${t.settings.notices ? "approval required" : "direct publish"}`} />
              <ToggleSwitch checked={t.settings.gallery} onChange={(v) => void handleToggle(t, "gallery", v)} label={`Photo gallery — ${t.settings.gallery ? "approval required" : "direct publish"}`} />
              <ToggleSwitch
                checked={!!t.canEditPublishedContent}
                onChange={(v) => void handleEditPublishedToggle(t, v)}
                label={t.canEditPublishedContent ? "Allow edit after publish" : "View only after publish"}
              />
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
