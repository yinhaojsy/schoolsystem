import { db } from "../db.js";
import { getParentStudentIds } from "../parentStudents.js";

/** Requires X-User-Id header from a logged-in parent account. */
export function requireParent(req, res, next) {
  const raw = req.headers["x-user-id"];
  const userId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(401).json({ error: "Sign in required." });
  }

  const user = db
    .prepare(`SELECT id, role, status, householdId, email, name FROM users WHERE id = ?`)
    .get(userId);

  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }
  if (user.role !== "parent") {
    return res.status(403).json({ error: "Parent access required." });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended. Please contact the school." });
  }

  const studentIds = getParentStudentIds(user.id);
  if (studentIds.length === 0) {
    return res.status(403).json({ error: "Your account is not linked to any children. Please contact the school." });
  }

  req.parentUser = user;
  req.parentStudentIds = studentIds;
  next();
}
