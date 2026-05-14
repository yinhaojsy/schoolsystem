/**
 * Fee builder schema v2: one field type — label + number or text.
 * Number fields can optionally link to invoice columns via billingMap.
 */
export type FeeFieldInputType = "number" | "text";
export type FeeFieldBillingMap = "monthly" | "registration" | "annual" | "meals";

export interface FeeBuilderField {
  id: string;
  label: string;
  inputType: FeeFieldInputType;
  /**
   * Only for number fields. When set, values are stored on the fee structure row.
   * monthly / registration / annual are used when generating invoices.
   * meals is the plan default rate only — billing is per-student via recurring additional charges.
   */
  billingMap?: FeeFieldBillingMap;
  /** When true, user must fill this field on the fee structure form (if it appears). */
  required?: boolean;
  /**
   * For number fields with registration / annual billing: show installments on the fee form.
   */
  allowInstallments?: boolean;
  /** Present on saved fee structures (instance JSON). */
  value?: string;
  /** Parsed installments on instance (registration / annual). */
  installments?: number;
}

export interface FeeBuilderSection {
  id: string;
  title: string;
  order: number;
  fields: FeeBuilderField[];
}

export interface FeeBuilderSchema {
  version: 2;
  sections: FeeBuilderSection[];
}

export const FEE_BUILDER_VERSION = 2 as const;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newFeeField(partial?: Partial<Pick<FeeBuilderField, "inputType" | "label">>): FeeBuilderField {
  return {
    id: `f_${uid()}`,
    label: partial?.label ?? "",
    inputType: partial?.inputType ?? "number",
    required: false,
    allowInstallments: false,
  };
}

export function emptyFeeBuilderSchema(): FeeBuilderSchema {
  return {
    version: FEE_BUILDER_VERSION,
    sections: [
      {
        id: `sec_${uid()}`,
        title: "Fee components",
        order: 0,
        fields: [
          {
            ...newFeeField({ label: "Monthly tuition", inputType: "number" }),
            billingMap: "monthly",
            required: true,
          },
        ],
      },
    ],
  };
}

// ── v1 legacy (migrate on read) ─────────────────────────────────────────────

type FeeBuilderLineTypeV1 = "monthly" | "registration" | "annual" | "meals" | "note";

interface FeeBuilderLineV1 {
  id: string;
  type: FeeBuilderLineTypeV1;
  label?: string;
  amount?: number;
  installments?: number;
  noteText?: string;
  required?: boolean;
}

interface FeeBuilderSchemaV1 {
  version: 1;
  sections: Array<{
    id: string;
    title: string;
    order: number;
    lines: FeeBuilderLineV1[];
  }>;
}

function migrateV1ToV2(v1: FeeBuilderSchemaV1): FeeBuilderSchema {
  const sections = v1.sections.map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    fields: s.lines.map((line): FeeBuilderField => {
      if (line.type === "note") {
        return {
          id: line.id.startsWith("ln_") ? line.id.replace(/^ln_/, "f_") : line.id,
          label: line.label?.trim() || "Note",
          inputType: "text",
          required: false,
          value: line.noteText,
        };
      }
      const map: Record<Exclude<FeeBuilderLineTypeV1, "note">, FeeFieldBillingMap> = {
        monthly: "monthly",
        registration: "registration",
        annual: "annual",
        meals: "meals",
      };
      const billingMap = map[line.type];
      return {
        id: line.id.startsWith("ln_") ? line.id.replace(/^ln_/, "f_") : line.id,
        label: line.label?.trim() || billingMap,
        inputType: "number",
        billingMap,
        required: line.type === "monthly" ? true : Boolean(line.required),
        allowInstallments: line.type === "registration" || line.type === "annual",
        value: line.amount != null ? String(line.amount) : undefined,
        installments: line.installments,
      };
    }),
  }));
  return { version: 2, sections };
}

/** Parse stored JSON: v2 or migrate v1 → v2 */
export function parseFeeBuilderSchema(raw: string | null | undefined): FeeBuilderSchema | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw) as { version?: number; sections?: unknown[] };
    if (v.version === 2 && Array.isArray(v.sections)) {
      return v as unknown as FeeBuilderSchema;
    }
    if (v.version === 1 && Array.isArray(v.sections)) {
      return migrateV1ToV2(v as unknown as FeeBuilderSchemaV1);
    }
    return null;
  } catch {
    return null;
  }
}

export interface CompiledFeeFlat {
  monthlyFee: number;
  registrationFee?: number;
  registrationFeeInstallments?: number;
  annualCharges?: number;
  annualChargesInstallments?: number;
  meals?: number;
}

