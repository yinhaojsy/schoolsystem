import { useState, FormEvent } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { ClassGroup } from "../types";
import {
  useGetClassGroupsQuery,
  useAddClassGroupMutation,
  useUpdateClassGroupMutation,
  useDeleteClassGroupMutation,
} from "../services/api";

type AlertModalType = "error" | "warning" | "info" | "success";

export default function ClassGroupsPage() {
  const { data: classGroups = [], isLoading } = useGetClassGroupsQuery();
  const [addClassGroup, { isLoading: isSaving }] = useAddClassGroupMutation();
  const [updateClassGroup, { isLoading: isUpdating }] = useUpdateClassGroupMutation();
  const [deleteClassGroup, { isLoading: isDeleting }] = useDeleteClassGroupMutation();

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    type: AlertModalType;
  }>({ isOpen: false, message: "", type: "error" });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: "", classGroupId: null as number | null });
  const [editingClassGroup, setEditingClassGroup] = useState<ClassGroup | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const resetForm = () => {
    setForm({ name: "", description: "" });
    setEditingClassGroup(null);
  };

  const handleEdit = (classGroup: ClassGroup) => {
    setEditingClassGroup(classGroup);
    setForm({
      name: classGroup.name,
      description: classGroup.description || "",
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setAlertModal({ isOpen: true, message: "Please enter a class group name.", type: "warning" });
      return;
    }

    try {
      const classGroupData = {
        name: form.name.trim(),
        description: form.description.trim(),
      };

      if (editingClassGroup) {
        await updateClassGroup({ id: editingClassGroup.id, data: classGroupData }).unwrap();
        setAlertModal({ isOpen: true, message: "Class group updated successfully!", type: "success" });
      } else {
        await addClassGroup(classGroupData).unwrap();
        setAlertModal({ isOpen: true, message: "Class group created successfully!", type: "success" });
      }

      resetForm();
    } catch (err: any) {
      const message = err?.data?.error || "Failed to save class group. Please try again.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleDeleteClick = (classGroup: ClassGroup) => {
    setConfirmModal({
      isOpen: true,
      message: `Are you sure you want to delete ${classGroup.name}?`,
      classGroupId: classGroup.id,
    });
  };

  const handleDeleteConfirm = async () => {
    if (confirmModal.classGroupId) {
      try {
        await deleteClassGroup(confirmModal.classGroupId).unwrap();
        setAlertModal({ isOpen: true, message: "Class group deleted successfully!", type: "success" });
      } catch (err: any) {
        const message = err?.data?.error || "Failed to delete class group.";
        setAlertModal({ isOpen: true, message, type: "error" });
      }
    }
    setConfirmModal({ isOpen: false, message: "", classGroupId: null });
  };

  if (isLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title={editingClassGroup ? "Edit Class Group" : "Create Class Group"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Class Group Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving || isUpdating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingClassGroup ? (isUpdating ? "Updating..." : "Update") : (isSaving ? "Creating..." : "Create")}
            </button>
            {editingClassGroup && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Class Groups List">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-600">
                <th className="pb-3">Name</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Created At</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classGroups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                    No class groups found. Create your first class group above.
                  </td>
                </tr>
              ) : (
                classGroups.map((cg) => (
                  <tr key={cg.id} className="border-b border-slate-100 text-sm">
                    <td className="py-3 font-medium">{cg.name}</td>
                    <td className="py-3">{cg.description || "-"}</td>
                    <td className="py-3">{new Date(cg.createdAt).toLocaleDateString()}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(cg)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(cg)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                          disabled={isDeleting}
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
      </SectionCard>

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
        onCancel={() => setConfirmModal({ isOpen: false, message: "", classGroupId: null })}
      />
    </div>
  );
}
