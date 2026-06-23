import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db.js";
import { requireTeacher } from "../middleware/requireTeacher.js";
import {
  todayEntryDate,
  getDiaryForStudent,
  getNoticesForStudent,
  getGalleryForStudent,
  studentSummaryForTeacher,
  assertTeacherStudentAccess,
  sanitizeDiarySummaryPayload,
  isSchoolScopeTeacher,
  canTeacherEditPublished,
} from "../dailyContent.js";
import {
  syncDiaryEventsFromPayload,
  submitDiaryEventsForApproval,
  publishDiaryEvents,
  withdrawDiaryEventsSubmission,
  deletePublishedDiaryEvent,
} from "../diaryEvents.js";
import {
  getTeacherContentSettings,
  applyContentDraftOnSave,
  applyContentApprovalOnSubmit,
  notifyTeacherContentSubmitted,
  submitDiaryForApproval,
  submitDiaryForPublish,
  withdrawDiarySubmission,
  submitGalleryForApproval,
  submitGalleryForPublish,
  withdrawGallerySubmission,
  deleteGalleryPhotoForTeacher,
  canTeacherEditDiary,
  canTeacherDeleteNotice,
  canTeacherEditPublishedNotice,
  correctApprovedDiary,
  correctApprovedNotice,
  canTeacherFillPublishedSummaryExtras,
  fillPublishedDiarySummaryExtras,
  buildDiaryEventsGroupSubmission,
  notifyStaffContentSubmitted,
  requiresApproval,
} from "../teacherContent.js";
import { notifyContentLiveUpdate } from "../contentLive.js";
import {
  createStreamToken,
  validateStreamToken,
  attachSseStream,
  buildTeacherStreamMeta,
} from "../staffNotifications.js";
import { getAttendanceStatus, bulkSetAttendance } from "../attendance.js";
import { uploadsRoot, publicUploadUrl, relativeUploadPath } from "../utils/uploads.js";

const router = express.Router();

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

// ==================== AUTH ====================
router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

  if (!user || user.role !== "teacher") {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended. Please contact the school." });
  }
  const schoolScope = user.teacherScope === "school";
  if (!schoolScope && !user.classGroupId) {
    return res.status(403).json({ error: "Your account is not assigned to a class yet." });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const { password: _p, invitePassword: _i, ...safe } = user;
  const classGroup = user.classGroupId
    ? db.prepare(`SELECT name FROM class_groups WHERE id = ?`).get(user.classGroupId)
    : null;
  res.json({
    user: {
      ...safe,
      teacherScope: user.teacherScope ?? "class",
      canEditPublishedContent: !!user.canEditPublishedContent,
      classGroupName: schoolScope ? "All students" : (classGroup?.name ?? null),
    },
  });
});

router.get("/me", requireTeacher, (req, res) => {
  const user = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.teacherScope,
              u.canEditPublishedContent, u.createdAt, cg.name as classGroupName
       FROM users u LEFT JOIN class_groups cg ON cg.id = u.classGroupId WHERE u.id = ?`,
    )
    .get(req.teacherUser.id);
  res.json({
    ...user,
    teacherScope: user.teacherScope ?? "class",
    canEditPublishedContent: !!user.canEditPublishedContent,
    classGroupName: isSchoolScopeTeacher(user) ? "All students" : (user.classGroupName ?? null),
  });
});

router.patch("/account/password", requireTeacher, (req, res) => {
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  const row = db.prepare(`SELECT password FROM users WHERE id = ?`).get(req.teacherUser.id);
  if (!row || !bcrypt.compareSync(currentPassword, row.password)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password = ?, invitePassword = ? WHERE id = ?`).run(
    hash,
    newPassword,
    req.teacherUser.id,
  );
  res.json({ success: true });
});

router.get("/me/content-settings", requireTeacher, (req, res) => {
  res.json(getTeacherContentSettings(req.teacherUser.id));
});

