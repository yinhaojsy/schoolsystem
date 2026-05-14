import type { Student } from "../types";
import { monthNameToIndex } from "./academicYear";

/** Calendar ordering: (monthA, yearA) vs (monthB, yearB). */
export function compareCalendarPeriod(monthA: string, yearA: number, monthB: string, yearB: number): number {
  const ta = yearA * 12 + monthNameToIndex(monthA);
  const tb = yearB * 12 + monthNameToIndex(monthB);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

export function countActiveStudentsInHousehold(
  students: Pick<Student, "id" | "householdId" | "status">[],
  householdId: number | null | undefined,
): number {
  if (householdId == null) return 0;
  return students.filter((s) => s.householdId === householdId && s.status === "active").length;
}

/**
 * True when this student's monthly invoice should use configured sibling pre/post amounts
 * (fixed Rs discount on monthly only; requires ≥2 active students in the same household).
 */
export function siblingMonthlyBillingActive(
  student: Student,
  allStudents: Student[],
  invoiceMonth: string,
  invoiceYear: number,
): boolean {
  const recv = !!(student.receivesSiblingDiscount === 1 || student.receivesSiblingDiscount === true);
  if (!recv) return false;
  if (student.householdId == null) return false;
  if (student.status !== "active") return false;
  if (countActiveStudentsInHousehold(allStudents, student.householdId) < 2) return false;

  const pre = Number(student.siblingPreMonthly);
  const post = Number(student.siblingPostMonthly);
  if (!Number.isFinite(pre) || !Number.isFinite(post) || post <= 0 || post >= pre) return false;

  const fromMonth = student.siblingDiscountFromMonth?.trim();
  const fromYear = student.siblingDiscountFromYear;
  if (!fromMonth || fromYear == null || Number.isNaN(Number(fromYear))) return false;

  return compareCalendarPeriod(invoiceMonth, invoiceYear, fromMonth, Number(fromYear)) >= 0;
}
