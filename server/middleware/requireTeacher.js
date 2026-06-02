import { db } from "../db.js";

/** Requires X-User-Id header from a logged-in teacher account. */
export function requireTeacher(req, res, next) {
  const raw = req.headers["x-user-id"];
  const userId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(401).json({ error: "Sign in required." });
  }

  const user = db
    .prepare(
      `SELECT id, role, status, classGroupId, email, name, teacherScope, canEditPublishedContent
       FROM users WHERE id = ?`,
    )
    .get(userId);

  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }
  if (user.role !== "teacher") {
    return res.status(403).json({ error: "Teacher access required." });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended. Please contact the school." });
  }
  const schoolScope = user.teacherScope === "school";
  if (!schoolScope && !user.classGroupId) {
    return res.status(403).json({ error: "Your account is not assigned to a class. Please contact the school." });
  }

  req.teacherUser = {
    ...user,
    canEditPublishedContent: !!user.canEditPublishedContent,
  };
  next();
}
