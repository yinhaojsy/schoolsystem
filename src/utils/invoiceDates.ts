import { CALENDAR_MONTH_NAMES } from "./academicYear";

/** Local calendar date as YYYY-MM-DD. */
export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Due date = 10th of the invoice date's calendar month. */
export function dueDateOnTenthOfMonth(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}-10`;
}

/** Billing month + year + default due date from invoice date. */
export function billingDefaultsFromInvoiceDate(invoiceDateYmd: string): {
  months: string[];
  year: number;
  dueDate: string;
} | null {
  const p = parseYmd(invoiceDateYmd);
  if (!p) return null;
  return {
    months: [CALENDAR_MONTH_NAMES[p.month - 1]],
    year: p.year,
    dueDate: dueDateOnTenthOfMonth(p.year, p.month),
  };
}

export function getInitialCreateInvoiceForm() {
  const invoiceDate = todayYmd();
  const billing = billingDefaultsFromInvoiceDate(invoiceDate)!;
  return {
    studentId: "",
    invoiceDate,
    months: billing.months,
    year: String(billing.year),
    dueDate: billing.dueDate,
    remarks: "",
  };
}

/** Apply invoice-date change to billing month, year, and default due date. */
export function syncBillingFromInvoiceDate(
  invoiceDate: string,
  prev: { months: string[]; year: string; dueDate: string },
): { months: string[]; year: string; dueDate: string } | null {
  const billing = billingDefaultsFromInvoiceDate(invoiceDate);
  if (!billing) return null;
  return {
    months: billing.months,
    year: String(billing.year),
    dueDate: billing.dueDate,
  };
}

/** Display on PDF / previews (e.g. 1-May-2026). */
export function formatInvoiceDateDisplay(dateStr: string): string {
  const p = parseYmd(dateStr);
  if (!p) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString("default", { month: "short" });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  const d = new Date(p.year, p.month - 1, p.day);
  const day = d.getDate();
  const month = d.toLocaleString("default", { month: "short" });
  return `${day}-${month}-${p.year}`;
}

/** Stored invoice date, or createdAt fallback for legacy rows. */
export function invoiceDateForDisplay(invoice: { invoiceDate?: string | null; createdAt?: string }): string {
  const raw = invoice.invoiceDate?.trim() || invoice.createdAt || "";
  if (!raw) return formatInvoiceDateDisplay(todayYmd());
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatInvoiceDateDisplay(raw);
  return formatInvoiceDateDisplay(raw.slice(0, 10));
}

/** Due date for invoice header (YYYY-MM-DD or ISO). */
export function dueDateForDisplay(dueDate: string | null | undefined): string {
  const raw = String(dueDate || "").trim();
  if (!raw) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatInvoiceDateDisplay(raw);
  return formatInvoiceDateDisplay(raw.slice(0, 10));
}