// ==================== CLASS ROSTER (TODAY) ====================
router.get("/students", requireTeacher, (req, res) => {
  const entryDate = todayEntryDate();
  const schoolScope = isSchoolScopeTeacher(req.teacherUser);
  const students = schoolScope
    ? db
        .prepare(
          `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
           FROM students s
           LEFT JOIN class_groups cg ON cg.id = s.classGroupId
           WHERE s.status = 'active' AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'
           ORDER BY cg.name ASC, s.name ASC`,
        )
        .all()
    : db
        .prepare(
          `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
           FROM students s
           LEFT JOIN class_groups cg ON cg.id = s.classGroupId
           WHERE s.classGroupId = ? AND s.status = 'active' AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'
           ORDER BY s.name ASC`,
        )
        .all(req.teacherUser.classGroupId);

  const result = students.map((s) => {
    const summary = studentSummaryForTeacher(s.id, entryDate);
    const attendanceStatus = getAttendanceStatus(s.id, entryDate);
    return {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      classGroupName: s.classGroupName,
      profilePhotoUrl: publicUploadUrl(s.profilePhotoPath),
      today: entryDate,
      attendanceStatus,
      isAbsent: attendanceStatus === "absent",
      ...summary,
    };
  });

  res.json({ entryDate, students: result });
});

router.patch("/attendance/bulk", requireTeacher, (req, res) => {
  try {
    const entryDate =
      typeof req.body.entryDate === "string" && req.body.entryDate.trim()
        ? req.body.entryDate.trim()
        : todayEntryDate();
    const status = req.body.status === "absent" ? "absent" : "present";
    const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
    if (!studentIds.length) {
      return res.status(400).json({ error: "Select at least one student." });
    }

    for (const rawId of studentIds) {
      const sid = parseInt(rawId, 10);
      if (Number.isNaN(sid)) continue;
      const access = assertTeacherStudentAccess(req.teacherUser, sid, entryDate);
      if (access.error) return res.status(access.status).json({ error: access.error });
    }

    const result = bulkSetAttendance(studentIds, entryDate, status, req.teacherUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ error: "Failed to update attendance." });
  }
});

// ==================== DIARY ====================

function canTeacherSyncDiaryEvents(studentId, entryDate) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .get(studentId, entryDate);
  return (row?.c ?? 0) === 0;
}

router.get("/students/:id/diary", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const diary = getDiaryForStudent(studentId, access.entryDate);
  res.json({ entryDate: access.entryDate, student: access.student, diary });
});

