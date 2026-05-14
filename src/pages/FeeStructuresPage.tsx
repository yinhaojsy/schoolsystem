import { useState, useMemo, useEffect, FormEvent } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import FeeStructureBuilder from "../components/feeStructure/FeeStructureBuilder";
import type { FeeStructure } from "../types";
import type { FeeBuilderSchema, FeeBuilderField } from "../types/feeBuilder";
import {
  emptyFeeBuilderSchema,
  parseFeeBuilderSchema,
  compileFeeBuilderSchema,
  validateFeeTemplateSchema,
  mergeTemplateWithFormValues,
  extractFormValuesFromInstance,
  validateFormAgainstTemplate,
  legacyFlatToFormValues,
  stripTemplateValues,
  displayFieldLabel,
  emptyDynamicFormValues,
  type FeeStructureFormValues,
  type FeeInstallmentFormValues,
} from "../types/feeBuilder";
import {
  useGetFeeStructuresQuery,
  useAddFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  useGetFeeBuilderTemplateQuery,
  useUpdateFeeBuilderTemplateMutation,
} from "../services/api";

type AlertModalType = "error" | "warning" | "info" | "success";

type PageTab = "structures" | "builder";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function allTemplateFields(template: FeeBuilderSchema): FeeBuilderField[] {
  return [...template.sections].sort((a, b) => a.order - b.order).flatMap((s) => s.fields);
}

