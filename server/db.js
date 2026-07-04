import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { migrateDiaryJsonToEvents, expandDiaryEventTypes, migrateSummaryTextToEvents } from "./diaryEvents.js";
import { ensureDropInFeeStructure } from "./dropIn.js";

export const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "server", "data");
export const dbPath = path.join(dataDir, "school.db");

fs.mkdirSync(dataDir, { recursive: true });

const applyPragmas = (instance) => {
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
};

export const createDbInstance = () => {
  const instance = new Database(dbPath);
  applyPragmas(instance);
  return instance;
};

export let db = createDbInstance();

export const closeDbConnection = () => {
  try {
    if (db && typeof db.close === "function") {
      db.close();
    }
  } catch (e) {
    // ignore close errors
  }
};

export const resetDbInstance = () => {
  closeDbConnection();
  db = createDbInstance();
  return db;
};

const ensureSchema = () => {
  // Users table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ).run();

  const userColNames = () => db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  const ensureUserColumn = (name, ddl) => {
    if (!userColNames().includes(name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${ddl}`).run();
    }
  };
  ensureUserColumn("status", "status TEXT NOT NULL DEFAULT 'active'");
  ensureUserColumn("householdId", "householdId INTEGER REFERENCES households(id) ON DELETE SET NULL");
  ensureUserColumn("invitePassword", "invitePassword TEXT");
  ensureUserColumn("classGroupId", "classGroupId INTEGER REFERENCES class_groups(id) ON DELETE SET NULL");
  ensureUserColumn("teacherScope", "teacherScope TEXT NOT NULL DEFAULT 'class'");
  ensureUserColumn("canEditPublishedContent", "canEditPublishedContent INTEGER NOT NULL DEFAULT 0");
  ensureUserColumn("parentDiaryAnimations", "parentDiaryAnimations INTEGER NOT NULL DEFAULT 1");

  // Class Groups table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS class_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ).run();

  // Fee Structures table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS fee_structures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      registrationFee REAL,
      registrationFeeInstallments INTEGER,
      annualCharges REAL,
      annualChargesInstallments INTEGER,
      monthlyFee REAL NOT NULL,
      meals REAL,
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ).run();

  // Households (siblings share one household for monthly sibling discount)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS households (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ).run();

  // Students table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parentsName TEXT,
      contactNo TEXT,
      rollNo TEXT NOT NULL UNIQUE,
      feeStructureId INTEGER NOT NULL,
      classGroupId INTEGER NOT NULL,
      address TEXT,
      dateOfBirth TEXT,
      admissionDate TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(feeStructureId) REFERENCES fee_structures(id),
      FOREIGN KEY(classGroupId) REFERENCES class_groups(id)
    );`
  ).run();

  const studentColNames = () => db.prepare("PRAGMA table_info(students)").all().map((c) => c.name);
  const ensureStudentColumn = (name, ddl) => {
    if (!studentColNames().includes(name)) {
      db.prepare(`ALTER TABLE students ADD COLUMN ${ddl}`).run();
    }
  };
  ensureStudentColumn("householdId", "householdId INTEGER REFERENCES households(id) ON DELETE SET NULL");
  ensureStudentColumn("receivesSiblingDiscount", "receivesSiblingDiscount INTEGER NOT NULL DEFAULT 0");
  ensureStudentColumn("siblingPreMonthly", "siblingPreMonthly REAL");
  ensureStudentColumn("siblingPostMonthly", "siblingPostMonthly REAL");
  ensureStudentColumn("siblingDiscountFromMonth", "siblingDiscountFromMonth TEXT");
  ensureStudentColumn("siblingDiscountFromYear", "siblingDiscountFromYear INTEGER");
  ensureStudentColumn("profilePhotoPath", "profilePhotoPath TEXT");
  ensureStudentColumn("programType", "programType TEXT NOT NULL DEFAULT 'daycare'");
  ensureStudentColumn("enrollmentStatus", "enrollmentStatus TEXT NOT NULL DEFAULT 'enrolled'");
  ensureStudentColumn("leftAt", "leftAt TEXT");
  ensureStudentColumn("leftReasonType", "leftReasonType TEXT");
  ensureStudentColumn("leftRemarks", "leftRemarks TEXT");
  ensureStudentColumn("enrollmentType", "enrollmentType TEXT NOT NULL DEFAULT 'regular'");
  ensureStudentColumn("dropInSessionType", "dropInSessionType TEXT");
  ensureStudentColumn("dropInRate", "dropInRate REAL");

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_students_household ON students(householdId);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_students_enrollment_type ON students(enrollmentType);`).run();

  // Invoices table
  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      invoiceNo TEXT NOT NULL UNIQUE,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      dueDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paymentDate TEXT,
      remarks TEXT,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id)
    );`
  ).run();

  // Invoice Items table (for additional charges or discounts)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paidAmount REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'charge',
      chargeType TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );`
  ).run();

  // Student Fee Overrides table (for custom fee adjustments per student)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS student_fee_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      chargeType TEXT NOT NULL,
      amount REAL,
      isExempt INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(studentId, chargeType)
    );`
  ).run();

  // Per-student extra charges (speech therapy, camps, picnics, etc.)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS student_additional_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      billedInvoiceId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(billedInvoiceId) REFERENCES invoices(id) ON DELETE SET NULL
    );`
  ).run();

  const studentAdditionalChargeCols = () =>
    db.prepare("PRAGMA table_info(student_additional_charges)").all().map((c) => c.name);
  if (studentAdditionalChargeCols().length > 0 && !studentAdditionalChargeCols().includes("active")) {
    db.prepare("ALTER TABLE student_additional_charges ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
  }

  // Payment History table (tracks all payments and allocations)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      amount REAL NOT NULL,
      paymentDate TEXT NOT NULL,
      remarks TEXT,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id)
    );`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
  ).run();

  /** One receipt row per bank/cash deposit (may split across many invoice line items). */
  db.prepare(
    `CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      totalAmount REAL NOT NULL,
      paymentDate TEXT NOT NULL,
      remarks TEXT,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id)
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS fee_payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feePaymentId INTEGER NOT NULL,
      invoiceItemId INTEGER NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(feePaymentId) REFERENCES fee_payments(id) ON DELETE CASCADE,
      FOREIGN KEY(invoiceItemId) REFERENCES invoice_items(id) ON DELETE RESTRICT
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS payment_proofs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL UNIQUE,
      parentId INTEGER NOT NULL,
      filePath TEXT NOT NULL,
      submittedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewedAt TEXT,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(parentId) REFERENCES users(id) ON DELETE CASCADE
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      userAgent TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );`,
  ).run();

  const paymentProofCols = db.prepare("PRAGMA table_info(payment_proofs)").all().map((c) => c.name);
  if (paymentProofCols.length > 0 && !paymentProofCols.includes("reviewedAt")) {
    db.prepare("ALTER TABLE payment_proofs ADD COLUMN reviewedAt TEXT").run();
  }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS daycare_diary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      mood TEXT,
      drankJson TEXT NOT NULL DEFAULT '[]',
      sleptJson TEXT NOT NULL DEFAULT '[]',
      ateJson TEXT NOT NULL DEFAULT '[]',
      activities TEXT,
      pottyJson TEXT NOT NULL DEFAULT '[]',
      suppliesJson TEXT NOT NULL DEFAULT '[]',
      teacherRemarks TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(teacherId) REFERENCES users(id),
      UNIQUE(studentId, entryDate)
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS parent_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS gallery_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      filePath TEXT NOT NULL,
      caption TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS parent_read_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parentId INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      contentType TEXT NOT NULL,
      entryDate TEXT NOT NULL,
      readAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parentId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(parentId, studentId, contentType, entryDate)
    );`,
  ).run();

  const diaryColNames = () => db.prepare("PRAGMA table_info(daycare_diary_entries)").all().map((c) => c.name);
  const ensureDiaryColumn = (name, ddl) => {
    if (!diaryColNames().includes(name)) {
      db.prepare(`ALTER TABLE daycare_diary_entries ADD COLUMN ${ddl}`).run();
    }
  };
  ensureDiaryColumn("medicineJson", "medicineJson TEXT NOT NULL DEFAULT '[]'");
  ensureDiaryColumn("approvalStatus", "approvalStatus TEXT NOT NULL DEFAULT 'approved'");
  ensureDiaryColumn("rejectionReason", "rejectionReason TEXT");
  ensureDiaryColumn("submittedAt", "submittedAt TEXT");
  ensureDiaryColumn("reviewedAt", "reviewedAt TEXT");
  ensureDiaryColumn("reviewedBy", "reviewedBy INTEGER REFERENCES users(id)");
  ensureDiaryColumn("adminCorrectedAt", "adminCorrectedAt TEXT");
  ensureDiaryColumn("adminCorrectedBy", "adminCorrectedBy INTEGER REFERENCES users(id)");

  const noticeColNames = () => db.prepare("PRAGMA table_info(parent_notices)").all().map((c) => c.name);
  const ensureNoticeColumn = (name, ddl) => {
    if (!noticeColNames().includes(name)) {
      db.prepare(`ALTER TABLE parent_notices ADD COLUMN ${ddl}`).run();
    }
  };
  ensureNoticeColumn("approvalStatus", "approvalStatus TEXT NOT NULL DEFAULT 'approved'");
  ensureNoticeColumn("rejectionReason", "rejectionReason TEXT");
  ensureNoticeColumn("submittedAt", "submittedAt TEXT");
  ensureNoticeColumn("reviewedAt", "reviewedAt TEXT");
  ensureNoticeColumn("reviewedBy", "reviewedBy INTEGER REFERENCES users(id)");
  ensureNoticeColumn("adminCorrectedAt", "adminCorrectedAt TEXT");
  ensureNoticeColumn("adminCorrectedBy", "adminCorrectedBy INTEGER REFERENCES users(id)");

  const galleryColNames = () => db.prepare("PRAGMA table_info(gallery_photos)").all().map((c) => c.name);
  const ensureGalleryColumn = (name, ddl) => {
    if (!galleryColNames().includes(name)) {
      db.prepare(`ALTER TABLE gallery_photos ADD COLUMN ${ddl}`).run();
    }
  };
  ensureGalleryColumn("approvalStatus", "approvalStatus TEXT NOT NULL DEFAULT 'approved'");
  ensureGalleryColumn("rejectionReason", "rejectionReason TEXT");
  ensureGalleryColumn("submittedAt", "submittedAt TEXT");
  ensureGalleryColumn("reviewedAt", "reviewedAt TEXT");
  ensureGalleryColumn("reviewedBy", "reviewedBy INTEGER REFERENCES users(id)");
  ensureGalleryColumn("adminCorrectedAt", "adminCorrectedAt TEXT");
  ensureGalleryColumn("adminCorrectedBy", "adminCorrectedBy INTEGER REFERENCES users(id)");
  ensureGalleryColumn("pendingDeletion", "pendingDeletion INTEGER NOT NULL DEFAULT 0");

  db.prepare(
    `CREATE TABLE IF NOT EXISTS teacher_content_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL,
      contentType TEXT NOT NULL,
      approvalRequired INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(teacherId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(teacherId, contentType)
    );`,
  ).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_diary_student_date ON daycare_diary_entries(studentId, entryDate);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notices_student_date ON parent_notices(studentId, entryDate);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_student_date ON gallery_photos(studentId, entryDate);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_diary_approval ON daycare_diary_entries(approvalStatus);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notices_approval ON parent_notices(approvalStatus);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_approval ON gallery_photos(approvalStatus);`).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS daycare_diary_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      eventType TEXT NOT NULL CHECK (eventType IN ('drank', 'slept', 'ate', 'medicine', 'potty', 'fun', 'remarks')),
      payloadJson TEXT NOT NULL,
      approvalStatus TEXT NOT NULL DEFAULT 'approved',
      rejectionReason TEXT,
      submittedAt TEXT,
      reviewedAt TEXT,
      reviewedBy INTEGER REFERENCES users(id),
      adminCorrectedAt TEXT,
      adminCorrectedBy INTEGER REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_diary_events_student_date ON daycare_diary_events(studentId, entryDate);`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_diary_events_approval ON daycare_diary_events(approvalStatus);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS content_approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contentType TEXT NOT NULL,
      contentId INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER,
      action TEXT NOT NULL,
      rejectionReason TEXT,
      reviewedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewedBy INTEGER REFERENCES users(id),
      snapshotJson TEXT NOT NULL,
      FOREIGN KEY(studentId) REFERENCES students(id),
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_content_history_action ON content_approval_history(action);`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_content_history_reviewed ON content_approval_history(reviewedAt);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS content_publication_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contentType TEXT NOT NULL,
      contentId INTEGER,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER,
      event TEXT NOT NULL,
      channel TEXT NOT NULL,
      actorUserId INTEGER,
      actorRole TEXT,
      summary TEXT,
      snapshotJson TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id),
      FOREIGN KEY(teacherId) REFERENCES users(id),
      FOREIGN KEY(actorUserId) REFERENCES users(id)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_publication_log_student ON content_publication_log(studentId, entryDate);`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_publication_log_created ON content_publication_log(createdAt);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS student_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
      markedBy INTEGER NOT NULL,
      markedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(markedBy) REFERENCES users(id),
      UNIQUE(studentId, entryDate)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_attendance_date ON student_attendance(entryDate);`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_attendance_student ON student_attendance(studentId, entryDate);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS staff_content_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventType TEXT NOT NULL,
      contentType TEXT NOT NULL,
      contentId INTEGER,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      preview TEXT,
      imagePath TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id),
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_staff_content_events_created ON staff_content_events(createdAt);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS parent_students (
      parentId INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parentId, studentId),
      FOREIGN KEY(parentId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    );`,
  ).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students(studentId);`).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(studentId);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_fee_payment_alloc_pay ON fee_payment_allocations(feePaymentId);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_fee_payment_alloc_item ON fee_payment_allocations(invoiceItemId);`).run();

  // Create indexes for better performance
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_students_rollNo ON students(rollNo);`
  ).run();
  
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_students_classGroup ON students(classGroupId);`
  ).run();
  
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(studentId);`
  ).run();
  
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_invoices_month_year ON invoices(month, year);`
  ).run();

  // Legacy DBs may have invoice_items without columns added in newer code; re-check pragma per column.
  const invoiceItemColumnNames = () =>
    db.prepare("PRAGMA table_info(invoice_items)").all().map((c) => c.name);
  if (invoiceItemColumnNames().length > 0) {
    if (!invoiceItemColumnNames().includes("paidAmount")) {
      db.prepare("ALTER TABLE invoice_items ADD COLUMN paidAmount REAL NOT NULL DEFAULT 0").run();
    }
    if (!invoiceItemColumnNames().includes("type")) {
      db.prepare("ALTER TABLE invoice_items ADD COLUMN type TEXT NOT NULL DEFAULT 'charge'").run();
    }
    if (!invoiceItemColumnNames().includes("chargeType")) {
      db.prepare("ALTER TABLE invoice_items ADD COLUMN chargeType TEXT").run();
    }
  }

  const feeStructureCols = db.prepare("PRAGMA table_info(fee_structures)").all();
  const hasBuilder = feeStructureCols.some((c) => c.name === "builderSchema");
  if (!hasBuilder) {
    db.prepare("ALTER TABLE fee_structures ADD COLUMN builderSchema TEXT").run();
  }

  const invoiceCols = db.prepare("PRAGMA table_info(invoices)").all().map((c) => c.name);
  if (!invoiceCols.includes("invoiceDate")) {
    db.prepare("ALTER TABLE invoices ADD COLUMN invoiceDate TEXT").run();
    db.prepare(
      `UPDATE invoices SET invoiceDate = date(createdAt) WHERE invoiceDate IS NULL OR trim(invoiceDate) = ''`,
    ).run();
  }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS fee_builder_template (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoice_template (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settingsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ).run();

  const DEFAULT_FEE_BUILDER_TEMPLATE = JSON.stringify({
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

  const tmplCount = db.prepare("SELECT COUNT(*) as c FROM fee_builder_template WHERE id = 1").get().c;
  if (tmplCount === 0) {
    db.prepare("INSERT INTO fee_builder_template (id, schema) VALUES (1, ?)").run(DEFAULT_FEE_BUILDER_TEMPLATE);
  }

  // Per-student fee agreement history (each row = one version / period start)
  db.prepare(
    `CREATE TABLE IF NOT EXISTS student_fee_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      effectiveFrom TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      monthlyFee REAL NOT NULL,
      registrationFee REAL,
      registrationFeeInstallments INTEGER,
      annualCharges REAL,
      annualChargesInstallments INTEGER,
      meals REAL,
      overridesJson TEXT,
      extrasJson TEXT,
      notes TEXT,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_student_fee_versions_student ON student_fee_versions(studentId, effectiveFrom);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS student_drop_in_fee_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      effectiveFrom TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      dropInSessionType TEXT NOT NULL CHECK (dropInSessionType IN ('half', 'full')),
      dropInRate REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_drop_in_fee_versions_student ON student_drop_in_fee_versions(studentId, effectiveFrom);`,
  ).run();

  /** One row per invoice: force-close / write-off (waive, bad debt, other) for audit and dashboards. */
  db.prepare(
    `CREATE TABLE IF NOT EXISTS invoice_writeoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL UNIQUE,
      studentId INTEGER NOT NULL,
      amount REAL NOT NULL,
      reasonCode TEXT NOT NULL,
      customReason TEXT,
      invoiceItemId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdBy INTEGER,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoice_writeoffs_student ON invoice_writeoffs(studentId);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoice_writeoffs_reason ON invoice_writeoffs(reasonCode);`).run();

  // ── Events (camps, seminars, etc.) ─────────────────────────────────────────
  db.prepare(
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      defaultPrice REAL,
      startDate TEXT,
      endDate TEXT,
      enrollmentDeadline TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      notes TEXT,
      copiedFromEventId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(copiedFromEventId) REFERENCES events(id) ON DELETE SET NULL
    );`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventId INTEGER NOT NULL,
      participantCode TEXT NOT NULL UNIQUE,
      participantName TEXT NOT NULL,
      invoiceDescription TEXT NOT NULL,
      agreedAmount REAL NOT NULL,
      age INTEGER,
      guardianName TEXT,
      email TEXT,
      contactNo TEXT,
      status TEXT NOT NULL DEFAULT 'registered',
      invoiceId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    );`,
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(eventId);`,
  ).run();

  const eventParticipantColNames = () =>
    db.prepare("PRAGMA table_info(event_participants)").all().map((c) => c.name);
  const ensureEventParticipantColumn = (name, ddl) => {
    if (!eventParticipantColNames().includes(name)) {
      db.prepare(`ALTER TABLE event_participants ADD COLUMN ${ddl}`).run();
    }
  };
  ensureEventParticipantColumn("studentId", "studentId INTEGER REFERENCES students(id) ON DELETE SET NULL");
  db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_participants_event_student
     ON event_participants(eventId, studentId) WHERE studentId IS NOT NULL`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS event_invoice_descriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventId INTEGER NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE,
      UNIQUE(eventId, description)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_event_invoice_descriptions_event ON event_invoice_descriptions(eventId);`,
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO event_invoice_descriptions (eventId, description)
     SELECT DISTINCT eventId, TRIM(invoiceDescription)
     FROM event_participants
     WHERE TRIM(invoiceDescription) != ''`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS event_extra_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventId INTEGER NOT NULL,
      name TEXT NOT NULL,
      defaultAmount REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE,
      UNIQUE(eventId, name)
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_event_extra_options_event ON event_extra_options(eventId);`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS event_participant_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participantId INTEGER NOT NULL,
      extraOptionId INTEGER,
      label TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(participantId) REFERENCES event_participants(id) ON DELETE CASCADE,
      FOREIGN KEY(extraOptionId) REFERENCES event_extra_options(id) ON DELETE SET NULL
    );`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_event_participant_extras_participant ON event_participant_extras(participantId);`,
  ).run();

  const invoiceColNames = () => db.prepare("PRAGMA table_info(invoices)").all().map((c) => c.name);
  const ensureInvoiceColumn = (name, ddl) => {
    if (!invoiceColNames().includes(name)) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN ${ddl}`).run();
    }
  };
  ensureInvoiceColumn("invoiceKind", "invoiceKind TEXT NOT NULL DEFAULT 'tuition'");
  ensureInvoiceColumn("eventParticipantId", "eventParticipantId INTEGER");
  ensureInvoiceColumn("eventId", "eventId INTEGER");
  ensureInvoiceColumn("billingName", "billingName TEXT");

  const feePaymentColNames = () => db.prepare("PRAGMA table_info(fee_payments)").all().map((c) => c.name);
  if (!feePaymentColNames().includes("eventParticipantId")) {
    db.prepare("ALTER TABLE fee_payments ADD COLUMN eventParticipantId INTEGER").run();
  }

  migrateInvoicesNullableStudentId();
  migrateFeePaymentsNullableStudentId();
  migrateInvoiceWriteoffsNullableStudentId();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoices_kind ON invoices(invoiceKind);`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoices_event ON invoices(eventId);`).run();
};

function migrateInvoicesNullableStudentId() {
  const studentCol = db.prepare("PRAGMA table_info(invoices)").all().find((c) => c.name === "studentId");
  if (!studentCol || studentCol.notnull === 0) return;

  db.exec(`PRAGMA foreign_keys=OFF;`);
  const tx = db.transaction(() => {
    db.prepare(
      `CREATE TABLE invoices_mig (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId INTEGER,
        invoiceNo TEXT NOT NULL UNIQUE,
        month TEXT NOT NULL,
        year INTEGER NOT NULL,
        amount REAL NOT NULL,
        dueDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        paymentDate TEXT,
        remarks TEXT,
        createdBy INTEGER,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invoiceDate TEXT,
        invoiceKind TEXT NOT NULL DEFAULT 'tuition',
        eventParticipantId INTEGER,
        eventId INTEGER,
        billingName TEXT,
        FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY(createdBy) REFERENCES users(id)
      );`,
    ).run();
    db.prepare(
      `INSERT INTO invoices_mig (
        id, studentId, invoiceNo, month, year, amount, dueDate, status, paymentDate,
        remarks, createdBy, createdAt, invoiceDate, invoiceKind
      )
      SELECT
        id, studentId, invoiceNo, month, year, amount, dueDate, status, paymentDate,
        remarks, createdBy, createdAt, invoiceDate, COALESCE(invoiceKind, 'tuition')
      FROM invoices;`,
    ).run();
    db.prepare(`DROP TABLE invoices;`).run();
    db.prepare(`ALTER TABLE invoices_mig RENAME TO invoices;`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(studentId);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoices_month_year ON invoices(month, year);`).run();
  });
  tx();
  db.exec(`PRAGMA foreign_keys=ON;`);
}

