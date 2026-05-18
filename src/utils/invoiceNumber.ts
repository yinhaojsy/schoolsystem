import { parseYmd } from "./invoiceDates";

export type InvoiceNumberStudentPart = "rollNo" | "studentName";
export type InvoiceNumberSequenceDigits = 3 | 4;

export interface InvoiceNumberSettings {
  /** Optional prefix, e.g. INV (shown before a hyphen). */
  invoiceNoPrefix: string;
  invoiceNoStudentPart: InvoiceNumberStudentPart;
  invoiceNoSequenceDigits: InvoiceNumberSequenceDigits;
}

export const DEFAULT_INVOICE_NUMBER_SETTINGS: InvoiceNumberSettings = {
  invoiceNoPrefix: "INV",
  invoiceNoStudentPart: "rollNo",
  invoiceNoSequenceDigits: 3,
};

export function rollNoForInvoiceNo(rollNo: string | null | undefined): string {
  return String(rollNo ?? "").trim().replace(/\s+/g, "") || "0";
}

/** Compressed uppercase alphanumeric from student name. */
export function studentNameForInvoiceNo(name: string | null | undefined): string {
  const compact = String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return compact || "STUDENT";
}

export function studentPartForInvoiceNo(
  studentPart: InvoiceNumberStudentPart,
  student: { rollNo?: string; name?: string },
): string {
  return studentPart === "rollNo"
    ? rollNoForInvoiceNo(student.rollNo)
    : studentNameForInvoiceNo(student.name);
}

/**
 * Build invoice number: {prefix}-{roll}{YYYY}{MM}{seq}
 * Example: INV-32202605001
 */
export function buildInvoiceNumber(
  settings: InvoiceNumberSettings,
  student: { rollNo?: string; name?: string },
  invoiceDateYmd: string,
  sequence: number,
): string {
  const p = parseYmd(invoiceDateYmd);
  const year = p?.year ?? new Date().getFullYear();
  const month = p?.month ?? new Date().getMonth() + 1;
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const seq = String(Math.max(1, Math.floor(sequence))).padStart(settings.invoiceNoSequenceDigits, "0");
  const idPart = studentPartForInvoiceNo(settings.invoiceNoStudentPart, student);
  const core = `${idPart}${yyyy}${mm}${seq}`;
  const prefix = settings.invoiceNoPrefix.trim();
  return prefix ? `${prefix}-${core}` : core;
}

/** Human-readable pattern for the template settings tab. */
export function describeInvoiceNumberPattern(settings: InvoiceNumberSettings): string {
  const prefix = settings.invoiceNoPrefix.trim();
  const idLabel = settings.invoiceNoStudentPart === "rollNo" ? "Roll #" : "Student name";
  const seq = "0".repeat(settings.invoiceNoSequenceDigits - 1) + "1";
  const p = prefix ? `${prefix}-` : "";
  return `${p}[${idLabel}]YYYYMM${seq}`;
}
