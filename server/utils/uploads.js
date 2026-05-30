import path from "path";
import { dataDir } from "../db.js";

export const uploadsRoot = path.join(dataDir, "uploads");

export function publicUploadUrl(relativePath) {
  if (!relativePath) return null;
  return `/api/uploads/${String(relativePath).replace(/\\/g, "/")}`;
}

export function relativeUploadPath(absolutePath) {
  return path.relative(uploadsRoot, absolutePath).replace(/\\/g, "/");
}