function migrateFeePaymentsNullableStudentId() {
  const studentCol = db.prepare("PRAGMA table_info(fee_payments)").all().find((c) => c.name === "studentId");
  if (!studentCol || studentCol.notnull === 0) return;

  db.exec(`PRAGMA foreign_keys=OFF;`);
  const tx = db.transaction(() => {
    db.prepare(
      `CREATE TABLE fee_payments_mig (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId INTEGER,
        eventParticipantId INTEGER,
        totalAmount REAL NOT NULL,
        paymentDate TEXT NOT NULL,
        remarks TEXT,
        createdBy INTEGER,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY(createdBy) REFERENCES users(id)
      );`,
    ).run();
    db.prepare(
      `INSERT INTO fee_payments_mig (
        id, studentId, eventParticipantId, totalAmount, paymentDate, remarks, createdBy, createdAt
      )
      SELECT id, studentId, eventParticipantId, totalAmount, paymentDate, remarks, createdBy, createdAt
      FROM fee_payments;`,
    ).run();
    db.prepare(`DROP TABLE fee_payments;`).run();
    db.prepare(`ALTER TABLE fee_payments_mig RENAME TO fee_payments;`).run();
  });
  tx();
  db.exec(`PRAGMA foreign_keys=ON;`);
}

function migrateInvoiceWriteoffsNullableStudentId() {
  const studentCol = db
    .prepare("PRAGMA table_info(invoice_writeoffs)")
    .all()
    .find((c) => c.name === "studentId");
  if (!studentCol || studentCol.notnull === 0) return;

  db.exec(`PRAGMA foreign_keys=OFF;`);
  const tx = db.transaction(() => {
    db.prepare(
      `CREATE TABLE invoice_writeoffs_mig (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL UNIQUE,
        studentId INTEGER,
        amount REAL NOT NULL,
        reasonCode TEXT NOT NULL,
        customReason TEXT,
        invoiceItemId INTEGER,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdBy INTEGER,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users(id)
      );`,
    ).run();
    db.prepare(
      `INSERT INTO invoice_writeoffs_mig (
        id, invoiceId, studentId, amount, reasonCode, customReason, invoiceItemId, createdAt, createdBy
      )
      SELECT id, invoiceId, studentId, amount, reasonCode, customReason, invoiceItemId, createdAt, createdBy
      FROM invoice_writeoffs;`,
    ).run();
    db.prepare(`DROP TABLE invoice_writeoffs;`).run();
    db.prepare(`ALTER TABLE invoice_writeoffs_mig RENAME TO invoice_writeoffs;`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoice_writeoffs_student ON invoice_writeoffs(studentId);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_invoice_writeoffs_reason ON invoice_writeoffs(reasonCode);`).run();
  });
  tx();
  db.exec(`PRAGMA foreign_keys=ON;`);
}

/** Snapshot current fee_structure + overrides + billable extras into one history row. */
export const insertStudentFeeVersionFromCurrentState = (studentId, effectiveFrom, notes = null) => {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid)) return;
  const s = db.prepare("SELECT id, feeStructureId, admissionDate FROM students WHERE id = ?").get(sid);
  if (!s) return;
  const fs = db.prepare("SELECT * FROM fee_structures WHERE id = ?").get(s.feeStructureId);
  if (!fs) return;
  const overrides = db
    .prepare(
      "SELECT chargeType, amount, isExempt, notes AS overrideNotes FROM student_fee_overrides WHERE studentId = ?",
    )
    .all(sid);
  const extras = db
    .prepare(
      `SELECT description, amount, recurring, active FROM student_additional_charges
       WHERE studentId = ? AND (recurring = 1 OR (recurring = 0 AND billedInvoiceId IS NULL))`,
    )
    .all(sid);
  let eff = typeof effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
    ? effectiveFrom
    : null;
  if (!eff && s.admissionDate) {
    const raw = String(s.admissionDate);
    eff = raw.length >= 10 ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
  }
  if (!eff) eff = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO student_fee_versions (
      studentId, effectiveFrom, monthlyFee, registrationFee, registrationFeeInstallments,
      annualCharges, annualChargesInstallments, meals, overridesJson, extrasJson, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sid,
    eff,
    fs.monthlyFee,
    fs.registrationFee ?? null,
    fs.registrationFeeInstallments ?? null,
    fs.annualCharges ?? null,
    fs.annualChargesInstallments ?? null,
    fs.meals ?? null,
    JSON.stringify(overrides),
    JSON.stringify(extras),
    notes,
  );
};

const backfillMissingStudentFeeVersions = () => {
  const rows = db
    .prepare(
      `SELECT s.id FROM students s
       WHERE NOT EXISTS (SELECT 1 FROM student_fee_versions v WHERE v.studentId = s.id)`,
    )
    .all();
  for (const { id } of rows) {
    insertStudentFeeVersionFromCurrentState(id, null, null);
  }
};

const backfillMissingDropInFeeVersions = () => {
  const rows = db
    .prepare(
      `SELECT s.id, s.dropInSessionType, s.dropInRate, s.admissionDate
       FROM students s
       WHERE COALESCE(s.enrollmentType, 'regular') = 'drop_in'
         AND s.dropInSessionType IS NOT NULL
         AND s.dropInRate IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM student_drop_in_fee_versions v WHERE v.studentId = s.id)`,
    )
    .all();
  for (const row of rows) {
    let eff = null;
    if (row.admissionDate) {
      const raw = String(row.admissionDate);
      eff = raw.length >= 10 ? raw.slice(0, 10) : null;
    }
    if (!eff) eff = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO student_drop_in_fee_versions (studentId, effectiveFrom, dropInSessionType, dropInRate, notes)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(row.id, eff, row.dropInSessionType, row.dropInRate, null);
  }
};

const seedData = () => {
  // Seed admin user
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const insert = db.prepare(
      `INSERT INTO users (name, email, password, role) VALUES (@name, @email, @password, @role);`
    );
    const seed = [
      { 
        name: "Admin", 
        email: "admin@school.com", 
        password: "$2a$10$bXJ1tkdB0uSGYci4DNsn/.EWdiCv4LiaczYkWK0XmrdfrWJ4M7td6", // password: admin123
        role: "admin" 
      },
    ];
    const insertMany = db.transaction((rows) => rows.forEach((row) => insert.run(row)));
    insertMany(seed);
  }

  // Seed sample class groups
  const classGroupCount = db.prepare("SELECT COUNT(*) as count FROM class_groups").get().count;
  if (classGroupCount === 0) {
    const insert = db.prepare(
      `INSERT INTO class_groups (name, description) VALUES (@name, @description);`
    );
    const seed = [
      { name: "Grade 1", description: "First grade students" },
      { name: "Grade 2", description: "Second grade students" },
      { name: "Grade 3", description: "Third grade students" },
      { name: "Grade 4", description: "Fourth grade students" },
      { name: "Grade 5", description: "Fifth grade students" },
    ];
    const insertMany = db.transaction((rows) => rows.forEach((row) => insert.run(row)));
    insertMany(seed);
  }

  // Seed sample fee structures
  const feeStructureCount = db.prepare("SELECT COUNT(*) as count FROM fee_structures").get().count;
  if (feeStructureCount === 0) {
    const insert = db.prepare(
      `INSERT INTO fee_structures (name, registrationFee, registrationFeeInstallments, annualCharges, annualChargesInstallments, monthlyFee, meals, description) 
       VALUES (@name, @registrationFee, @registrationFeeInstallments, @annualCharges, @annualChargesInstallments, @monthlyFee, @meals, @description);`
    );
    const seed = [
      { 
        name: "Basic", 
        registrationFee: 10000, 
        registrationFeeInstallments: 2,
        annualCharges: 8000,
        annualChargesInstallments: 4,
        monthlyFee: 5000, 
        meals: 2000,
        description: "Basic fee structure with meals" 
      },
      { 
        name: "Standard", 
        registrationFee: 15000, 
        registrationFeeInstallments: 3,
        annualCharges: 12000,
        annualChargesInstallments: 4,
        monthlyFee: 7500, 
        meals: 3000,
        description: "Standard fee structure with meals" 
      },
      { 
        name: "Premium", 
        registrationFee: 20000, 
        registrationFeeInstallments: 4,
        annualCharges: 15000,
        annualChargesInstallments: 5,
        monthlyFee: 10000, 
        meals: 4000,
        description: "Premium fee structure with meals" 
      },
    ];
    const insertMany = db.transaction((rows) => rows.forEach((row) => insert.run(row)));
    insertMany(seed);
  }
};

export const initDatabase = () => {
  try {
    ensureSchema();
    seedData();
    ensureDropInFeeStructure();
    backfillMissingStudentFeeVersions();
    backfillMissingDropInFeeVersions();
    migrateDiaryJsonToEvents();
    expandDiaryEventTypes();
    migrateSummaryTextToEvents();
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};
