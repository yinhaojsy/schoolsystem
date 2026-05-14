import express from "express";
import { db, insertStudentFeeVersionFromCurrentState } from "../db.js";
import bcrypt from "bcryptjs";
import {
  recordFeePayment,
  deleteFeePayment,
  previewAllocation,
  priorOpenBalanceForPeriod,
  invoiceNetFromItems,
  invoicePaidOnCharges,
  invoiceUnpaidBalance,
  invoiceChargesGross,
  roundMoney,
  syncInvoiceStatus,
  stripFeeAllocationsForInvoice,
  refreshInvoiceStatementAmount,
} from "../paymentEngine.js";

const router = express.Router();

function periodNetFromPayloadItems(items) {
  if (!items || !Array.isArray(items)) return 0;
  let t = 0;
  for (const it of items) {
    const amt = roundMoney(Number(it.amount) || 0);
    if (it.type === "discount") t -= amt;
    else t += amt;
  }
  return roundMoney(t);
}

function parseStudentHouseholdAndSibling(body) {
  let householdId = null;
  if (body.householdId != null && body.householdId !== "") {
    const n = parseInt(body.householdId, 10);
    if (!Number.isNaN(n)) householdId = n;
  }
  const receivesSiblingDiscount = !!(
    body.receivesSiblingDiscount === true ||
    body.receivesSiblingDiscount === 1 ||
    body.receivesSiblingDiscount === "1"
  );

  if (!receivesSiblingDiscount) {
    return {
      householdId,
      receivesSiblingDiscount: 0,
      siblingPreMonthly: null,
      siblingPostMonthly: null,
      siblingDiscountFromMonth: null,
      siblingDiscountFromYear: null,
    };
  }

  if (!householdId) {
    throw new Error("HOUSEHOLD_REQUIRED");
  }

  const siblingPreMonthly =
    body.siblingPreMonthly != null && body.siblingPreMonthly !== "" ? Number(body.siblingPreMonthly) : NaN;
  const siblingPostMonthly =
    body.siblingPostMonthly != null && body.siblingPostMonthly !== "" ? Number(body.siblingPostMonthly) : NaN;
  const siblingDiscountFromMonth =
    typeof body.siblingDiscountFromMonth === "string" && body.siblingDiscountFromMonth.trim()
      ? body.siblingDiscountFromMonth.trim()
      : null;
  const siblingDiscountFromYear =
    body.siblingDiscountFromYear != null && body.siblingDiscountFromYear !== ""
      ? parseInt(body.siblingDiscountFromYear, 10)
      : NaN;

  if (
    !Number.isFinite(siblingPreMonthly) ||
    !Number.isFinite(siblingPostMonthly) ||
    siblingPostMonthly <= 0 ||
    siblingPostMonthly >= siblingPreMonthly
  ) {
    throw new Error("SIBLING_AMOUNTS_INVALID");
  }
  if (!siblingDiscountFromMonth || Number.isNaN(siblingDiscountFromYear)) {
    throw new Error("SIBLING_PERIOD_REQUIRED");
  }

  return {
    householdId,
    receivesSiblingDiscount: 1,
    siblingPreMonthly,
    siblingPostMonthly,
    siblingDiscountFromMonth,
    siblingDiscountFromYear,
  };
}

// ==================== AUTH ====================
router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  const isValid = bcrypt.compareSync(password, user.password);
  
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword });
});

// ==================== HOUSEHOLDS (sibling discount grouping) ====================
router.get("/households", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT h.*, 
                (SELECT COUNT(*) FROM students s WHERE s.householdId = h.id AND s.status = 'active') as activeMemberCount,
                (SELECT COUNT(*) FROM students s WHERE s.householdId = h.id) as memberCount
         FROM households h
         ORDER BY h.id DESC`,
      )
      .all();
    res.json(rows);
  } catch (error) {
    console.error("Error fetching households:", error);
    res.status(500).json({ error: "Failed to fetch households" });
  }
});

router.post("/households", (req, res) => {
  try {
    const label = req.body.label != null && String(req.body.label).trim() ? String(req.body.label).trim() : null;
    const result = db.prepare(`INSERT INTO households (label) VALUES (?)`).run(label);
    const row = db.prepare(`SELECT * FROM households WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    console.error("Error creating household:", error);
    res.status(500).json({ error: "Failed to create household" });
  }
});

router.delete("/households/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const used = db.prepare(`SELECT COUNT(*) as c FROM students WHERE householdId = ?`).get(id).c;
    if (used > 0) {
      return res.status(400).json({ error: "Cannot delete a household that still has students assigned." });
    }
    db.prepare(`DELETE FROM households WHERE id = ?`).run(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting household:", error);
    res.status(500).json({ error: "Failed to delete household" });
  }
});

