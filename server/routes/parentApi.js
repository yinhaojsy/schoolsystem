import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db.js";
import { requireParent } from "../middleware/requireParent.js";
import {
  todayEntryDate,
  getDiaryForParent,
  getNoticesForStudent,
  getGalleryForStudent,
  unreadCountForStudent,
  markReadReceipt,
} from "../dailyContent.js";
import { getParentStudentIds, parentHasStudentAccess } from "../parentStudents.js";
import { notifyPaymentProofSubmitted } from "../paymentProofs.js";
import { uploadsRoot, publicUploadUrl } from "../utils/uploads.js";
import {
  invoiceNetFromItems,
  invoicePaidOnCharges,
  invoiceCollectionTier,
  invoiceUnpaidBalance,
  priorOpenBalanceForPeriod,
  roundMoney,
} from "../paymentEngine.js";
import {
  createStreamToken,
  validateStreamToken,
  attachSseStream,
  buildParentStreamMeta,
} from "../staffNotifications.js";

const router = express.Router();
const paymentProofDir = path.join(uploadsRoot, "payment-proofs");

fs.mkdirSync(paymentProofDir, { recursive: true });

const paymentProofUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, paymentProofDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

function publicPhotoUrl(profilePhotoPath) {
  return publicUploadUrl(profilePhotoPath);
}

function formatParentUser(row) {
  if (!row) return null;
  const { password: _p, invitePassword: _i, ...safe } = row;
  return {
    ...safe,
    parentDiaryAnimations: row.parentDiaryAnimations == null ? true : !!row.parentDiaryAnimations,
  };
}

function assertParentChildAccess(parentUser, studentId) {
  if (!parentHasStudentAccess(parentUser.id, studentId)) return null;
  const student = db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
       FROM students s LEFT JOIN class_groups cg ON cg.id = s.classGroupId
       WHERE s.id = ? AND s.status = 'active' AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'`,
    )
    .get(studentId);
  if (!student) return null;
  return {
    ...student,
    profilePhotoUrl: publicPhotoUrl(student.profilePhotoPath),
  };
}

// ==================== AUTH ====================
router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

  if (!user || user.role !== "parent") {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended. Please contact the school." });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const { password: _p, invitePassword: _i, ...safe } = user;
  res.json({ user: formatParentUser(safe) });
});

// ==================== PROFILE ====================
router.get("/me", requireParent, (req, res) => {
  const user = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.householdId, u.createdAt, u.parentDiaryAnimations,
              h.label as householdLabel
       FROM users u
       LEFT JOIN households h ON h.id = u.householdId
       WHERE u.id = ?`,
    )
    .get(req.parentUser.id);
  res.json(formatParentUser(user));
});

router.patch("/account/email", requireParent, (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  const existing = db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).get(email, req.parentUser.id);
  if (existing) {
    return res.status(400).json({ error: "That email is already in use." });
  }
  db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, req.parentUser.id);
  const user = db
    .prepare(`SELECT id, name, email, role, status, householdId, createdAt FROM users WHERE id = ?`)
    .get(req.parentUser.id);
  res.json({ user });
});

router.patch("/account/password", requireParent, (req, res) => {
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  const row = db.prepare(`SELECT password FROM users WHERE id = ?`).get(req.parentUser.id);
  if (!row || !bcrypt.compareSync(currentPassword, row.password)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password = ?, invitePassword = ? WHERE id = ?`).run(hash, newPassword, req.parentUser.id);
  res.json({ success: true });
});

