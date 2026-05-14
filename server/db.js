import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "server", "data");
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

export const resetDbInstance = () => {
  try {
    if (db && typeof db.close === "function") {
      db.close();
    }
  } catch (e) {
    // ignore close errors
  }
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

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_students_household ON students(householdId);`).run();

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

  db.prepare(
    `CREATE TABLE IF NOT EXISTS fee_builder_template (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema TEXT NOT NULL,
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
};

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
    backfillMissingStudentFeeVersions();
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};
