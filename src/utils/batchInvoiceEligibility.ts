import type { FeeStructure, Invoice, Student } from "../types";
import { billingPeriodOverlaps } from "./billingMonths";

export type BatchStudentEligibility =
  | "ready"
  | "already_billed"
  | "no_fee_structure"
  | "inactive"
  | "drop_in";

export function getBatchStudentEligibility(
  student: Student,
  feeStructures: FeeStructure[],
  studentInvoices: Invoice[],
  billingMonths: string[],
  year: number,
): BatchStudentEligibility {
  if (student.status !== "active") return "inactive";
  if ((student.enrollmentType ?? "regular") === "drop_in") return "drop_in";
  const fs = feeStructures.find((f) => f.id === student.feeStructureId);
  if (!fs) return "no_fee_structure";
  for (const inv of studentInvoices) {
    if (inv.year !== year) continue;
    for (const m of billingMonths) {
      if (billingPeriodOverlaps(inv.month, m)) return "already_billed";
    }
  }
  return "ready";
}

export const BATCH_ELIGIBILITY_LABELS: Record<BatchStudentEligibility, string> = {
  ready: "Ready",
  already_billed: "Already billed",
  no_fee_structure: "No fee plan",
  inactive: "Inactive",
  drop_in: "Drop-in (use Drop-in invoices tab)",
};