// ==================== CHILDREN (HOME) ====================
router.get("/children", requireParent, (req, res) => {
  const studentIds = req.parentStudentIds ?? getParentStudentIds(req.parentUser.id);
  if (studentIds.length === 0) {
    return res.json([]);
  }

  const placeholders = studentIds.map(() => "?").join(",");
  const students = db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
       FROM students s
       LEFT JOIN class_groups cg ON cg.id = s.classGroupId
       WHERE s.id IN (${placeholders})
       ORDER BY s.name ASC`,
    )
    .all(...studentIds);

  const entryDate = todayEntryDate();
  const result = students.map((s) => {
    const dailyUnread = unreadCountForStudent(req.parentUser.id, s.id, entryDate);
    return {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      classGroupName: s.classGroupName,
      programType: s.programType,
      profilePhotoUrl: publicPhotoUrl(s.profilePhotoPath),
      unread: {
        ...dailyUnread,
        invoice: countUnreadInvoicesForStudent(s.id),
      },
    };
  });

  res.json(result);
});

function countUnreadInvoicesForStudent(studentId) {
  const rows = db
    .prepare(
      `SELECT i.id FROM invoices i
       WHERE i.studentId = ? AND i.status != 'paid'
       AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.invoiceId = i.id)`,
    )
    .all(studentId);
  return rows.length;
}

// ==================== INBOX ====================
router.get("/inbox", requireParent, (req, res) => {
  const studentIds = req.parentStudentIds ?? getParentStudentIds(req.parentUser.id);
  const items = [];
  const entryDate = todayEntryDate();

  for (const studentId of studentIds) {
    const student = db.prepare(`SELECT name FROM students WHERE id = ?`).get(studentId);
    const name = student?.name ?? "Child";
    const unread = unreadCountForStudent(req.parentUser.id, studentId, entryDate);

    if (unread.diary) {
      items.push({
        id: `diary-${studentId}-${entryDate}`,
        type: "diary",
        title: "Kid diary updated",
        subtitle: name,
        studentId,
        createdAt: entryDate,
        unread: true,
      });
    }
    if (unread.notices) {
      items.push({
        id: `notices-${studentId}-${entryDate}`,
        type: "notice",
        title: "Teacher note",
        subtitle: name,
        studentId,
        createdAt: entryDate,
        unread: true,
      });
    }
    if (unread.gallery) {
      items.push({
        id: `gallery-${studentId}-${entryDate}`,
        type: "gallery",
        title: "New photos",
        subtitle: name,
        studentId,
        createdAt: entryDate,
        unread: true,
      });
    }
  }

  if (studentIds.length > 0) {
    const placeholders = studentIds.map(() => "?").join(",");
    const invoices = db
      .prepare(
        `SELECT i.id, i.invoiceNo, i.month, i.year, i.status, i.dueDate, s.name as studentName, s.id as studentId
         FROM invoices i
         JOIN students s ON s.id = i.studentId
         WHERE i.studentId IN (${placeholders}) AND i.status != 'paid'
         AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.invoiceId = i.id)
         ORDER BY i.year DESC, i.month DESC`,
      )
      .all(...studentIds);

    for (const inv of invoices) {
      items.push({
        id: `invoice-${inv.id}`,
        type: "invoice",
        title: `Invoice ${inv.invoiceNo}`,
        subtitle: `${inv.studentName} · ${inv.month} ${inv.year}`,
        studentId: inv.studentId,
        invoiceId: inv.id,
        createdAt: inv.dueDate,
        unread: true,
      });
    }
  }

  res.json({ items, unreadCount: items.filter((i) => i.unread).length });
});

// ==================== DAILY CONTENT (TODAY ONLY) ====================
router.get("/children/:id/diary", requireParent, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = assertParentChildAccess(req.parentUser, studentId);
  if (!student) return res.status(404).json({ error: "Child not found." });

  const entryDate = todayEntryDate();
  const diary = getDiaryForParent(studentId, entryDate);
  markReadReceipt(req.parentUser.id, studentId, "diary", entryDate);
  res.json({ entryDate, student, diary });
});

router.get("/children/:id/notices", requireParent, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = assertParentChildAccess(req.parentUser, studentId);
  if (!student) return res.status(404).json({ error: "Child not found." });

  const entryDate = todayEntryDate();
  const notices = getNoticesForStudent(studentId, entryDate, { approvedOnly: true });
  if (notices.length > 0) {
    markReadReceipt(req.parentUser.id, studentId, "notices", entryDate);
  }
  res.json({ entryDate, student, notices });
});

router.get("/children/:id/gallery", requireParent, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = assertParentChildAccess(req.parentUser, studentId);
  if (!student) return res.status(404).json({ error: "Child not found." });

  const entryDate = todayEntryDate();
  const photos = getGalleryForStudent(studentId, entryDate, { approvedOnly: true });
  if (photos.length > 0) {
    markReadReceipt(req.parentUser.id, studentId, "gallery", entryDate);
  }
  res.json({ entryDate, student, photos });
});

// ==================== FEES ====================
router.get("/invoices", requireParent, (req, res) => {
  const studentIds = req.parentStudentIds ?? getParentStudentIds(req.parentUser.id);
  if (studentIds.length === 0) {
    return res.json([]);
  }

  const placeholders = studentIds.map(() => "?").join(",");
  const invoices = db
    .prepare(
      `SELECT i.*, s.name as studentName, s.rollNo as studentRollNo, cg.name as classGroupName
       FROM invoices i
       LEFT JOIN students s ON i.studentId = s.id
       LEFT JOIN class_groups cg ON s.classGroupId = cg.id
       WHERE i.studentId IN (${placeholders})
       ORDER BY i.year DESC, i.month DESC, i.id DESC`,
    )
    .all(...studentIds);

  for (const inv of invoices) {
    inv.periodNet = invoiceNetFromItems(inv.id);
    inv.periodPaid = invoicePaidOnCharges(inv.id);
    inv.periodUnpaid = roundMoney(Math.max(0, inv.periodNet - inv.periodPaid));
    inv.collectionTier = invoiceCollectionTier(inv.id, inv.status);
    inv.hasPaymentProof = !!db.prepare(`SELECT id FROM payment_proofs WHERE invoiceId = ?`).get(inv.id);
    inv.unread = inv.status !== "paid" && !inv.hasPaymentProof;
  }

  res.json(invoices);
});

router.get("/invoices/:id", requireParent, (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (Number.isNaN(invoiceId)) {
    return res.status(400).json({ error: "Invalid invoice id." });
  }

  const studentIds = req.parentStudentIds ?? getParentStudentIds(req.parentUser.id);
  const invoice = db
    .prepare(
      `SELECT i.*, s.name as studentName, s.rollNo as studentRollNo, s.parentsName, s.contactNo, cg.name as classGroupName
       FROM invoices i
       LEFT JOIN students s ON i.studentId = s.id
       LEFT JOIN class_groups cg ON s.classGroupId = cg.id
       WHERE i.id = ?`,
    )
    .get(invoiceId);

  if (!invoice || !studentIds.includes(invoice.studentId)) {
    return res.status(404).json({ error: "Invoice not found." });
  }

  const items = db.prepare(`SELECT * FROM invoice_items WHERE invoiceId = ? ORDER BY id ASC`).all(invoiceId);
  const priorBalance = priorOpenBalanceForPeriod(invoice.studentId, invoice.month, invoice.year);
  const periodNet = invoiceNetFromItems(invoiceId);
  const periodPaid = invoicePaidOnCharges(invoiceId);
  const periodUnpaid = invoiceUnpaidBalance(invoiceId);
  const grandDue = roundMoney(priorBalance + periodUnpaid);
  const hasPaymentProof = !!db.prepare(`SELECT id FROM payment_proofs WHERE invoiceId = ?`).get(invoiceId);

  res.json({
    ...invoice,
    items,
    priorBalance,
    periodNet,
    periodPaid,
    periodUnpaid,
    periodSubtotal: periodNet,
    grandDue,
    collectionTier: invoiceCollectionTier(invoiceId, invoice.status),
    hasPaymentProof,
    unread: invoice.status !== "paid" && !hasPaymentProof,
  });
});

router.post("/invoices/:id/payment-proof", requireParent, paymentProofUpload.single("proof"), (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const studentIds = req.parentStudentIds ?? getParentStudentIds(req.parentUser.id);
    const inv = db.prepare(`SELECT id, studentId FROM invoices WHERE id = ?`).get(invoiceId);
    if (!inv || !studentIds.includes(inv.studentId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Invoice not found." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Payment proof image is required." });
    }

    const relPath = path.relative(uploadsRoot, req.file.path).replace(/\\/g, "/");
    const existing = db.prepare(`SELECT id, filePath FROM payment_proofs WHERE invoiceId = ?`).get(invoiceId);
    if (existing) {
      const oldPath = path.join(uploadsRoot, existing.filePath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      db.prepare(
        `UPDATE payment_proofs SET filePath = ?, parentId = ?, submittedAt = CURRENT_TIMESTAMP, reviewedAt = NULL WHERE invoiceId = ?`,
      ).run(relPath, req.parentUser.id, invoiceId);
      notifyPaymentProofSubmitted(existing.id);
    } else {
      const result = db.prepare(
        `INSERT INTO payment_proofs (invoiceId, parentId, filePath) VALUES (?, ?, ?)`,
      ).run(invoiceId, req.parentUser.id, relPath);
      notifyPaymentProofSubmitted(result.lastInsertRowid);
    }

    res.status(201).json({ success: true, invoiceId });
  } catch (error) {
    console.error("Payment proof upload error:", error);
    res.status(500).json({ error: "Failed to upload payment proof." });
  }
});

router.post("/stream-token", requireParent, (req, res) => {
  const token = createStreamToken(req.parentUser.id, "parent");
  res.json({ token, expiresIn: 1800 });
});

router.get("/stream", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const session = validateStreamToken(token);
  if (!session || session.role !== "parent") {
    return res.status(401).json({ error: "Invalid or expired stream token." });
  }

  const user = db.prepare(`SELECT id, role FROM users WHERE id = ? AND role = 'parent'`).get(session.userId);
  if (!user) {
    return res.status(403).json({ error: "Parent access required." });
  }

  attachSseStream(req, res, buildParentStreamMeta(user));
});

export default router;
