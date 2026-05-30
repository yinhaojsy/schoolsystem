import { db } from "./db.js";
import { todayEntryDate } from "./utils/schoolDate.js";
import { publicUploadUrl } from "./utils/uploads.js";

export { todayEntryDate };

export function parseJsonArray(raw, fallback = []) {
  if (raw == null || raw === "") return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function mapDiaryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    entryDate: row.entryDate,
    teacherId: row.teacherId,
    mood: row.mood,
    drank: parseJsonArray(row.drankJson),
    slept: parseJsonArray(row.sleptJson),
    ate: parseJsonArray(row.ateJson),
    activities: row.activities,
    potty: parseJsonArray(row.pottyJson),
    supplies: parseJsonArray(row.suppliesJson),
    teacherRemarks: row.teacherRemarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getDiaryForStudent(studentId, entryDate = todayEntryDate()) {
  const row = db
    .prepare(`SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  return mapDiaryRow(row);
}

export function getNoticesForStudent(studentId, entryDate = todayEntryDate()) {
  return db
    .prepare(
      `SELECT id, studentId, entryDate, teacherId, message, createdAt
       FROM parent_notices WHERE studentId = ? AND entryDate = ? ORDER BY id ASC`,
    )
    .all(studentId, entryDate);
}

export function getGalleryForStudent(studentId, entryDate = todayEntryDate()) {
  return db
    .prepare(
      `SELECT id, studentId, entryDate, teacherId, filePath, caption, createdAt
       FROM gallery_photos WHERE studentId = ? AND entryDate = ? ORDER BY id ASC`,
    )
    .all(studentId, entryDate)
    .map((p) => ({
      ...p,
      url: publicUploadUrl(p.filePath),
    }));
}

export function hasReadReceipt(parentId, studentId, contentType, entryDate = todayEntryDate()) {
  return !!db
    .prepare(
      `SELECT id FROM parent_read_receipts
       WHERE parentId = ? AND studentId = ? AND contentType = ? AND entryDate = ?`,
    )
    .get(parentId, studentId, contentType, entryDate);
}

export function markReadReceipt(parentId, studentId, contentType, entryDate = todayEntryDate()) {
  db.prepare(
    `INSERT INTO parent_read_receipts (parentId, studentId, contentType, entryDate)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(parentId, studentId, contentType, entryDate) DO UPDATE SET readAt = CURRENT_TIMESTAMP`,
  ).run(parentId, studentId, contentType, entryDate);
}

export function unreadCountForStudent(parentId, studentId, entryDate = todayEntryDate()) {
  const diary = getDiaryForStudent(studentId, entryDate);
  const notices = getNoticesForStudent(studentId, entryDate);
  const gallery = getGalleryForStudent(studentId, entryDate);

  const diaryUnread = diary && !hasReadReceipt(parentId, studentId, "diary", entryDate) ? 1 : 0;
  const noticesUnread =
    notices.length > 0 && !hasReadReceipt(parentId, studentId, "notices", entryDate) ? 1 : 0;
  const galleryUnread =
    gallery.length > 0 && !hasReadReceipt(parentId, studentId, "gallery", entryDate) ? 1 : 0;

  return { diary: diaryUnread, notices: noticesUnread, gallery: galleryUnread };
}

export function assertTeacherStudentAccess(teacher, studentId, entryDate = todayEntryDate()) {
  const student = db
    .prepare(
      `SELECT id, name, classGroupId, programType, profilePhotoPath, rollNo, status
       FROM students WHERE id = ? AND status = 'active'`,
    )
    .get(studentId);

  if (!student) return { error: "Student not found.", status: 404 };
  if (student.classGroupId !== teacher.classGroupId) {
    return { error: "This student is not in your class.", status: 403 };
  }
  if (student.programType !== "daycare") {
    return { error: "Daily diary is only for daycare students.", status: 400 };
  }

  return { student, entryDate };
}

export function studentSummaryForTeacher(studentId, entryDate = todayEntryDate()) {
  const diary = getDiaryForStudent(studentId, entryDate);
  const notices = getNoticesForStudent(studentId, entryDate);
  const gallery = getGalleryForStudent(studentId, entryDate);
  return {
    hasDiary: !!diary,
    noticeCount: notices.length,
    photoCount: gallery.length,
  };
}
