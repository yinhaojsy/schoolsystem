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
} from "../dailyContent.js";
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

function sanitizeDiaryPayload(body) {
  const mood = typeof body.mood === "string" ? body.mood.trim() : "";
  const activities = typeof body.activities === "string" ? body.activities.trim() : "";
  const teacherRemarks = typeof body.teacherRemarks === "string" ? body.teacherRemarks.trim() : "";
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    mood: mood || null,
    drankJson: JSON.stringify(arr(body.drank)),
    sleptJson: JSON.stringify(arr(body.slept)),
    ateJson: JSON.stringify(arr(body.ate)),
    activities: activities || null,
    pottyJson: JSON.stringify(arr(body.potty)),
    suppliesJson: JSON.stringify(arr(body.supplies)),
    teacherRemarks: teacherRemarks || null,
  };
}

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
  if (!user.classGroupId) {
    return res.status(403).json({ error: "Your account is not assigned to a class yet." });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const { password: _p, invitePassword: _i, ...safe } = user;
  const classGroup = db.prepare(`SELECT name FROM class_groups WHERE id = ?`).get(user.classGroupId);
  res.json({ user: { ...safe, classGroupName: classGroup?.name ?? null } });
});

router.get("/me", requireTeacher, (req, res) => {
  const user = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.classGroupId, u.createdAt, cg.name as classGroupName
       FROM users u LEFT JOIN class_groups cg ON cg.id = u.classGroupId WHERE u.id = ?`,
    )
    .get(req.teacherUser.id);
  res.json(user);
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

// ==================== CLASS ROSTER (TODAY) ====================
router.get("/students", requireTeacher, (req, res) => {
  const entryDate = todayEntryDate();
  const students = db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, s.profilePhotoPath, s.programType, cg.name as classGroupName
       FROM students s
       LEFT JOIN class_groups cg ON cg.id = s.classGroupId
       WHERE s.classGroupId = ? AND s.status = 'active' AND s.programType = 'daycare'
       ORDER BY s.name ASC`,
    )
    .all(req.teacherUser.classGroupId);

  const result = students.map((s) => {
    const summary = studentSummaryForTeacher(s.id, entryDate);
    return {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      classGroupName: s.classGroupName,
      profilePhotoUrl: publicUploadUrl(s.profilePhotoPath),
      today: entryDate,
      ...summary,
    };
  });

  res.json({ entryDate, students: result });
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

  const payload = sanitizeDiaryPayload(req.body);
  const existing = db
    .prepare(`SELECT id FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, access.entryDate);

  if (existing) {
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, drankJson = ?, sleptJson = ?, ateJson = ?, activities = ?,
        pottyJson = ?, suppliesJson = ?, teacherRemarks = ?, teacherId = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
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
        studentId, entryDate, teacherId, mood, drankJson, sleptJson, ateJson,
        activities, pottyJson, suppliesJson, teacherRemarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      studentId,
      access.entryDate,
      req.teacherUser.id,
      payload.mood,
      payload.drankJson,
      payload.sleptJson,
      payload.ateJson,
      payload.activities,
      payload.pottyJson,
      payload.suppliesJson,
      payload.teacherRemarks,
    );
  }

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
    notices: getNoticesForStudent(studentId, access.entryDate),
  });
});

router.post("/students/:id/notices", requireTeacher, (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const access = assertTeacherStudentAccess(req.teacherUser, studentId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Notice message is required." });

  const result = db
    .prepare(
      `INSERT INTO parent_notices (studentId, entryDate, teacherId, message) VALUES (?, ?, ?, ?)`,
    )
    .run(studentId, access.entryDate, req.teacherUser.id, message);

  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ notice });
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

  db.prepare(`DELETE FROM parent_notices WHERE id = ?`).run(noticeId);
  res.json({ success: true });
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
    const result = db
      .prepare(
        `INSERT INTO gallery_photos (studentId, entryDate, teacherId, filePath, caption) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(studentId, access.entryDate, req.teacherUser.id, relPath, caption);

    const photo = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ photo: { ...photo, url: publicUploadUrl(photo.filePath) } });
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

  const abs = path.join(uploadsRoot, photo.filePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  db.prepare(`DELETE FROM gallery_photos WHERE id = ?`).run(photoId);
  res.json({ success: true });
});

export default router;
