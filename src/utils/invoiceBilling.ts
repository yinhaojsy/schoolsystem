import type { Invoice, InvoiceItem } from "../types";
import { academicYearStart } from "./academicYear";

function isChargeLine(it: InvoiceItem): boolean {
  return (it.type ?? "charge") === "charge";
}

/** Count registration charge lines on prior invoices (for diagnostics / edge cases). */
export function countRegistrationLines(pastInvoices: Invoice[]): number {
  let n = 0;
  for (const inv of pastInvoices) {
    for (const it of inv.items ?? []) {
      if (isChargeLine(it) && it.chargeType === "registration") n += 1;
    }
  }
  return n;
}

/** How many annual charge lines already exist in the given academic year (Aug–Jul). */
export function countAnnualChargeLinesInAcademicYear(
  pastInvoices: Invoice[],
  academicYearKey: number,
): number {
  let n = 0;
  for (const inv of pastInvoices) {
    if (academicYearStart(inv.month, inv.year) !== academicYearKey) continue;
    for (const it of inv.items ?? []) {
      if (isChargeLine(it) && it.chargeType === "annual") n += 1;
    }
  }
  return n;
}
