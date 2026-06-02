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
  sanitizeDiaryPayload,
} from "../dailyContent.js";
import {
  getTeacherContentSettings,
  applyContentDraftOnSave,
  applyContentApprovalOnSubmit,
  notifyTeacherContentSubmitted,
  submitDiaryForApproval,
  withdrawDiarySubmission,
  submitGalleryForApproval,
  withdrawGallerySubmission,
  isGalleryLockedForTeacher,
  canTeacherEditDiary,
  canTeacherDeleteNotice,
  canTeacherEditPublishedNotice,
  correctApprovedDiary,
  correctApprovedNotice,
} from "../teacherContent.js";
import { isSchoolScopeTeacher, canSchoolAdminEditPublished } from "../dailyContent.js";
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
           WHERE s.status = 'active'
           ORDER BY cg.name ASC, s.name ASC`,
        )
        .all()
    : db
        .prepare(
          `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
           FROM students s
           LEFT JOIN class_groups cg ON cg.id = s.classGroupId
           WHERE s.classGroupId = ? AND s.status = 'active'
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
    .prepare(`SELECT id, approvalStatus FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, access.entryDate);

  if (existing?.approvalStatus === "approved" && canSchoolAdminEditPublished(req.teacherUser)) {
    const result = correctApprovedDiary(existing.id, req.body, req.teacherUser.id, {
      channel: "school_admin_edit",
      actorRole: "school_admin",
    });
    if (!result) return res.status(404).json({ error: "Diary not found." });
    if (result?.error) return res.status(result.status).json({ error: result.error });
    const diary = getDiaryForStudent(studentId, access.entryDate);
    return res.json({ entryDate: access.entryDate, diary });
  }

  if (!canTeacherEditDiary(studentId, access.entryDate, req.teacherUser)) {
    return res.status(400).json({ error: "Tap Edit to change a submitted diary." });
  }

  const payload = sanitizeDiaryPayload(req.body);
  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");

  if (existing) {
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, drankJson = ?, sleptJson = ?, ateJson = ?, medicineJson = ?, activities = ?,
        pottyJson = ?, suppliesJson = ?, teacherRemarks = ?, teacherId = ?,
        approvalStatus = ?, rejectionReason = ?, submittedAt = ?, reviewedAt = ?, reviewedBy = ?,
        adminCorrectedAt = NULL, adminCorrectedBy = NULL,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
      payload.medicineJson,
      payload.activities,
      payload.pottyJson,
      payload.suppliesJson,
      payload.teacherRemarks,
      req.teacherUser.id,
      existing.approvalStatus === "rejected" ? "draft" : approval.approvalStatus,
      approval.rejectionReason,
      approval.submittedAt,
      approval.reviewedAt,
      approval.reviewedBy,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO daycare_diary_entries (
        studentId, entryDate, teacherId, mood, drankJson, sleptJson, ateJson, medicineJson,
        activities, pottyJson, suppliesJson, teacherRemarks,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
      payload.medicineJson,
      payload.activities,
      payload.pottyJson,
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

router.post("/students/:id/diary/submit", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const payload = sanitizeDiaryPayload(req.body);
  if (!canTeacherEditDiary(studentId, access.entryDate, req.teacherUser)) {
    return res.status(400).json({ error: "Diary is already submitted." });
  }

  const approval = applyContentDraftOnSave(req.teacherUser.id, "diary");
  const existing = db
    .prepare(`SELECT id FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, access.entryDate);

  if (existing) {
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, drankJson = ?, sleptJson = ?, ateJson = ?, medicineJson = ?, activities = ?,
        pottyJson = ?, suppliesJson = ?, teacherRemarks = ?, teacherId = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
      payload.medicineJson,
      payload.activities,
      payload.pottyJson,
      payload.suppliesJson,
      payload.teacherRemarks,
      req.teacherUser.id,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO daycare_diary_entries (
        studentId, entryDate, teacherId, mood, drankJson, sleptJson, ateJson, medicineJson,
        activities, pottyJson, suppliesJson, teacherRemarks,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
      payload.medicineJson,
      payload.activities,
      payload.pottyJson,
      payload.suppliesJson,
      payload.teacherRemarks,
      approval.approvalStatus,
      approval.rejectionReason,
      approval.submittedAt,
      approval.reviewedAt,
      approval.reviewedBy,
    );
  }

  const result = submitDiaryForApproval(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  res.json({ entryDate: access.entryDate, diary: result.diary });
});

router.post("/students/:id/diary/withdraw", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const result = withdrawDiarySubmission(studentId, access.entryDate, req.teacherUser.id);
  if (result?.error) return res.status(result.status).json({ error: result.error });
  res.json({ entryDate: access.entryDate, diary: result.diary });
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
    channel: "school_admin_edit",
    actorRole: "school_admin",
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
    if (isGalleryLockedForTeacher(studentId, access.entryDate, req.teacherUser.id)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Tap Edit to add more photos." });
    }

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
    res.status(201).json({ photo });
  } catch (error) {
    console.error("Gallery upload error:", error);
    res.status(500).json({ error: "Failed to upload photo." });
  }
});

router.delete("/gallery/:id", requireTeacher, (req, res) => {
  const photoId = parseInt(req.params.id, 10);
  const photo = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(photoId);
  if (!photo) return res.status(404).json({ error: "Photo not found." });
  if (photo.entryDate !== todayEntryDate()) {
    return res.status(400).json({ error: "Only today's photos can be removed." });
  }

  const access = assertTeacherStudentAccess(req.teacherUser, photo.studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  if (photo.approvalStatus === "approved") {
    return res.status(400).json({ error: "Published photos cannot be removed." });
  }
  if (!["draft", "rejected"].includes(photo.approvalStatus)) {
    return res.status(400).json({ error: "Submitted photos cannot be removed." });
  }

  const abs = path.join(uploadsRoot, photo.filePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  db.prepare(`DELETE FROM gallery_photos WHERE id = ?`).run(photoId);
  res.json({ success: true });
});

router.post("/students/:id/gallery/submit", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const result = submitGalleryForApproval(studentId, access.entryDate, req.teacherUser.id);
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