function FeeStructureFields({
  template,
  values,
  installments,
  onValuesChange,
  onInstallmentsChange,
}: {
  template: FeeBuilderSchema;
  values: FeeStructureFormValues;
  installments: FeeInstallmentFormValues;
  onValuesChange: (next: FeeStructureFormValues) => void;
  onInstallmentsChange: (next: FeeInstallmentFormValues) => void;
}) {
  const patchVal = (id: string, v: string) => onValuesChange({ ...values, [id]: v });
  const patchInst = (id: string, v: string) => onInstallmentsChange({ ...installments, [id]: v });
  const sections = [...template.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.id}>
          <h4 className="text-sm font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">{section.title}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((field) => {
              const label = displayFieldLabel(field);
              if (field.inputType === "text") {
                return (
                  <div key={field.id} className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <textarea
                      value={values[field.id] ?? ""}
                      onChange={(e) => patchVal(field.id, e.target.value)}
                      rows={3}
                      required={field.required}
                      className={inputClass}
                      placeholder="Optional"
                    />
                  </div>
                );
              }

              const showInst =
                field.allowInstallments && (field.billingMap === "registration" || field.billingMap === "annual");

              return (
                <div key={field.id} className="md:col-span-2 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {label}
                      {field.billingMap === "monthly" && <span className="text-red-500"> *</span>}
                      {!field.billingMap && <span className="text-slate-400 text-xs font-normal ml-1">(Rs)</span>}
                      {field.billingMap && field.billingMap !== "monthly" && (
                        <span className="text-slate-500 text-xs font-normal ml-1">(Rs)</span>
                      )}
                      {field.required && field.billingMap !== "monthly" && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required={field.required || field.billingMap === "monthly"}
                      value={values[field.id] ?? ""}
                      onChange={(e) => patchVal(field.id, e.target.value)}
                      className={inputClass}
                      placeholder={field.required ? undefined : "Optional"}
                    />
                  </div>
                  {showInst && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Installments for “{label}” (optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={installments[field.id] ?? ""}
                        onChange={(e) => patchInst(field.id, e.target.value)}
                        className={inputClass}
                        placeholder="Split into equal installments"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeeStructuresPage() {
  const [pageTab, setPageTab] = useState<PageTab>("structures");
  const { data: feeStructures = [], isLoading } = useGetFeeStructuresQuery();
  const { data: tmplData, isLoading: templateLoading } = useGetFeeBuilderTemplateQuery();
  const [addFeeStructure, { isLoading: isSaving }] = useAddFeeStructureMutation();
  const [updateFeeStructure, { isLoading: isUpdating }] = useUpdateFeeStructureMutation();
  const [deleteFeeStructure, { isLoading: isDeleting }] = useDeleteFeeStructureMutation();
  const [updateFeeTemplate, { isLoading: isSavingTemplate }] = useUpdateFeeBuilderTemplateMutation();

  const templateSchema = useMemo(() => {
    if (!tmplData?.schema) return emptyFeeBuilderSchema();
    const p = parseFeeBuilderSchema(tmplData.schema);
    return stripTemplateValues(p ?? emptyFeeBuilderSchema());
  }, [tmplData]);

  const [templateDraft, setTemplateDraft] = useState<FeeBuilderSchema | null>(null);
  useEffect(() => {
    if (pageTab !== "builder" || templateDraft !== null || !tmplData?.schema) return;
    const p = parseFeeBuilderSchema(tmplData.schema) ?? emptyFeeBuilderSchema();
    setTemplateDraft(stripTemplateValues(p));
  }, [pageTab, templateDraft, tmplData]);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    type: AlertModalType;
  }>({ isOpen: false, message: "", type: "error" });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: "", feeStructureId: null as number | null });
  const [editingFeeStructure, setEditingFeeStructure] = useState<FeeStructure | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [feeForm, setFeeForm] = useState<FeeStructureFormValues>(() => emptyDynamicFormValues());
  const [feeInstallments, setFeeInstallments] = useState<FeeInstallmentFormValues>(() => ({}));

  const resetForm = () => {
    setName("");
    setDescription("");
    setFeeForm(emptyDynamicFormValues());
    setFeeInstallments({});
    setEditingFeeStructure(null);
  };

  const handleEdit = (feeStructure: FeeStructure) => {
    setEditingFeeStructure(feeStructure);
    setName(feeStructure.name);
    setDescription(feeStructure.description || "");
    const parsed = parseFeeBuilderSchema(feeStructure.builderSchema ?? undefined);
    if (parsed && parsed.version === 2) {
      const { values, installments } = extractFormValuesFromInstance(parsed);
      setFeeForm(values);
      setFeeInstallments(installments);
    } else {
      const { values, installments } = legacyFlatToFormValues(templateSchema, feeStructure);
      setFeeForm(values);
      setFeeInstallments(installments);
    }
    setPageTab("structures");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setAlertModal({ isOpen: true, message: "Please enter a fee structure name.", type: "warning" });
      return;
    }

    const formCheck = validateFormAgainstTemplate(templateSchema, feeForm);
    if (!formCheck.ok) {
      setAlertModal({ isOpen: true, message: formCheck.message, type: "warning" });
      return;
    }

    const instanceSchema = mergeTemplateWithFormValues(templateSchema, feeForm, feeInstallments);
    const compiled = compileFeeBuilderSchema(instanceSchema);
    if (!compiled.ok) {
      setAlertModal({ isOpen: true, message: compiled.message, type: "warning" });
      return;
    }

    const { monthlyFee, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, meals } =
      compiled.data;

    try {
      const feeStructureData = {
        name: name.trim(),
        registrationFee,
        registrationFeeInstallments,
        annualCharges,
        annualChargesInstallments,
        monthlyFee,
        meals,
        description: description.trim() || undefined,
        builderSchema: JSON.stringify(instanceSchema),
      };

      if (editingFeeStructure) {
        await updateFeeStructure({ id: editingFeeStructure.id, data: feeStructureData }).unwrap();
        setAlertModal({ isOpen: true, message: "Fee structure updated successfully!", type: "success" });
      } else {
        await addFeeStructure(feeStructureData).unwrap();
        setAlertModal({ isOpen: true, message: "Fee structure created successfully!", type: "success" });
      }

      resetForm();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save fee structure. Please try again.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateDraft) return;
    const stripped = stripTemplateValues(templateDraft);
    const v = validateFeeTemplateSchema(stripped);
    if (!v.ok) {
      setAlertModal({ isOpen: true, message: v.message, type: "warning" });
      return;
    }
    try {
      const result = await updateFeeTemplate({ schema: stripped }).unwrap();
      const next = parseFeeBuilderSchema(result.schema);
      if (next) setTemplateDraft(stripTemplateValues(next));
      setAlertModal({
        isOpen: true,
        message: "Fee builder saved. The Fee structures form now follows this layout.",
        type: "success",
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save fee builder.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleDeleteClick = (feeStructure: FeeStructure) => {
    setConfirmModal({
      isOpen: true,
      message: `Are you sure you want to delete ${feeStructure.name}?`,
      feeStructureId: feeStructure.id,
    });
  };

  const handleDeleteConfirm = async () => {
    if (confirmModal.feeStructureId) {
      try {
        await deleteFeeStructure(confirmModal.feeStructureId).unwrap();
        setAlertModal({ isOpen: true, message: "Fee structure deleted successfully!", type: "success" });
      } catch (err: unknown) {
        const message =
          err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
            ? String((err.data as { error?: string }).error)
            : "Failed to delete fee structure.";
        setAlertModal({ isOpen: true, message, type: "error" });
      }
    }
    setConfirmModal({ isOpen: false, message: "", feeStructureId: null });
  };

  if (isLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const tabBtn = (id: PageTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setPageTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        pageTab === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("structures", "Fee structures")}
        {tabBtn("builder", "Fee builder")}
      </div>

      {pageTab === "structures" && (
        <>
          <SectionCard title={editingFeeStructure ? "Edit fee structure" : "Create fee structure"}>
            <p className="text-sm text-slate-600 mb-4">
              Fields come from the{" "}
              <button type="button" onClick={() => setPageTab("builder")} className="text-blue-600 font-medium hover:underline">
                Fee builder
              </button>
              . Add any number of labeled fields (number or text). Link numbers to invoices only when needed.
            </p>

            {templateLoading ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading form layout…</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fee structure name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description (internal)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Optional internal notes"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">Fee breakdown</h3>
                  <p className="text-xs text-slate-500 mb-6">
                    {allTemplateFields(templateSchema).length === 0
                      ? "No fields in the builder yet — add fields on the Fee builder tab."
                      : "Fill in the values for this plan."}
                  </p>
                  <FeeStructureFields
                    template={templateSchema}
                    values={feeForm}
                    installments={feeInstallments}
                    onValuesChange={setFeeForm}
                    onInstallmentsChange={setFeeInstallments}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isSaving || isUpdating}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingFeeStructure ? (isUpdating ? "Updating…" : "Update") : isSaving ? "Creating…" : "Create"}
                  </button>
                  {editingFeeStructure && (
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
            )}
          </SectionCard>

          <SectionCard title="Fee structures list">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-600">
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Registration fee</th>
                    <th className="pb-3">Annual charges</th>
                    <th className="pb-3">Monthly fee</th>
                    <th className="pb-3">Meals (plan default)</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeStructures.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                        No fee structures yet. Create one above.
                      </td>
                    </tr>
                  ) : (
                    feeStructures.map((fs) => (
                      <tr key={fs.id} className="border-b border-slate-100 text-sm">
                        <td className="py-3 font-medium">{fs.name}</td>
                        <td className="py-3">
                          {fs.registrationFee ? (
                            <>
                              Rs {fs.registrationFee.toLocaleString()}
                              {fs.registrationFeeInstallments && (
                                <span className="text-xs text-slate-500 block">
                                  ({fs.registrationFeeInstallments} installments)
                                </span>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-3">
                          {fs.annualCharges ? (
                            <>
                              Rs {fs.annualCharges.toLocaleString()}
                              {fs.annualChargesInstallments && (
                                <span className="text-xs text-slate-500 block">
                                  ({fs.annualChargesInstallments} installments)
                                </span>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-3">Rs {fs.monthlyFee.toLocaleString()}</td>
                        <td className="py-3">{fs.meals ? `Rs ${fs.meals.toLocaleString()}` : "-"}</td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(fs)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(fs)}
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
        </>
      )}

      {pageTab === "builder" && (
        <SectionCard title="Fee builder">
          <p className="text-sm text-slate-600 mb-4">
            Click <strong>+ Add field</strong>, then use the right panel to set the <strong>label</strong>, choose{" "}
            <strong>number</strong> or <strong>text</strong>, and for numbers set <strong>Invoice link</strong> (monthly
            is required once for standard invoices). Use invoice link <strong>None</strong> for extra plan amounts; to
            bill specific students, use <strong>Invoices</strong> → extra charges when generating their invoice.
          </p>
          {templateLoading || !templateDraft ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading builder…</div>
          ) : (
            <>
              <FeeStructureBuilder schema={templateDraft} onChange={setTemplateDraft} />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingTemplate ? "Saving…" : "Save fee builder"}
                </button>
              </div>
            </>
          )}
        </SectionCard>
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
        onCancel={() => setConfirmModal({ isOpen: false, message: "", feeStructureId: null })}
      />
    </div>
  );
}
