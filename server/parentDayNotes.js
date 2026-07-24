import { db } from "./db.js";
import { todayEntryDate } from "./utils/schoolDate.js";
import { publicUploadUrl } from "./utils/uploads.js";

const PREVIEW_LEN = 100;

function snippet(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (t.length <= PREVIEW_LEN) return t;
  return `${t.slice(0, PREVIEW_LEN - 1)}…`;
}

export function getNoteRow(studentId, entryDate = todayEntryDate()) {
  return db
    .prepare(`SELECT * FROM parent_day_notes WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
}

export function getMessagesForNote(noteId) {
  return db
    .prepare(
      `SELECT m.id, m.noteId, m.authorRole, m.authorId, m.body, m.createdAt, u.name as authorName
       FROM parent_day_note_messages m
       LEFT JOIN users u ON u.id = m.authorId
       WHERE m.noteId = ?
       ORDER BY m.id ASC`,
    )
    .all(noteId);
}

function latestMessageByRole(messages, role) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].authorRole === role) return messages[i];
  }
  return null;
}

function firstParentMessage(messages) {
  return messages.find((m) => m.authorRole === "parent") ?? messages[0] ?? null;
}

export function isUnreadForTeacher(note, messages) {
  if (!note || !messages.length) return false;
  const latestParent = latestMessageByRole(messages, "parent");
  if (!latestParent) return false;
  if (!note.teacherReadAt) return true;
  return latestParent.createdAt > note.teacherReadAt;
}

export function isUnreadForParent(note, messages) {
  if (!note || !messages.length) return false;
  const latestTeacher = latestMessageByRole(messages, "teacher");
  if (!latestTeacher) return false;
  if (!note.parentReadAt) return true;
  return latestTeacher.createdAt > note.parentReadAt;
}

function mapStudentBrief(studentId) {
  const s = db
    .prepare(
      `SELECT id, name, rollNo, profilePhotoPath FROM students WHERE id = ?`,
    )
    .get(studentId);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    rollNo: s.rollNo,
    profilePhotoUrl: publicUploadUrl(s.profilePhotoPath),
  };
}

export function formatDayNote(note, { viewerRole } = {}) {
  if (!note) return null;
  const messages = getMessagesForNote(note.id);
  const student = mapStudentBrief(note.studentId);
  const first = firstParentMessage(messages);
  const unread =
    viewerRole === "teacher"
      ? isUnreadForTeacher(note, messages)
      : viewerRole === "parent"
        ? isUnreadForParent(note, messages)
        : false;

  return {
    id: note.id,
    studentId: note.studentId,
    entryDate: note.entryDate,
    student,
    preview: snippet(first?.body ?? ""),
    messages: messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole,
      authorId: m.authorId,
      authorName: m.authorName || (m.authorRole === "teacher" ? "Teacher" : "Parent"),
      body: m.body,
      createdAt: m.createdAt,
    })),
    unread,
    messageCount: messages.length,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
  };
}

export function getDayNoteForStudent(studentId, entryDate = todayEntryDate(), { viewerRole } = {}) {
  const note = getNoteRow(studentId, entryDate);
  if (!note) return null;
  return formatDayNote(note, { viewerRole });
}

export function hasParentDayNote(studentId, entryDate = todayEntryDate()) {
  return !!getNoteRow(studentId, entryDate);
}

export function parentDayNoteUnreadForTeacher(studentId, entryDate = todayEntryDate()) {
  const note = getNoteRow(studentId, entryDate);
  if (!note) return false;
  return isUnreadForTeacher(note, getMessagesForNote(note.id));
}

export function parentDayNoteUnreadForParent(studentId, entryDate = todayEntryDate()) {
  const note = getNoteRow(studentId, entryDate);
  if (!note) return false;
  return isUnreadForParent(note, getMessagesForNote(note.id));
}

export function listDayNotesForTeacher(teacher, entryDate = todayEntryDate()) {
  const notes =
    teacher?.teacherScope === "school"
      ? db
          .prepare(
            `SELECT n.*
           FROM parent_day_notes n
           JOIN students s ON s.id = n.studentId
           WHERE n.entryDate = ?
             AND s.status = 'active'
             AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'
           ORDER BY n.updatedAt DESC, n.id DESC`,
          )
          .all(entryDate)
      : db
          .prepare(
            `SELECT n.*
           FROM parent_day_notes n
           JOIN students s ON s.id = n.studentId
           WHERE n.entryDate = ?
             AND s.classGroupId = ?
             AND s.status = 'active'
             AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'
           ORDER BY n.updatedAt DESC, n.id DESC`,
          )
          .all(entryDate, teacher.classGroupId);

  const items = notes
    .map((n) => formatDayNote(n, { viewerRole: "teacher" }))
    .filter(Boolean);

  return {
    entryDate,
    notes: items,
    unreadCount: items.filter((n) => n.unread).length,
  };
}

export function markDayNoteRead(noteId, viewerRole) {
  if (viewerRole === "teacher") {
    db.prepare(
      `UPDATE parent_day_notes SET teacherReadAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(noteId);
  } else if (viewerRole === "parent") {
    db.prepare(
      `UPDATE parent_day_notes SET parentReadAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(noteId);
  }
}

export function postParentDayNoteMessage(studentId, parentId, body, entryDate = todayEntryDate()) {
  const text = String(body || "").trim();
  if (!text) return { error: "Message is required.", status: 400 };
  if (text.length > 2000) return { error: "Message is too long (max 2000 characters).", status: 400 };

  let note = getNoteRow(studentId, entryDate);
  if (!note) {
    const result = db
      .prepare(
        `INSERT INTO parent_day_notes (studentId, parentId, entryDate, parentReadAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(studentId, parentId, entryDate);
    note = getNoteRow(studentId, entryDate);
    if (!note) {
      // fallback if race
      note = db.prepare(`SELECT * FROM parent_day_notes WHERE id = ?`).get(result.lastInsertRowid);
    }
  }

  db.prepare(
    `INSERT INTO parent_day_note_messages (noteId, authorRole, authorId, body)
     VALUES (?, 'parent', ?, ?)`,
  ).run(note.id, parentId, text);

  db.prepare(
    `UPDATE parent_day_notes
     SET updatedAt = CURRENT_TIMESTAMP,
         parentReadAt = CURRENT_TIMESTAMP,
         teacherReadAt = NULL
     WHERE id = ?`,
  ).run(note.id);

  return { note: formatDayNote(getNoteRow(studentId, entryDate), { viewerRole: "parent" }) };
}

export function postTeacherDayNoteReply(studentId, teacherId, body, entryDate = todayEntryDate()) {
  const text = String(body || "").trim();
  if (!text) return { error: "Message is required.", status: 400 };
  if (text.length > 2000) return { error: "Message is too long (max 2000 characters).", status: 400 };

  const note = getNoteRow(studentId, entryDate);
  if (!note) {
    return { error: "No parent note for this student today.", status: 404 };
  }

  db.prepare(
    `INSERT INTO parent_day_note_messages (noteId, authorRole, authorId, body)
     VALUES (?, 'teacher', ?, ?)`,
  ).run(note.id, teacherId, text);

  db.prepare(
    `UPDATE parent_day_notes
     SET updatedAt = CURRENT_TIMESTAMP,
         teacherReadAt = CURRENT_TIMESTAMP,
         parentReadAt = NULL
     WHERE id = ?`,
  ).run(note.id);

  return { note: formatDayNote(getNoteRow(studentId, entryDate), { viewerRole: "teacher" }) };
}
