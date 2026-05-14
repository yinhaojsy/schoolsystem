/**
 * Academic / fiscal year for billing: **August → July** (next calendar year).
 * The "academic year start" is the calendar year of the August that begins the cycle.
 * Example: Sep 2025 and Jul 2026 both belong to academic year starting Aug 2025 → key `2025`.
 */

export const CALENDAR_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function monthNameToIndex(month: string): number {
  const key = month.trim().toLowerCase();
  return MONTH_INDEX[key] ?? 1;
}

/** Calendar year of the August that starts the academic year containing this invoice period. */
export function academicYearStart(invoiceMonth: string, invoiceYear: number): number {
  const m = monthNameToIndex(invoiceMonth);
  if (m >= 8) return invoiceYear;
  return invoiceYear - 1;
}

export function academicYearLabel(ayStart: number): string {
  return `Aug ${ayStart} – Jul ${ayStart + 1}`;
}
