import { db } from "../db.js";

/** Requires X-User-Id header for any authenticated user. */
export function requireAuth(req, res, next) {
  const raw = req.headers["x-user-id"];
  const userId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(401).json({ error: "Sign in required." });
  }

  const user = db.prepare(`SELECT id, role, status, email, name FROM users WHERE id = ?`).get(userId);
  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Your account has been suspended." });
  }

  req.authUser = user;
  next();
}
