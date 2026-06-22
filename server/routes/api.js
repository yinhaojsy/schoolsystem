import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { db, dataDir, insertStudentFeeVersionFromCurrentState } from "../db.js";
import bcrypt from "bcryptjs";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  getDatabaseInfo,
  writeBackupFile,
  restoreDatabaseFromBuffer,
  isSqliteDatabaseBuffer,
} from "../backupRestore.js";
import {
  recordFeePayment,
  deleteFeePayment,
  previewAllocation,
  priorOpenBalanceForPeriod,
  invoiceNetFromItems,
  invoicePaidOnCharges,
  invoiceUnpaidBalance,
  invoiceCollectionTier,
  invoiceChargesGross,
  roundMoney,
  syncInvoiceStatus,
  stripFeeAllocationsForInvoice,
  refreshInvoiceStatementAmount,
  refreshAllInvoiceStatementAmountsForStudent,
} from "../paymentEngine.js";
import {
  parseBillingMonths,
  earliestBillingMonth,
  invoiceOverlapsAnyMonth,
  billingPeriodOverlaps,
} from "../billingMonths.js";
import { buildInvoiceNumber, nextInvoiceSequenceForMonth } from "../invoiceNumber.js";
import parentApiRoutes from "./parentApi.js";
import teacherApiRoutes from "./teacherApi.js";
import { generateInvitePassword } from "../utils/password.js";
import { uploadsRoot, relativeUploadPath, publicUploadUrl } from "../utils/uploads.js";
import {
  parseStudentIds,
  syncParentStudents,
  formatParentAccountRow,
} from "../parentStudents.js";
import {
  listPendingPaymentProofs,
  listActiveNotifications,
  getPaymentProofById,
  getPaymentProofByInvoiceId,
  markPaymentProofReviewed,
  markPaymentProofRead,
} from "../paymentProofs.js";
import { listStaffNotifications } from "../staffNotificationFeed.js";
import {
  listAllTeachersContentSettings,
  updateTeacherContentSettings,
  listPendingContentSubmissions,
  listReviewedContentSubmissions,
  approveContent,
  rejectContent,
  deletePendingGalleryPhoto,
  removeGalleryPhotoAsAdmin,
  addApprovedGalleryPhotoAsAdmin,
  approveGalleryGroup,
  rejectGalleryGroup,
  approveDiaryEventsGroup,
  rejectDiaryEventsGroup,
  deletePendingDiaryEvent,
  deletePendingNotice,
  updatePendingNotice,
  approveNoticesGroup,
  rejectNoticesGroup,
  updatePendingDiary,
  correctApprovedDiary,
  correctApprovedNotice,
  reopenApprovedContent,
  reopenApprovedNoticesGroup,
  reopenApprovedGalleryGroup,
  deleteTeacherAccount,
  listPublishedOverview,
  getPublishedContentForAdmin,
} from "../teacherContent.js";
import { listAttendanceSheet, bulkSetAttendance } from "../attendance.js";
import { todayEntryDate } from "../utils/schoolDate.js";
import {
  createStreamToken,
  validateStreamToken,
  attachSseStream,
  buildTeacherStreamMeta,
  startSseHeartbeat,
} from "../staffNotifications.js";
import {
  getVapidPublicKey,
  isWebPushEnabled,
  savePushSubscription,
  deletePushSubscription,
} from "../webPush.js";

const router = express.Router();

startSseHeartbeat();

router.use("/parent", parentApiRoutes);
router.use("/teacher", teacherApiRoutes);

const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const studentPhotosDir = path.join(dataDir, "uploads", "students");
fs.mkdirSync(studentPhotosDir, { recursive: true });

const studentPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, studentPhotosDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `student-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

const galleryDir = path.join(uploadsRoot, "gallery");
fs.mkdirSync(galleryDir, { recursive: true });

const galleryUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, galleryDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

const invoiceLogoDir = path.join(uploadsRoot, "invoice-logos");
fs.mkdirSync(invoiceLogoDir, { recursive: true });

const invoiceLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, invoiceLogoDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `invoice-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") cb(null, true);
    else cb(new Error("Only PNG or JPEG image files are allowed."));
  },
});

function withProfilePhotoUrl(row) {
  if (!row) return row;
  return {
    ...row,
    profilePhotoUrl: row.profilePhotoPath ? `/api/uploads/${String(row.profilePhotoPath).replace(/\\/g, "/")}` : null,
  };
}

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

  if (user.role !== "admin") {
    return res.status(403).json({
      error: user.role === "parent"
        ? "Please use the parent portal to sign in."
        : user.role === "teacher"
          ? "Please use the teacher portal to sign in."
          : "You do not have access to the admin portal.",
    });
  }

  if (user.status && user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended." });
  }
  
  const isValid = bcrypt.compareSync(password, user.password);
  
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  const { password: _, invitePassword: __, ...userWithoutPassword } = user;
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
    res.json(students.map(withProfilePhotoUrl));
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

router.patch("/fee-payments/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }
    const row = db.prepare(`SELECT id FROM fee_payments WHERE id = ?`).get(id);
    if (!row) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    const { remarks } = req.body;
    const trimmed =
      remarks != null && String(remarks).trim() ? String(remarks).trim() : null;
    db.prepare(`UPDATE fee_payments SET remarks = ? WHERE id = ?`).run(trimmed, id);
    res.json({ success: true, remarks: trimmed });
  } catch (error) {
    console.error("Error updating fee payment remarks:", error);
    res.status(500).json({ error: "Failed to update receipt remarks" });
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
    
    res.json(withProfilePhotoUrl(student));
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

router.post("/students/:id/photo", requireAdmin, studentPhotoUpload.single("photo"), (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const student = db.prepare(`SELECT id, profilePhotoPath FROM students WHERE id = ?`).get(studentId);
    if (!student) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Student not found." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Photo file is required." });
    }
    if (student.profilePhotoPath) {
      const oldPath = path.join(dataDir, "uploads", student.profilePhotoPath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const relPath = path.relative(path.join(dataDir, "uploads"), req.file.path).replace(/\\/g, "/");
    db.prepare(`UPDATE students SET profilePhotoPath = ? WHERE id = ?`).run(relPath, studentId);
    const updated = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
    res.json(withProfilePhotoUrl(updated));
  } catch (error) {
    console.error("Student photo upload error:", error);
    res.status(500).json({ error: "Failed to upload photo." });
  }
});

