import { db } from "./db.js";
import { notifyContentLiveUpdate } from "./contentLive.js";
import { todayEntryDate } from "./utils/schoolDate.js";

export const DIARY_EVENT_TYPES = ["drank", "slept", "ate", "medicine", "potty", "fun", "remarks"];

function parseJsonArray(raw, fallback = []) {
  if (raw == null || raw === "") return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function parsePayload(raw) {
  if (raw == null || raw === "") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function parseTimeMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function computeSleepDuration(from, to) {
  const fromMinutes = parseTimeMinutes(from);
  const toMinutes = parseTimeMinutes(to);
  if (fromMinutes === null || toMinutes === null) return "";
  let diff = toMinutes - fromMinutes;
  if (diff <= 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return `${mins} min${mins === 1 ? "" : "s"}`;
  if (mins === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr${hours === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
}

function eventHasContent(eventType, payload) {
  if (!payload || typeof payload !== "object") return false;
  switch (eventType) {
    case "drank":
      return !!(
        String(payload.what || "").trim() ||
        String(payload.when || "").trim() ||
        String(payload.amount || "").trim()
      );
    case "slept":
      return !!(
        String(payload.from || payload.when || "").trim() ||
        String(payload.to || "").trim() ||
        String(payload.duration || "").trim()
      );
    case "ate":
      return !!(String(payload.what || "").trim() || String(payload.when || "").trim() || payload.rating);
    case "medicine":
      return !!(
        String(payload.what || "").trim() ||
        String(payload.when || "").trim() ||
        String(payload.notes || "").trim()
      );
    case "potty":
      return !!String(payload.when || "").trim();
    case "fun":
    case "remarks":
      return !!String(payload.text || "").trim();
    default:
      return false;
  }
}

export function sanitizeDiaryEventPayload(eventType, body) {
  if (!DIARY_EVENT_TYPES.includes(eventType)) return null;
  const payload = body && typeof body === "object" ? body : {};
  switch (eventType) {
    case "drank":
      return {
        what: String(payload.what ?? "").trim(),
        when: String(payload.when ?? "").trim(),
        amount: String(payload.amount ?? "").trim(),
      };
    case "slept": {
      const from = String(payload.from ?? payload.when ?? "").trim();
      const to = String(payload.to ?? "").trim();
      const duration = from && to ? computeSleepDuration(from, to) : String(payload.duration ?? "").trim();
      return { from, to, duration };
    }
    case "ate":
      return {
        what: String(payload.what ?? "").trim(),
        when: String(payload.when ?? "").trim(),
        rating: String(payload.rating ?? "").trim(),
      };
    case "medicine":
      return {
        what: String(payload.what ?? "").trim(),
        when: String(payload.when ?? "").trim(),
        notes: String(payload.notes ?? "").trim(),
      };
    case "potty": {
      const pottyType = String(payload.type ?? "").trim();
      return {
        type: pottyType === "poo" || pottyType === "pee" ? pottyType : "wet",
        when: String(payload.when ?? "").trim(),
      };
    }
    case "fun":
    case "remarks":
      return { text: String(payload.text ?? "").trim() };
    default:
      return null;
  }
}

export function mapDiaryEventRow(row) {
  if (!row) return null;
  const payload = parsePayload(row.payloadJson);
  return {
    id: row.id,
    studentId: row.studentId,
    entryDate: row.entryDate,
    teacherId: row.teacherId,
    eventType: row.eventType,
    ...payload,
    approvalStatus: row.approvalStatus ?? "approved",
    rejectionReason: row.rejectionReason ?? null,
    submittedAt: row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    adminCorrectedAt: row.adminCorrectedAt ?? null,
    adminCorrectedBy: row.adminCorrectedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getDiaryEventsForStudent(studentId, entryDate = todayEntryDate(), { approvedOnly = false } = {}) {
  const statusClause = approvedOnly ? ` AND approvalStatus = 'approved'` : "";
  return db
    .prepare(
      `SELECT * FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ?${statusClause}
       ORDER BY id ASC`,
    )
    .all(studentId, entryDate)
    .map(mapDiaryEventRow);
}

export function stripEventMeta(event) {
  if (!event) return event;
  const { id, studentId, entryDate, teacherId, eventType, approvalStatus, rejectionReason, submittedAt, reviewedAt, adminCorrectedAt, adminCorrectedBy, createdAt, updatedAt, ...payload } = event;
  return payload;
}

export function groupEventsToArrays(events, { forParent = false } = {}) {
  const result = {
    drank: [],
    slept: [],
    ate: [],
    medicine: [],
    potty: [],
    fun: [],
    remarks: [],
  };
  for (const event of events) {
    if (!DIARY_EVENT_TYPES.includes(event.eventType)) continue;
    const payload = stripEventMeta(event);
    if (forParent) {
      result[event.eventType].push(payload);
    } else {
      result[event.eventType].push({
        ...payload,
        id: event.id,
        approvalStatus: event.approvalStatus,
        rejectionReason: event.rejectionReason ?? null,
      });
    }
  }
  return result;
}

export function syncDiaryEventsFromPayload(studentId, entryDate, teacherId, body, approvalDefaults, options = {}) {
  const allowEditPublished = !!options.allowEditPublished;
  const submitEditsForApproval = !!options.submitEditsForApproval;
  let editsSubmittedForApproval = 0;
  const existing = getDiaryEventsForStudent(studentId, entryDate);
  const updatableIds = new Set(
    existing
      .filter(
        (e) =>
          e.approvalStatus === "draft" ||
          e.approvalStatus === "rejected" ||
          (allowEditPublished && e.approvalStatus === "approved"),
      )
      .map((e) => e.id),
  );
  const deletableIds = new Set(
    existing
      .filter((e) => e.approvalStatus === "draft" || e.approvalStatus === "rejected")
      .map((e) => e.id),
  );
  const incomingIds = new Set();

  const insertStmt = db.prepare(
    `INSERT INTO daycare_diary_events (
      studentId, entryDate, teacherId, eventType, payloadJson,
      approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const updateStmt = db.prepare(
    `UPDATE daycare_diary_events SET
      payloadJson = ?, teacherId = ?, approvalStatus = ?, rejectionReason = ?,
      submittedAt = ?, reviewedAt = ?, reviewedBy = ?,
      adminCorrectedAt = NULL, adminCorrectedBy = NULL,
      updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  );

  const deleteStmt = db.prepare(`DELETE FROM daycare_diary_events WHERE id = ?`);

  for (const eventType of DIARY_EVENT_TYPES) {
    const rows = Array.isArray(body[eventType]) ? body[eventType] : [];
    for (const row of rows) {
      const payload = sanitizeDiaryEventPayload(eventType, row);
      if (!payload || !eventHasContent(eventType, payload)) continue;

      const rowId = row?.id != null ? parseInt(String(row.id), 10) : NaN;
      if (!Number.isNaN(rowId) && updatableIds.has(rowId)) {
        incomingIds.add(rowId);
        const existingRow = existing.find((e) => e.id === rowId);
        const keepApproved =
          existingRow?.approvalStatus === "approved" && allowEditPublished && !submitEditsForApproval;
        const resubmitForApproval =
          existingRow?.approvalStatus === "approved" && allowEditPublished && submitEditsForApproval;
        const approval = keepApproved
          ? {
              approvalStatus: "approved",
              rejectionReason: null,
              submittedAt: existingRow.submittedAt ?? approvalDefaults.submittedAt,
              reviewedAt: existingRow.reviewedAt ?? approvalDefaults.reviewedAt,
              reviewedBy: existingRow.reviewedBy ?? approvalDefaults.reviewedBy,
            }
          : resubmitForApproval
            ? {
                approvalStatus: "pending",
                rejectionReason: null,
                submittedAt: new Date().toISOString(),
                reviewedAt: null,
                reviewedBy: null,
              }
            : approvalDefaults;
        if (resubmitForApproval) editsSubmittedForApproval += 1;
        updateStmt.run(
          JSON.stringify(payload),
          teacherId,
          approval.approvalStatus,
          approval.rejectionReason,
          approval.submittedAt,
          approval.reviewedAt,
          approval.reviewedBy,
          rowId,
        );
      } else if (Number.isNaN(rowId) || !existing.some((e) => e.id === rowId)) {
        insertStmt.run(
          studentId,
          entryDate,
          teacherId,
          eventType,
          JSON.stringify(payload),
          approvalDefaults.approvalStatus,
          approvalDefaults.rejectionReason,
          approvalDefaults.submittedAt,
          approvalDefaults.reviewedAt,
          approvalDefaults.reviewedBy,
        );
      }
    }
  }

  for (const id of deletableIds) {
    if (!incomingIds.has(id)) {
      deleteStmt.run(id);
    }
  }

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "diary_events" });
  return { editsSubmittedForApproval };
}

export function publishDiaryEvents(studentId, entryDate) {
  const drafts = db
    .prepare(
      `SELECT id FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus IN ('draft', 'rejected')`,
    )
    .all(studentId, entryDate);

  if (drafts.length === 0) {
    return { error: "Add at least one activity before submitting.", status: 400 };
  }

  const now = new Date().toISOString();
  for (const { id } of drafts) {
    db.prepare(
      `UPDATE daycare_diary_events SET approvalStatus = 'approved', submittedAt = ?, rejectionReason = NULL,
       reviewedAt = ?, reviewedBy = NULL, adminCorrectedAt = NULL, adminCorrectedBy = NULL,
       updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(now, now, id);
  }

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "diary_events" });
  return { success: true, submittedCount: drafts.length };
}

export function submitDiaryEventsForApproval(studentId, entryDate, teacherId) {
  const drafts = db
    .prepare(
      `SELECT id FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus IN ('draft', 'rejected')`,
    )
    .all(studentId, entryDate);

  if (drafts.length === 0) {
    return { error: "Add at least one activity before submitting.", status: 400 };
  }

  const pending = db
    .prepare(
      `SELECT id FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(studentId, entryDate);
  if (pending.length > 0) {
    return { error: "Activities are already submitted for approval.", status: 400 };
  }

  for (const { id } of drafts) {
    db.prepare(
      `UPDATE daycare_diary_events SET approvalStatus = 'pending', submittedAt = CURRENT_TIMESTAMP,
       rejectionReason = NULL, reviewedAt = NULL, reviewedBy = NULL,
       adminCorrectedAt = NULL, adminCorrectedBy = NULL, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(id);
  }

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "diary_events" });
  return { success: true, submittedCount: drafts.length };
}

export function withdrawDiaryEventsSubmission(studentId, entryDate) {
  const pending = db
    .prepare(
      `SELECT id FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(studentId, entryDate);

  if (pending.length === 0) {
    return { error: "No pending activities to withdraw.", status: 400 };
  }

  for (const { id } of pending) {
    db.prepare(
      `UPDATE daycare_diary_events SET approvalStatus = 'draft', submittedAt = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(id);
  }

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "diary_events" });
  return { success: true, withdrawnCount: pending.length };
}

export function approveDiaryEventsGroup(studentId, entryDate, adminId) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };

  const events = db
    .prepare(
      `SELECT id FROM daycare_diary_events WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (events.length === 0) return { error: "No pending activities in this group.", status: 404 };

  for (const { id } of events) {
    db.prepare(
      `UPDATE daycare_diary_events SET approvalStatus = 'approved', rejectionReason = NULL,
       reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
    ).run(adminId, id);
  }

  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "diary_events" });
  return { success: true, approvedCount: events.length, studentId: sid, entryDate };
}

export function rejectDiaryEventsGroup(studentId, entryDate, adminId, rejectionReason) {
  const sid = parseInt(studentId, 10);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };
  if (!reason) return { error: "Rejection reason is required.", status: 400 };

  const events = db
    .prepare(
      `SELECT id FROM daycare_diary_events WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (events.length === 0) return { error: "No pending activities in this group.", status: 404 };

  for (const { id } of events) {
    db.prepare(
      `UPDATE daycare_diary_events SET approvalStatus = 'rejected', rejectionReason = ?,
       reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
    ).run(reason, adminId, id);
  }

  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "diary_events" });
  return { success: true, rejectedCount: events.length, studentId: sid, entryDate };
}

export function deletePendingDiaryEvent(eventId) {
  const id = parseInt(eventId, 10);
  if (Number.isNaN(id)) return null;

  const row = db.prepare(`SELECT * FROM daycare_diary_events WHERE id = ?`).get(id);
  if (!row) return null;
  if (row.approvalStatus !== "pending") {
    return { error: "Only pending activities can be removed.", status: 400 };
  }

  db.prepare(`DELETE FROM daycare_diary_events WHERE id = ?`).run(id);
  notifyContentLiveUpdate({ studentId: row.studentId, entryDate: row.entryDate, contentType: "diary_events" });
  return { success: true, studentId: row.studentId, entryDate: row.entryDate };
}

export function deletePublishedDiaryEvent(eventId) {
  const id = parseInt(eventId, 10);
  if (Number.isNaN(id)) return null;

  const row = db.prepare(`SELECT * FROM daycare_diary_events WHERE id = ?`).get(id);
  if (!row) return null;
  if (row.approvalStatus !== "approved") {
    return { error: "Only published activities can be removed.", status: 400 };
  }

  db.prepare(`DELETE FROM daycare_diary_events WHERE id = ?`).run(id);
  notifyContentLiveUpdate({ studentId: row.studentId, entryDate: row.entryDate, contentType: "diary_events" });
  return { success: true, studentId: row.studentId, entryDate: row.entryDate };
}

export function migrateDiaryJsonToEvents() {
  const entries = db.prepare(`SELECT * FROM daycare_diary_entries`).all();
  for (const entry of entries) {
    const existingCount = db
      .prepare(`SELECT COUNT(*) AS c FROM daycare_diary_events WHERE studentId = ? AND entryDate = ?`)
      .get(entry.studentId, entry.entryDate)?.c;
    if (existingCount > 0) continue;

    const status = entry.approvalStatus ?? "approved";
    const insert = db.prepare(
      `INSERT INTO daycare_diary_events (
        studentId, entryDate, teacherId, eventType, payloadJson,
        approvalStatus, submittedAt, reviewedAt, reviewedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const types = [
      ["drank", entry.drankJson],
      ["slept", entry.sleptJson],
      ["ate", entry.ateJson],
      ["medicine", entry.medicineJson],
      ["potty", entry.pottyJson],
    ];

    for (const [eventType, json] of types) {
      const arr = parseJsonArray(json);
      for (const item of arr) {
        const payload = sanitizeDiaryEventPayload(eventType, item);
        if (!payload || !eventHasContent(eventType, payload)) continue;
        insert.run(
          entry.studentId,
          entry.entryDate,
          entry.teacherId,
          eventType,
          JSON.stringify(payload),
          status,
          entry.submittedAt,
          entry.reviewedAt,
          entry.reviewedBy,
          entry.createdAt,
          entry.updatedAt,
        );
      }
    }

    db.prepare(
      `UPDATE daycare_diary_entries SET
        drankJson = '[]', sleptJson = '[]', ateJson = '[]', medicineJson = '[]', pottyJson = '[]',
        updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(entry.id);
  }
}

export function expandDiaryEventTypes() {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daycare_diary_events'`).get();
  if (!row?.sql || row.sql.includes("'fun'")) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE daycare_diary_events_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      entryDate TEXT NOT NULL,
      teacherId INTEGER NOT NULL,
      eventType TEXT NOT NULL CHECK (eventType IN ('drank', 'slept', 'ate', 'medicine', 'potty', 'fun', 'remarks')),
      payloadJson TEXT NOT NULL,
      approvalStatus TEXT NOT NULL DEFAULT 'approved',
      rejectionReason TEXT,
      submittedAt TEXT,
      reviewedAt TEXT,
      reviewedBy INTEGER REFERENCES users(id),
      adminCorrectedAt TEXT,
      adminCorrectedBy INTEGER REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(teacherId) REFERENCES users(id)
    );
    INSERT INTO daycare_diary_events_new SELECT * FROM daycare_diary_events;
    DROP TABLE daycare_diary_events;
    ALTER TABLE daycare_diary_events_new RENAME TO daycare_diary_events;
    CREATE INDEX IF NOT EXISTS idx_diary_events_student_date ON daycare_diary_events(studentId, entryDate);
    CREATE INDEX IF NOT EXISTS idx_diary_events_approval ON daycare_diary_events(approvalStatus);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export function migrateSummaryTextToEvents() {
  const entries = db
    .prepare(
      `SELECT * FROM daycare_diary_entries
       WHERE (activities IS NOT NULL AND TRIM(activities) != '')
          OR (teacherRemarks IS NOT NULL AND TRIM(teacherRemarks) != '')`,
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO daycare_diary_events (
      studentId, entryDate, teacherId, eventType, payloadJson,
      approvalStatus, submittedAt, reviewedAt, reviewedBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const entry of entries) {
    const status = entry.approvalStatus ?? "approved";
    const activities = (entry.activities ?? "").trim();
    const remarks = (entry.teacherRemarks ?? "").trim();

    if (activities) {
      const hasFun = db
        .prepare(
          `SELECT COUNT(*) AS c FROM daycare_diary_events
           WHERE studentId = ? AND entryDate = ? AND eventType = 'fun'`,
        )
        .get(entry.studentId, entry.entryDate)?.c;
      if (!hasFun) {
        insert.run(
          entry.studentId,
          entry.entryDate,
          entry.teacherId,
          "fun",
          JSON.stringify({ text: activities }),
          status,
          entry.submittedAt,
          entry.reviewedAt,
          entry.reviewedBy,
          entry.createdAt,
          entry.updatedAt,
        );
      }
    }

    if (remarks) {
      const hasRemarks = db
        .prepare(
          `SELECT COUNT(*) AS c FROM daycare_diary_events
           WHERE studentId = ? AND entryDate = ? AND eventType = 'remarks'`,
        )
        .get(entry.studentId, entry.entryDate)?.c;
      if (!hasRemarks) {
        insert.run(
          entry.studentId,
          entry.entryDate,
          entry.teacherId,
          "remarks",
          JSON.stringify({ text: remarks }),
          status,
          entry.submittedAt,
          entry.reviewedAt,
          entry.reviewedBy,
          entry.createdAt,
          entry.updatedAt,
        );
      }
    }

    db.prepare(
      `UPDATE daycare_diary_entries SET activities = NULL, teacherRemarks = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(entry.id);
  }
}