// ==================== STUDENTS ====================
router.get("/students", (req, res) => {
  try {
    const students = db.prepare(`
      SELECT 
        s.*,
        fs.name as feeStructureName,
        fs.monthlyFee as monthlyFee,
        cg.name as classGroupName,
        h.label as householdLabel
      FROM students s
      LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      LEFT JOIN households h ON s.householdId = h.id
      ORDER BY s.createdAt DESC
    `).all();
    res.json(students);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

/** Full fee ledger: charge debits, discount credits, receipts, running balance — for statements / export. */
router.get("/students/:id/ledger", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }

    const student = db
      .prepare(
        `SELECT s.id, s.name, s.rollNo, s.parentsName, s.contactNo, cg.name as classGroupName
         FROM students s
         LEFT JOIN class_groups cg ON s.classGroupId = cg.id
         WHERE s.id = ?`,
      )
      .get(studentId);

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const invoices = db
      .prepare(
        `SELECT id, invoiceNo, month, year, amount, dueDate, status, createdAt, remarks, paymentDate
         FROM invoices WHERE studentId = ?`,
      )
      .all(studentId);

    const feePayRows = db
      .prepare(
        `SELECT id, totalAmount, paymentDate, remarks, createdAt
         FROM fee_payments WHERE studentId = ?
         ORDER BY datetime(createdAt) ASC, id ASC`,
      )
      .all(studentId);

    const ymd = (iso) => {
      if (!iso) return "";
      const s = String(iso);
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    const padNum = (n, w = 10) => String(n).padStart(w, "0");

    const events = [];

    for (const inv of invoices) {
      const gross = invoiceChargesGross(inv.id);
      if (gross > 0.009) {
        events.push({
          kind: "invoice",
          sortKey: `${ymd(inv.createdAt)}|0|inv${padNum(inv.id)}`,
          displayDate: ymd(inv.createdAt),
          invoiceNo: inv.invoiceNo,
          invoiceId: inv.id,
          description: `Invoice ${inv.invoiceNo} — ${inv.month} ${inv.year} (charges)`,
          debit: gross,
          credit: 0,
        });
      }

      const discs = db
        .prepare(
          `SELECT id, amount, description, createdAt FROM invoice_items
           WHERE invoiceId = ? AND type = 'discount'
           ORDER BY datetime(createdAt) ASC, id ASC`,
        )
        .all(inv.id);
      for (const d of discs) {
        const amt = roundMoney(Number(d.amount) || 0);
        if (amt <= 0.009) continue;
        const dDay = ymd(d.createdAt || inv.createdAt);
        events.push({
          kind: "discount",
          sortKey: `${dDay}|1|dis${padNum(d.id, 12)}`,
          displayDate: dDay,
          invoiceNo: inv.invoiceNo,
          invoiceId: inv.id,
          description: d.description,
          debit: 0,
          credit: amt,
        });
      }
    }

    for (const fp of feePayRows) {
      const amount = Number(fp.totalAmount) || 0;
      const receiptDay = ymd(fp.paymentDate || fp.createdAt);
      const anchor = db
        .prepare(
          `SELECT ii.invoiceId
           FROM fee_payment_allocations a
           INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
           WHERE a.feePaymentId = ?
           LIMIT 1`,
        )
        .get(fp.id);
      const anchorInvId = anchor?.invoiceId ?? invoices[0]?.id ?? 0;
      const invMeta = db.prepare(`SELECT invoiceNo, month, year FROM invoices WHERE id = ?`).get(anchorInvId);
      const nos = db
        .prepare(
          `SELECT DISTINCT i.invoiceNo
           FROM fee_payment_allocations a
           INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
           INNER JOIN invoices i ON i.id = ii.invoiceId
           WHERE a.feePaymentId = ?
           ORDER BY i.invoiceNo`,
        )
        .all(fp.id)
        .map((r) => r.invoiceNo)
        .join(", ");
      const descExtra = nos ? ` — ${nos}` : "";
      events.push({
        kind: "payment",
        sortKey: `${receiptDay}|2|pay${padNum(fp.id)}`,
        displayDate: receiptDay,
        invoiceNo: invMeta?.invoiceNo || "",
        invoiceId: anchorInvId,
        description: `Receipt #${fp.id}${descExtra}${fp.remarks ? ` — ${fp.remarks}` : ""}`,
        debit: 0,
        credit: amount,
      });
    }

    let legacyReceiptTotal = 0;
    for (const inv of invoices) {
      const net = invoiceNetFromItems(inv.id);
      const allocSum =
        db
          .prepare(
            `SELECT COALESCE(SUM(a.amount), 0) AS s
             FROM fee_payment_allocations a
             INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
             WHERE ii.invoiceId = ?`,
          )
          .get(inv.id).s || 0;
      const paidOnCharges = invoicePaidOnCharges(inv.id);
      const gap = roundMoney(net - allocSum);
      if (
        String(inv.status || "").toLowerCase() === "paid" &&
        net > 0.01 &&
        paidOnCharges >= net - 0.02 &&
        allocSum < net - 0.02
      ) {
        legacyReceiptTotal += gap;
        const receiptDay = ymd(inv.paymentDate || inv.createdAt);
        events.push({
          kind: "payment",
          sortKey: `${receiptDay}|3|leg${padNum(inv.id)}`,
          displayDate: receiptDay,
          invoiceNo: inv.invoiceNo,
          invoiceId: inv.id,
          description: `Receipt — ${inv.invoiceNo} (${inv.month} ${inv.year}) — Mark paid (legacy, no receipt log)`,
          debit: 0,
          credit: gap,
        });
      }
    }

    events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

    let running = 0;
    const lines = events.map((e) => {
      running = roundMoney(running + e.debit - e.credit);
      const tx =
        e.kind === "invoice" ? "invoice" : e.kind === "discount" ? "discount" : "payment";
      return {
        transactionType: tx,
        date: e.displayDate,
        description: e.description,
        invoiceDebit: e.debit > 0.009 ? e.debit : null,
        paymentCredit: e.credit > 0.009 ? e.credit : null,
        balanceAfter: running,
        invoiceNo: e.invoiceNo,
        invoiceId: e.invoiceId,
      };
    });

    const totalInvoiced = invoices.reduce((s, i) => s + invoiceNetFromItems(i.id), 0);
    const totalPaidFromFeePayments = feePayRows.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
    const totalPaid = roundMoney(totalPaidFromFeePayments + legacyReceiptTotal);

    res.json({
      student,
      lines,
      summary: {
        totalInvoiced: roundMoney(totalInvoiced),
        totalPaid,
        balance: roundMoney(totalInvoiced - totalPaid),
      },
    });
  } catch (error) {
    console.error("Error fetching student ledger:", error);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

/** Preview how a receipt would split across open charge lines (FIFO, oldest invoice first). */
router.get("/students/:id/payment-allocation-preview", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }
    const amount = parseFloat(String(req.query.amount || ""));
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid or missing amount query parameter" });
    }
    const restrictRaw = req.query.invoiceId;
    const restrict =
      restrictRaw != null && String(restrictRaw).trim() !== ""
        ? parseInt(String(restrictRaw), 10)
        : null;
    const preview = previewAllocation(studentId, amount, Number.isNaN(restrict) ? null : restrict);
    res.json(preview);
  } catch (error) {
    console.error("Error previewing payment allocation:", error);
    res.status(500).json({ error: "Failed to preview allocation" });
  }
});

/** All fee receipts for a student (for reversing mistaken entries). */
router.get("/students/:id/fee-payments", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }
    const exists = db.prepare(`SELECT id FROM students WHERE id = ?`).get(studentId);
    if (!exists) {
      return res.status(404).json({ error: "Student not found" });
    }
    const rows = db
      .prepare(
        `SELECT fp.*, u.name as createdByName
         FROM fee_payments fp
         LEFT JOIN users u ON fp.createdBy = u.id
         WHERE fp.studentId = ?
         ORDER BY fp.createdAt DESC, fp.id DESC`,
      )
      .all(studentId);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching fee payments:", error);
    res.status(500).json({ error: "Failed to fetch fee payments" });
  }
});

router.delete("/fee-payments/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }
    deleteFeePayment(id);
    res.json({ success: true });
  } catch (error) {
    if (error && error.message === "NOT_FOUND") {
      return res.status(404).json({ error: "Receipt not found" });
    }
    console.error("Error deleting fee payment:", error);
    res.status(500).json({ error: "Failed to delete fee payment" });
  }
});