function allFields(schema: FeeBuilderSchema): FeeBuilderField[] {
  return [...schema.sections].sort((a, b) => a.order - b.order).flatMap((s) => s.fields);
}

/** From a saved instance schema (fields carry value / installments). */
export function compileFeeBuilderSchema(schema: FeeBuilderSchema):
  | { ok: true; data: CompiledFeeFlat }
  | { ok: false; message: string } {
  const fields = allFields(schema);
  const byMap = {
    monthly: [] as FeeBuilderField[],
    registration: [] as FeeBuilderField[],
    annual: [] as FeeBuilderField[],
    meals: [] as FeeBuilderField[],
  };

  for (const f of fields) {
    if (f.inputType !== "number" || !f.billingMap) continue;
    byMap[f.billingMap].push(f);
  }

  if (byMap.monthly.length !== 1) {
    return {
      ok: false,
      message:
        byMap.monthly.length === 0
          ? "Template needs exactly one number field linked to “Monthly tuition” billing."
          : "Only one field can be linked to monthly billing.",
    };
  }
  for (const key of ["registration", "annual", "meals"] as const) {
    if (byMap[key].length > 1) {
      return { ok: false, message: `Only one field can be linked to ${key} billing.` };
    }
  }

  const monthly = byMap.monthly[0];
  const monthlyNum = parseFloat((monthly.value ?? "").trim());
  if (!monthly.value?.trim() || Number.isNaN(monthlyNum) || monthlyNum <= 0) {
    return { ok: false, message: "Monthly amount must be greater than zero." };
  }

  const data: CompiledFeeFlat = { monthlyFee: monthlyNum };

  const parseOptionalAmount = (f: FeeBuilderField | undefined) => {
    if (!f) return undefined;
    const t = (f.value ?? "").trim();
    if (t === "") return undefined;
    const n = parseFloat(t);
    if (Number.isNaN(n) || n < 0) return NaN;
    return n;
  };

  const reg = byMap.registration[0];
  if (reg) {
    if (reg.required) {
      const t = (reg.value ?? "").trim();
      if (t === "") return { ok: false, message: `${reg.label || "Registration"} is required.` };
    }
    const a = parseOptionalAmount(reg);
    if (a !== undefined && Number.isNaN(a)) {
      return { ok: false, message: `Invalid amount for ${reg.label || "registration"}.` };
    }
    if (a != null && a > 0) {
      data.registrationFee = a;
      if (reg.allowInstallments && reg.installments != null) {
        const inst = reg.installments;
        if (!Number.isInteger(inst) || inst < 1) {
          return { ok: false, message: "Registration installments must be a whole number ≥ 1." };
        }
        data.registrationFeeInstallments = inst;
      }
    }
  }

  const ann = byMap.annual[0];
  if (ann) {
    if (ann.required) {
      const t = (ann.value ?? "").trim();
      if (t === "") return { ok: false, message: `${ann.label || "Annual"} is required.` };
    }
    const a = parseOptionalAmount(ann);
    if (a !== undefined && Number.isNaN(a)) {
      return { ok: false, message: `Invalid amount for ${ann.label || "annual charges"}.` };
    }
    if (a != null && a > 0) {
      data.annualCharges = a;
      if (ann.allowInstallments && ann.installments != null) {
        const inst = ann.installments;
        if (!Number.isInteger(inst) || inst < 1) {
          return { ok: false, message: "Annual installments must be a whole number ≥ 1." };
        }
        data.annualChargesInstallments = inst;
      }
    }
  }

  const meals = byMap.meals[0];
  if (meals) {
    if (meals.required) {
      const t = (meals.value ?? "").trim();
      if (t === "") return { ok: false, message: `${meals.label || "Meals"} is required.` };
    }
    const a = parseOptionalAmount(meals);
    if (a !== undefined && Number.isNaN(a)) {
      return { ok: false, message: `Invalid amount for ${meals.label || "meals"}.` };
    }
    if (a != null && a > 0) data.meals = a;
  }

  return { ok: true, data };
}

export function validateFeeTemplateSchema(schema: FeeBuilderSchema): { ok: true } | { ok: false; message: string } {
  const fields = allFields(schema);
  const maps = { monthly: 0, registration: 0, annual: 0, meals: 0 };
  for (const f of fields) {
    if (f.inputType === "text") {
      if (f.billingMap) return { ok: false, message: "Text fields cannot be linked to billing." };
      continue;
    }
    if (!f.billingMap) continue;
    maps[f.billingMap]++;
  }
  if (maps.monthly !== 1) {
    return {
      ok: false,
      message: "Add exactly one number field and set billing to “Monthly tuition (required for invoices)”.",
    };
  }
  if (maps.registration > 1 || maps.annual > 1 || maps.meals > 1) {
    return { ok: false, message: "At most one field each for registration, annual, and meals billing." };
  }
  return { ok: true };
}