router.put("/students/:id/diary", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const existing = db
    .prepare(`SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, access.entryDate);

  if (existing?.approvalStatus === "approved" && canTeacherEditPublished(req.teacherUser)) {
    const result = correctApprovedDiary(existing.id, req.body, req.teacherUser.id, {
      channel: "teacher_edit",
      actorRole: "teacher",
      submitForApproval: requiresApproval(req.teacherUser.id, "diary"),
    });
    if (!result) return res.status(404).json({ error: "Diary not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    const diary = getDiaryForStudent(studentId, access.entryDate);
    return res.json({ entryDate: access.entryDate, diary });
  }

  if (existing?.approvalStatus === "approved") {
    if (canTeacherFillPublishedSummaryExtras(existing, req.body)) {
      const result = fillPublishedDiarySummaryExtras(existing.id, req.body, req.teacherUser.id);
      if (!result) return res.status(404).json({ error: "Diary not found." });
      if (result?.error) return res.status(result.status).json({ error: result.error });
    }
    const diary = getDiaryForStudent(studentId, access.entryDate);
    return res.json({ entryDate: access.entryDate, diary });
  }

  if (!canTeacherEditDiary(studentId, access.entryDate, req.teacherUser)) {
    return res.status(400).json({ error: "Tap Edit to change a submitted diary summary." });
  }

  const payload = sanitizeDiarySummaryPayload(req.body);
  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");

  const nextApprovalStatus = (current) => {
    if (current === "rejected") return "draft";
    if (current === "approved") return "approved";
    if (current === "pending") return "pending";
    return approval.approvalStatus;
  };

  if (existing) {
    const status = nextApprovalStatus(existing.approvalStatus);
    const keepPublished = status === "approved" || status === "pending";
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?, teacherId = ?,
        approvalStatus = ?, rejectionReason = ?, submittedAt = ?, reviewedAt = ?, reviewedBy = ?,
        adminCorrectedAt = NULL, adminCorrectedBy = NULL,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.activities,
      payload.suppliesJson,
      payload.teacherRemarks,
      req.teacherUser.id,
      status,
      keepPublished ? null : approval.rejectionReason,
      keepPublished ? existing.submittedAt : approval.submittedAt,
      keepPublished ? existing.reviewedAt : approval.reviewedAt,
      keepPublished ? existing.reviewedBy : approval.reviewedBy,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO daycare_diary_entries (
        studentId, entryDate, teacherId, mood, activities, suppliesJson, teacherRemarks,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      payload.mood,
      payload.activities,
      payload.suppliesJson,
      payload.teacherRemarks,
      approval.approvalStatus,
      approval.rejectionReason,
      approval.submittedAt,
      approval.reviewedAt,
      approval.reviewedBy,
    );
  }

  const diary = getDiaryForStudent(studentId, access.entryDate);
  res.json({ entryDate: access.entryDate, diary });
});

router.put("/students/:id/diary/events", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (!canTeacherSyncDiaryEvents(studentId, access.entryDate)) {
    return res.status(400).json({ error: "Tap Edit to change submitted activities." });
  }

  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");
  const syncResult = syncDiaryEventsFromPayload(studentId, access.entryDate, req.teacherUser.id, req.body, approval, {
    allowEditPublished: canTeacherEditPublished(req.teacherUser),
    submitEditsForApproval: requiresApproval(req.teacherUser.id, "diary"),
  });
  if (syncResult.editsSubmittedForApproval > 0) {
    const submission = buildDiaryEventsGroupSubmission(studentId, access.entryDate, req.teacherUser.id);
    notifyStaffContentSubmitted(submission, { eventType: "submitted" });
  }

  const diary = getDiaryForStudent(studentId, access.entryDate);
  res.json({ entryDate: access.entryDate, diary });
});

router.delete("/diary/events/:eventId", requireTeacher, (req, res) => {
  if (!canTeacherEditPublished(req.teacherUser)) {
    return res.status(403).json({ error: "Published activities cannot be removed." });
  }

  const eventId = parseInt(req.params.eventId, 10);
  const result = deletePublishedDiaryEvent(eventId);
  if (!result) return res.status(404).json({ error: "Activity not found." });
  if (result?.error) return res.status(result.status).json({ error: result.error });

  const access = assertTeacherStudentAccess(req.teacherUser, result.studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const diary = getDiaryForStudent(result.studentId, result.entryDate);
  res.json({ entryDate: result.entryDate, diary });
});

router.post("/students/:id/diary/submit", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const payload = sanitizeDiarySummaryPayload(req.body);
  if (!canTeacherEditDiary(studentId, access.entryDate, req.teacherUser)) {
    return res.status(400).json({ error: "Diary summary is already submitted." });
  }

  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");
  const existing = db
    .prepare(`SELECT id FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, access.entryDate);

  if (existing) {
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?, teacherId = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.activities,
      payload.suppliesJson,
      payload.teacherRemarks,
      req.teacherUser.id,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO daycare_diary_entries (
        studentId, entryDate, teacherId, mood, activities, suppliesJson, teacherRemarks,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      payload.mood,
      payload.activities,
      payload.suppliesJson,
      payload.teacherRemarks,
      approval.approvalStatus,
      approval.rejectionReason,
      approval.submittedAt,
      approval.reviewedAt,
      approval.reviewedBy,
    );
  }

  if (requiresApproval(req.teacherUser.id, "diary")) {
    const result = submitDiaryForApproval(studentId, access.entryDate, req.teacherUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    return res.json({ entryDate: access.entryDate, diary: result.diary });
  }

  const result = submitDiaryForPublish(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  return res.json({ entryDate: access.entryDate, diary: result.diary });
});

router.post("/students/:id/diary/events/submit", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (!canTeacherSyncDiaryEvents(studentId, access.entryDate)) {
    return res.status(400).json({ error: "Activities are already submitted." });
  }

  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");
  syncDiaryEventsFromPayload(studentId, access.entryDate, req.teacherUser.id, req.body, approval, {
    allowEditPublished: canTeacherEditPublished(req.teacherUser),
    submitEditsForApproval: requiresApproval(req.teacherUser.id, "diary"),
  });

  if (requiresApproval(req.teacherUser.id, "diary")) {
    const result = submitDiaryEventsForApproval(studentId, access.entryDate, req.teacherUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    const submission = buildDiaryEventsGroupSubmission(studentId, access.entryDate, req.teacherUser.id);
    notifyStaffContentSubmitted(submission, { eventType: "submitted" });
    const diary = getDiaryForStudent(studentId, access.entryDate);
    return res.json({ entryDate: access.entryDate, diary });
  }

  const result = publishDiaryEvents(studentId, access.entryDate);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  const diary = getDiaryForStudent(studentId, access.entryDate);
  res.json({ entryDate: access.entryDate, diary });
});

router.post("/students/:id/diary/withdraw", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const result = withdrawDiarySubmission(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  res.json({ entryDate: access.entryDate, diary: result.diary });
});

router.post("/students/:id/diary/events/withdraw", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const result = withdrawDiaryEventsSubmission(studentId, access.entryDate);
  if (result?.error) return res.status(result.status).json({ error: result.error });

  const submission = buildDiaryEventsGroupSubmission(studentId, access.entryDate, req.teacherUser.id);
  notifyStaffContentSubmitted(submission, { eventType: "withdrawn" });

  const diary = getDiaryForStudent(studentId, access.entryDate);
  res.json({ entryDate: access.entryDate, diary });
});

