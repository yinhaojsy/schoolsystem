/** @typedef {'rollNo' | 'studentName'} InvoiceNumberStudentPart */

/**
 * @param {string | null | undefined} rollNo
 */
export function rollNoForInvoiceNo(rollNo) {
  return String(rollNo ?? "").trim().replace(/\s+/g, "") || "0";
}

/**
 * @param {string | null | undefined} name
 */
export function studentNameForInvoiceNo(name) {
  const compact = String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return compact || "STUDENT";
}

/**
 * @param {InvoiceNumberStudentPart} studentPart
 * @param {{ rollNo?: string, name?: string }} student
 */
export function studentPartForInvoiceNo(studentPart, student) {
  return studentPart === "rollNo"
    ? rollNoForInvoiceNo(student.rollNo)
    : studentNameForInvoiceNo(student.name);
}

/**
 * @param {string} dateStr YYYY-MM-DD
 */
function parseYmd(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * @param {{ invoiceNoPrefix?: string, invoiceNoStudentPart?: string, invoiceNoSequenceDigits?: number }} settings
 * @param {{ rollNo?: string, name?: string }} student
 * @param {string} invoiceDateYmd
 * @param {number} sequence
 */
export function buildInvoiceNumber(settings, student, invoiceDateYmd, sequence) {
  const p = parseYmd(invoiceDateYmd);
  const year = p?.year ?? new Date().getFullYear();
  const month = p?.month ?? new Date().getMonth() + 1;
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const digits = settings.invoiceNoSequenceDigits === 4 ? 4 : 3;
  const seq = String(Math.max(1, Math.floor(sequence))).padStart(digits, "0");
  const idPart = studentPartForInvoiceNo(
    settings.invoiceNoStudentPart === "studentName" ? "studentName" : "rollNo",
    student,
  );
  const core = `${idPart}${yyyy}${mm}${seq}`;
  const prefix = String(settings.invoiceNoPrefix ?? "").trim();
  return prefix ? `${prefix}-${core}` : core;
}

/**
 * Count invoices in the same calendar month as invoiceDate (for global sequence).
 * @param {import('better-sqlite3').Database} db
 * @param {string} invoiceDateYmd
 */
export function nextInvoiceSequenceForMonth(db, invoiceDateYmd) {
  const p = parseYmd(invoiceDateYmd);
  if (!p) return 1;
  const ym = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM invoices
       WHERE strftime('%Y-%m', COALESCE(invoiceDate, date(createdAt))) = ?`,
    )
    .get(ym);
  return (row?.c ?? 0) + 1;
}
