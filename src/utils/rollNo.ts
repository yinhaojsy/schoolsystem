import type { Invoice } from "../types";
import { earliestBillingMonth } from "./billingMonths";
import { compareCalendarPeriod } from "./siblingDiscount";

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