router.get("/students/:id", (req, res) => {
  try {
    const student = db.prepare(`
      SELECT 
        s.*,
        fs.name as feeStructureName,
        fs.monthlyFee as monthlyFee,
        cg.name as classGroupName,
        h.label as householdLabel
      FROM students s
      LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      LEFT JOIN households h ON s.householdId = h.id
      WHERE s.id = ?
    `).get(req.params.id);
    
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    res.json(student);
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

const safeParseJsonArray = (raw) => {
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const mapFeeVersionRow = (row) => ({
  id: row.id,
  studentId: row.studentId,
  effectiveFrom: row.effectiveFrom,
  createdAt: row.createdAt,
  monthlyFee: row.monthlyFee,
  registrationFee: row.registrationFee,
  registrationFeeInstallments: row.registrationFeeInstallments,
  annualCharges: row.annualCharges,
  annualChargesInstallments: row.annualChargesInstallments,
  meals: row.meals,
  overrides: safeParseJsonArray(row.overridesJson),
  extras: safeParseJsonArray(row.extrasJson),
  notes: row.notes,
});

const feeStructureFingerprint = (fs) => ({
  monthlyFee: roundMoney(fs.monthlyFee),
  registrationFee: fs.registrationFee == null ? null : roundMoney(fs.registrationFee),
  registrationFeeInstallments: fs.registrationFeeInstallments ?? null,
  annualCharges: fs.annualCharges == null ? null : roundMoney(fs.annualCharges),
  annualChargesInstallments: fs.annualChargesInstallments ?? null,
  meals: fs.meals == null ? null : roundMoney(fs.meals),
});

router.get("/students/:id/fee-versions", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }
    const exists = db.prepare("SELECT id FROM students WHERE id = ?").get(studentId);
    if (!exists) {
      return res.status(404).json({ error: "Student not found" });
    }
    const rows = db
      .prepare(
        `SELECT * FROM student_fee_versions WHERE studentId = ? ORDER BY effectiveFrom ASC, id ASC`,
      )
      .all(studentId);
    res.json(rows.map(mapFeeVersionRow));
  } catch (error) {
    console.error("Error fetching fee versions:", error);
    res.status(500).json({ error: "Failed to fetch fee versions" });
  }
});

router.post("/students/:id/fee-versions", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    const fs = db.prepare("SELECT * FROM fee_structures WHERE id = ?").get(student.feeStructureId);
    if (!fs) {
      return res.status(500).json({ error: "Fee structure missing for student" });
    }

    const body = req.body || {};
    const monthly = Number(body.monthlyFee);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      return res.status(400).json({ error: "monthlyFee is required and must be greater than 0." });
    }

    const numOrNull = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      if (n <= 0) return null;
      return n;
    };

    const intOrNull = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const next = {
      monthlyFee: monthly,
      registrationFee: Object.prototype.hasOwnProperty.call(body, "registrationFee")
        ? numOrNull(body.registrationFee)
        : fs.registrationFee ?? null,
      registrationFeeInstallments: Object.prototype.hasOwnProperty.call(body, "registrationFeeInstallments")
        ? intOrNull(body.registrationFeeInstallments)
        : fs.registrationFeeInstallments ?? null,
      annualCharges: Object.prototype.hasOwnProperty.call(body, "annualCharges")
        ? numOrNull(body.annualCharges)
        : fs.annualCharges ?? null,
      annualChargesInstallments: Object.prototype.hasOwnProperty.call(body, "annualChargesInstallments")
        ? intOrNull(body.annualChargesInstallments)
        : fs.annualChargesInstallments ?? null,
      meals: Object.prototype.hasOwnProperty.call(body, "meals") ? numOrNull(body.meals) : fs.meals ?? null,
    };
    if (next.registrationFee == null) next.registrationFeeInstallments = null;
    if (next.annualCharges == null) next.annualChargesInstallments = null;

    const before = feeStructureFingerprint(fs);
    const after = feeStructureFingerprint({ ...fs, ...next });
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return res.status(400).json({
        error: "No change from the current fee amounts. Adjust at least one field before saving a new version.",
      });
    }

    let effectiveFrom =
      typeof body.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom.trim())
        ? body.effectiveFrom.trim()
        : new Date().toISOString().slice(0, 10);
    const notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE fee_structures SET
          registrationFee = ?,
          registrationFeeInstallments = ?,
          annualCharges = ?,
          annualChargesInstallments = ?,
          monthlyFee = ?,
          meals = ?
        WHERE id = ?`,
      ).run(
        next.registrationFee,
        next.registrationFeeInstallments,
        next.annualCharges,
        next.annualChargesInstallments,
        next.monthlyFee,
        next.meals,
        student.feeStructureId,
      );
      db.prepare("DELETE FROM student_fee_overrides WHERE studentId = ?").run(studentId);
      insertStudentFeeVersionFromCurrentState(studentId, effectiveFrom, notes);
    });
    tx();

    const rows = db
      .prepare(
        `SELECT * FROM student_fee_versions WHERE studentId = ? ORDER BY effectiveFrom ASC, id ASC`,
      )
      .all(studentId);
    res.status(201).json({ versions: rows.map(mapFeeVersionRow) });
  } catch (error) {
    console.error("Error creating fee version:", error);
    res.status(500).json({ error: "Failed to create fee version" });
  }
});

router.post("/students", (req, res) => {
  try {
    const { name, parentsName, contactNo, rollNo, feeStructureId, classGroupId, address, dateOfBirth, customFee } =
      req.body;

    const existing = db.prepare("SELECT id FROM students WHERE rollNo = ?").get(rollNo);
    if (existing) {
      return res.status(409).json({ error: "Roll number already exists" });
    }

    let resolvedFeeStructureId = feeStructureId != null ? parseInt(feeStructureId, 10) : null;
    if (Number.isNaN(resolvedFeeStructureId)) resolvedFeeStructureId = null;

    if (customFee && typeof customFee === "object") {
      const monthly = Number(customFee.monthlyFee);
      if (!Number.isFinite(monthly) || monthly <= 0) {
        return res.status(400).json({
          error: "Custom fee requires a valid monthly tuition amount greater than 0.",
        });
      }

      const rawName =
        typeof customFee.structureName === "string" && customFee.structureName.trim()
          ? customFee.structureName.trim()
          : `Custom: ${String(rollNo).trim()} — ${String(name).trim()}`;
      let uniqueName = rawName;
      let n = 1;
      while (db.prepare("SELECT id FROM fee_structures WHERE name = ?").get(uniqueName)) {
        uniqueName = `${rawName} (${n++})`;
      }

      const parseOpt = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const x = Number(v);
        return Number.isFinite(x) && x > 0 ? x : null;
      };

      const reg = parseOpt(customFee.registrationFee);
      const annual = parseOpt(customFee.annualCharges);

      const fsResult = db
        .prepare(
          `INSERT INTO fee_structures (name, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, monthlyFee, meals, description, builderSchema)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uniqueName,
          reg,
          null,
          annual,
          null,
          monthly,
          null,
          "Created from new admission (custom fee)",
          null,
        );
      resolvedFeeStructureId = fsResult.lastInsertRowid;
    }

    if (!resolvedFeeStructureId) {
      return res.status(400).json({ error: "Select a fee structure or enter a custom fee." });
    }

    let sib;
    try {
      sib = parseStudentHouseholdAndSibling(req.body);
    } catch (err) {
      const code = err && err.message;
      if (code === "HOUSEHOLD_REQUIRED") {
        return res.status(400).json({ error: "Sibling discount requires assigning a household." });
      }
      if (code === "SIBLING_AMOUNTS_INVALID") {
        return res.status(400).json({
          error: "Sibling discount requires valid before/after monthly amounts (after must be less than before, both positive).",
        });
      }
      if (code === "SIBLING_PERIOD_REQUIRED") {
        return res.status(400).json({
          error: "Sibling discount requires the first billing month and year when the discount starts.",
        });
      }
      throw err;
    }

    const result = db.prepare(`
      INSERT INTO students (name, parentsName, contactNo, rollNo, feeStructureId, classGroupId, address, dateOfBirth,
        householdId, receivesSiblingDiscount, siblingPreMonthly, siblingPostMonthly, siblingDiscountFromMonth, siblingDiscountFromYear)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      parentsName,
      contactNo,
      rollNo,
      resolvedFeeStructureId,
      classGroupId,
      address,
      dateOfBirth,
      sib.householdId,
      sib.receivesSiblingDiscount,
      sib.siblingPreMonthly,
      sib.siblingPostMonthly,
      sib.siblingDiscountFromMonth,
      sib.siblingDiscountFromYear,
    );

    const newStudent = db.prepare(`
      SELECT 
        s.*,
        fs.name as feeStructureName,
        fs.monthlyFee as monthlyFee,
        cg.name as classGroupName,
        h.label as householdLabel
      FROM students s
      LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      LEFT JOIN households h ON s.householdId = h.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    try {
      const adm =
        newStudent.admissionDate && String(newStudent.admissionDate).length >= 10
          ? String(newStudent.admissionDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
      insertStudentFeeVersionFromCurrentState(newStudent.id, adm, null);
    } catch (verErr) {
      console.error("Could not record initial fee version:", verErr);
    }
    
    res.status(201).json(newStudent);
  } catch (error) {
    console.error("Error creating student:", error);
    res.status(500).json({ error: "Failed to create student" });
  }
});