router.delete("/students/:id/photo", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const student = db.prepare(`SELECT id, profilePhotoPath FROM students WHERE id = ?`).get(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }
    if (student.profilePhotoPath) {
      const filePath = path.join(dataDir, "uploads", student.profilePhotoPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare(`UPDATE students SET profilePhotoPath = NULL WHERE id = ?`).run(studentId);
    const updated = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
    res.json(withProfilePhotoUrl(updated));
  } catch (error) {
    console.error("Student photo delete error:", error);
    res.status(500).json({ error: "Failed to remove photo." });
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
    const { name, parentsName, contactNo, rollNo, feeStructureId, classGroupId, address, dateOfBirth, admissionDate, customFee } =
      req.body;

    const resolvedAdmissionDate =
      admissionDate && String(admissionDate).length >= 10
        ? String(admissionDate).slice(0, 10)
        : new Date().toISOString().slice(0, 10);

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
      INSERT INTO students (name, parentsName, contactNo, rollNo, feeStructureId, classGroupId, address, dateOfBirth, admissionDate,
        householdId, receivesSiblingDiscount, siblingPreMonthly, siblingPostMonthly, siblingDiscountFromMonth, siblingDiscountFromYear)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      parentsName,
      contactNo,
      rollNo,
      resolvedFeeStructureId,
      classGroupId,
      address,
      dateOfBirth,
      resolvedAdmissionDate,
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
      admissionDate,
      status,
    } = req.body;

    const resolvedAdmissionDate =
      admissionDate && String(admissionDate).length >= 10
        ? String(admissionDate).slice(0, 10)
        : null;

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
          feeStructureId = ?, classGroupId = ?, address = ?, dateOfBirth = ?, admissionDate = COALESCE(?, admissionDate), status = ?,
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
      resolvedAdmissionDate,
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

router.patch("/students/:id/mark-left", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid student id" });

    const student = db.prepare("SELECT id, name FROM students WHERE id = ?").get(id);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const reasonTypeRaw =
      typeof req.body.reasonType === "string" ? req.body.reasonType.trim() : "";
    const allowedReasonTypes = new Set(["parent_decision", "school_terminated", "other"]);
    const reasonType =
      reasonTypeRaw && allowedReasonTypes.has(reasonTypeRaw) ? reasonTypeRaw : null;
    const leftRemarks =
      typeof req.body.leftRemarks === "string" && req.body.leftRemarks.trim()
        ? req.body.leftRemarks.trim().slice(0, 2000)
        : null;

    db.prepare(
      `UPDATE students
       SET enrollmentStatus = 'left',
           leftAt = CURRENT_TIMESTAMP,
           leftReasonType = ?,
           leftRemarks = ?
       WHERE id = ?`,
    ).run(reasonType, leftRemarks, id);

    const updated = db
      .prepare(
        `SELECT s.*, fs.name as feeStructureName, fs.monthlyFee as monthlyFee, cg.name as classGroupName, h.label as householdLabel
         FROM students s
         LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
         LEFT JOIN class_groups cg ON s.classGroupId = cg.id
         LEFT JOIN households h ON s.householdId = h.id
         WHERE s.id = ?`,
      )
      .get(id);
    res.json(withProfilePhotoUrl(updated));
  } catch (error) {
    console.error("Error marking student left:", error);
    res.status(500).json({ error: "Failed to mark student as left." });
  }
});

router.patch("/students/:id/re-enroll", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid student id" });

    const student = db.prepare("SELECT id FROM students WHERE id = ?").get(id);
    if (!student) return res.status(404).json({ error: "Student not found" });

    db.prepare(
      `UPDATE students
       SET enrollmentStatus = 'enrolled',
           leftAt = NULL,
           leftReasonType = NULL,
           leftRemarks = NULL
       WHERE id = ?`,
    ).run(id);

    const updated = db
      .prepare(
        `SELECT s.*, fs.name as feeStructureName, fs.monthlyFee as monthlyFee, cg.name as classGroupName, h.label as householdLabel
         FROM students s
         LEFT JOIN fee_structures fs ON s.feeStructureId = fs.id
         LEFT JOIN class_groups cg ON s.classGroupId = cg.id
         LEFT JOIN households h ON s.householdId = h.id
         WHERE s.id = ?`,
      )
      .get(id);
    res.json(withProfilePhotoUrl(updated));
  } catch (error) {
    console.error("Error re-enrolling student:", error);
    res.status(500).json({ error: "Failed to re-enroll student." });
  }
});

router.delete("/students/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid student id" });
    if (req.body?.confirmText !== "DELETE") {
      return res.status(400).json({ error: 'Type "DELETE" to confirm student deletion.' });
    }
    const exists = db.prepare("SELECT id FROM students WHERE id = ?").get(id);
    if (!exists) return res.status(404).json({ error: "Student not found" });
    db.prepare("DELETE FROM students WHERE id = ?").run(id);
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

const DEFAULT_INVOICE_TEMPLATE_SETTINGS = {
  schoolName: "YOUR SCHOOL NAME",
  schoolSubtitle: "DAYCARE & PRESCHOOL",
  schoolNameColor: "#d63384",
  schoolSubtitleColor: "#20c997",
  logoPath: null,
  bankName: "",
  accountTitle: "",
  accountNo: "",
  branchCode: "",
  iban: "",
  footerNote: "Thank you for your prompt payment. For queries, contact the office during school hours.",
  invoiceNoPrefix: "INV",
  invoiceNoStudentPart: "rollNo",
  invoiceNoSequenceDigits: 3,
};

function loadInvoiceTemplateSettings() {
  const row = db.prepare("SELECT settingsJson, updatedAt FROM invoice_template WHERE id = 1").get();
  if (!row) {
    return { settings: { ...DEFAULT_INVOICE_TEMPLATE_SETTINGS }, updatedAt: null };
  }
  let parsed = {};
  try {
    parsed = JSON.parse(row.settingsJson);
  } catch {
    parsed = {};
  }
  // Legacy cleanup: remove old base64 payload if present.
  if (Object.prototype.hasOwnProperty.call(parsed, "logoBase64")) {
    delete parsed.logoBase64;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "logoMimeType")) {
    delete parsed.logoMimeType;
  }
  return {
    settings: { ...DEFAULT_INVOICE_TEMPLATE_SETTINGS, ...parsed },
    updatedAt: row.updatedAt ?? null,
  };
}

function persistInvoiceTemplateSettings(settings) {
  const settingsJson = JSON.stringify(settings);
  const existing = db.prepare("SELECT id FROM invoice_template WHERE id = 1").get();
  if (existing) {
    db.prepare(
      "UPDATE invoice_template SET settingsJson = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 1",
    ).run(settingsJson);
  } else {
    db.prepare("INSERT INTO invoice_template (id, settingsJson) VALUES (1, ?)").run(settingsJson);
  }
  return loadInvoiceTemplateSettings();
}

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

