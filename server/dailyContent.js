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

export function sanitizeDiaryPayload(body) {
  const mood = typeof body.mood === "string" ? body.mood.trim() : "";
  const activities = typeof body.activities === "string" ? body.activities.trim() : "";
  const teacherRemarks = typeof body.teacherRemarks === "string" ? body.teacherRemarks.trim() : "";
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    mood: mood || null,
    drankJson: JSON.stringify(arr(body.drank)),
    sleptJson: JSON.stringify(arr(body.slept)),
    ateJson: JSON.stringify(arr(body.ate)),
    medicineJson: JSON.stringify(arr(body.medicine)),
    activities: activities || null,
    pottyJson: JSON.stringify(arr(body.potty)),
    suppliesJson: JSON.stringify(arr(body.supplies)),
    teacherRemarks: teacherRemarks || null,
  };
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
    medicine: parseJsonArray(row.medicineJson),
    activities: row.activities,
    potty: parseJsonArray(row.pottyJson),
    supplies: parseJsonArray(row.suppliesJson),
    teacherRemarks: row.teacherRemarks,
    approvalStatus: row.approvalStatus ?? "approved",
    rejectionReason: row.rejectionReason ?? null,
    submittedAt: row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    adminCorrectedAt: row.adminCorrectedAt ?? null,
    adminCorrectedBy: row.adminCorrectedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapNoticeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    entryDate: row.entryDate,
    teacherId: row.teacherId,
    message: row.message,
    createdAt: row.createdAt,
    approvalStatus: row.approvalStatus ?? "approved",
    rejectionReason: row.rejectionReason ?? null,
    submittedAt: row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    adminCorrectedAt: row.adminCorrectedAt ?? null,
    adminCorrectedBy: row.adminCorrectedBy ?? null,
  };
}

export function mapGalleryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    entryDate: row.entryDate,
    teacherId: row.teacherId,
    filePath: row.filePath,
    caption: row.caption,
    createdAt: row.createdAt,
    url: publicUploadUrl(row.filePath),
    approvalStatus: row.approvalStatus ?? "approved",
    rejectionReason: row.rejectionReason ?? null,
    submittedAt: row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    adminCorrectedAt: row.adminCorrectedAt ?? null,
    adminCorrectedBy: row.adminCorrectedBy ?? null,
  };
}

export function getDiaryForStudent(studentId, entryDate = todayEntryDate()) {
  const row = db
    .prepare(`SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  return mapDiaryRow(row);
}

export function getNoticesForStudent(studentId, entryDate = todayEntryDate(), { approvedOnly = false } = {}) {
  const statusClause = approvedOnly ? ` AND approvalStatus = 'approved'` : "";
  return db
    .prepare(
      `SELECT id, studentId, entryDate, teacherId, message, createdAt,
              approvalStatus, rejectionReason, submittedAt, reviewedAt
       FROM parent_notices WHERE studentId = ? AND entryDate = ?${statusClause} ORDER BY id ASC`,
    )
    .all(studentId, entryDate)
    .map(mapNoticeRow);
}

export function getGalleryForStudent(studentId, entryDate = todayEntryDate(), { approvedOnly = false } = {}) {
  const statusClause = approvedOnly ? ` AND approvalStatus = 'approved'` : "";
  return db
    .prepare(
      `SELECT id, studentId, entryDate, teacherId, filePath, caption, createdAt,
              approvalStatus, rejectionReason, submittedAt, reviewedAt
       FROM gallery_photos WHERE studentId = ? AND entryDate = ?${statusClause} ORDER BY id ASC`,
    )
    .all(studentId, entryDate)
    .map(mapGalleryRow);
}

export function getDiaryForParent(studentId, entryDate = todayEntryDate()) {
  const row = db
    .prepare(`SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`)
    .get(studentId, entryDate);
  return mapDiaryRow(row);
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
  const diary = getDiaryForParent(studentId, entryDate);
  const notices = getNoticesForStudent(studentId, entryDate, { approvedOnly: true });
  const gallery = getGalleryForStudent(studentId, entryDate, { approvedOnly: true });

  const diaryUnread = diary && !hasReadReceipt(parentId, studentId, "diary", entryDate) ? 1 : 0;
  const noticesUnread =
    notices.length > 0 && !hasReadReceipt(parentId, studentId, "notices", entryDate) ? 1 : 0;
  const galleryUnread =
    gallery.length > 0 && !hasReadReceipt(parentId, studentId, "gallery", entryDate) ? 1 : 0;

  return { diary: diaryUnread, notices: noticesUnread, gallery: galleryUnread };
}

export function isSchoolScopeTeacher(teacher) {
  return teacher?.teacherScope === "school";
}

export function canSchoolAdminEditPublished(teacher) {
  return isSchoolScopeTeacher(teacher) && !!teacher.canEditPublishedContent;
}

export function assertTeacherStudentAccess(teacher, studentId, entryDate = todayEntryDate()) {
  const student = db
    .prepare(
      `SELECT id, name, classGroupId, programType, profilePhotoPath, rollNo, status
       FROM students
       WHERE id = ? AND status = 'active' AND COALESCE(enrollmentStatus, 'enrolled') = 'enrolled'`,
    )
    .get(studentId);

  if (!student) return { error: "Student not found.", status: 404 };
  if (!isSchoolScopeTeacher(teacher) && student.classGroupId !== teacher.classGroupId) {
    return { error: "This student is not in your class.", status: 403 };
  }

  return { student, entryDate };
}

export function studentSummaryForTeacher(studentId, entryDate = todayEntryDate()) {
  const diary = getDiaryForStudent(studentId, entryDate);
  const notices = getNoticesForStudent(studentId, entryDate);
  const gallery = getGalleryForStudent(studentId, entryDate);
  return {
    hasDiary: !!diary,
    diaryStatus: diary?.approvalStatus ?? null,
    noticeCount: notices.length,
    photoCount: gallery.length,
    pendingNoticeCount: notices.filter((n) => n.approvalStatus === "pending").length,
    pendingPhotoCount: gallery.filter((p) => p.approvalStatus === "pending").length,
  };
}