// ==================== NOTICES ====================
router.get("/students/:id/notices", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  res.json({
    entryDate: access.entryDate,
    notices: getNoticesForStudent(studentId, access.entryDate).map((notice) => ({
      ...notice,
      deletable: canTeacherDeleteNotice(notice, req.teacherUser),
    })),
  });
});

router.post("/students/:id/notices", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Notice message is required." });

  const approval = applyContentApprovalOnSubmit(req.teacherUser.id, "notices");
  const result = db
    .prepare(
      `INSERT INTO parent_notices (
        studentId, entryDate, teacherId, message,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      message,
      approval.approvalStatus,
      approval.rejectionReason,
      approval.submittedAt,
      approval.reviewedAt,
      approval.reviewedBy,
    );

  if (approval.approvalStatus === "pending") {
    notifyTeacherContentSubmitted({
      contentType: "notices",
      contentId: result.lastInsertRowid,
      teacherId: req.teacherUser.id,
      studentId,
    });
  } else {
    notifyContentLiveUpdate({ studentId, entryDate: access.entryDate, contentType: "notices" });
  }

  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ notice: getNoticesForStudent(studentId, access.entryDate).find((n) => n.id === notice.id) });
});

router.delete("/notices/:id", requireTeacher, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(noticeId);
  if (!notice) return res.status(404).json({ error: "Notice not found." });
  if (notice.entryDate !== todayEntryDate()) {
    return res.status(400).json({ error: "Only today's notices can be removed." });
  }

  const access = assertTeacherStudentAccess(req.teacherUser, notice.studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (!canTeacherDeleteNotice(notice, req.teacherUser)) {
    return res.status(400).json({ error: "Published notes cannot be removed." });
  }

  db.prepare(`DELETE FROM parent_notices WHERE id = ?`).run(noticeId);
  notifyContentLiveUpdate({ studentId: notice.studentId, entryDate: notice.entryDate, contentType: "notices" });
  res.json({ success: true });
});

router.patch("/notices/:id", requireTeacher, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(noticeId);
  if (!notice) return res.status(404).json({ error: "Note not found." });
  if (notice.entryDate !== todayEntryDate()) {
    return res.status(400).json({ error: "Only today's notes can be edited." });
  }

  const access = assertTeacherStudentAccess(req.teacherUser, notice.studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (notice.approvalStatus !== "approved" || !canTeacherEditPublishedNotice(req.teacherUser)) {
    return res.status(400).json({ error: "You cannot edit this note." });
  }

  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Message cannot be empty." });

  const result = correctApprovedNotice(noticeId, message, req.teacherUser.id, {
    channel: "teacher_edit",
    actorRole: "teacher",
    submitForApproval: requiresApproval(req.teacherUser.id, "notices"),
  });
  if (!result) return res.status(404).json({ error: "Note not found." });
  if (result?.error) return res.status(result.status).json({ error: result.error });

  const updated = getNoticesForStudent(notice.studentId, notice.entryDate).find((n) => n.id === noticeId);
  res.json({ notice: updated });
});

// ==================== GALLERY ====================
router.get("/students/:id/gallery", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  res.json({
    entryDate: access.entryDate,
    photos: getGalleryForStudent(studentId, access.entryDate),
  });
});

router.post("/students/:id/gallery", requireTeacher, galleryUpload.single("photo"), (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const access = assertTeacherStudentAccess(req.teacherUser, studentId);
    if (access.error) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(access.status).json({ error: access.error });
    }
    if (!req.file) return res.status(400).json({ error: "Photo file is required." });

    const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : null;
    const relPath = relativeUploadPath(req.file.path);
    const approval = applyContentDraftOnSave(req.teacherUser.id, "gallery");
    const result = db
      .prepare(
        `INSERT INTO gallery_photos (
          studentId, entryDate, teacherId, filePath, caption,
          approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        access.entryDate,
        req.teacherUser.id,
        relPath,
        caption,
        approval.approvalStatus,
        approval.rejectionReason,
        approval.submittedAt,
        approval.reviewedAt,
        approval.reviewedBy,
      );

    const photo = getGalleryForStudent(studentId, access.entryDate).find((p) => p.id === result.lastInsertRowid);
    if (approval.approvalStatus === "approved") {
      notifyContentLiveUpdate({ studentId, entryDate: access.entryDate, contentType: "gallery" });
    }
    res.status(201).json({ photo });
  } catch (error) {
    console.error("Gallery upload error:", error);
    res.status(500).json({ error: "Failed to upload photo." });
  }
});