// ==================== INVOICE TEMPLATE (shared across devices) ====================
router.get("/invoice-template", requireAdmin, (_req, res) => {
  try {
    const { settings, updatedAt } = loadInvoiceTemplateSettings();
    return res.json({
      settings: {
        ...settings,
        logoUrl: publicUploadUrl(settings.logoPath),
      },
      updatedAt,
    });
  } catch (error) {
    console.error("Error fetching invoice template:", error);
    return res.status(500).json({ error: "Failed to fetch invoice template" });
  }
});

router.put("/invoice-template", requireAdmin, (req, res) => {
  try {
    const incoming = req.body?.settings;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "settings is required" });
    }
    const normalized = {
      ...DEFAULT_INVOICE_TEMPLATE_SETTINGS,
      ...incoming,
      logoUrl: undefined,
      logoPath:
        typeof incoming.logoPath === "string" && incoming.logoPath.trim()
          ? incoming.logoPath.trim()
          : null,
      invoiceNoPrefix:
        typeof incoming.invoiceNoPrefix === "string"
          ? incoming.invoiceNoPrefix.trim().slice(0, 16)
          : DEFAULT_INVOICE_TEMPLATE_SETTINGS.invoiceNoPrefix,
      invoiceNoStudentPart:
        incoming.invoiceNoStudentPart === "studentName" ? "studentName" : "rollNo",
      invoiceNoSequenceDigits: incoming.invoiceNoSequenceDigits === 4 ? 4 : 3,
    };
    const { settings, updatedAt } = persistInvoiceTemplateSettings(normalized);
    return res.json({
      settings: {
        ...settings,
        logoUrl: publicUploadUrl(settings.logoPath),
      },
      updatedAt,
    });
  } catch (error) {
    console.error("Error saving invoice template:", error);
    return res.status(500).json({ error: "Failed to save invoice template" });
  }
});

router.post("/invoice-template/logo", requireAdmin, invoiceLogoUpload.single("logo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Logo image is required." });
    }
    const current = loadInvoiceTemplateSettings();
    if (current.settings.logoPath) {
      const oldAbsPath = path.join(uploadsRoot, current.settings.logoPath);
      if (fs.existsSync(oldAbsPath)) {
        fs.unlinkSync(oldAbsPath);
      }
    }
    const next = {
      ...current.settings,
      logoPath: relativeUploadPath(req.file.path),
    };
    const { settings, updatedAt } = persistInvoiceTemplateSettings(next);
    return res.json({
      settings: {
        ...settings,
        logoUrl: publicUploadUrl(settings.logoPath),
      },
      updatedAt,
    });
  } catch (error) {
    console.error("Error uploading invoice logo:", error);
    return res.status(500).json({ error: "Failed to upload invoice logo" });
  }
});

router.delete("/invoice-template/logo", requireAdmin, (_req, res) => {
  try {
    const current = loadInvoiceTemplateSettings();
    if (current.settings.logoPath) {
      const oldAbsPath = path.join(uploadsRoot, current.settings.logoPath);
      if (fs.existsSync(oldAbsPath)) {
        fs.unlinkSync(oldAbsPath);
      }
    }
    const next = { ...current.settings, logoPath: null };
    const { settings, updatedAt } = persistInvoiceTemplateSettings(next);
    return res.json({
      settings: {
        ...settings,
        logoUrl: publicUploadUrl(settings.logoPath),
      },
      updatedAt,
    });
  } catch (error) {
    console.error("Error deleting invoice logo:", error);
    return res.status(500).json({ error: "Failed to remove invoice logo" });
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
    
    const invoices = db.prepare(query).all(...params);

    for (const inv of invoices) {
      inv.periodNet = invoiceNetFromItems(inv.id);
      inv.periodPaid = invoicePaidOnCharges(inv.id);
      inv.periodUnpaid = roundMoney(Math.max(0, inv.periodNet - inv.periodPaid));
      inv.collectionTier = invoiceCollectionTier(inv.id, inv.status);
    }

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
    const paymentProof = getPaymentProofByInvoiceId(invoice.id);

    res.json({ ...invoice, items, priorBalance, periodSubtotal, grandDue, paymentProof });
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
    });
    run();
    refreshAllInvoiceStatementAmountsForStudent(inv.studentId);

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

router.post("/invoices/suggest-number", (req, res) => {
  try {
    const { studentId, invoiceDate, numbering } = req.body;
    const sid = parseInt(studentId, 10);
    if (Number.isNaN(sid)) {
      return res.status(400).json({ error: "studentId is required." });
    }
    const invDateRaw =
      invoiceDate != null && String(invoiceDate).trim()
        ? String(invoiceDate).trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const student = db.prepare(`SELECT id, rollNo, name FROM students WHERE id = ?`).get(sid);
    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }
    const settings = {
      invoiceNoPrefix: numbering?.invoiceNoPrefix ?? "INV",
      invoiceNoStudentPart:
        numbering?.invoiceNoStudentPart === "studentName" ? "studentName" : "rollNo",
      invoiceNoSequenceDigits: numbering?.invoiceNoSequenceDigits === 4 ? 4 : 3,
    };
    const sequence = nextInvoiceSequenceForMonth(db, invDateRaw);
    const invoiceNo = buildInvoiceNumber(settings, student, invDateRaw, sequence);
    res.json({ invoiceNo, sequence });
  } catch (error) {
    console.error("Error suggesting invoice number:", error);
    res.status(500).json({ error: "Failed to suggest invoice number" });
  }
});

