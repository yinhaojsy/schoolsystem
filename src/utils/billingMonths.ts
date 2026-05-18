import { CALENDAR_MONTH_NAMES } from "./academicYear";
import { compareCalendarPeriod } from "./siblingDiscount";

/** Split stored invoice month field into individual month names (supports "June, July"). */
export function parseBillingMonths(monthStr: string | null | undefined): string[] {
  if (!monthStr?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of monthStr.split(/,\s*|\s*&\s*|\|/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const canonical =
      CALENDAR_MONTH_NAMES.find((m) => m.toLowerCase() === key) ??
      t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    result.push(canonical);
  }
  return result;
}

/** Calendar order within a billing year. */
export function sortBillingMonths(months: string[], year: number): string[] {
  return [...months].sort((a, b) => compareCalendarPeriod(a, year, b, year));
}

/** Persisted value for invoices.month (comma-separated, sorted). */
export function joinBillingMonths(months: string[], year: number): string {
  return sortBillingMonths(months, year).join(", ");
}

/** First billing period in a multi-month invoice (for prior balance / sorting). */
export function earliestBillingMonth(monthStr: string, year: number): string {
  const months = parseBillingMonths(monthStr);
  if (months.length === 0) return String(monthStr || "").trim();
  return sortBillingMonths(months, year)[0];
}

/** Human-readable label: "June 2026" or "June 2026, July 2026". */
export function formatBillingPeriodLabel(monthStr: string, year: number): string {
  const months = parseBillingMonths(monthStr);
  if (months.length === 0) {
    const raw = String(monthStr || "").trim();
    return raw ? `${raw} ${year}` : String(year);
  }
  if (months.length === 1) return `${months[0]} ${year}`;
  return sortBillingMonths(months, year)
    .map((m) => `${m} ${year}`)
    .join(", ");
}

/** Charge line label when billing multiple months on one invoice. */
export function chargeLineDescription(
  baseDescription: string,
  billingMonth: string,
  multiMonth: boolean,
): string {
  const desc = baseDescription.trim();
  if (!multiMonth || !billingMonth.trim()) return desc;
  return `${desc} (${billingMonth})`;
}

/** Whether an existing invoice row already bills this calendar month. */
export function billingPeriodOverlaps(invoiceMonthField: string, targetMonth: string): boolean {
  const covered = parseBillingMonths(invoiceMonthField);
  const target = targetMonth.trim().toLowerCase();
  if (covered.length === 0) {
    return invoiceMonthField.trim().toLowerCase() === target;
  }
  return covered.some((m) => m.toLowerCase() === target);
}
