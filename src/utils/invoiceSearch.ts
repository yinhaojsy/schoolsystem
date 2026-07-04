/** Match invoice list search by student/participant name or roll number. */
export function invoiceMatchesNameRollSearch(
  inv: {
    studentName?: string | null;
    studentRollNo?: string | null;
    billingName?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (inv.billingName ?? inv.studentName ?? "").toLowerCase();
  const roll = String(inv.studentRollNo ?? "").toLowerCase();
  return name.includes(q) || roll.includes(q);
}