router.post("/invoices", (req, res) => {
  try {
    const { studentId, month, year, amount, dueDate, remarks, items, createdBy, invoiceDate, invoiceNo: bodyInvoiceNo } = req.body;
    const invDateRaw = invoiceDate != null && String(invoiceDate).trim()
      ? String(invoiceDate).trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    
    let invoiceNo =
      bodyInvoiceNo != null && String(bodyInvoiceNo).trim()
        ? String(bodyInvoiceNo).trim()
        : `INV-${Date.now()}`;
    const existingNo = db.prepare(`SELECT id FROM invoices WHERE invoiceNo = ?`).get(invoiceNo);
    if (existingNo) {
      return res.status(409).json({ error: `Invoice number "${invoiceNo}" is already in use.` });
    }
    
    const billingMonths = parseBillingMonths(month);
    const monthsToBill = billingMonths.length > 0 ? billingMonths : [String(month || "").trim()].filter(Boolean);
    if (monthsToBill.length === 0) {
      return res.status(400).json({ error: "At least one billing month is required." });
    }

    const existingRows = db
      .prepare(`SELECT id, month FROM invoices WHERE studentId = ? AND year = ?`)
      .all(studentId, year);
    const overlap = existingRows.find((row) => invoiceOverlapsAnyMonth(row.month, monthsToBill));
    if (overlap) {
      return res.status(409).json({
        error: "An invoice already exists for this student that includes one or more of these billing months.",
      });
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
    const priorAnchor = earliestBillingMonth(month, year);
    const prior = priorOpenBalanceForPeriod(studentId, priorAnchor, year);
    const finalAmount = roundMoney(periodNet + prior);

    const result = db.prepare(`
      INSERT INTO invoices (studentId, invoiceNo, month, year, amount, dueDate, invoiceDate, remarks, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(studentId, invoiceNo, month, year, finalAmount, dueDate, invDateRaw, remarks, createdBy);
    
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

    const priorBalance = priorOpenBalanceForPeriod(studentId, priorAnchor, year);
    const periodSubtotal = invoiceNetFromItems(invoiceId);
    
    res.status(201).json({
      ...newInvoice,
      priorBalance,
      periodSubtotal,
      grandDue: roundMoney(priorBalance + invoiceUnpaidBalance(invoiceId)),
    });
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

/** Unpaid balance from invoices strictly before the given billing period (brought forward). */
router.get("/students/:id/prior-balance", (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student id" });
    }
    const month = String(req.query.month || "").trim();
    const year = parseInt(String(req.query.year || ""), 10);
    if (!month || Number.isNaN(year)) {
      return res.status(400).json({ error: "month and year query parameters are required." });
    }
    const exists = db.prepare(`SELECT id FROM students WHERE id = ?`).get(studentId);
    if (!exists) {
      return res.status(404).json({ error: "Student not found" });
    }
    const priorAnchor = earliestBillingMonth(month, year);
    const priorBalance = priorOpenBalanceForPeriod(studentId, priorAnchor, year);
    res.json({ priorBalance });
  } catch (error) {
    console.error("Error fetching prior balance:", error);
    res.status(500).json({ error: "Failed to fetch prior balance" });
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

// ==================== REPORTS ====================
router.get("/reports/monthly-income", (req, res) => {
  try {
    const month = String(req.query.month || "").trim();
    const year = parseInt(String(req.query.year || ""), 10);
    if (!month || Number.isNaN(year)) {
      return res.status(400).json({ error: "month and year query parameters are required." });
    }

    const allInvoices = db
      .prepare(
        `SELECT
           i.id,
           i.studentId,
           i.invoiceNo,
           i.month,
           i.year,
           i.amount,
           i.invoiceDate,
           i.dueDate,
           i.status,
           i.paymentDate,
           i.createdAt,
           s.name AS studentName,
           s.rollNo AS studentRollNo,
           cg.name AS classGroupName
         FROM invoices i
         LEFT JOIN students s ON i.studentId = s.id
         LEFT JOIN class_groups cg ON s.classGroupId = cg.id
         WHERE i.year = ? AND LOWER(TRIM(i.status)) != 'cancelled'
         ORDER BY i.invoiceNo ASC`,
      )
      .all(year);

    const rows = [];
    for (const inv of allInvoices) {
      if (!billingPeriodOverlaps(inv.month, month)) continue;

      const billedAmount = invoiceNetFromItems(inv.id);
      const cashCollected = invoicePaidOnCharges(inv.id);
      const outstandingReceivable = roundMoney(Math.max(0, billedAmount - cashCollected));
      const collectionTier = invoiceCollectionTier(inv.id, inv.status);

      rows.push({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        studentId: inv.studentId,
        studentName: inv.studentName,
        studentRollNo: inv.studentRollNo,
        classGroupName: inv.classGroupName,
        billingMonth: inv.month,
        billingYear: inv.year,
        invoiceDate: inv.invoiceDate || inv.createdAt?.slice(0, 10) || null,
        dueDate: inv.dueDate,
        status: inv.status,
        collectionTier,
        billedAmount,
        cashCollected,
        outstandingReceivable,
        statementAmount: roundMoney(inv.amount),
      });
    }

    const summary = {
      invoiceCount: rows.length,
      totalBilled: roundMoney(rows.reduce((s, r) => s + r.billedAmount, 0)),
      cashCollected: roundMoney(rows.reduce((s, r) => s + r.cashCollected, 0)),
      outstandingReceivable: roundMoney(rows.reduce((s, r) => s + r.outstandingReceivable, 0)),
    };

    const availableYears = db
      .prepare(`SELECT DISTINCT year FROM invoices ORDER BY year DESC`)
      .all()
      .map((r) => r.year);

    res.json({
      month,
      year,
      summary,
      invoices: rows,
      availableYears: availableYears.length > 0 ? availableYears : [year],
    });
  } catch (error) {
    console.error("Error fetching monthly income report:", error);
    res.status(500).json({ error: "Failed to fetch monthly income report" });
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

    const totalReceipts = roundMoney(
      db.prepare(`SELECT COALESCE(SUM(totalAmount), 0) AS total FROM fee_payments`).get().total || 0,
    );

    const openInvoices = db.prepare(`SELECT id FROM invoices WHERE status != 'cancelled'`).all();
    let totalOutstanding = 0;
    for (const inv of openInvoices) {
      totalOutstanding += invoiceUnpaidBalance(inv.id);
    }
    totalOutstanding = roundMoney(totalOutstanding);

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
      totalReceipts,
      totalOutstanding,
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

// ==================== SETTINGS (database backup / restore) ====================
router.get("/settings/database-info", requireAdmin, (req, res) => {
  try {
    res.json(getDatabaseInfo());
  } catch (error) {
    console.error("Database info error:", error);
    res.status(500).json({ error: "Failed to read database info." });
  }
});

router.get("/settings/backup", requireAdmin, async (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `school-backup-${stamp}.db`;
  const tmpPath = path.join(dataDir, `backup-${Date.now()}.db`);

  try {
    await writeBackupFile(tmpPath);
    res.download(tmpPath, filename, (err) => {
      fs.unlink(tmpPath, () => {
        if (err && !res.headersSent) {
          console.error("Backup download error:", err);
        }
      });
    });
  } catch (error) {
    console.error("Backup error:", error);
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    res.status(500).json({ error: "Failed to create backup." });
  }
});

router.post("/settings/restore", requireAdmin, restoreUpload.single("database"), (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: "Upload a .db backup file." });
    }

    if (!isSqliteDatabaseBuffer(req.file.buffer)) {
      return res.status(400).json({ error: "File is not a valid SQLite database." });
    }

    const { safetyBackupPath } = restoreDatabaseFromBuffer(req.file.buffer);
    res.json({
      success: true,
      message: "Database restored successfully. Reload the app to see updated data.",
      safetyBackupPath,
    });
  } catch (error) {
    console.error("Restore error:", error);
    res.status(500).json({ error: "Failed to restore database. The previous database may still be in use." });
  }
});

// ==================== PARENT ACCOUNTS (admin) ====================
router.get("/parent-accounts", requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.householdId, u.invitePassword, u.createdAt,
                h.label as householdLabel
         FROM users u
         LEFT JOIN households h ON h.id = u.householdId
         WHERE u.role = 'parent'
         ORDER BY u.createdAt DESC`,
      )
      .all()
      .map(formatParentAccountRow);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching parent accounts:", error);
    res.status(500).json({ error: "Failed to fetch parent accounts." });
  }
});

router.post("/parent-accounts", requireAdmin, (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const studentIds = parseStudentIds(req.body.studentIds);
    const householdId =
      req.body.householdId != null && req.body.householdId !== "" ? parseInt(req.body.householdId, 10) : null;
    const password =
      typeof req.body.password === "string" && req.body.password.trim()
        ? req.body.password.trim()
        : generateInvitePassword();

    if (!name) return res.status(400).json({ error: "Parent name is required." });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required." });
    if (studentIds.length === 0) return res.status(400).json({ error: "Select at least one student." });

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) return res.status(409).json({ error: "Email is already in use." });

    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password, role, status, householdId, invitePassword)
         VALUES (?, ?, ?, 'parent', 'active', ?, ?)`,
      )
      .run(name, email, hash, householdId, password);

    syncParentStudents(result.lastInsertRowid, studentIds);

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.householdId, u.invitePassword, u.createdAt,
                h.label as householdLabel
         FROM users u LEFT JOIN households h ON h.id = u.householdId WHERE u.id = ?`,
      )
      .get(result.lastInsertRowid);
    res.status(201).json(formatParentAccountRow(row));
  } catch (error) {
    console.error("Error creating parent account:", error);
    if (error instanceof Error && error.message === "STUDENT_NOT_FOUND") {
      return res.status(400).json({ error: "One or more selected students were not found." });
    }
    res.status(500).json({ error: "Failed to create parent account." });
  }
});

