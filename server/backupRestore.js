import fs from "fs";
import path from "path";
import { ZipArchive } from "archiver";
import AdmZip from "adm-zip";
import { db, dbPath, dataDir, closeDbConnection, resetDbInstance, initDatabase } from "./db.js";
import { uploadsRoot } from "./utils/uploads.js";
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

  let uploadsSizeBytes = 0;
  if (fs.existsSync(uploadsRoot)) {
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else uploadsSizeBytes += st.size;
      }
    };
    try {
      walk(uploadsRoot);
    } catch {
      uploadsSizeBytes = 0;
    }
  }

  return {
    path: dbPath,
    sizeBytes: stat.size,
    uploadsSizeBytes,
    uploadsPath: uploadsRoot,
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

/**
 * Write a zip containing school.db + uploads/ to destZipPath.
 */
export async function writeFullBackupArchive(destZipPath) {
  const tmpDb = path.join(dataDir, `full-backup-db-${Date.now()}.db`);
  try {
    await writeBackupFile(tmpDb);

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destZipPath);
      const archive = new ZipArchive({ zlib: { level: 5 } });

      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.on("warning", (err) => {
        if (err.code !== "ENOENT") reject(err);
      });

      archive.pipe(output);
      archive.file(tmpDb, { name: "school.db" });
      if (fs.existsSync(uploadsRoot)) {
        archive.directory(uploadsRoot, "uploads");
      }
      void archive.finalize();
    });
  } finally {
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  }
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

function createPreRestoreUploadsSafetyCopy() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyPath = path.join(dataDir, `uploads.pre-restore-${stamp}`);
  if (fs.existsSync(uploadsRoot)) {
    fs.cpSync(uploadsRoot, safetyPath, { recursive: true });
    return safetyPath;
  }
  return null;
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

function findDbEntry(zip) {
  const entries = zip.getEntries();
  const preferred = entries.find(
    (e) =>
      !e.isDirectory &&
      (e.entryName === "school.db" ||
        e.entryName === "database.db" ||
        e.entryName.endsWith("/school.db")),
  );
  if (preferred) return preferred;

  return entries.find((e) => {
    if (e.isDirectory) return false;
    const name = e.entryName.toLowerCase();
    return name.endsWith(".db") || name.endsWith(".sqlite") || name.endsWith(".sqlite3");
  });
}

function safeUploadsRelative(entryName) {
  if (!entryName.startsWith("uploads/")) return null;
  const rel = entryName.slice("uploads/".length);
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

/**
 * Restore database + uploads from a zip file on disk.
 * Zip must contain school.db (or *.db) and may contain uploads/.
 */
export function restoreFullBackupFromZipPath(zipPath) {
  const zip = new AdmZip(zipPath);
  const dbEntry = findDbEntry(zip);
  if (!dbEntry) {
    throw new Error("MISSING_DB");
  }

  const dbBuffer = dbEntry.getData();
  if (!isSqliteDatabaseBuffer(dbBuffer)) {
    throw new Error("INVALID_SQLITE");
  }

  const entries = zip.getEntries();
  const hasUploads = entries.some((e) => e.entryName === "uploads/" || e.entryName.startsWith("uploads/"));

  const safetyBackupPath = createPreRestoreSafetyCopy();
  const safetyUploadsPath = hasUploads ? createPreRestoreUploadsSafetyCopy() : null;

  closeDbConnection();
  removeWalSidecars();
  fs.writeFileSync(dbPath, dbBuffer);

  if (hasUploads) {
    if (fs.existsSync(uploadsRoot)) {
      fs.rmSync(uploadsRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(uploadsRoot, { recursive: true });

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const rel = safeUploadsRelative(entry.entryName);
      if (!rel) continue;
      const dest = path.join(uploadsRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }
  }

  resetDbInstance();
  runPostRestoreMaintenance();

  return { safetyBackupPath, safetyUploadsPath };
}