router.put("/students/:id", (req, res) => {
  try {
    const {
      name,
      parentsName,
      contactNo,
      rollNo,
      feeStructureId,
      classGroupId,
      address,
      dateOfBirth,
      status,
    } = req.body;

    const existing = db.prepare("SELECT id FROM students WHERE rollNo = ? AND id != ?").get(rollNo, req.params.id);
    if (existing) {
      return res.status(409).json({ error: "Roll number already exists" });
    }

    let sib;
    try {
      sib = parseStudentHouseholdAndSibling(req.body);
    } catch (err) {
      const code = err && err.message;
      if (code === "HOUSEHOLD_REQUIRED") {
        return res.status(400).json({ error: "Sibling discount requires assigning a household." });
      }
      if (code === "SIBLING_AMOUNTS_INVALID") {
        return res.status(400).json({
          error: "Sibling discount requires valid before/after monthly amounts (after must be less than before, both positive).",
        });
      }
      if (code === "SIBLING_PERIOD_REQUIRED") {
        return res.status(400).json({
          error: "Sibling discount requires the first billing month and year when the discount starts.",
        });
      }
      throw err;
    }

    db.prepare(`
      UPDATE students 
      SET name = ?, parentsName = ?, contactNo = ?, rollNo = ?, 
          feeStructureId = ?, classGroupId = ?, address = ?, dateOfBirth = ?, status = ?,
          householdId = ?, receivesSiblingDiscount = ?, siblingPreMonthly = ?, siblingPostMonthly = ?,
          siblingDiscountFromMonth = ?, siblingDiscountFromYear = ?
      WHERE id = ?
    `).run(
      name,
      parentsName,
      contactNo,
      rollNo,
      feeStructureId,
      classGroupId,
      address,
      dateOfBirth,
      status,
      sib.householdId,
      sib.receivesSiblingDiscount,
      sib.siblingPreMonthly,
      sib.siblingPostMonthly,
      sib.siblingDiscountFromMonth,
      sib.siblingDiscountFromYear,
      req.params.id,
    );

    const updatedStudent = db.prepare(`
      SELECT 
        s.*,
        fs.name as feeStructureName,
        fs.monthlyFee as monthlyFee,
        cg.name as classGroupName,
        h.label as householdLabel
      FROM students s
      LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      LEFT JOIN households h ON s.householdId = h.id
      WHERE s.id = ?
    `).get(req.params.id);
    
    res.json(updatedStudent);
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({ error: "Failed to update student" });
  }
});

router.delete("/students/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM students WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(500).json({ error: "Failed to delete student" });
  }
});

// ==================== FEE STRUCTURES ====================
router.get("/fee-structures", (req, res) => {
  try {
    const feeStructures = db.prepare("SELECT * FROM fee_structures ORDER BY name").all();
    res.json(feeStructures);
  } catch (error) {
    console.error("Error fetching fee structures:", error);
    res.status(500).json({ error: "Failed to fetch fee structures" });
  }
});