router.put("/parent-accounts/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'parent'`).get(id);
    if (!existing) return res.status(404).json({ error: "Parent account not found." });

    const name = typeof req.body.name === "string" ? req.body.name.trim() : existing.name;
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : existing.email;
    const status = req.body.status === "inactive" ? "inactive" : req.body.status === "active" ? "active" : existing.status;
    const studentIds = req.body.studentIds != null ? parseStudentIds(req.body.studentIds) : null;
    const householdId =
      req.body.householdId != null && req.body.householdId !== ""
        ? parseInt(req.body.householdId, 10)
        : existing.householdId;

    if (!name) return res.status(400).json({ error: "Parent name is required." });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required." });
    if (studentIds != null && studentIds.length === 0) {
      return res.status(400).json({ error: "Select at least one student." });
    }

    const emailTaken = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, id);
    if (emailTaken) return res.status(409).json({ error: "Email is already in use." });

    let invitePassword = existing.invitePassword;
    let passwordHash = existing.password;
    if (typeof req.body.password === "string" && req.body.password.trim()) {
      invitePassword = req.body.password.trim();
      passwordHash = bcrypt.hashSync(invitePassword, 10);
    }

    db.prepare(
      `UPDATE users SET name = ?, email = ?, status = ?, householdId = ?, password = ?, invitePassword = ? WHERE id = ?`,
    ).run(name, email, status, householdId, passwordHash, invitePassword, id);

    if (studentIds != null) {
      syncParentStudents(id, studentIds);
    }

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.householdId, u.invitePassword, u.createdAt,
                h.label as householdLabel
         FROM users u LEFT JOIN households h ON h.id = u.householdId WHERE u.id = ?`,
      )
      .get(id);
    res.json(formatParentAccountRow(row));
  } catch (error) {
    console.error("Error updating parent account:", error);
    if (error instanceof Error && error.message === "STUDENT_NOT_FOUND") {
      return res.status(400).json({ error: "One or more selected students were not found." });
    }
    res.status(500).json({ error: "Failed to update parent account." });
  }
});

router.post("/parent-accounts/:id/reset-password", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'parent'`).get(id);
    if (!existing) return res.status(404).json({ error: "Parent account not found." });

    const password = generateInvitePassword();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`UPDATE users SET password = ?, invitePassword = ? WHERE id = ?`).run(hash, password, id);

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.householdId, u.invitePassword, u.createdAt,
                h.label as householdLabel
         FROM users u LEFT JOIN households h ON h.id = u.householdId WHERE u.id = ?`,
      )
      .get(id);
    res.json(formatParentAccountRow(row));
  } catch (error) {
    console.error("Error resetting parent password:", error);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

router.delete("/parent-accounts/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'parent'`).get(id);
    if (!existing) return res.status(404).json({ error: "Parent account not found." });
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting parent account:", error);
    res.status(500).json({ error: "Failed to delete parent account." });
  }
});

