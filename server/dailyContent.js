import { db } from "./db.js";
import { todayEntryDate } from "./utils/schoolDate.js";
import { publicUploadUrl } from "./utils/uploads.js";
import { getDiaryEventsForStudent, groupEventsToArrays } from "./diaryEvents.js";

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

/** Summary fields only — timed activities live in daycare_diary_events. */
export function sanitizeDiarySummaryPayload(body) {
  const mood = typeof body.mood === "string" ? body.mood.trim() : "";
  const activities = typeof body.activities === "string" ? body.activities.trim() : "";
  const teacherRemarks = typeof body.teacherRemarks === "string" ? body.teacherRemarks.trim() : "";
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    mood: mood || null,
    activities: activities || null,
    suppliesJson: JSON.stringify(arr(body.supplies)),
    teacherRemarks: teacherRemarks || null,
  };
}

/** @deprecated Use sanitizeDiarySummaryPayload + syncDiaryEventsFromPayload */
export function sanitizeDiaryPayload(body) {
  const summary = sanitizeDiarySummaryPayload(body);
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    ...summary,
    drankJson: JSON.stringify(arr(body.drank)),
    sleptJson: JSON.stringify(arr(body.slept)),
    ateJson: JSON.stringify(arr(body.ate)),
    medicineJson: JSON.stringify(arr(body.medicine)),
    pottyJson: JSON.stringify(arr(body.potty)),
  };
}

export function buildDiaryView(row, events, { forParent = false } = {}) {
  const eventArrays = groupEventsToArrays(events, { forParent });
  if (!row && events.length === 0) return null;

  const supplies = row ? parseJsonArray(row.suppliesJson) : [];
  const summaryStatus = row?.approvalStatus ?? null;
  const pendingEventCount = events.filter((e) => e.approvalStatus === "pending").length;
  const draftEventCount = events.filter(
    (e) => e.approvalStatus === "draft" || e.approvalStatus === "rejected",
  ).length;
  const approvedEventCount = events.filter((e) => e.approvalStatus === "approved").length;

  return {
    id: row?.id,
    studentId: row?.studentId ?? events[0]?.studentId,
    entryDate: row?.entryDate ?? events[0]?.entryDate,
    teacherId: row?.teacherId ?? events[0]?.teacherId,
    mood: forParent && summaryStatus !== "approved" ? null : (row?.mood ?? null),
    ...eventArrays,
    activities: forParent && summaryStatus !== "approved" ? null : (row?.activities ?? null),
    supplies: forParent && summaryStatus !== "approved" ? [] : supplies,
    teacherRemarks: forParent && summaryStatus !== "approved" ? null : (row?.teacherRemarks ?? null),
    approvalStatus: summaryStatus,
    summaryApprovalStatus: summaryStatus,
    rejectionReason: row?.rejectionReason ?? null,
    submittedAt: row?.submittedAt ?? null,
    reviewedAt: row?.reviewedAt ?? null,
    adminCorrectedAt: row?.adminCorrectedAt ?? null,
    adminCorrectedBy: row?.adminCorrectedBy ?? null,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
    pendingEventCount,
    draftEventCount,
    approvedEventCount,
    hasPendingEvents: pendingEventCount > 0,
    hasDraftEvents: draftEventCount > 0,
  };
}

export function mapDiaryRow(row, events = null, options = {}) {
  if (!row && (!events || events.length === 0)) return null;
  const resolvedEvents =
    events ??
    (row
      ? getDiaryEventsForStudent(row.studentId, row.entryDate, { approvedOnly: options.approvedOnly })
      : []);
  return buildDiaryView(row, resolvedEvents, options);
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
  const events = getDiaryEventsForStudent(studentId, entryDate);
  return buildDiaryView(row, events);
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
  const summaryRow = db
    .prepare(
      `SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
    )
    .get(studentId, entryDate);
  const events = getDiaryEventsForStudent(studentId, entryDate, { approvedOnly: true });
  return buildDiaryView(summaryRow, events, { forParent: true });
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
    diaryStatus: diary?.summaryApprovalStatus ?? (diary?.hasPendingEvents ? "events_pending" : diary?.approvedEventCount ? "approved" : null),
    pendingEventCount: diary?.pendingEventCount ?? 0,
    draftEventCount: diary?.draftEventCount ?? 0,
    noticeCount: notices.length,
    photoCount: gallery.length,
    pendingNoticeCount: notices.filter((n) => n.approvalStatus === "pending").length,
    pendingPhotoCount: gallery.filter((p) => p.approvalStatus === "pending").length,
  };
}

export function diaryHasPublishedContent(studentId, entryDate) {
  const summary = db
    .prepare(
      `SELECT id FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
    )
    .get(studentId, entryDate);
  const eventCount = db
    .prepare(
      `SELECT COUNT(*) AS c FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
    )
    .get(studentId, entryDate)?.c;
  return !!summary || (eventCount ?? 0) > 0;
}
