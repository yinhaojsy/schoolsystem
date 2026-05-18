import { db } from "../db.js";

/** Requires X-User-Id header (set by frontend from logged-in user). */
export function requireAdmin(req, res, next) {
  const raw = req.headers["x-user-id"];
  const userId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(401).json({ error: "Sign in required." });
  }

  const user = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(userId);
  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  req.adminUser = user;
  next();
}