router.delete("/gallery/:id", requireTeacher, (req, res) => {
  const photoId = parseInt(req.params.id, 10);
  const result = deleteGalleryPhotoForTeacher(photoId, req.teacherUser);
  if (!result) return res.status(404).json({ error: "Photo not found." });
  if (result?.error) return res.status(result.status ?? 400).json({ error: result.error });

  const access = assertTeacherStudentAccess(req.teacherUser, result.studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const photos = getGalleryForStudent(result.studentId, result.entryDate);
  res.json({ success: true, photos, pendingDeletion: !!result.pendingDeletion });
});

router.post("/stream-token", requireTeacher, (req, res) => {
  const token = createStreamToken(req.teacherUser.id, "teacher");
  res.json({ token, expiresIn: 1800 });
});

router.get("/stream", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const session = validateStreamToken(token);
  if (!session || session.role !== "teacher") {
    return res.status(401).json({ error: "Invalid or expired stream token." });
  }

  const user = db
    .prepare(
      `SELECT id, role, classGroupId, teacherScope FROM users WHERE id = ? AND role = 'teacher'`,
    )
    .get(session.userId);
  if (!user) {
    return res.status(403).json({ error: "Teacher access required." });
  }

  attachSseStream(req, res, buildTeacherStreamMeta(user));
});

router.post("/students/:id/gallery/submit", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (requiresApproval(req.teacherUser.id, "gallery")) {
    const result = submitGalleryForApproval(studentId, access.entryDate, req.teacherUser.id);
    if (result?.error) return res.status(result.status).json({ error: result.error });
    return res.json({ entryDate: access.entryDate, photos: result.photos, submittedCount: result.submittedCount });
  }

  const result = submitGalleryForPublish(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  res.json({ entryDate: access.entryDate, photos: result.photos, submittedCount: result.submittedCount });
});

router.post("/students/:id/gallery/withdraw", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const result = withdrawGallerySubmission(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  res.json({ entryDate: access.entryDate, photos: result.photos, withdrawnCount: result.withdrawnCount });
});

export default router;
