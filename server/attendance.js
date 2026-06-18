import { db } from "./db.js";
import { todayEntryDate } from "./utils/schoolDate.js";

export function getAttendanceStatus(studentId, entryDate = todayEntryDate()) {
  const row = db
    .prepare(`SELECT status FROM student_attendance WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  return row?.status ?? null;
}

export function isStudentAbsent(studentId, entryDate = todayEntryDate()) {
  return getAttendanceStatus(studentId, entryDate) === "absent";
}

export function assertStudentNotAbsent(studentId, entryDate = todayEntryDate()) {
  if (isStudentAbsent(studentId, entryDate)) {
    return { error: "This student is marked absent today.", status: 403 };
  }
  return null;
}

export function setStudentAttendance(studentId, entryDate, status, markedBy) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate) {
    return { error: "Invalid attendance request.", status: 400 };
  }
  if (!["present", "absent"].includes(status)) {
    return { error: "Invalid attendance status.", status: 400 };
  }

  if (status === "present") {
    db.prepare(
      `INSERT INTO student_attendance (studentId, entryDate, status, markedBy)
       VALUES (?, ?, 'present', ?)
       ON CONFLICT(studentId, entryDate) DO UPDATE SET
         status = 'present',
         markedBy = excluded.markedBy,
         markedAt = CURRENT_TIMESTAMP`,
    ).run(sid, entryDate, markedBy);
    return { success: true, studentId: sid, entryDate, status: "present" };
  }

  db.prepare(
    `INSERT INTO student_attendance (studentId, entryDate, status, markedBy)
     VALUES (?, ?, 'absent', ?)
     ON CONFLICT(studentId, entryDate) DO UPDATE SET
       status = 'absent',
       markedBy = excluded.markedBy,
       markedAt = CURRENT_TIMESTAMP`,
  ).run(sid, entryDate, markedBy);

  return { success: true, studentId: sid, entryDate, status: "absent" };
}

export function bulkSetAttendance(studentIds, entryDate, status, markedBy) {
  const ids = (Array.isArray(studentIds) ? studentIds : [])
    .map((id) => parseInt(id, 10))
    .filter((id) => !Number.isNaN(id));
  if (!ids.length) {
    return { error: "Select at least one student.", status: 400 };
  }
  if (!entryDate) {
    return { error: "Invalid date.", status: 400 };
  }

  const run = db.transaction(() => {
    for (const sid of ids) {
      setStudentAttendance(sid, entryDate, status, markedBy);
    }
  });
  run();
  return { success: true, count: ids.length, entryDate, status };
}

export function listAttendanceSheet({ classGroupId, year, month }) {
  const cgId = parseInt(classGroupId, 10);
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(cgId) || Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) {
    return { error: "Invalid class, year, or month.", status: 400 };
  }

  const classGroup = db.prepare(`SELECT id, name FROM class_groups WHERE id = ?`).get(cgId);
  if (!classGroup) return { error: "Class not found.", status: 404 };

  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStr = String(m).padStart(2, "0");
  const startDate = `${y}-${monthStr}-01`;
  const endDate = `${y}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const students = db
    .prepare(
      `SELECT id, name, rollNo FROM students
       WHERE status = 'active' AND COALESCE(enrollmentStatus, 'enrolled') = 'enrolled' AND classGroupId = ?
       ORDER BY rollNo ASC, name ASC`,
    )
    .all(cgId);

  const attendanceRows = db
    .prepare(
      `SELECT a.studentId, a.entryDate, a.status
       FROM student_attendance a
       INNER JOIN students s ON s.id = a.studentId
       WHERE s.classGroupId = ? AND s.status = 'active'
         AND a.entryDate >= ? AND a.entryDate <= ?`,
    )
    .all(cgId, startDate, endDate);

  const marksByStudent = new Map();
  for (const row of attendanceRows) {
    const day = parseInt(String(row.entryDate).slice(8, 10), 10);
    if (!marksByStudent.has(row.studentId)) marksByStudent.set(row.studentId, new Map());
    marksByStudent.get(row.studentId).set(day, row.status === "absent" ? "A" : "P");
  }

  return {
    year: y,
    month: m,
    daysInMonth,
    classGroupId: cgId,
    classGroupName: classGroup.name,
    students: students.map((s) => {
      const studentMarks = marksByStudent.get(s.id) ?? new Map();
      const days = {};
      for (let d = 1; d <= daysInMonth; d += 1) {
        days[d] = studentMarks.get(d) ?? null;
      }
      return { id: s.id, rollNo: s.rollNo, name: s.name, days };
    }),
  };
}