router.post("/fee-structures", (req, res) => {
  try {
    const { name, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, monthlyFee, meals, description, builderSchema } = req.body;
    
    const existing = db.prepare("SELECT id FROM fee_structures WHERE name = ?").get(name);
    if (existing) {
      return res.status(409).json({ error: "Fee structure with this name already exists" });
    }
    
    const result = db.prepare(`
      INSERT INTO fee_structures (name, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, monthlyFee, meals, description, builderSchema)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, registrationFee || null, registrationFeeInstallments || null, annualCharges || null, annualChargesInstallments || null, monthlyFee, meals || null, description ?? null, builderSchema ?? null);
    
    const newFeeStructure = db.prepare("SELECT * FROM fee_structures WHERE id = ?").get(result.lastInsertRowid);
    
    res.status(201).json(newFeeStructure);
  } catch (error) {
    console.error("Error creating fee structure:", error);
    res.status(500).json({ error: "Failed to create fee structure" });
  }
});

router.put("/fee-structures/:id", (req, res) => {
  try {
    const { name, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, monthlyFee, meals, description, builderSchema } = req.body;
    
    const existing = db.prepare("SELECT id FROM fee_structures WHERE name = ? AND id != ?").get(name, req.params.id);
    if (existing) {
      return res.status(409).json({ error: "Fee structure with this name already exists" });
    }
    
    db.prepare(`
      UPDATE fee_structures 
      SET name = ?, registrationFee = ?, registrationFeeInstallments = ?, annualCharges = ?, annualChargesInstallments = ?, monthlyFee = ?, meals = ?, description = ?, builderSchema = ?
      WHERE id = ?
    `).run(name, registrationFee || null, registrationFeeInstallments || null, annualCharges || null, annualChargesInstallments || null, monthlyFee, meals || null, description ?? null, builderSchema ?? null, req.params.id);
    
    const updatedFeeStructure = db.prepare("SELECT * FROM fee_structures WHERE id = ?").get(req.params.id);
    
    res.json(updatedFeeStructure);
  } catch (error) {
    console.error("Error updating fee structure:", error);
    res.status(500).json({ error: "Failed to update fee structure" });
  }
});

router.delete("/fee-structures/:id", (req, res) => {
  try {
    // Check if any students are using this fee structure
    const students = db.prepare("SELECT COUNT(*) as count FROM students WHERE feeStructureId = ?").get(req.params.id);
    if (students.count > 0) {
      return res.status(400).json({ error: "Cannot delete fee structure that is assigned to students" });
    }
    
    db.prepare("DELETE FROM fee_structures WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting fee structure:", error);
    res.status(500).json({ error: "Failed to delete fee structure" });
  }
});

const DEFAULT_FEE_BUILDER_TEMPLATE_ROW = JSON.stringify({
  version: 2,
  sections: [
    {
      id: "sec_default",
      title: "Fee components",
      order: 0,
      fields: [
        {
          id: "f_monthly_default",
          label: "Monthly tuition",
          inputType: "number",
          billingMap: "monthly",
          required: true,
          allowInstallments: false,
        },
      ],
    },
  ],
});

// ==================== FEE BUILDER TEMPLATE (global form layout) ====================
router.get("/fee-builder-template", (req, res) => {
  try {
    const row = db.prepare("SELECT schema FROM fee_builder_template WHERE id = 1").get();
    if (!row) {
      return res.json({ schema: DEFAULT_FEE_BUILDER_TEMPLATE_ROW });
    }
    res.json({ schema: row.schema });
  } catch (error) {
    console.error("Error fetching fee builder template:", error);
    res.status(500).json({ error: "Failed to fetch fee builder template" });
  }
});

router.put("/fee-builder-template", (req, res) => {
  try {
    let schemaStr;
    if (typeof req.body.schema === "string") {
      schemaStr = req.body.schema;
    } else if (req.body.schema != null && typeof req.body.schema === "object") {
      schemaStr = JSON.stringify(req.body.schema);
    } else {
      return res.status(400).json({ error: "schema is required" });
    }

    const existing = db.prepare("SELECT id FROM fee_builder_template WHERE id = 1").get();
    if (existing) {
      db.prepare(
        "UPDATE fee_builder_template SET schema = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1",
      ).run(schemaStr);
    } else {
      db.prepare("INSERT INTO fee_builder_template (id, schema) VALUES (1, ?)").run(schemaStr);
    }

    const row = db.prepare("SELECT schema, updatedAt FROM fee_builder_template WHERE id = 1").get();
    res.json({ schema: row.schema, updatedAt: row.updatedAt });
  } catch (error) {
    console.error("Error saving fee builder template:", error);
    res.status(500).json({ error: "Failed to save fee builder template" });
  }
});

// ==================== CLASS GROUPS ====================
router.get("/class-groups", (req, res) => {
  try {
    const classGroups = db.prepare("SELECT * FROM class_groups ORDER BY name").all();
    res.json(classGroups);
  } catch (error) {
    console.error("Error fetching class groups:", error);
    res.status(500).json({ error: "Failed to fetch class groups" });
  }
});

router.post("/class-groups", (req, res) => {
  try {
    const { name, description } = req.body;
    
    const existing = db.prepare("SELECT id FROM class_groups WHERE name = ?").get(name);
    if (existing) {
      return res.status(409).json({ error: "Class group with this name already exists" });
    }
    
    const result = db.prepare(`
      INSERT INTO class_groups (name, description)
      VALUES (?, ?)
    `).run(name, description);
    
    const newClassGroup = db.prepare("SELECT * FROM class_groups WHERE id = ?").get(result.lastInsertRowid);
    
    res.status(201).json(newClassGroup);
  } catch (error) {
    console.error("Error creating class group:", error);
    res.status(500).json({ error: "Failed to create class group" });
  }
});

router.put("/class-groups/:id", (req, res) => {
  try {
    const { name, description } = req.body;
    
    const existing = db.prepare("SELECT id FROM class_groups WHERE name = ? AND id != ?").get(name, req.params.id);
    if (existing) {
      return res.status(409).json({ error: "Class group with this name already exists" });
    }
    
    db.prepare(`
      UPDATE class_groups 
      SET name = ?, description = ?
      WHERE id = ?
    `).run(name, description, req.params.id);
    
    const updatedClassGroup = db.prepare("SELECT * FROM class_groups WHERE id = ?").get(req.params.id);
    
    res.json(updatedClassGroup);
  } catch (error) {
    console.error("Error updating class group:", error);
    res.status(500).json({ error: "Failed to update class group" });
  }
});

router.delete("/class-groups/:id", (req, res) => {
  try {
    // Check if any students are in this class group
    const students = db.prepare("SELECT COUNT(*) as count FROM students WHERE classGroupId = ?").get(req.params.id);
    if (students.count > 0) {
      return res.status(400).json({ error: "Cannot delete class group that has students" });
    }
    
    db.prepare("DELETE FROM class_groups WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting class group:", error);
    res.status(500).json({ error: "Failed to delete class group" });
  }
});

// ==================== INVOICES ====================
router.get("/invoices", (req, res) => {
  try {
    const { studentId, month, year, status } = req.query;
    
    let query = `
      SELECT 
        i.*,
        s.name as studentName,
        s.rollNo as studentRollNo,
        cg.name as classGroupName
      FROM invoices i
      LEFT JOIN students s ON i.studentId = s.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      WHERE 1=1
    `;
    const params = [];
    
    if (studentId) {
      query += " AND i.studentId = ?";
      params.push(studentId);
    }
    if (month) {
      query += " AND i.month = ?";
      params.push(month);
    }
    if (year) {
      query += " AND i.year = ?";
      params.push(year);
    }
    if (status) {
      query += " AND i.status = ?";
      params.push(status);
    }
    
    query += " ORDER BY i.createdAt DESC";
    
    const invoices = db.prepare(query).all(...params);

    if (req.query.includeItems === "true" && invoices.length > 0) {
      const itemStmt = db.prepare("SELECT * FROM invoice_items WHERE invoiceId = ?");
      for (const inv of invoices) {
        inv.items = itemStmt.all(inv.id);
      }
    }

    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.get("/invoices/:id", (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT 
        i.*,
        s.name as studentName,
        s.rollNo as studentRollNo,
        s.parentsName,
        s.contactNo,
        cg.name as classGroupName
      FROM invoices i
      LEFT JOIN students s ON i.studentId = s.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      WHERE i.id = ?
    `).get(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    // Get invoice items
    const items = db.prepare(`
      SELECT * FROM invoice_items WHERE invoiceId = ?
    `).all(req.params.id);

    const sid = invoice.studentId;
    const priorBalance = priorOpenBalanceForPeriod(sid, invoice.month, invoice.year);
    const periodSubtotal = invoiceNetFromItems(invoice.id);
    const unpaidThisInvoice = invoiceUnpaidBalance(invoice.id);
    const grandDue = roundMoney(priorBalance + unpaidThisInvoice);

    res.json({ ...invoice, items, priorBalance, periodSubtotal, grandDue });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

/**
 * Shared handler: write off remaining balance on one invoice (discount line + invoice_writeoffs row).
 * @param {number|string} invoiceIdRaw
 */
function handleInvoiceForceClose(req, res, invoiceIdRaw) {
  try {
    const invoiceId = parseInt(String(invoiceIdRaw), 10);
    if (Number.isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice id" });
    }
    const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoiceId);
    if (!inv) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const dup = db.prepare(`SELECT id FROM invoice_writeoffs WHERE invoiceId = ?`).get(invoiceId);
    if (dup) {
      return res.status(400).json({
        error:
          "This invoice already has a write-off on file. Remove the linked discount line or contact support if that was a mistake.",
      });
    }

    const unpaid = invoiceUnpaidBalance(invoiceId);
    if (unpaid <= 0.01) {
      return res.status(400).json({ error: "Nothing to write off — this invoice has no unpaid balance." });
    }

    const body = req.body || {};
    const reasonCodeRaw = String(body.reasonCode || "")
      .trim()
      .toLowerCase();
    const allowed = ["waive", "bad_debt", "other"];
    if (!allowed.includes(reasonCodeRaw)) {
      return res.status(400).json({ error: "reasonCode must be waive, bad_debt, or other." });
    }
    const customReason = typeof body.customReason === "string" ? body.customReason.trim() : "";
    if (reasonCodeRaw === "other" && !customReason) {
      return res.status(400).json({ error: "customReason is required when reasonCode is other." });
    }

    const invoiceNo = inv.invoiceNo;
    const periodLabel = `${inv.month} ${inv.year}`;
    let discDescription = "";
    if (reasonCodeRaw === "waive") {
      discDescription = `Concession / waiver (remaining balance) — ${invoiceNo} — ${periodLabel}`;
    } else if (reasonCodeRaw === "bad_debt") {
      discDescription = `Bad debt write-off — ${invoiceNo} — ${periodLabel}`;
    } else {
      discDescription = `${customReason} — ${invoiceNo}`;
    }

    const createdByRaw = body.createdBy != null ? parseInt(String(body.createdBy), 10) : NaN;
    const createdBySql = Number.isFinite(createdByRaw) ? createdByRaw : null;

    const run = db.transaction(() => {
      const itemResult = db
        .prepare(
          `INSERT INTO invoice_items (invoiceId, description, amount, type, chargeType)
           VALUES (?, ?, ?, 'discount', NULL)`,
        )
        .run(invoiceId, discDescription, unpaid);
      const invoiceItemId = itemResult.lastInsertRowid;
      db.prepare(
        `INSERT INTO invoice_writeoffs (invoiceId, studentId, amount, reasonCode, customReason, invoiceItemId, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        invoiceId,
        inv.studentId,
        unpaid,
        reasonCodeRaw,
        reasonCodeRaw === "other" ? customReason : null,
        invoiceItemId,
        createdBySql,
      );
      syncInvoiceStatus(invoiceId);
      refreshInvoiceStatementAmount(invoiceId);
    });
    run();

    const updated = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoiceId);
    return res.status(201).json({
      success: true,
      invoice: updated,
      amountWrittenOff: unpaid,
      reasonCode: reasonCodeRaw,
    });
  } catch (error) {
    console.error("Error force-closing invoice:", error);
    return res.status(500).json({ error: "Failed to force-close invoice" });
  }
}

/** Body: { invoiceId, reasonCode, customReason?, createdBy? } — same family as POST /invoices. */
router.post("/invoices/close-balance", (req, res) => {
  const raw = req.body?.invoiceId;
  if (raw == null || raw === "") {
    return res.status(400).json({ error: "invoiceId is required in the request body." });
  }
  return handleInvoiceForceClose(req, res, raw);
});

/** Legacy alias (some setups cached this path). */
router.post("/invoice-write-offs", (req, res) => {
  const raw = req.body?.invoiceId;
  if (raw == null || raw === "") {
    return res.status(400).json({ error: "invoiceId is required in the request body." });
  }
  return handleInvoiceForceClose(req, res, raw);
});

router.post("/invoices/:id/force-close", (req, res) => {
  return handleInvoiceForceClose(req, res, req.params.id);
});

router.post("/invoices", (req, res) => {
  try {
    const { studentId, month, year, amount, dueDate, remarks, items, createdBy } = req.body;
    
    // Generate invoice number
    const invoiceNo = `INV-${Date.now()}`;
    
    // Check if invoice already exists for this student and month/year
    const existing = db.prepare(`
      SELECT id FROM invoices 
      WHERE studentId = ? AND month = ? AND year = ?
    `).get(studentId, month, year);
    
    if (existing) {
      return res.status(409).json({ error: "Invoice already exists for this student and period" });
    }

    if (items && Array.isArray(items)) {
      const newRegLines = items.filter((x) => x.chargeType === "registration").length;
      if (newRegLines > 0) {
        const priorRegCount = db
          .prepare(
            `SELECT COUNT(*) as c FROM invoice_items ii
             JOIN invoices i ON ii.invoiceId = i.id
             WHERE i.studentId = ? AND ii.type = 'charge' AND ii.chargeType = 'registration'`,
          )
          .get(studentId).c;
        const st = db.prepare(`SELECT feeStructureId FROM students WHERE id = ?`).get(studentId);
        const fsRow = st
          ? db
              .prepare(`SELECT registrationFeeInstallments FROM fee_structures WHERE id = ?`)
              .get(st.feeStructureId)
          : null;
        const regSlots = fsRow?.registrationFeeInstallments || 1;
        if (priorRegCount + newRegLines > regSlots) {
          return res.status(400).json({
            error:
              "Registration fee installments for this student are already complete. Remove registration lines from this invoice.",
          });
        }
      }

      for (const item of items) {
        if (item.additionalChargeId != null) {
          const ch = db
            .prepare(
              `SELECT * FROM student_additional_charges WHERE id = ? AND studentId = ?`,
            )
            .get(item.additionalChargeId, studentId);
          if (!ch) {
            return res.status(400).json({ error: "Invalid student additional charge reference" });
          }
          if (ch.recurring === 0 && ch.billedInvoiceId != null) {
            return res.status(400).json({
              error: `One-time charge "${ch.description}" was already billed. Remove it or add a new charge.`,
            });
          }
          const chargeActive = ch.active == null || ch.active === 1;
          if (!chargeActive) {
            return res.status(400).json({
              error: `Student extra "${ch.description}" is inactive. Turn it on under Manage fees or on the create-invoice form before including it.`,
            });
          }
        }
      }
    }
    
    const periodNet = items && Array.isArray(items) && items.length > 0
      ? periodNetFromPayloadItems(items)
      : roundMoney(Number(amount) || 0);
    const prior = priorOpenBalanceForPeriod(studentId, month, year);
    const finalAmount = roundMoney(periodNet + prior);

    const result = db.prepare(`
      INSERT INTO invoices (studentId, invoiceNo, month, year, amount, dueDate, remarks, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(studentId, invoiceNo, month, year, finalAmount, dueDate, remarks, createdBy);
    
    const invoiceId = result.lastInsertRowid;
    
    // Insert invoice items if provided
    if (items && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO invoice_items (invoiceId, description, amount, type, chargeType)
        VALUES (?, ?, ?, ?, ?)
      `);
      const markOneTimeBilled = db.prepare(`
        UPDATE student_additional_charges
        SET billedInvoiceId = ?
        WHERE id = ? AND studentId = ? AND recurring = 0 AND billedInvoiceId IS NULL
      `);
      
      const insertMany = db.transaction((rows) => {
        rows.forEach((item) => {
          insertItem.run(
            invoiceId,
            item.description,
            item.amount,
            item.type || "charge",
            item.chargeType || null,
          );
          if (item.additionalChargeId != null) {
            markOneTimeBilled.run(invoiceId, item.additionalChargeId, studentId);
          }
        });
      });
      insertMany(items);
    }
    
    const newInvoice = db.prepare(`
      SELECT 
        i.*,
        s.name as studentName,
        s.rollNo as studentRollNo,
        cg.name as classGroupName
      FROM invoices i
      LEFT JOIN students s ON i.studentId = s.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      WHERE i.id = ?
    `).get(invoiceId);
    
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.put("/invoices/:id", (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const { status, paymentDate, remarks, createdBy } = req.body;

    const invRow = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invoiceId);
    if (!invRow) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const runUpdate = db.transaction(() => {
      if (status === "paid") {
        const studentId = invRow.studentId;
        const localUnpaid = invoiceUnpaidBalance(invoiceId);
        const prior = priorOpenBalanceForPeriod(studentId, invRow.month, invRow.year);
        const residual = roundMoney(prior + localUnpaid);

        if (residual > 0.01) {
          const payDate =
            paymentDate && String(paymentDate).trim()
              ? String(paymentDate).trim()
              : new Date().toISOString().slice(0, 10);
          const payRemarks =
            remarks != null && String(remarks).trim()
              ? String(remarks).trim()
              : "Mark paid (full settlement)";
          recordFeePayment(studentId, residual, payDate, payRemarks, createdBy ?? null, {});
        }
        syncInvoiceStatus(invoiceId);
        db.prepare(`UPDATE invoices SET paymentDate = ?, remarks = ? WHERE id = ?`).run(
          paymentDate && String(paymentDate).trim() ? String(paymentDate).trim() : null,
          remarks != null && String(remarks).trim() ? String(remarks).trim() : invRow.remarks,
          invoiceId,
        );
      } else {
        db.prepare(`
        UPDATE invoices 
        SET status = ?, paymentDate = ?, remarks = ?
        WHERE id = ?
      `).run(status, paymentDate, remarks, invoiceId);
      }
    });

    runUpdate();

    const updatedInvoice = db.prepare(`
      SELECT 
        i.*,
        s.name as studentName,
        s.rollNo as studentRollNo,
        cg.name as classGroupName
      FROM invoices i
      LEFT JOIN students s ON i.studentId = s.id
      LEFT JOIN class_groups cg ON s.classGroupId = cg.id
      WHERE i.id = ?
    `).get(req.params.id);

    res.json(updatedInvoice);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

router.delete("/invoices/:id", (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (Number.isNaN(invoiceId)) {
      return res.status(400).json({ error: "Invalid invoice id" });
    }
    const inv = db.prepare(`SELECT id FROM invoices WHERE id = ?`).get(invoiceId);
    if (!inv) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const run = db.transaction(() => {
      stripFeeAllocationsForInvoice(invoiceId);
      db.prepare("DELETE FROM invoices WHERE id = ?").run(invoiceId);
    });
    run();

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// Record partial payment — applies FIFO across all open invoices for this student
router.post("/invoices/:id/payments", (req, res) => {
  try {
    const { amount, paymentDate, remarks, createdBy } = req.body;
    const invoiceId = parseInt(req.params.id, 10);

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const inv = db.prepare(`SELECT studentId FROM invoices WHERE id = ?`).get(invoiceId);
    if (!inv) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const result = recordFeePayment(inv.studentId, amount, paymentDate, remarks, createdBy, {});

    const updatedInv = db.prepare(`SELECT status, amount FROM invoices WHERE id = ?`).get(invoiceId);
    const totalPaid = db.prepare(`
      SELECT SUM(paidAmount) as total FROM invoice_items WHERE invoiceId = ?
    `).get(invoiceId).total || 0;

    res.json({
      success: true,
      feePaymentId: result.feePaymentId,
      allocations: result.allocations,
      totalPaid,
      remainingAmount: Math.max(0, result.remainingAmount),
      status: updatedInv.status,
      totalAllocated: result.totalAllocated,
    });
  } catch (error) {
    console.error("Error recording payment:", error);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// Receipts that touched this invoice (may include allocations to other periods)
router.get("/invoices/:id/payments", (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const rows = db
      .prepare(
        `SELECT DISTINCT fp.id, fp.studentId, fp.totalAmount, fp.paymentDate, fp.remarks, fp.createdAt, fp.createdBy,
                u.name as createdByName
         FROM fee_payments fp
         INNER JOIN fee_payment_allocations a ON a.feePaymentId = fp.id
         INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
         LEFT JOIN users u ON fp.createdBy = u.id
         WHERE ii.invoiceId = ?
         ORDER BY fp.createdAt DESC`,
      )
      .all(invoiceId);

    const allocStmt = db.prepare(
      `SELECT a.invoiceItemId, a.amount, ii.description, ii.invoiceId
       FROM fee_payment_allocations a
       INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
       WHERE a.feePaymentId = ?`,
    );

    const enriched = rows.map((fp) => ({
      ...fp,
      allocations: allocStmt.all(fp.id),
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

// Get student payment history by charge type
router.get("/students/:id/payment-history", (req, res) => {
  try {
    const history = db.prepare(`
      SELECT 
        ii.chargeType,
        SUM(ii.amount) as totalCharged,
        SUM(ii.paidAmount) as totalPaid,
        MAX(i.year) as lastChargedYear
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      WHERE i.studentId = ? AND ii.type = 'charge'
      GROUP BY ii.chargeType
    `).all(req.params.id);
    
    res.json(history);
  } catch (error) {
    console.error("Error fetching student payment history:", error);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

// ==================== STUDENT FEE OVERRIDES ====================
router.get("/students/:id/fee-overrides", (req, res) => {
  try {
    const overrides = db.prepare(`
      SELECT * FROM student_fee_overrides WHERE studentId = ?
    `).all(req.params.id);
    
    res.json(overrides);
  } catch (error) {
    console.error("Error fetching fee overrides:", error);
    res.status(500).json({ error: "Failed to fetch fee overrides" });
  }
});

router.post("/students/:id/fee-overrides", (req, res) => {
  try {
    const { chargeType, amount, isExempt, notes } = req.body;
    const studentId = parseInt(req.params.id);
    
    // Check if override already exists
    const existing = db.prepare(`
      SELECT id FROM student_fee_overrides WHERE studentId = ? AND chargeType = ?
    `).get(studentId, chargeType);
    
    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE student_fee_overrides 
        SET amount = ?, isExempt = ?, notes = ?
        WHERE id = ?
      `).run(amount, isExempt ? 1 : 0, notes, existing.id);
      
      const updated = db.prepare(`
        SELECT * FROM student_fee_overrides WHERE id = ?
      `).get(existing.id);
      
      res.json(updated);
    } else {
      // Create new
      const result = db.prepare(`
        INSERT INTO student_fee_overrides (studentId, chargeType, amount, isExempt, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(studentId, chargeType, amount, isExempt ? 1 : 0, notes);
      
      const newOverride = db.prepare(`
        SELECT * FROM student_fee_overrides WHERE id = ?
      `).get(result.lastInsertRowid);
      
      res.status(201).json(newOverride);
    }
  } catch (error) {
    console.error("Error saving fee override:", error);
    res.status(500).json({ error: "Failed to save fee override" });
  }
});

router.delete("/students/:studentId/fee-overrides/:overrideId", (req, res) => {
  try {
    db.prepare("DELETE FROM student_fee_overrides WHERE id = ?").run(req.params.overrideId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting fee override:", error);
    res.status(500).json({ error: "Failed to delete fee override" });
  }
});

// ==================== STUDENT ADDITIONAL CHARGES (custom line items) ====================
router.get("/students/:id/additional-charges", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT * FROM student_additional_charges
      WHERE studentId = ?
        AND (recurring = 1 OR (recurring = 0 AND billedInvoiceId IS NULL))
      ORDER BY createdAt ASC
    `,
      )
      .all(req.params.id);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching additional charges:", error);
    res.status(500).json({ error: "Failed to fetch additional charges" });
  }
});

router.post("/students/:id/additional-charges", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const { description, amount, recurring, active } = req.body;
    if (!description || String(description).trim() === "") {
      return res.status(400).json({ error: "Description is required" });
    }
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt < 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    const rec = recurring === true || recurring === 1 || recurring === "1" ? 1 : 0;
    const act =
      active === false || active === 0 || active === "0" ? 0 : 1;
    const result = db
      .prepare(
        `
      INSERT INTO student_additional_charges (studentId, description, amount, recurring, active)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(studentId, String(description).trim(), amt, rec, act);
    const row = db.prepare("SELECT * FROM student_additional_charges WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    console.error("Error creating additional charge:", error);
    res.status(500).json({ error: "Failed to create additional charge" });
  }
});

router.patch("/students/:studentId/additional-charges/:chargeId", (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const chargeId = parseInt(req.params.chargeId, 10);
    if (Number.isNaN(studentId) || Number.isNaN(chargeId)) {
      return res.status(400).json({ error: "Invalid student or charge id" });
    }
    if (req.body.active === undefined) {
      return res.status(400).json({ error: "active is required (true or false)" });
    }
    const active =
      req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
    const r = db
      .prepare(
        "UPDATE student_additional_charges SET active = ? WHERE id = ? AND studentId = ?",
      )
      .run(active, chargeId, studentId);
    if (r.changes === 0) {
      return res.status(404).json({ error: "Charge not found" });
    }
    const row = db.prepare("SELECT * FROM student_additional_charges WHERE id = ?").get(chargeId);
    res.json(row);
  } catch (error) {
    console.error("Error updating additional charge:", error);
    res.status(500).json({ error: "Failed to update additional charge" });
  }
});

router.delete("/students/:studentId/additional-charges/:chargeId", (req, res) => {
  try {
    db.prepare(
      "DELETE FROM student_additional_charges WHERE id = ? AND studentId = ?",
    ).run(req.params.chargeId, req.params.studentId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting additional charge:", error);
    res.status(500).json({ error: "Failed to delete additional charge" });
  }
});

// ==================== DASHBOARD STATS ====================
router.get("/dashboard/stats", (req, res) => {
  try {
    const totalStudents = db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'active'").get().count;
    const totalInvoices = db.prepare("SELECT COUNT(*) as count FROM invoices").get().count;
    const pendingInvoices = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'pending'").get().count;
    const paidInvoices = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'paid'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(amount) as total FROM invoices WHERE status = 'paid'").get().total || 0;
    const pendingRevenue = db.prepare("SELECT SUM(amount) as total FROM invoices WHERE status = 'pending'").get().total || 0;

    const woBad = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM invoice_writeoffs WHERE reasonCode = 'bad_debt'`)
      .get().t || 0;
    const woWaive = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM invoice_writeoffs WHERE reasonCode = 'waive'`)
      .get().t || 0;
    const woOther = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM invoice_writeoffs WHERE reasonCode = 'other'`)
      .get().t || 0;
    const writeOffsTotal = roundMoney(Number(woBad) + Number(woWaive) + Number(woOther));

    res.json({
      totalStudents,
      totalInvoices,
      pendingInvoices,
      paidInvoices,
      totalRevenue,
      pendingRevenue,
      writeOffBadDebtTotal: roundMoney(woBad),
      writeOffWaiveTotal: roundMoney(woWaive),
      writeOffOtherTotal: roundMoney(woOther),
      writeOffsTotal,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
