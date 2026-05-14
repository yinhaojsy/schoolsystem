/**
 * Fee builder v2: sections of fields — each field is label + number or text only.
 */
import { useState, useRef } from "react";
import type { FeeBuilderSchema, FeeBuilderSection, FeeBuilderField } from "../../types/feeBuilder";
import {
  newFeeField,
  validateFeeTemplateSchema,
  displayFieldLabel,
  type FeeFieldBillingMap,
} from "../../types/feeBuilder";

const BILLING_OPTIONS: { value: FeeFieldBillingMap | ""; label: string }[] = [
  {
    value: "",
    label: "None — extra charge on this plan only (amount saved; use Invoices → student extras to bill)",
  },
  { value: "monthly", label: "Monthly tuition (required for invoices)" },
  { value: "registration", label: "Registration fee" },
  { value: "annual", label: "Annual charges" },
  { value: "meals", label: "Meals (plan default — subscribe per student on Invoices)" },
];

function FieldRow({
  field,
  selected,
  onSelect,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: FeeBuilderField;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const title = displayFieldLabel(field);
  const sub =
    field.inputType === "text"
      ? "Text input"
      : field.billingMap
        ? `Number · ${BILLING_OPTIONS.find((o) => o.value === field.billingMap)?.label ?? field.billingMap}`
        : "Number · extra (no invoice slot)";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors overflow-hidden ${
        selected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      onClick={onSelect}
    >
      <div className="cursor-grab text-slate-300 select-none px-1 shrink-0" title="Drag to reorder">
        ⠿
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-sm font-semibold text-slate-900 truncate">{title || "Untitled field"}</div>
        <div className="text-xs text-slate-500 truncate">{sub}</div>
        {field.required && <span className="text-xs text-rose-500">Required</span>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={isFirst}
          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={isLast}
          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 text-slate-400 hover:text-rose-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function FieldProperties({ field, onChange }: { field: FeeBuilderField; onChange: (f: FeeBuilderField) => void }) {
  const labelBase = "block text-xs font-medium text-slate-600 mb-0.5";
  const inputBase =
    "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";
  const up = (patch: Partial<FeeBuilderField>) => onChange({ ...field, ...patch });

  const isRegOrAnnual = field.billingMap === "registration" || field.billingMap === "annual";

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-800">Field</h4>
      <div>
        <label className={labelBase}>Label</label>
        <input
          type="text"
          className={inputBase}
          value={field.label}
          onChange={(e) => up({ label: e.target.value })}
          placeholder="e.g. Monthly fee, Library deposit…"
        />
      </div>
      <div>
        <label className={labelBase}>Input type</label>
        <select
          className={inputBase}
          value={field.inputType}
          onChange={(e) => {
            const inputType = e.target.value as FeeBuilderField["inputType"];
            if (inputType === "text") {
              up({ inputType: "text", billingMap: undefined, allowInstallments: false });
            } else {
              up({ inputType: "number" });
            }
          }}
        >
          <option value="number">Number (amount)</option>
          <option value="text">Text</option>
        </select>
      </div>

      {field.inputType === "number" && (
        <div>
          <label className={labelBase}>Invoice link</label>
          <select
            className={inputBase}
            value={field.billingMap ?? ""}
            onChange={(e) => {
              const v = e.target.value as FeeFieldBillingMap | "";
              const billingMap = v === "" ? undefined : v;
              up({
                billingMap,
                allowInstallments: billingMap === "registration" || billingMap === "annual",
              });
            }}
          >
            {BILLING_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Choose <strong>None</strong> for optional amounts on the fee plan. <strong>Meals</strong> saves a default rate
            on the plan only — each student needs a recurring extra charge on the invoice screen until you remove it.
            Monthly, registration, and annual links feed the standard invoice generator directly.
          </p>
        </div>
      )}

      {field.inputType === "number" && isRegOrAnnual && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            id={`inst_${field.id}`}
            checked={Boolean(field.allowInstallments)}
            onChange={(e) => up({ allowInstallments: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor={`inst_${field.id}`} className="text-sm text-slate-700 cursor-pointer">
            Ask for installments on the fee structure form
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <input
          type="checkbox"
          id={`req_${field.id}`}
          checked={Boolean(field.required)}
          onChange={(e) => up({ required: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        <label htmlFor={`req_${field.id}`} className="text-sm text-slate-700 cursor-pointer">
          Required when creating a fee structure
        </label>
      </div>
    </div>
  );
}

interface Props {
  schema: FeeBuilderSchema;
  onChange: (schema: FeeBuilderSchema) => void;
}

export default function FeeStructureBuilder({ schema, onChange }: Props) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [tab, setTab] = useState<"build" | "preview">("build");
  const dragFieldRef = useRef<{ sectionId: string; fieldIdx: number } | null>(null);
  const dragOverFieldRef = useRef<{ sectionId: string; fieldIdx: number } | null>(null);
  const dragSectionRef = useRef<number | null>(null);
  const dragOverSectionRef = useRef<number | null>(null);

  const up = (patch: Partial<FeeBuilderSchema>) => onChange({ ...schema, ...patch });
  const sections = [...schema.sections].sort((a, b) => a.order - b.order);

  const updateSection = (id: string, patch: Partial<FeeBuilderSection>) => {
    up({
      sections: schema.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const addSection = () => {
    const id = `sec_${Math.random().toString(36).slice(2, 10)}`;
    const sec: FeeBuilderSection = { id, title: "New section", order: sections.length, fields: [] };
    up({ sections: [...schema.sections, sec] });
    setSelectedFieldId(null);
  };

  const deleteSection = (id: string) => {
    up({ sections: schema.sections.filter((s) => s.id !== id) });
    setSelectedFieldId(null);
  };

  const moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    const arr = [...sections];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    up({ sections: arr.map((s, i) => ({ ...s, order: i })) });
  };

  const moveSectionDown = (idx: number) => {
    if (idx >= sections.length - 1) return;
    const arr = [...sections];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    up({ sections: arr.map((s, i) => ({ ...s, order: i })) });
  };

  const addField = (sectionId: string) => {
    const field = newFeeField();
    updateSection(sectionId, {
      fields: [...(sections.find((s) => s.id === sectionId)?.fields || []), field],
    });
    setSelectedFieldId(field.id);
  };

  const updateField = (sectionId: string, fieldId: string, updated: FeeBuilderField) => {
    updateSection(sectionId, {
      fields: (sections.find((s) => s.id === sectionId)?.fields || []).map((f) => (f.id === fieldId ? updated : f)),
    });
  };

  const deleteField = (sectionId: string, fieldId: string) => {
    updateSection(sectionId, {
      fields: (sections.find((s) => s.id === sectionId)?.fields || []).filter((f) => f.id !== fieldId),
    });
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const moveFieldUp = (sectionId: string, idx: number) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec || idx === 0) return;
    const fields = [...sec.fields];
    [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
    updateSection(sectionId, { fields });
  };

  const moveFieldDown = (sectionId: string, idx: number) => {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec || idx >= sec.fields.length - 1) return;
    const fields = [...sec.fields];
    [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
    updateSection(sectionId, { fields });
  };

  const selectedField = selectedFieldId
    ? sections.flatMap((s) => s.fields).find((f) => f.id === selectedFieldId) ?? null
    : null;
  const selectedFieldSectionId = selectedFieldId
    ? sections.find((s) => s.fields.some((f) => f.id === selectedFieldId))?.id ?? null
    : null;

  const onSectionDragStart = (idx: number) => {
    dragSectionRef.current = idx;
  };
  const onSectionDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverSectionRef.current = idx;
  };
  const onSectionDrop = () => {
    const from = dragSectionRef.current;
    const to = dragOverSectionRef.current;
    if (from == null || to == null || from === to) return;
    const arr = [...sections];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    up({ sections: arr.map((s, i) => ({ ...s, order: i })) });
    dragSectionRef.current = null;
    dragOverSectionRef.current = null;
  };

  const onFieldDragStart = (sectionId: string, idx: number) => {
    dragFieldRef.current = { sectionId, fieldIdx: idx };
  };
  const onFieldDragOver = (e: React.DragEvent, sectionId: string, idx: number) => {
    e.preventDefault();
    dragOverFieldRef.current = { sectionId, fieldIdx: idx };
  };
  const onFieldDrop = (targetSectionId: string) => {
    const from = dragFieldRef.current;
    const to = dragOverFieldRef.current;
    if (!from || !to) return;
    if (from.sectionId !== targetSectionId) return;
    if (from.fieldIdx === to.fieldIdx) return;
    const sec = sections.find((s) => s.id === targetSectionId);
    if (!sec) return;
    const fields = [...sec.fields];
    const [moved] = fields.splice(from.fieldIdx, 1);
    fields.splice(to.fieldIdx, 0, moved);
    updateSection(targetSectionId, { fields });
    dragFieldRef.current = null;
    dragOverFieldRef.current = null;
  };

  const templateCheck = validateFeeTemplateSchema(schema);
  const tabBtn = (t: typeof tab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <p className="text-xs text-slate-500 max-w-xl">
          Use <strong>+ Add field</strong> for each row, then set <strong>label</strong> and <strong>input type</strong>
          (number or text) in the panel. For number fields, use <strong>Invoice link</strong> for standard billing, or{" "}
          <strong>None</strong> for extra amounts stored only on the fee plan (bill students via Invoices → extra
          charges).
        </p>
        <div className="flex items-center gap-2">
          {tabBtn("build", "Build")}
          {tabBtn("preview", "Preview")}
        </div>
      </div>

      {tab === "build" && (
        <div className="flex gap-4 min-h-[480px] flex-col lg:flex-row">
          <div className="flex-1 min-w-0 space-y-4 overflow-y-auto max-h-[72vh] pr-1">
            {sections.map((section, secIdx) => (
              <div
                key={section.id}
                draggable
                onDragStart={() => onSectionDragStart(secIdx)}
                onDragOver={(e) => onSectionDragOver(e, secIdx)}
                onDrop={onSectionDrop}
                className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <div className="cursor-grab text-slate-300 select-none">⠿</div>
                  <input
                    className="flex-1 rounded-lg border border-transparent bg-white px-2.5 py-1 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    placeholder="Section title"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSectionUp(secIdx)}
                      disabled={secIdx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSectionDown(secIdx)}
                      disabled={secIdx === sections.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSection(section.id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div
                  className="space-y-1.5 px-3 pb-1 min-h-[40px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onFieldDrop(section.id)}
                >
                  {section.fields.map((field, fIdx) => (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={() => onFieldDragStart(section.id, fIdx)}
                      onDragOver={(e) => onFieldDragOver(e, section.id, fIdx)}
                    >
                      <FieldRow
                        field={field}
                        selected={selectedFieldId === field.id}
                        onSelect={() => setSelectedFieldId(field.id)}
                        onDelete={() => deleteField(section.id, field.id)}
                        onMoveUp={() => moveFieldUp(section.id, fIdx)}
                        onMoveDown={() => moveFieldDown(section.id, fIdx)}
                        isFirst={fIdx === 0}
                        isLast={fIdx === section.fields.length - 1}
                      />
                    </div>
                  ))}
                  {section.fields.length === 0 && (
                    <div className="py-2 text-center text-xs text-slate-400">No fields yet</div>
                  )}
                </div>

                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => addField(section.id)}
                    className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600"
                  >
                    + Add field
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addSection}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600"
            >
              + Add section
            </button>
          </div>

          <div className="w-full lg:w-80 shrink-0 rounded-xl border border-slate-200 bg-white p-4 overflow-y-auto max-h-[72vh]">
            {selectedField && selectedFieldSectionId ? (
              <FieldProperties
                field={selectedField}
                onChange={(updated) => updateField(selectedFieldSectionId, selectedField.id, updated)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-sm text-slate-400 gap-2 py-8">
                <span className="text-2xl">←</span>
                <p>Click a field to edit label, type, and invoice link</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 max-h-[72vh] overflow-y-auto space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Form preview</h3>
            <p className="text-xs text-slate-400 mt-1">Rough layout of the Fee structures tab.</p>
          </div>
          {!templateCheck.ok && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {templateCheck.message}
            </div>
          )}
          {sections.map((section) => (
            <div key={section.id}>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-1">{section.title}</h4>
              <ul className="space-y-2">
                {section.fields.map((f) => (
                  <li key={f.id} className="text-sm border border-slate-100 rounded-lg px-3 py-2">
                    <span className="font-medium text-slate-800">{displayFieldLabel(f)}</span>
                    {f.required && <span className="text-rose-500 ml-1">*</span>}
                    <span className="text-slate-400 text-xs ml-2">
                      ({f.inputType}
                      {f.inputType === "number" && f.billingMap ? ` · ${f.billingMap}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
