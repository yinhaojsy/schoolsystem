import type { Invoice } from "../types";
import { earliestBillingMonth } from "./billingMonths";
import { compareCalendarPeriod } from "./siblingDiscount";

/**
 * Lowest unused positive integer roll among existing numeric roll numbers.
 * e.g. rolls 1–7 and 9–32 in use → "8"; if 1–32 all used → "33".
 */
export function suggestNextNumericRollNo(rollNumbers: Iterable<string | null | undefined>): string {
  const used = new Set<number>();
  let max = 0;
  for (const raw of rollNumbers) {
    const t = String(raw ?? "").trim();
    if (!/^\d+$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (n > 0) {
      used.add(n);
      if (n > max) max = n;
    }
  }
  for (let i = 1; i <= max; i++) {
    if (!used.has(i)) return String(i);
  }
  return String(max + 1);
}

/** Natural-order compare for roll numbers (e.g. 2 before 10). */
export function compareRollNo(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Invoice list order: roll # ascending, then newest billing period per student. */
export function compareInvoicesByRollNo(a: Invoice, b: Invoice): number {
  const roll = compareRollNo(a.studentRollNo, b.studentRollNo);
  if (roll !== 0) return roll;
  const monthA = earliestBillingMonth(a.month, a.year);
  const monthB = earliestBillingMonth(b.month, b.year);
  const period = compareCalendarPeriod(monthB, b.year, monthA, a.year);
  if (period !== 0) return period;
  return b.id - a.id;
}
