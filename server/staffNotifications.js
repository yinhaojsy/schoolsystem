import crypto from "node:crypto";
import { db } from "./db.js";
import { getParentStudentIds } from "./parentStudents.js";

/** @type {Set<{ res: import('express').Response; userId: number; role: 'admin' | 'teacher' | 'parent'; studentIds?: number[]; classGroupId?: number | null; schoolScope?: boolean }>} */
const sseClients = new Set();

/** @type {Map<string, { userId: number; role: string; expiresAt: number }>} */
const streamTokens = new Map();

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createStreamToken(userId, role = "admin") {
  const token = crypto.randomBytes(32).toString("hex");
  streamTokens.set(token, { userId, role, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function validateStreamToken(token) {
  if (!token) return null;
  const entry = streamTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    streamTokens.delete(token);
    return null;
  }
  return entry;
}

export function addSseClient(res, meta) {
  sseClients.add({
    res,
    userId: meta.userId,
    role: meta.role,
    studentIds: meta.studentIds,
    classGroupId: meta.classGroupId ?? null,
    schoolScope: !!meta.schoolScope,
  });
}

export function removeSseClient(res) {
  for (const client of sseClients) {
    if (client.res === res) {
      sseClients.delete(client);
      break;
    }
  }
}

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function clientShouldReceiveContent(client, studentId) {
  if (client.role === "admin") return true;
  if (client.role === "parent") {
    return Array.isArray(client.studentIds) && client.studentIds.includes(studentId);
  }
  if (client.role === "teacher") {
    if (client.schoolScope) return true;
    const student = db.prepare(`SELECT classGroupId FROM students WHERE id = ?`).get(studentId);
    if (!student) return false;
    return client.classGroupId != null && student.classGroupId === client.classGroupId;
  }
  return false;
}

export function broadcastContentUpdated({ studentId, entryDate, contentType = "all" }) {
  const payload = {
    type: "content_updated",
    studentId,
    entryDate,
    contentType,
  };

  for (const client of sseClients) {
    if (!clientShouldReceiveContent(client, studentId)) continue;
    try {
      writeSseEvent(client.res, "content", payload);
    } catch {
      removeSseClient(client.res);
    }
  }
}

export function broadcastStaffEvent(payload) {
  for (const client of sseClients) {
    if (client.role !== "admin") continue;
    try {
      writeSseEvent(client.res, "staff", payload);
    } catch {
      removeSseClient(client.res);
    }
  }
}

export function attachSseStream(req, res, meta) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  addSseClient(res, meta);
  writeSseEvent(res, "connected", { ok: true });

  req.on("close", () => {
    removeSseClient(res);
  });
}

export function buildTeacherStreamMeta(teacherUser) {
  return {
    userId: teacherUser.id,
    role: "teacher",
    classGroupId: teacherUser.classGroupId ?? null,
    schoolScope: teacherUser.teacherScope === "school",
  };
}

export function buildParentStreamMeta(parentUser) {
  return {
    userId: parentUser.id,
    role: "parent",
    studentIds: getParentStudentIds(parentUser.id),
  };
}

export function startSseHeartbeat() {
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(": ping\n\n");
      } catch {
        removeSseClient(client.res);
      }
    }
  }, 25000);
}