// ==================== TEACHER ACCOUNTS (admin) ====================
router.get("/teacher-accounts", requireAdmin, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.teacherScope,
                u.canEditPublishedContent, u.invitePassword, u.createdAt,
                cg.name as classGroupName,
                CASE WHEN u.teacherScope = 'school' THEN
                  (SELECT COUNT(*) FROM students s WHERE s.status = 'active')
                ELSE
                  (SELECT COUNT(*) FROM students s WHERE s.classGroupId = u.classGroupId AND s.status = 'active')
                END as daycareStudentCount
         FROM users u
         LEFT JOIN class_groups cg ON cg.id = u.classGroupId
         WHERE u.role = 'teacher'
         ORDER BY u.createdAt DESC`,
      )
      .all()
      .map((row) => ({
        ...row,
        teacherScope: row.teacherScope ?? "class",
        canEditPublishedContent: !!row.canEditPublishedContent,
        classGroupName: row.teacherScope === "school" ? "All students" : row.classGroupName,
      }));
    res.json(rows);
  } catch (error) {
    console.error("Error fetching teacher accounts:", error);
    res.status(500).json({ error: "Failed to fetch teacher accounts." });
  }
});

router.post("/teacher-accounts", requireAdmin, (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const teacherScope = req.body.teacherScope === "school" ? "school" : "class";
    const canEditPublishedContent = !!req.body.canEditPublishedContent;
    const classGroupIdRaw =
      req.body.classGroupId != null && req.body.classGroupId !== "" ? parseInt(req.body.classGroupId, 10) : null;
    const password =
      typeof req.body.password === "string" && req.body.password.trim()
        ? req.body.password.trim()
        : generateInvitePassword();

    if (!name) return res.status(400).json({ error: "Teacher name is required." });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required." });

    let classGroupId = null;
    if (teacherScope === "class") {
      if (classGroupIdRaw == null || Number.isNaN(classGroupIdRaw)) {
        return res.status(400).json({ error: "Class group is required for classroom teachers." });
      }
      const cg = db.prepare(`SELECT id FROM class_groups WHERE id = ?`).get(classGroupIdRaw);
      if (!cg) return res.status(400).json({ error: "Class group not found." });
      classGroupId = classGroupIdRaw;
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) return res.status(409).json({ error: "Email is already in use." });

    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password, role, status, classGroupId, teacherScope, canEditPublishedContent, invitePassword)
         VALUES (?, ?, ?, 'teacher', 'active', ?, ?, ?, ?)`,
      )
      .run(name, email, hash, classGroupId, teacherScope, canEditPublishedContent ? 1 : 0, password);

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.teacherScope, u.canEditPublishedContent,
                u.invitePassword, u.createdAt, cg.name as classGroupName
         FROM users u LEFT JOIN class_groups cg ON cg.id = u.classGroupId WHERE u.id = ?`,
      )
      .get(result.lastInsertRowid);
    res.status(201).json({
      ...row,
      teacherScope: row.teacherScope ?? "class",
      canEditPublishedContent: !!row.canEditPublishedContent,
      classGroupName: row.teacherScope === "school" ? "All students" : row.classGroupName,
    });
  } catch (error) {
    console.error("Error creating teacher account:", error);
    res.status(500).json({ error: "Failed to create teacher account." });
  }
});

router.put("/teacher-accounts/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'teacher'`).get(id);
    if (!existing) return res.status(404).json({ error: "Teacher account not found." });

    const name = typeof req.body.name === "string" ? req.body.name.trim() : existing.name;
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : existing.email;
    const status = req.body.status === "inactive" ? "inactive" : req.body.status === "active" ? "active" : existing.status;
    const teacherScope =
      req.body.teacherScope === "school" ? "school" : req.body.teacherScope === "class" ? "class" : (existing.teacherScope ?? "class");
    const canEditPublishedContent =
      req.body.canEditPublishedContent != null
        ? !!req.body.canEditPublishedContent
        : !!existing.canEditPublishedContent;
    const classGroupIdRaw =
      req.body.classGroupId != null && req.body.classGroupId !== ""
        ? parseInt(req.body.classGroupId, 10)
        : existing.classGroupId;

    if (!name) return res.status(400).json({ error: "Teacher name is required." });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A valid email is required." });

    let classGroupId = null;
    if (teacherScope === "class") {
      if (classGroupIdRaw == null || Number.isNaN(classGroupIdRaw)) {
        return res.status(400).json({ error: "Class group is required for classroom teachers." });
      }
      classGroupId = classGroupIdRaw;
    }

    const emailTaken = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, id);
    if (emailTaken) return res.status(409).json({ error: "Email is already in use." });

    let invitePassword = existing.invitePassword;
    let passwordHash = existing.password;
    if (typeof req.body.password === "string" && req.body.password.trim()) {
      invitePassword = req.body.password.trim();
      passwordHash = bcrypt.hashSync(invitePassword, 10);
    }

    db.prepare(
      `UPDATE users SET name = ?, email = ?, status = ?, classGroupId = ?, teacherScope = ?,
       canEditPublishedContent = ?, password = ?, invitePassword = ? WHERE id = ?`,
    ).run(
      name,
      email,
      status,
      classGroupId,
      teacherScope,
      canEditPublishedContent ? 1 : 0,
      passwordHash,
      invitePassword,
      id,
    );

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.teacherScope, u.canEditPublishedContent,
                u.invitePassword, u.createdAt, cg.name as classGroupName
         FROM users u LEFT JOIN class_groups cg ON cg.id = u.classGroupId WHERE u.id = ?`,
      )
      .get(id);
    res.json({
      ...row,
      teacherScope: row.teacherScope ?? "class",
      canEditPublishedContent: !!row.canEditPublishedContent,
      classGroupName: row.teacherScope === "school" ? "All students" : row.classGroupName,
    });
  } catch (error) {
    console.error("Error updating teacher account:", error);
    res.status(500).json({ error: "Failed to update teacher account." });
  }
});

router.post("/teacher-accounts/:id/reset-password", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher'`).get(id);
    if (!existing) return res.status(404).json({ error: "Teacher account not found." });

    const password = generateInvitePassword();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`UPDATE users SET password = ?, invitePassword = ? WHERE id = ?`).run(hash, password, id);

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.invitePassword, u.createdAt, cg.name as classGroupName
         FROM users u LEFT JOIN class_groups cg ON cg.id = u.classGroupId WHERE u.id = ?`,
      )
      .get(id);
    res.json(row);
  } catch (error) {
    console.error("Error resetting teacher password:", error);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

router.delete("/teacher-accounts/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = deleteTeacherAccount(id);
    if (!result) return res.status(404).json({ error: "Teacher account not found." });
    res.json(result);
  } catch (error) {
    console.error("Error deleting teacher account:", error);
    res.status(500).json({ error: "Failed to delete teacher account." });
  }
});

// ==================== TEACHER PORTAL PERMISSIONS ====================

router.get("/teacher-content-settings", requireAdmin, (_req, res) => {
  try {
    res.json(listAllTeachersContentSettings());
  } catch (error) {
    console.error("Error fetching teacher content settings:", error);
    res.status(500).json({ error: "Failed to fetch teacher permissions." });
  }
});

router.put("/teacher-accounts/:id/content-settings", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const settings = updateTeacherContentSettings(id, {
      diary: !!req.body.diary,
      notices: !!req.body.notices,
      gallery: !!req.body.gallery,
    });
    if (!settings) return res.status(404).json({ error: "Teacher account not found." });
    res.json({ teacherId: id, settings });
  } catch (error) {
    console.error("Error updating teacher content settings:", error);
    res.status(500).json({ error: "Failed to update teacher permissions." });
  }
});

// ==================== ATTENDANCE SHEET ====================

router.get("/attendance-sheet", requireAdmin, (req, res) => {
  try {
    const classGroupId = parseInt(String(req.query.classGroupId ?? ""), 10);
    const year = parseInt(String(req.query.year ?? ""), 10);
    const month = parseInt(String(req.query.month ?? ""), 10);
    const result = listAttendanceSheet({ classGroupId, year, month });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error fetching attendance sheet:", error);
    res.status(500).json({ error: "Failed to fetch attendance sheet." });
  }
});

// ==================== CONTENT APPROVALS ====================

router.get("/content-approvals/published-overview", requireAdmin, (req, res) => {
  try {
    const entryDate = typeof req.query.entryDate === "string" ? req.query.entryDate.trim() : undefined;
    const classGroupId =
      req.query.classGroupId != null && String(req.query.classGroupId).trim() !== ""
        ? parseInt(String(req.query.classGroupId), 10)
        : null;
    const date = entryDate || todayEntryDate();
    res.json({
      entryDate: date,
      students: listPublishedOverview({
        entryDate: date,
        classGroupId: classGroupId != null && !Number.isNaN(classGroupId) ? classGroupId : null,
      }),
    });
  } catch (error) {
    console.error("Error fetching published overview:", error);
    res.status(500).json({ error: "Failed to fetch published overview." });
  }
});

router.get("/content-approvals/published-content", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(String(req.query.studentId ?? ""), 10);
    const entryDate = typeof req.query.entryDate === "string" ? req.query.entryDate.trim() : undefined;
    const contentType = typeof req.query.contentType === "string" ? req.query.contentType.trim() : "";
    if (Number.isNaN(studentId)) {
      return res.status(400).json({ error: "Invalid student." });
    }
    const result = getPublishedContentForAdmin(studentId, entryDate, contentType);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error fetching published content:", error);
    res.status(500).json({ error: "Failed to fetch published content." });
  }
});

router.get("/content-approvals", requireAdmin, (req, res) => {
  try {
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "pending";
    const listFn =
      statusRaw === "approved" || statusRaw === "rejected"
        ? (opts) => listReviewedContentSubmissions({ ...opts, status: statusRaw })
        : listPendingContentSubmissions;

    if (pageRaw != null && String(pageRaw).trim() !== "") {
      const page = parseInt(String(pageRaw), 10);
      const limit = limitRaw != null ? parseInt(String(limitRaw), 10) : 20;
      if (Number.isNaN(page)) {
        return res.status(400).json({ error: "Invalid page." });
      }
      res.json(listFn({ page, limit: Number.isNaN(limit) ? 20 : limit }));
      return;
    }
    const limit = limitRaw != null ? parseInt(String(limitRaw), 10) : 50;
    res.json(listFn({ limit: Number.isNaN(limit) ? 50 : limit }));
  } catch (error) {
    console.error("Error fetching content approvals:", error);
    res.status(500).json({ error: "Failed to fetch pending submissions." });
  }
});

router.delete("/content-approvals/gallery/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pendingOnly = req.query.pendingOnly === "1" || req.query.pendingOnly === "true";
    const result = pendingOnly
      ? deletePendingGalleryPhoto(id)
      : removeGalleryPhotoAsAdmin(id, req.adminUser.id);
    if (!result) return res.status(404).json({ error: "Photo not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error removing gallery photo:", error);
    res.status(500).json({ error: "Failed to remove photo." });
  }
});

router.post("/content-approvals/gallery/upload", requireAdmin, galleryUpload.single("photo"), (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const teacherId =
      req.body.teacherId != null && req.body.teacherId !== "" ? parseInt(req.body.teacherId, 10) : null;
    if (!req.file) return res.status(400).json({ error: "Photo file is required." });

    const relPath = relativeUploadPath(req.file.path);
    const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : null;
    const result = addApprovedGalleryPhotoAsAdmin({
      studentId,
      entryDate,
      teacherId,
      adminId: req.adminUser.id,
      filePath: relPath,
      caption: caption || null,
    });
    if (result?.error) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(result.status).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (error) {
    console.error("Error uploading approved gallery photo:", error);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to upload photo." });
  }
});

router.patch("/content-approvals/diary-events/group/approve", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const result = approveDiaryEventsGroup(studentId, entryDate, req.adminUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error approving diary activities group:", error);
    res.status(500).json({ error: "Failed to approve diary activities." });
  }
});

router.patch("/content-approvals/diary-events/group/reject", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const result = rejectDiaryEventsGroup(studentId, entryDate, req.adminUser.id, reason);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error rejecting diary activities group:", error);
    res.status(500).json({ error: "Failed to reject diary activities." });
  }
});

router.delete("/content-approvals/diary-events/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = deletePendingDiaryEvent(id);
    if (!result) return res.status(404).json({ error: "Activity not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error removing diary activity:", error);
    res.status(500).json({ error: "Failed to remove activity." });
  }
});

router.patch("/content-approvals/gallery/group/approve", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const result = approveGalleryGroup(studentId, entryDate, req.adminUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error approving gallery group:", error);
    res.status(500).json({ error: "Failed to approve photos." });
  }
});

router.patch("/content-approvals/gallery/group/reject", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const result = rejectGalleryGroup(studentId, entryDate, req.adminUser.id, reason);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error rejecting gallery group:", error);
    res.status(500).json({ error: "Failed to reject photos." });
  }
});

router.delete("/content-approvals/notices/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = deletePendingNotice(id);
    if (!result) return res.status(404).json({ error: "Note not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error removing notice:", error);
    res.status(500).json({ error: "Failed to remove note." });
  }
});

router.patch("/content-approvals/notices/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = updatePendingNotice(id, req.body.message, req.adminUser.id);
    if (!result) return res.status(404).json({ error: "Note not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error updating notice:", error);
    res.status(500).json({ error: "Failed to update note." });
  }
});

router.patch("/content-approvals/notices/group/approve", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const result = approveNoticesGroup(studentId, entryDate, req.adminUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error approving notices group:", error);
    res.status(500).json({ error: "Failed to approve notes." });
  }
});

router.patch("/content-approvals/notices/group/reject", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const result = rejectNoticesGroup(studentId, entryDate, req.adminUser.id, reason);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error rejecting notices group:", error);
    res.status(500).json({ error: "Failed to reject notes." });
  }
});

router.patch("/content-approvals/diary/:id/correct", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = correctApprovedDiary(id, req.body, req.adminUser.id);
    if (!result) return res.status(404).json({ error: "Diary not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error correcting approved diary:", error);
    res.status(500).json({ error: "Failed to update diary." });
  }
});

router.patch("/content-approvals/notices/:id/correct", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = correctApprovedNotice(id, req.body.message, req.adminUser.id);
    if (!result) return res.status(404).json({ error: "Note not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error correcting approved note:", error);
    res.status(500).json({ error: "Failed to update note." });
  }
});

router.patch("/content-approvals/notices/group/reopen", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const result = reopenApprovedNoticesGroup(studentId, entryDate, req.adminUser.id, reason);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error reopening notices group:", error);
    res.status(500).json({ error: "Failed to send notes back to teacher." });
  }
});

router.patch("/content-approvals/gallery/group/reopen", requireAdmin, (req, res) => {
  try {
    const studentId = parseInt(req.body.studentId, 10);
    const entryDate = typeof req.body.entryDate === "string" ? req.body.entryDate.trim() : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const result = reopenApprovedGalleryGroup(studentId, entryDate, req.adminUser.id, reason);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error reopening gallery group:", error);
    res.status(500).json({ error: "Failed to send photos back to teacher." });
  }
});

router.patch("/content-approvals/diary/:id", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = updatePendingDiary(id, req.body, req.adminUser.id);
    if (!result) return res.status(404).json({ error: "Diary not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error updating diary:", error);
    res.status(500).json({ error: "Failed to update diary." });
  }
});

router.patch("/content-approvals/:contentType/:id/reopen", requireAdmin, (req, res) => {
  try {
    const contentType = req.params.contentType;
    const id = parseInt(req.params.id, 10);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const updated = reopenApprovedContent(contentType, id, req.adminUser.id, reason);
    if (!updated) return res.status(404).json({ error: "Submission not found." });
    if (updated?.error) return res.status(updated.status).json({ error: updated.error });
    res.json(updated);
  } catch (error) {
    console.error("Error reopening approved content:", error);
    res.status(500).json({ error: "Failed to send submission back to teacher." });
  }
});

router.patch("/content-approvals/:contentType/:id/approve", requireAdmin, (req, res) => {
  try {
    const contentType = req.params.contentType;
    const id = parseInt(req.params.id, 10);
    const updated = approveContent(contentType, id, req.adminUser.id);
    if (!updated) return res.status(404).json({ error: "Submission not found." });
    if (updated?.error) return res.status(updated.status).json({ error: updated.error });
    res.json(updated);
  } catch (error) {
    console.error("Error approving content:", error);
    res.status(500).json({ error: "Failed to approve submission." });
  }
});

router.patch("/content-approvals/:contentType/:id/reject", requireAdmin, (req, res) => {
  try {
    const contentType = req.params.contentType;
    const id = parseInt(req.params.id, 10);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const updated = rejectContent(contentType, id, req.adminUser.id, reason);
    if (!updated) return res.status(404).json({ error: "Submission not found." });
    if (updated?.error) return res.status(updated.status).json({ error: updated.error });
    res.json(updated);
  } catch (error) {
    console.error("Error rejecting content:", error);
    res.status(500).json({ error: "Failed to reject submission." });
  }
});

// ==================== PAYMENT PROOFS & STAFF NOTIFICATIONS ====================

router.get("/payment-proofs/pending", requireAdmin, (_req, res) => {
  try {
    res.json(listActiveNotifications({ limit: 5 }));
  } catch (error) {
    console.error("Error fetching payment proofs:", error);
    res.status(500).json({ error: "Failed to fetch payment proofs." });
  }
});

router.get("/notifications", requireAdmin, (req, res) => {
  try {
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    if (pageRaw != null && String(pageRaw).trim() !== "") {
      const page = parseInt(String(pageRaw), 10);
      const limit = limitRaw != null ? parseInt(String(limitRaw), 10) : 20;
      if (Number.isNaN(page)) {
        return res.status(400).json({ error: "Invalid page." });
      }
      res.json(listStaffNotifications({ page, limit: Number.isNaN(limit) ? 20 : limit }));
      return;
    }
    const limit = limitRaw != null ? parseInt(String(limitRaw), 10) : 5;
    res.json(listStaffNotifications({ limit: Number.isNaN(limit) ? 5 : limit }));
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications." });
  }
});

router.patch("/payment-proofs/:id/reviewed", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const proof = getPaymentProofById(id);
    if (!proof) return res.status(404).json({ error: "Payment proof not found." });
    const updated = markPaymentProofReviewed(id);
    res.json(updated);
  } catch (error) {
    console.error("Error marking payment proof read:", error);
    res.status(500).json({ error: "Failed to update payment proof." });
  }
});

router.patch("/payment-proofs/:id/read", requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const proof = getPaymentProofById(id);
    if (!proof) return res.status(404).json({ error: "Payment proof not found." });
    const updated = markPaymentProofRead(id);
    res.json(updated);
  } catch (error) {
    console.error("Error marking payment proof read:", error);
    res.status(500).json({ error: "Failed to update payment proof." });
  }
});

router.post("/notifications/stream-token", requireAdmin, (req, res) => {
  const token = createStreamToken(req.adminUser.id, "admin");
  res.json({ token, expiresIn: 1800 });
});

router.get("/notifications/stream", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const session = validateStreamToken(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired stream token." });
  }

  const user = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(session.userId);
  if (!user || user.role !== "admin" || session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  attachSseStream(req, res, { userId: user.id, role: "admin" });
});

router.get("/push/vapid-public-key", requireAdmin, (_req, res) => {
  res.json({ enabled: isWebPushEnabled(), publicKey: getVapidPublicKey() });
});

router.post("/push/subscribe", requireAdmin, (req, res) => {
  try {
    if (!isWebPushEnabled()) {
      return res.status(503).json({ error: "Push notifications are not configured on this server." });
    }
    savePushSubscription(req.adminUser.id, req.body?.subscription, req.headers["user-agent"]);
    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SUBSCRIPTION") {
      return res.status(400).json({ error: "Invalid push subscription." });
    }
    console.error("Push subscribe error:", error);
    res.status(500).json({ error: "Failed to save push subscription." });
  }
});

router.delete("/push/subscribe", requireAdmin, (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) return res.status(400).json({ error: "endpoint is required." });
  deletePushSubscription(req.adminUser.id, endpoint);
  res.json({ success: true });
});

export default router;
