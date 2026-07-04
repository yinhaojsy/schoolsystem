import { db } from "./db.js";
import { roundMoney } from "./paymentEngine.js";

const DROP_IN_FEE_STRUCTURE_NAME = "Drop-in";

export function ensureDropInFeeStructure() {
  const existing = db.prepare("SELECT id FROM fee_structures WHERE name = ?").get(DROP_IN_FEE_STRUCTURE_NAME);
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO fee_structures (name, registrationFee, annualCharges, monthlyFee, meals, description)
       VALUES (?, NULL, NULL, 0, NULL, ?)`,
    )
    .run(DROP_IN_FEE_STRUCTURE_NAME, "Zero plan for drop-in students (billed via Drop-in invoices)");
  return result.lastInsertRowid;
}

export function applyDropInFeeExemptions(studentId) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid)) return;
  const upsert = db.prepare(`
    INSERT INTO student_fee_overrides (studentId, chargeType, amount, isExempt, notes)
    VALUES (?, ?, NULL, 1, 'Drop-in student')
    ON CONFLICT(studentId, chargeType) DO UPDATE SET isExempt = 1, notes = excluded.notes
  `);
  for (const chargeType of ["registration", "annual", "monthly"]) {
    upsert.run(sid, chargeType);
  }
}

export function countPresentDays(studentId, year, month) {
  const sid = parseInt(studentId, 10);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(sid) || Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStr = String(m).padStart(2, "0");
  const startDate = `${y}-${monthStr}-01`;
  const endDate = `${y}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM student_attendance
       WHERE studentId = ? AND status = 'present' AND entryDate >= ? AND entryDate <= ?`,
    )
    .get(sid, startDate, endDate);
  return row?.c ?? 0;
}

export function listPresentDates(studentId, year, month) {
  const sid = parseInt(studentId, 10);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(sid) || Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStr = String(m).padStart(2, "0");
  const startDate = `${y}-${monthStr}-01`;
  const endDate = `${y}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
  const rows = db
    .prepare(
      `SELECT entryDate FROM student_attendance
       WHERE studentId = ? AND status = 'present' AND entryDate >= ? AND entryDate <= ?
       ORDER BY entryDate ASC`,
    )
    .all(sid, startDate, endDate);
  return rows.map((r) => String(r.entryDate).slice(0, 10));
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatPresentDateLabel(entryDate) {
  const raw = String(entryDate ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLabel = SHORT_MONTHS[month - 1] ?? match[2];
  return `${day}-${monthLabel}-${year}`;
}

export function buildDropInInvoiceLineItems({
  billingMonth,
  billingYear,
  presentDays,
  presentDates,
  chargeSubtotal,
  dropInRate,
  itemizeByDay,
}) {
  const amount = roundMoney(Number(chargeSubtotal));
  if (!itemizeByDay || !presentDates?.length) {
    return [
      {
        description: `Drop-in – ${billingMonth} ${billingYear} (${presentDays} day${presentDays === 1 ? "" : "s"} present)`,
        amount,
      },
    ];
  }

  const rate = roundMoney(Number(dropInRate));
  const n = presentDates.length;
  let allocated = 0;
  return presentDates.map((entryDate, index) => {
    const isLast = index === n - 1;
    const lineAmount = isLast ? roundMoney(amount - allocated) : rate;
    if (!isLast) allocated += lineAmount;
    return {
      description: `Drop-in – ${formatPresentDateLabel(entryDate)}`,
      amount: lineAmount,
    };
  });
}

export function computeDropInChargeSubtotal(studentId, year, month) {
  const sid = parseInt(studentId, 10);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(sid)) {
    return { chargeSubtotal: null, presentDays: 0, dropInRate: null };
  }
  const row = db.prepare(`SELECT dropInRate FROM students WHERE id = ?`).get(sid);
  const dropInRate = row?.dropInRate != null ? roundMoney(Number(row.dropInRate)) : null;
  const presentDays = countPresentDays(sid, y, m);
  if (!dropInRate || dropInRate <= 0 || presentDays <= 0) {
    return { chargeSubtotal: null, presentDays, dropInRate };
  }
  return {
    chargeSubtotal: roundMoney(presentDays * dropInRate),
    presentDays,
    dropInRate,
  };
}

export function mapDropInStudentRow(row) {
  if (!row) return row;
  return {
    studentId: row.id,
    name: row.name,
    rollNo: row.rollNo,
    classGroupName: row.classGroupName ?? null,
    dropInSessionType: row.dropInSessionType ?? null,
    dropInRate: row.dropInRate != null ? Number(row.dropInRate) : null,
    presentDays: row.presentDays ?? 0,
    existingInvoiceId: row.existingInvoiceId ?? null,
    existingInvoiceNo: row.existingInvoiceNo ?? null,
    existingInvoiceStatus: row.existingInvoiceStatus ?? null,
  };
}

export function listDropInBillingCandidates({ year, month }) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) {
    return { error: "Invalid year or month.", status: 400 };
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const billingMonth = monthNames[m - 1];

  const students = db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, s.dropInSessionType, s.dropInRate, cg.name AS classGroupName
       FROM students s
       LEFT JOIN class_groups cg ON cg.id = s.classGroupId
       WHERE s.status = 'active'
         AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'
         AND COALESCE(s.enrollmentType, 'regular') = 'drop_in'
       ORDER BY s.rollNo ASC, s.name ASC`,
    )
    .all();

  return students.map((s) => {
    const existing = db
      .prepare(
        `SELECT id, invoiceNo, status FROM invoices
         WHERE studentId = ? AND year = ? AND month = ? AND invoiceKind = 'drop_in' AND status != 'cancelled'
         LIMIT 1`,
      )
      .get(s.id, y, billingMonth);
    return mapDropInStudentRow({
      ...s,
      presentDays: countPresentDays(s.id, y, m),
      existingInvoiceId: existing?.id ?? null,
      existingInvoiceNo: existing?.invoiceNo ?? null,
      existingInvoiceStatus: existing?.status ?? null,
    });
  });
}

export function sessionTypeLabel(sessionType) {
  if (sessionType === "half") return "Half day";
  if (sessionType === "full") return "Full day";
  return "";
}

export function mapDropInFeeVersionRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    studentId: row.studentId,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    dropInSessionType: row.dropInSessionType,
    dropInRate: Number(row.dropInRate),
    notes: row.notes ?? null,
  };
}

export function listDropInFeeVersions(studentId) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid)) return [];
  return db
    .prepare(
      `SELECT * FROM student_drop_in_fee_versions WHERE studentId = ? ORDER BY effectiveFrom ASC, id ASC`,
    )
    .all(sid)
    .map(mapDropInFeeVersionRow);
}

export function insertDropInFeeVersion(studentId, sessionType, rate, effectiveFrom, notes = null) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid)) return null;
  const session = sessionType === "full" ? "full" : sessionType === "half" ? "half" : null;
  const amount = roundMoney(Number(rate));
  if (!session || !Number.isFinite(amount) || amount <= 0) return null;

  const student = db.prepare("SELECT admissionDate FROM students WHERE id = ?").get(sid);
  let eff =
    typeof effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom.trim())
      ? effectiveFrom.trim()
      : null;
  if (!eff && student?.admissionDate) {
    const raw = String(student.admissionDate);
    eff = raw.length >= 10 ? raw.slice(0, 10) : null;
  }
  if (!eff) eff = new Date().toISOString().slice(0, 10);

  const result = db
    .prepare(
      `INSERT INTO student_drop_in_fee_versions (studentId, effectiveFrom, dropInSessionType, dropInRate, notes)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sid, eff, session, amount, notes);
  return mapDropInFeeVersionRow(
    db.prepare("SELECT * FROM student_drop_in_fee_versions WHERE id = ?").get(result.lastInsertRowid),
  );
}

export function dropInFeeFingerprint(sessionType, rate) {
  return {
    dropInSessionType: sessionType === "full" ? "full" : "half",
    dropInRate: roundMoney(Number(rate)),
  };
}
