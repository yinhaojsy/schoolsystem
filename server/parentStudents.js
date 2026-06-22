import { db } from "./db.js";

export function parseStudentIds(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((v) => parseInt(String(v), 10))
    .filter((id) => !Number.isNaN(id));
  return [...new Set(ids)];
}

export function getParentStudentIds(parentId) {
  return db
    .prepare(
      `SELECT ps.studentId
       FROM parent_students ps
       JOIN students s ON s.id = ps.studentId
       WHERE ps.parentId = ? AND s.status = 'active'
       ORDER BY s.name ASC`,
    )
    .all(parentId)
    .map((r) => r.studentId);
}

export function getParentStudentSummaries(parentId) {
  return db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, cg.name as classGroupName
       FROM parent_students ps
       JOIN students s ON s.id = ps.studentId
       LEFT JOIN class_groups cg ON cg.id = s.classGroupId
       WHERE ps.parentId = ?
       ORDER BY s.name ASC`,
    )
    .all(parentId);
}

export function parentHasStudentAccess(parentId, studentId) {
  const row = db
    .prepare(
      `SELECT ps.studentId
       FROM parent_students ps
       JOIN students s ON s.id = ps.studentId
       WHERE ps.parentId = ? AND ps.studentId = ? AND s.status = 'active'`,
    )
    .get(parentId, studentId);
  return !!row;
}

export function syncParentStudents(parentId, studentIds) {
  const uniqueIds = [...new Set(studentIds)];
  const tx = db.transaction((ids) => {
    db.prepare(`DELETE FROM parent_students WHERE parentId = ?`).run(parentId);
    const insert = db.prepare(`INSERT INTO parent_students (parentId, studentId) VALUES (?, ?)`);
    for (const studentId of ids) {
      const student = db.prepare(`SELECT id FROM students WHERE id = ?`).get(studentId);
      if (!student) throw new Error("STUDENT_NOT_FOUND");
      insert.run(parentId, studentId);
    }
  });
  tx(uniqueIds);
}

export function backfillParentStudentsFromHouseholds() {
  const parents = db
    .prepare(`SELECT id, householdId FROM users WHERE role = 'parent' AND householdId IS NOT NULL`)
    .all();
  for (const parent of parents) {
    const existing = db.prepare(`SELECT COUNT(*) as c FROM parent_students WHERE parentId = ?`).get(parent.id).c;
    if (existing > 0) continue;
    const students = db
      .prepare(`SELECT id FROM students WHERE householdId = ? AND status = 'active'`)
      .all(parent.householdId);
    if (students.length === 0) continue;
    syncParentStudents(
      parent.id,
      students.map((s) => s.id),
    );
  }
}

export function formatParentAccountRow(row) {
  const students = getParentStudentSummaries(row.id);
  return {
    ...row,
    parentDiaryAnimations: row.parentDiaryAnimations == null ? true : !!row.parentDiaryAnimations,
    studentIds: students.map((s) => s.id),
    studentNames: students.map((s) => s.name),
    linkedStudents: students,
    activeChildrenCount: students.length,
  };
}