export type FeeStructureFormValues = Record<string, string>;
export type FeeInstallmentFormValues = Record<string, string>;

export function emptyDynamicFormValues(): FeeStructureFormValues {
  return {};
}

/** Build instance schema for API (template + form state). */
export function mergeTemplateWithFormValues(
  template: FeeBuilderSchema,
  values: FeeStructureFormValues,
  installments: FeeInstallmentFormValues,
): FeeBuilderSchema {
  const clone = JSON.parse(JSON.stringify(template)) as FeeBuilderSchema;
  for (const sec of clone.sections) {
    for (const field of sec.fields) {
      if (field.inputType === "number") {
        field.value = values[field.id] ?? "";
        if (field.allowInstallments && (field.billingMap === "registration" || field.billingMap === "annual")) {
          const is = (installments[field.id] ?? "").trim();
          field.installments = is === "" ? undefined : parseInt(is, 10);
          if (field.installments != null && (Number.isNaN(field.installments) || field.installments < 1)) {
            field.installments = undefined;
          }
        }
      } else {
        field.value = values[field.id] ?? "";
      }
    }
  }
  return clone;
}

export function extractFormValuesFromInstance(schema: FeeBuilderSchema): {
  values: FeeStructureFormValues;
  installments: FeeInstallmentFormValues;
} {
  const values: FeeStructureFormValues = {};
  const installments: FeeInstallmentFormValues = {};
  for (const f of allFields(schema)) {
    values[f.id] = f.value ?? "";
    if (f.allowInstallments && f.installments != null) {
      installments[f.id] = String(f.installments);
    }
  }
  return { values, installments };
}

export function validateFormAgainstTemplate(
  template: FeeBuilderSchema,
  values: FeeStructureFormValues,
): { ok: true } | { ok: false; message: string } {
  for (const f of allFields(template)) {
    if (!f.required) continue;
    const v = (values[f.id] ?? "").trim();
    if (v === "") {
      return { ok: false, message: `“${f.label || "Field"}” is required.` };
    }
    if (f.inputType === "number") {
      const n = parseFloat(v);
      if (Number.isNaN(n) || n < 0) {
        return { ok: false, message: `“${f.label || "Field"}” must be a valid number (≥ 0).` };
      }
    }
  }
  return { ok: true };
}

/** Legacy DB row → form values using current template field ids. */
export function legacyFlatToFormValues(
  template: FeeBuilderSchema,
  fs: {
    monthlyFee: number;
    registrationFee?: number | null;
    registrationFeeInstallments?: number | null;
    annualCharges?: number | null;
    annualChargesInstallments?: number | null;
    meals?: number | null;
  },
): { values: FeeStructureFormValues; installments: FeeInstallmentFormValues } {
  const values: FeeStructureFormValues = {};
  const installments: FeeInstallmentFormValues = {};
  for (const f of allFields(template)) {
    if (f.inputType === "text") {
      values[f.id] = "";
      continue;
    }
    if (f.billingMap === "monthly") {
      values[f.id] = fs.monthlyFee != null ? String(fs.monthlyFee) : "";
    } else if (f.billingMap === "registration") {
      values[f.id] = fs.registrationFee != null ? String(fs.registrationFee) : "";
      if (fs.registrationFeeInstallments != null) {
        installments[f.id] = String(fs.registrationFeeInstallments);
      }
    } else if (f.billingMap === "annual") {
      values[f.id] = fs.annualCharges != null ? String(fs.annualCharges) : "";
      if (fs.annualChargesInstallments != null) {
        installments[f.id] = String(fs.annualChargesInstallments);
      }
    } else if (f.billingMap === "meals") {
      values[f.id] = fs.meals != null ? String(fs.meals) : "";
    } else {
      values[f.id] = "";
    }
  }
  return { values, installments };
}

export function displayFieldLabel(f: FeeBuilderField): string {
  return f.label?.trim() || (f.inputType === "number" ? "Amount" : "Text");
}

/** Template rows should not carry saved instance values. */
export function stripTemplateValues(schema: FeeBuilderSchema): FeeBuilderSchema {
  const c = JSON.parse(JSON.stringify(schema)) as FeeBuilderSchema;
  for (const s of c.sections) {
    for (const f of s.fields) {
      delete f.value;
      delete f.installments;
    }
  }
  return c;
}
