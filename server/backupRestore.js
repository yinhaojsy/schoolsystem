import fs from "fs";
import path from "path";
import { db, dbPath, dataDir, closeDbConnection, resetDbInstance, initDatabase } from "./db.js";
import { migrateLegacyPayments, refreshAllInvoiceStatementAmountsForStudent } from "./paymentEngine.js";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export function isSqliteDatabaseBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 16 && buffer.subarray(0, 16).equals(SQLITE_MAGIC);
}

export function getDatabaseInfo() {
  const stat = fs.statSync(dbPath);
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM students) as students,
        (SELECT COUNT(*) FROM invoices) as invoices,
        (SELECT COUNT(*) FROM users) as users`,
    )
    .get();

  return {
    path: dbPath,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    students: row.students,
    invoices: row.invoices,
    users: row.users,
  };
}

/** Write a consistent SQLite snapshot to destPath (uses better-sqlite3 backup API). */
export async function writeBackupFile(destPath) {
  await db.backup(destPath);
}

function removeWalSidecars() {
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

export function createPreRestoreSafetyCopy() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyPath = path.join(dataDir, `school.pre-restore-${stamp}.db`);
  fs.copyFileSync(dbPath, safetyPath);
  return safetyPath;
}

export function runPostRestoreMaintenance() {
  initDatabase();
  migrateLegacyPayments();
  for (const row of db.prepare(`SELECT DISTINCT studentId FROM invoices`).all()) {
    refreshAllInvoiceStatementAmountsForStudent(row.studentId);
  }
}

/**
 * Replace the live database file with buffer contents.
 * Keeps a timestamped copy of the previous database in dataDir.
 */
export function restoreDatabaseFromBuffer(buffer) {
  if (!isSqliteDatabaseBuffer(buffer)) {
    throw new Error("INVALID_SQLITE");
  }

  const safetyPath = createPreRestoreSafetyCopy();
  closeDbConnection();
  removeWalSidecars();
  fs.writeFileSync(dbPath, buffer);
  resetDbInstance();
  runPostRestoreMaintenance();

  return { safetyBackupPath: safetyPath };
}
