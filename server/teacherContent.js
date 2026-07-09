import { db } from "./db.js";
import fs from "fs";
import path from "path";
import { publicUploadUrl, uploadsRoot } from "./utils/uploads.js";
import { broadcastStaffEvent } from "./staffNotifications.js";
import {
  notifyContentInbox,
  notifyContentHandledInbox,
} from "./staffNotificationInbox.js";
import { notifyContentLiveUpdate } from "./contentLive.js";
import { sendPushToAllAdmins } from "./webPush.js";
import {
  mapDiaryRow,
  mapNoticeRow,
  mapGalleryRow,
  sanitizeDiarySummaryPayload,
  parseJsonArray,
  getDiaryForStudent,
  getGalleryForStudent,
  canSchoolAdminEditPublished,
  canTeacherEditPublished,
  buildDiaryView,
  diaryHasPublishedContent,
} from "./dailyContent.js";
import {
  getDiaryEventsForStudent,
  mapDiaryEventRow,
  stripEventMeta,
  approveDiaryEventsGroup,
  rejectDiaryEventsGroup,
  deletePendingDiaryEvent,
} from "./diaryEvents.js";
import { todayEntryDate } from "./utils/schoolDate.js";

export const CONTENT_TYPES = ["diary", "notices", "gallery"];

const CONTENT_LABELS = {
  diary: "Kids diary",
  diary_events: "Diary activities",
  notices: "Teacher note",
  gallery: "Photo gallery",
};

export function getTeacherContentSettings(teacherId) {
  const rows = db
    .prepare(`SELECT contentType, approvalRequired FROM teacher_content_settings WHERE teacherId = ?`)
    .all(teacherId);
  const settings = { diary: false, notices: false, gallery: false };
  for (const row of rows) {
    if (row.contentType in settings) {
      settings[row.contentType] = !!row.approvalRequired;
    }
  }
  return settings;
}

export function requiresApproval(teacherId, contentType) {
  const row = db
    .prepare(`SELECT approvalRequired FROM teacher_content_settings WHERE teacherId = ? AND contentType = ?`)
    .get(teacherId, contentType);
  return !!row?.approvalRequired;
}

export function resolveContentApprovalStatus(teacherId, contentType) {
  return requiresApproval(teacherId, contentType) ? "pending" : "approved";
}

export { canSchoolAdminEditPublished, canTeacherEditPublished } from "./dailyContent.js";

export function listAllTeachersContentSettings() {
  const teachers = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.status, u.teacherScope, u.canEditPublishedContent,
              u.classGroupId, cg.name as classGroupName
       FROM users u
       LEFT JOIN class_groups cg ON cg.id = u.classGroupId
       WHERE u.role = 'teacher'
       ORDER BY u.name ASC`,
    )
    .all();
  return teachers.map((t) => ({
    ...t,
    teacherScope: t.teacherScope ?? "class",
    canEditPublishedContent: !!t.canEditPublishedContent,
    settings: getTeacherContentSettings(t.id),
  }));
}

function publishPendingContentForTeacher(teacherId, contentType) {
  const tid = parseInt(teacherId, 10);
  if (Number.isNaN(tid)) return { publishedCount: 0 };

  const now = new Date().toISOString();
  let publishedCount = 0;

  if (contentType === "diary") {
    const summaries = db
      .prepare(`SELECT id FROM daycare_diary_entries WHERE teacherId = ? AND approvalStatus = 'pending'`)
      .all(tid);
    for (const { id } of summaries) {
      db.prepare(
        `UPDATE daycare_diary_entries SET approvalStatus = 'approved', rejectionReason = NULL,
         submittedAt = COALESCE(submittedAt, ?), reviewedAt = ?, reviewedBy = NULL,
         updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(now, now, id);
      publishedCount += 1;
    }

    const events = db
      .prepare(`SELECT id FROM daycare_diary_events WHERE teacherId = ? AND approvalStatus = 'pending'`)
      .all(tid);
    for (const { id } of events) {
      db.prepare(
        `UPDATE daycare_diary_events SET approvalStatus = 'approved', rejectionReason = NULL,
         submittedAt = COALESCE(submittedAt, ?), reviewedAt = ?, reviewedBy = NULL,
         updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(now, now, id);
      publishedCount += 1;
    }
  } else if (contentType === "notices") {
    const notices = db
      .prepare(`SELECT id FROM parent_notices WHERE teacherId = ? AND approvalStatus = 'pending'`)
      .all(tid);
    for (const { id } of notices) {
      db.prepare(
        `UPDATE parent_notices SET approvalStatus = 'approved', rejectionReason = NULL,
         submittedAt = COALESCE(submittedAt, ?), reviewedAt = ?, reviewedBy = NULL WHERE id = ?`,
      ).run(now, now, id);
      publishedCount += 1;
    }
  } else if (contentType === "gallery") {
    const photos = db
      .prepare(`SELECT id FROM gallery_photos WHERE teacherId = ? AND approvalStatus = 'pending'`)
      .all(tid);
    for (const { id } of photos) {
      db.prepare(
        `UPDATE gallery_photos SET approvalStatus = 'approved', rejectionReason = NULL,
         submittedAt = COALESCE(submittedAt, ?), reviewedAt = ?, reviewedBy = NULL WHERE id = ?`,
      ).run(now, now, id);
      publishedCount += 1;
    }
  }

  return { publishedCount };
}

export function updateTeacherContentSettings(teacherId, settings) {
  const teacher = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'teacher'`).get(teacherId);
  if (!teacher) return null;

  const previousSettings = getTeacherContentSettings(teacherId);

  const upsert = db.prepare(
    `INSERT INTO teacher_content_settings (teacherId, contentType, approvalRequired)
     VALUES (?, ?, ?)
     ON CONFLICT(teacherId, contentType) DO UPDATE SET approvalRequired = excluded.approvalRequired`,
  );

  const runUpdate = db.transaction(() => {
    for (const contentType of CONTENT_TYPES) {
      if (settings[contentType] == null) continue;
      const wasRequired = !!previousSettings[contentType];
      const nowRequired = !!settings[contentType];
      upsert.run(teacherId, contentType, nowRequired ? 1 : 0);
      if (wasRequired && !nowRequired) {
        publishPendingContentForTeacher(teacherId, contentType);
      }
    }
  });

  runUpdate();
  return getTeacherContentSettings(teacherId);
}

const pendingSubmissionSql = `
  SELECT 'diary' AS contentType, d.id AS contentId, d.studentId, d.entryDate, d.submittedAt, d.teacherId,
         s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
         d.mood AS preview, NULL AS imagePath
  FROM daycare_diary_entries d
  JOIN students s ON s.id = d.studentId
  JOIN users u ON u.id = d.teacherId
  WHERE d.approvalStatus = 'pending'
  UNION ALL
  SELECT 'notices', n.id, n.studentId, n.entryDate, n.submittedAt, n.teacherId,
         s.name, s.rollNo, u.name, n.message, NULL
  FROM parent_notices n
  JOIN students s ON s.id = n.studentId
  JOIN users u ON u.id = n.teacherId
  WHERE n.approvalStatus = 'pending'
  UNION ALL
  SELECT 'gallery', g.id, g.studentId, g.entryDate, g.submittedAt, g.teacherId,
         s.name, s.rollNo, u.name, g.caption, g.filePath
  FROM gallery_photos g
  JOIN students s ON s.id = g.studentId
  JOIN users u ON u.id = g.teacherId
  WHERE g.approvalStatus = 'pending'
`;

export function getSubmissionDetail(contentType, contentId) {
  const id = parseInt(contentId, 10);
  if (Number.isNaN(id)) return null;

  if (contentType === "diary") {
    const row = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
    if (!row) return null;
    return { type: "diary", diary: mapDiaryRow(row, [], { forParent: false }) };
  }

  if (contentType === "diary_events") {
    const event = db.prepare(`SELECT * FROM daycare_diary_events WHERE id = ?`).get(id);
    if (!event) return null;
    const mapped = mapDiaryEventRow(event);
    return {
      type: "diary_events",
      events: [{ contentId: mapped.id, eventType: mapped.eventType, ...stripEventMeta(mapped) }],
    };
  }

  if (contentType === "notices") {
    const row = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(id);
    if (!row) return null;
    return { type: "notices", notice: mapNoticeRow(row) };
  }

  if (contentType === "gallery") {
    const row = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(id);
    if (!row) return null;
    return { type: "gallery", photo: mapGalleryRow(row) };
  }

  return null;
}

export function formatContentSubmissionRow(row) {
  if (!row) return null;
  const base = {
    id: `${row.contentType}-${row.contentId}`,
    kind: "content_submission",
    contentType: row.contentType,
    contentId: row.contentId,
    studentId: row.studentId,
    studentName: row.studentName,
    studentRollNo: row.studentRollNo,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    entryDate: row.entryDate,
    submittedAt: row.submittedAt,
    approvalStatus: row.approvalStatus ?? "pending",
    rejectionReason: row.rejectionReason ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewedByName: row.reviewerName ?? null,
    preview: row.preview ?? null,
    imageUrl: row.imagePath ? publicUploadUrl(row.imagePath) : null,
    contentLabel: CONTENT_LABELS[row.contentType] ?? row.contentType,
  };
  return { ...base, detail: getSubmissionDetail(row.contentType, row.contentId) };
}

export function countPendingContentSubmissions() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
        SELECT id FROM daycare_diary_entries WHERE approvalStatus = 'pending'
        UNION ALL
        SELECT id FROM daycare_diary_events WHERE approvalStatus = 'pending'
        UNION ALL
        SELECT id FROM parent_notices WHERE approvalStatus = 'pending'
        UNION ALL
        SELECT id FROM gallery_photos WHERE approvalStatus = 'pending'
      )`,
    )
    .get();
  return row?.c ?? 0;
}

export function listPendingContentSubmissions({ page, limit = 20 } = {}) {
  const allItems = buildGroupedApprovalItems();
  return paginateApprovalItems(allItems, page, limit);
}

export function listReviewedContentSubmissions({ status, page, limit = 20 } = {}) {
  if (status !== "approved" && status !== "rejected") {
    return { items: [], total: 0, page: 1, limit: 20 };
  }
  const allItems = buildGroupedHistoryItems(status);
  return paginateApprovalItems(allItems, page, limit);
}

function paginateApprovalItems(allItems, page, limit = 20) {
  const total = allItems.length;

  if (page != null) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    return {
      items: allItems.slice(offset, offset + safeLimit),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  const previewLimit = Math.min(Math.max(limit, 1), 50);
  return { items: allItems.slice(0, previewLimit), total };
}

function buildGroupedApprovalItems() {
  const diaryRows = db
    .prepare(
      `SELECT 'diary' AS contentType, d.id AS contentId, d.studentId, d.entryDate, d.submittedAt, d.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              d.mood AS preview, NULL AS imagePath
       FROM daycare_diary_entries d
       JOIN students s ON s.id = d.studentId
       JOIN users u ON u.id = d.teacherId
       WHERE d.approvalStatus = 'pending'
       ORDER BY d.submittedAt DESC`,
    )
    .all()
    .map(formatContentSubmissionRow);

  const noticeRows = db
    .prepare(
      `SELECT n.id AS contentId, n.studentId, n.entryDate, n.submittedAt, n.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              n.message
       FROM parent_notices n
       JOIN students s ON s.id = n.studentId
       JOIN users u ON u.id = n.teacherId
       WHERE n.approvalStatus = 'pending'
       ORDER BY n.submittedAt DESC`,
    )
    .all();

  const noticeGroups = new Map();
  for (const row of noticeRows) {
    const key = `${row.studentId}-${row.entryDate}`;
    if (!noticeGroups.has(key)) {
      noticeGroups.set(key, {
        id: `notices-group-${row.studentId}-${row.entryDate}`,
        kind: "content_submission",
        contentType: "notices",
        isGroup: true,
        studentId: row.studentId,
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        entryDate: row.entryDate,
        teacherName: row.teacherName,
        submittedAt: row.submittedAt,
        contentLabel: CONTENT_LABELS.notices,
        notices: [],
      });
    }
    const group = noticeGroups.get(key);
    group.notices.push({
      contentId: row.contentId,
      message: row.message,
      submittedAt: row.submittedAt,
      teacherName: row.teacherName,
    });
    if (new Date(row.submittedAt).getTime() > new Date(group.submittedAt).getTime()) {
      group.submittedAt = row.submittedAt;
      group.teacherName = row.teacherName;
    }
  }

  const galleryRows = db
    .prepare(
      `SELECT g.id AS contentId, g.studentId, g.entryDate, g.submittedAt, g.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              g.caption, g.filePath
       FROM gallery_photos g
       JOIN students s ON s.id = g.studentId
       JOIN users u ON u.id = g.teacherId
       WHERE g.approvalStatus = 'pending'
       ORDER BY g.submittedAt DESC`,
    )
    .all();

  const galleryGroups = new Map();
  for (const row of galleryRows) {
    const key = `${row.studentId}-${row.entryDate}`;
    if (!galleryGroups.has(key)) {
      galleryGroups.set(key, {
        id: `gallery-group-${row.studentId}-${row.entryDate}`,
        kind: "content_submission",
        contentType: "gallery",
        isGroup: true,
        studentId: row.studentId,
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        entryDate: row.entryDate,
        teacherName: row.teacherName,
        submittedAt: row.submittedAt,
        contentLabel: CONTENT_LABELS.gallery,
        photos: [],
      });
    }
    const group = galleryGroups.get(key);
    group.photos.push({
      contentId: row.contentId,
      imageUrl: publicUploadUrl(row.filePath),
      caption: row.caption ?? null,
      submittedAt: row.submittedAt,
      teacherName: row.teacherName,
    });
    if (new Date(row.submittedAt).getTime() > new Date(group.submittedAt).getTime()) {
      group.submittedAt = row.submittedAt;
      group.teacherName = row.teacherName;
    }
  }

  const diaryEventRows = db
    .prepare(
      `SELECT e.id AS contentId, e.studentId, e.entryDate, e.submittedAt, e.teacherId, e.eventType, e.payloadJson,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName
       FROM daycare_diary_events e
       JOIN students s ON s.id = e.studentId
       JOIN users u ON u.id = e.teacherId
       WHERE e.approvalStatus = 'pending'
       ORDER BY e.submittedAt DESC`,
    )
    .all();

  const diaryEventGroups = new Map();
  for (const row of diaryEventRows) {
    const key = `${row.studentId}-${row.entryDate}`;
    if (!diaryEventGroups.has(key)) {
      diaryEventGroups.set(key, {
        id: `diary-events-group-${row.studentId}-${row.entryDate}`,
        kind: "content_submission",
        contentType: "diary_events",
        isGroup: true,
        studentId: row.studentId,
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        entryDate: row.entryDate,
        teacherName: row.teacherName,
        submittedAt: row.submittedAt,
        contentLabel: CONTENT_LABELS.diary_events,
        diaryEvents: [],
      });
    }
    const group = diaryEventGroups.get(key);
    const mapped = mapDiaryEventRow(row);
    group.diaryEvents.push({
      contentId: row.contentId,
      eventType: row.eventType,
      ...stripEventMeta(mapped),
      submittedAt: row.submittedAt,
      teacherName: row.teacherName,
    });
    if (new Date(row.submittedAt).getTime() > new Date(group.submittedAt).getTime()) {
      group.submittedAt = row.submittedAt;
      group.teacherName = row.teacherName;
    }
  }

  return [...diaryRows, ...diaryEventGroups.values(), ...noticeGroups.values(), ...galleryGroups.values()].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}

export function countGroupedPendingApprovals() {
  return buildGroupedApprovalItems("pending").length;
}

function captureApprovalSnapshot(contentType, contentId) {
  const submission = getContentSubmission(contentType, contentId);
  if (!submission) return null;
  return JSON.stringify({
    submittedAt: submission.submittedAt,
    preview: submission.preview ?? null,
    imageUrl: submission.imageUrl ?? null,
    detail: submission.detail ?? null,
  });
}

function insertContentApprovalHistory({
  contentType,
  contentId,
  studentId,
  entryDate,
  teacherId,
  action,
  rejectionReason,
  reviewedBy,
  snapshotJson,
}) {
  const reason = action === "rejected" && typeof rejectionReason === "string" ? rejectionReason.trim() : null;
  db.prepare(
    `INSERT INTO content_approval_history (
      contentType, contentId, studentId, entryDate, teacherId, action,
      rejectionReason, reviewedBy, snapshotJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(contentType, contentId, studentId, entryDate, teacherId ?? null, action, reason, reviewedBy, snapshotJson);
}

function parseHistorySnapshot(row) {
  try {
    return row.snapshotJson ? JSON.parse(row.snapshotJson) : null;
  } catch {
    return null;
  }
}

function getSubmissionDetailIfStillApproved(contentType, contentId) {
  const detail = getSubmissionDetail(contentType, contentId);
  if (!detail) return null;
  const status =
    detail.type === "diary"
      ? detail.diary?.approvalStatus
      : detail.type === "notices"
        ? detail.notice?.approvalStatus
        : detail.photo?.approvalStatus;
  return status === "approved" ? detail : null;
}

function formatHistorySubmissionRow(row) {
  const snapshot = parseHistorySnapshot(row);
  const liveDetail =
    row.action === "approved" ? getSubmissionDetailIfStillApproved(row.contentType, row.contentId) : null;
  const detail = liveDetail ?? snapshot?.detail ?? getSubmissionDetail(row.contentType, row.contentId);
  const submittedAt = snapshot?.submittedAt ?? row.reviewedAt;

  return {
    id: `history-${row.historyId}`,
    kind: "content_submission",
    contentType: row.contentType,
    contentId: row.contentId,
    studentId: row.studentId,
    studentName: row.studentName,
    studentRollNo: row.studentRollNo,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    entryDate: row.entryDate,
    submittedAt,
    reviewedAt: row.reviewedAt,
    reviewedByName: row.reviewerName ?? null,
    approvalStatus: row.action === "reopened" ? "rejected" : row.action,
    rejectionReason: row.rejectionReason ?? null,
    preview: snapshot?.preview ?? null,
    imageUrl: snapshot?.imageUrl ?? null,
    contentLabel: CONTENT_LABELS[row.contentType] ?? row.contentType,
    detail,
    historyId: row.historyId,
    groupKey: row.groupKey ?? null,
  };
}

function buildGroupedHistoryItems(status) {
  const actionClause =
    status === "approved" ? `h.action = 'approved'` : `h.action IN ('rejected', 'reopened')`;
  const rows = db
    .prepare(
      `SELECT h.id AS historyId, h.contentType, h.contentId, h.studentId, h.entryDate,
              h.reviewedAt, h.reviewedBy, h.rejectionReason, h.snapshotJson, h.teacherId,
              h.action,
              s.name AS studentName, s.rollNo AS studentRollNo,
              u.name AS teacherName, r.name AS reviewerName
       FROM content_approval_history h
       JOIN students s ON s.id = h.studentId
       LEFT JOIN users u ON u.id = h.teacherId
       LEFT JOIN users r ON r.id = h.reviewedBy
       WHERE ${actionClause}
       ORDER BY h.reviewedAt DESC`,
    )
    .all();

  const diaryItems = [];
  const noticeGroups = new Map();
  const galleryGroups = new Map();

  for (const row of rows) {
    const reviewedMinute = row.reviewedAt?.slice(0, 16) ?? row.reviewedAt;
    const groupKey = `${row.studentId}-${row.entryDate}-${reviewedMinute}`;

    if (row.contentType === "diary") {
      diaryItems.push(formatHistorySubmissionRow({ ...row, groupKey }));
      continue;
    }

    if (row.contentType === "notices") {
      const snapshot = parseHistorySnapshot(row);
      const liveNotice =
        row.action === "approved"
          ? db
              .prepare(`SELECT message FROM parent_notices WHERE id = ? AND approvalStatus = 'approved'`)
              .get(row.contentId)
          : null;
      const message =
        liveNotice?.message ??
        (snapshot?.detail?.type === "notices" ? snapshot.detail.notice.message : snapshot?.preview ?? "");
      if (!noticeGroups.has(groupKey)) {
        noticeGroups.set(groupKey, {
          id: `history-notices-group-${row.historyId}`,
          kind: "content_submission",
          contentType: "notices",
          isGroup: true,
          studentId: row.studentId,
          studentName: row.studentName,
          studentRollNo: row.studentRollNo,
          entryDate: row.entryDate,
          teacherName: row.teacherName,
          submittedAt: snapshot?.submittedAt ?? row.reviewedAt,
          reviewedAt: row.reviewedAt,
          reviewedByName: row.reviewerName ?? null,
          approvalStatus: row.action === "reopened" ? "rejected" : row.action,
          rejectionReason: row.rejectionReason ?? null,
          contentLabel: CONTENT_LABELS.notices,
          notices: [],
        });
      }
      const group = noticeGroups.get(groupKey);
      group.notices.push({
        contentId: row.contentId,
        message,
        submittedAt: snapshot?.submittedAt ?? row.reviewedAt,
        teacherName: row.teacherName,
      });
      continue;
    }

    if (row.contentType === "gallery") {
      const snapshot = parseHistorySnapshot(row);
      const livePhoto =
        row.action === "approved"
          ? db
              .prepare(`SELECT filePath, caption FROM gallery_photos WHERE id = ? AND approvalStatus = 'approved'`)
              .get(row.contentId)
          : null;
      const photo = snapshot?.detail?.type === "gallery" ? snapshot.detail.photo : null;
      if (!galleryGroups.has(groupKey)) {
        galleryGroups.set(groupKey, {
          id: `history-gallery-group-${row.historyId}`,
          kind: "content_submission",
          contentType: "gallery",
          isGroup: true,
          studentId: row.studentId,
          studentName: row.studentName,
          studentRollNo: row.studentRollNo,
          entryDate: row.entryDate,
          teacherName: row.teacherName,
          submittedAt: snapshot?.submittedAt ?? row.reviewedAt,
          reviewedAt: row.reviewedAt,
          reviewedByName: row.reviewerName ?? null,
          approvalStatus: row.action === "reopened" ? "rejected" : row.action,
          rejectionReason: row.rejectionReason ?? null,
          contentLabel: CONTENT_LABELS.gallery,
          photos: [],
        });
      }
      const group = galleryGroups.get(groupKey);
      group.photos.push({
        contentId: row.contentId,
        imageUrl: livePhoto ? publicUploadUrl(livePhoto.filePath) : (photo?.url ?? snapshot?.imageUrl ?? ""),
        caption: livePhoto?.caption ?? photo?.caption ?? null,
        submittedAt: snapshot?.submittedAt ?? row.reviewedAt,
        teacherName: row.teacherName,
      });
    }
  }

  return appendLiveReviewedItems(status, [
    ...diaryItems,
    ...noticeGroups.values(),
    ...galleryGroups.values(),
  ]).sort(
    (a, b) => new Date(b.reviewedAt ?? b.submittedAt).getTime() - new Date(a.reviewedAt ?? a.submittedAt).getTime(),
  );
}

function collectHistoryContentKeys(items) {
  const seenKeys = new Set();
  for (const item of items) {
    if (item.isGroup) {
      if (item.contentType === "notices" && item.notices) {
        for (const notice of item.notices) seenKeys.add(`notices-${notice.contentId}`);
      }
      if (item.contentType === "gallery" && item.photos) {
        for (const photo of item.photos) seenKeys.add(`gallery-${photo.contentId}`);
      }
      continue;
    }
    if (item.contentId != null) seenKeys.add(`${item.contentType}-${item.contentId}`);
  }
  return seenKeys;
}

function appendLiveReviewedItems(status, historyItems) {
  const seenKeys = collectHistoryContentKeys(historyItems);
  const liveItems = buildGroupedLiveReviewedItems(status, seenKeys);
  return [...historyItems, ...liveItems];
}

function buildGroupedLiveReviewedItems(status, seenKeys) {
  const approvalStatus = status === "approved" ? "approved" : "rejected";
  const reviewedFilter = ` AND d.reviewedAt IS NOT NULL`;

  const diaryRows = db
    .prepare(
      `SELECT 'diary' AS contentType, d.id AS contentId, d.studentId, d.entryDate, d.submittedAt, d.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              d.mood AS preview, NULL AS imagePath, d.approvalStatus, d.rejectionReason, d.reviewedAt,
              r.name AS reviewerName
       FROM daycare_diary_entries d
       JOIN students s ON s.id = d.studentId
       JOIN users u ON u.id = d.teacherId
       LEFT JOIN users r ON r.id = d.reviewedBy
       WHERE d.approvalStatus = ?${reviewedFilter}
       ORDER BY d.reviewedAt DESC`,
    )
    .all(approvalStatus)
    .map(formatContentSubmissionRow)
    .filter((item) => item && !seenKeys.has(`diary-${item.contentId}`));

  const noticeRows = db
    .prepare(
      `SELECT n.id AS contentId, n.studentId, n.entryDate, n.submittedAt, n.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              n.message, n.rejectionReason, n.reviewedAt, r.name AS reviewerName
       FROM parent_notices n
       JOIN students s ON s.id = n.studentId
       JOIN users u ON u.id = n.teacherId
       LEFT JOIN users r ON r.id = n.reviewedBy
       WHERE n.approvalStatus = ? AND n.reviewedAt IS NOT NULL
       ORDER BY n.reviewedAt DESC`,
    )
    .all(approvalStatus);

  const noticeGroups = new Map();
  for (const row of noticeRows) {
    if (seenKeys.has(`notices-${row.contentId}`)) continue;
    const reviewedMinute = row.reviewedAt?.slice(0, 16) ?? row.reviewedAt;
    const key = `${row.studentId}-${row.entryDate}-${reviewedMinute}`;
    if (!noticeGroups.has(key)) {
      noticeGroups.set(key, {
        id: `live-notices-group-${row.contentId}`,
        kind: "content_submission",
        contentType: "notices",
        isGroup: true,
        studentId: row.studentId,
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        entryDate: row.entryDate,
        teacherName: row.teacherName,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        reviewedByName: row.reviewerName ?? null,
        approvalStatus,
        rejectionReason: row.rejectionReason ?? null,
        contentLabel: CONTENT_LABELS.notices,
        notices: [],
      });
    }
    const group = noticeGroups.get(key);
    group.notices.push({
      contentId: row.contentId,
      message: row.message,
      submittedAt: row.submittedAt,
      teacherName: row.teacherName,
    });
  }

  const galleryRows = db
    .prepare(
      `SELECT g.id AS contentId, g.studentId, g.entryDate, g.submittedAt, g.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              g.caption, g.filePath, g.rejectionReason, g.reviewedAt, r.name AS reviewerName
       FROM gallery_photos g
       JOIN students s ON s.id = g.studentId
       JOIN users u ON u.id = g.teacherId
       LEFT JOIN users r ON r.id = g.reviewedBy
       WHERE g.approvalStatus = ? AND g.reviewedAt IS NOT NULL
       ORDER BY g.reviewedAt DESC`,
    )
    .all(approvalStatus);

  const galleryGroups = new Map();
  for (const row of galleryRows) {
    if (seenKeys.has(`gallery-${row.contentId}`)) continue;
    const reviewedMinute = row.reviewedAt?.slice(0, 16) ?? row.reviewedAt;
    const key = `${row.studentId}-${row.entryDate}-${reviewedMinute}`;
    if (!galleryGroups.has(key)) {
      galleryGroups.set(key, {
        id: `live-gallery-group-${row.contentId}`,
        kind: "content_submission",
        contentType: "gallery",
        isGroup: true,
        studentId: row.studentId,
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        entryDate: row.entryDate,
        teacherName: row.teacherName,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        reviewedByName: row.reviewerName ?? null,
        approvalStatus,
        rejectionReason: row.rejectionReason ?? null,
        contentLabel: CONTENT_LABELS.gallery,
        photos: [],
      });
    }
    const group = galleryGroups.get(key);
    group.photos.push({
      contentId: row.contentId,
      imageUrl: publicUploadUrl(row.filePath),
      caption: row.caption ?? null,
      submittedAt: row.submittedAt,
      teacherName: row.teacherName,
    });
  }

  return [...diaryRows, ...noticeGroups.values(), ...galleryGroups.values()];
}

export function getContentSubmission(contentType, contentId) {
  const id = parseInt(contentId, 10);
  if (Number.isNaN(id)) return null;

  if (contentType === "diary") {
    const direct = db
      .prepare(
        `SELECT 'diary' AS contentType, d.id AS contentId, d.studentId, d.entryDate, d.submittedAt, d.teacherId,
                s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
                d.mood AS preview, NULL AS imagePath, d.approvalStatus
         FROM daycare_diary_entries d
         JOIN students s ON s.id = d.studentId
         JOIN users u ON u.id = d.teacherId
         WHERE d.id = ?`,
      )
      .get(id);
    return formatContentSubmissionRow(direct);
  }

  if (contentType === "notices") {
    const direct = db
      .prepare(
        `SELECT 'notices' AS contentType, n.id AS contentId, n.studentId, n.entryDate, n.submittedAt, n.teacherId,
                s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
                n.message AS preview, NULL AS imagePath, n.approvalStatus
         FROM parent_notices n
         JOIN students s ON s.id = n.studentId
         JOIN users u ON u.id = n.teacherId
         WHERE n.id = ?`,
      )
      .get(id);
    return formatContentSubmissionRow(direct);
  }

  if (contentType === "gallery") {
    const direct = db
      .prepare(
        `SELECT 'gallery' AS contentType, g.id AS contentId, g.studentId, g.entryDate, g.submittedAt, g.teacherId,
                s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
                g.caption AS preview, g.filePath AS imagePath, g.approvalStatus
         FROM gallery_photos g
         JOIN students s ON s.id = g.studentId
         JOIN users u ON u.id = g.teacherId
         WHERE g.id = ?`,
      )
      .get(id);
    return formatContentSubmissionRow(direct);
  }

  return null;
}

function updateContentApproval(contentType, contentId, adminId, status, rejectionReason = null, options = {}) {
  const id = parseInt(contentId, 10);
  if (Number.isNaN(id)) return null;

  const table =
    contentType === "diary"
      ? "daycare_diary_entries"
      : contentType === "notices"
        ? "parent_notices"
        : contentType === "gallery"
          ? "gallery_photos"
          : null;
  if (!table) return null;

  const existing = db.prepare(`SELECT id, approvalStatus, pendingDeletion FROM ${table} WHERE id = ?`).get(id);
  if (!existing) return null;
  if (existing.approvalStatus !== "pending") {
    return { error: "This submission is no longer pending.", status: 400 };
  }

  const snapshotJson = captureApprovalSnapshot(contentType, id);
  const submissionMeta = db
    .prepare(`SELECT studentId, entryDate, teacherId FROM ${table} WHERE id = ?`)
    .get(id);
  if (!snapshotJson || !submissionMeta) return null;

  if (contentType === "gallery" && existing.pendingDeletion) {
    if (status === "approved") {
      const photo = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(id);
      removeGalleryPhotoRecord(photo);
    } else if (status === "rejected") {
      const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
      if (!reason) return { error: "Rejection reason is required.", status: 400 };
      db.prepare(
        `UPDATE gallery_photos SET approvalStatus = 'approved', pendingDeletion = 0, rejectionReason = ?,
         reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
      ).run(reason, adminId, id);
    }

    insertContentApprovalHistory({
      contentType,
      contentId: id,
      studentId: submissionMeta.studentId,
      entryDate: submissionMeta.entryDate,
      teacherId: submissionMeta.teacherId,
      action: status === "approved" ? "approved_deletion" : "rejected",
      rejectionReason: status === "rejected" ? rejectionReason : null,
      reviewedBy: adminId,
      snapshotJson,
    });

    if (!options.skipLiveBroadcast) {
      notifyContentLiveUpdate({
        studentId: submissionMeta.studentId,
        entryDate: submissionMeta.entryDate,
        contentType,
      });
    }

    const deletionSubmission = getContentSubmission(contentType, id);
    if (deletionSubmission && !deletionSubmission.error) {
      notifyContentHandledInbox(
        deletionSubmission,
        status === "approved" ? "approved" : "rejected",
        status === "rejected" ? rejectionReason : null,
      );
    }

    return { success: true, contentId: id, studentId: submissionMeta.studentId, entryDate: submissionMeta.entryDate };
  }

  if (status === "approved") {
    db.prepare(
      `UPDATE ${table} SET approvalStatus = 'approved', rejectionReason = NULL,
       reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
    ).run(adminId, id);
  } else if (status === "rejected") {
    const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
    if (!reason) return { error: "Rejection reason is required.", status: 400 };
    db.prepare(
      `UPDATE ${table} SET approvalStatus = 'rejected', rejectionReason = ?,
       reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
    ).run(reason, adminId, id);
  }

  insertContentApprovalHistory({
    contentType,
    contentId: id,
    studentId: submissionMeta.studentId,
    entryDate: submissionMeta.entryDate,
    teacherId: submissionMeta.teacherId,
    action: status,
    rejectionReason: status === "rejected" ? rejectionReason : null,
    reviewedBy: adminId,
    snapshotJson,
  });

  if (!options.skipLiveBroadcast) {
    notifyContentLiveUpdate({
      studentId: submissionMeta.studentId,
      entryDate: submissionMeta.entryDate,
      contentType,
    });
  }

  const result = getContentSubmission(contentType, id);
  if (result && !result.error) {
    notifyContentHandledInbox(
      result,
      status === "approved" || status === "approved_deletion" ? "approved" : "rejected",
      status === "rejected" ? rejectionReason : null,
    );
  }
  return result;
}

export function approveContent(contentType, contentId, adminId, options = {}) {
  return updateContentApproval(contentType, contentId, adminId, "approved", null, options);
}

export function rejectContent(contentType, contentId, adminId, rejectionReason, options = {}) {
  return updateContentApproval(contentType, contentId, adminId, "rejected", rejectionReason, options);
}

export function deletePendingGalleryPhoto(photoId) {
  return removeGalleryPhotoAsAdmin(photoId, null, { pendingOnly: true });
}

function removeGalleryPhotoRecord(photo) {
  if (!photo) return null;
  const abs = path.join(uploadsRoot, photo.filePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  db.prepare(`DELETE FROM gallery_photos WHERE id = ?`).run(photo.id);
  notifyContentLiveUpdate({ studentId: photo.studentId, entryDate: photo.entryDate, contentType: "gallery" });
  return { success: true, studentId: photo.studentId, entryDate: photo.entryDate };
}

export function deleteGalleryPhotoForTeacher(photoId, teacher) {
  const id = parseInt(photoId, 10);
  if (Number.isNaN(id)) return null;

  const photo = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(id);
  if (!photo) return null;
  if (photo.entryDate !== todayEntryDate()) {
    return { error: "Only today's photos can be removed.", status: 400 };
  }

  const status = photo.approvalStatus ?? "approved";

  if (status === "draft" || status === "rejected") {
    return removeGalleryPhotoRecord(photo);
  }

  if (status === "pending") {
    if (photo.pendingDeletion) {
      return { error: "Removal is already pending approval.", status: 400 };
    }
    return { error: "Submitted photos cannot be removed. Withdraw the submission first.", status: 400 };
  }

  if (status === "approved") {
    if (!canTeacherEditPublished(teacher)) {
      return { error: "Published photos cannot be removed.", status: 403 };
    }
    if (requiresApproval(teacher.id, "gallery")) {
      db.prepare(
        `UPDATE gallery_photos SET approvalStatus = 'pending', pendingDeletion = 1,
         submittedAt = CURRENT_TIMESTAMP, rejectionReason = NULL, reviewedAt = NULL, reviewedBy = NULL,
         adminCorrectedAt = NULL, adminCorrectedBy = NULL
         WHERE id = ?`,
      ).run(id);

      const snapshotJson = captureApprovalSnapshot("gallery", id);
      insertContentApprovalHistory({
        contentType: "gallery",
        contentId: id,
        studentId: photo.studentId,
        entryDate: photo.entryDate,
        teacherId: photo.teacherId,
        action: "teacher_requested_deletion",
        rejectionReason: null,
        reviewedBy: teacher.id,
        snapshotJson,
      });

      notifyTeacherContentSubmitted({
        contentType: "gallery",
        contentId: id,
        teacherId: photo.teacherId,
        studentId: photo.studentId,
      });
      notifyContentLiveUpdate({ studentId: photo.studentId, entryDate: photo.entryDate, contentType: "gallery" });
      return { success: true, pendingDeletion: true, studentId: photo.studentId, entryDate: photo.entryDate };
    }
    return removeGalleryPhotoRecord(photo);
  }

  return { error: "This photo cannot be removed.", status: 400 };
}

export function removeGalleryPhotoAsAdmin(photoId, adminId, { pendingOnly = false } = {}) {
  const id = parseInt(photoId, 10);
  if (Number.isNaN(id)) return null;

  const photo = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(id);
  if (!photo) return null;
  if (pendingOnly && photo.approvalStatus !== "pending") {
    return { error: "Only pending photos can be removed.", status: 400 };
  }
  if (!pendingOnly && !["pending", "approved"].includes(photo.approvalStatus ?? "approved")) {
    return { error: "This photo cannot be removed.", status: 400 };
  }

  return removeGalleryPhotoRecord(photo);
}

export function addApprovedGalleryPhotoAsAdmin({
  studentId,
  entryDate,
  teacherId,
  adminId,
  filePath,
  caption = null,
}) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate || !filePath) {
    return { error: "Invalid upload.", status: 400 };
  }

  let authorId = teacherId != null ? parseInt(teacherId, 10) : NaN;
  if (Number.isNaN(authorId)) {
    const existing = db
      .prepare(
        `SELECT teacherId FROM gallery_photos WHERE studentId = ? AND entryDate = ? ORDER BY id ASC LIMIT 1`,
      )
      .get(sid, entryDate);
    authorId = existing?.teacherId ?? null;
  }
  if (authorId == null || Number.isNaN(authorId)) {
    return { error: "Could not determine teacher for this gallery.", status: 400 };
  }

  const result = db
    .prepare(
      `INSERT INTO gallery_photos (
        studentId, entryDate, teacherId, filePath, caption,
        approvalStatus, rejectionReason, submittedAt, reviewedAt, reviewedBy
      ) VALUES (?, ?, ?, ?, ?, 'approved', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
    )
    .run(sid, entryDate, authorId, filePath, caption, adminId);

  const photoId = result.lastInsertRowid;
  const row = db.prepare(`SELECT * FROM gallery_photos WHERE id = ?`).get(photoId);
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "gallery" });
  return { success: true, photo: mapGalleryRow(row), studentId: sid, entryDate };
}

export function approveGalleryGroup(studentId, entryDate, adminId) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };

  const photos = db
    .prepare(
      `SELECT id FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (photos.length === 0) return { error: "No pending photos in this group.", status: 404 };

  for (const { id } of photos) {
    approveContent("gallery", id, adminId, { skipLiveBroadcast: true });
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "gallery" });
  return { success: true, approvedCount: photos.length, studentId: sid, entryDate };
}

export function rejectGalleryGroup(studentId, entryDate, adminId, rejectionReason) {
  const sid = parseInt(studentId, 10);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };
  if (!reason) return { error: "Rejection reason is required.", status: 400 };

  const photos = db
    .prepare(
      `SELECT id FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (photos.length === 0) return { error: "No pending photos in this group.", status: 404 };

  for (const { id } of photos) {
    const result = rejectContent("gallery", id, adminId, reason, { skipLiveBroadcast: true });
    if (result?.error) return result;
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "gallery" });
  return { success: true, rejectedCount: photos.length, studentId: sid, entryDate };
}

export function deletePendingNotice(noticeId) {
  const id = parseInt(noticeId, 10);
  if (Number.isNaN(id)) return null;

  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(id);
  if (!notice) return null;
  if (notice.approvalStatus !== "pending") {
    return { error: "Only pending notes can be removed.", status: 400 };
  }

  db.prepare(`DELETE FROM parent_notices WHERE id = ?`).run(id);
  notifyContentLiveUpdate({ studentId: notice.studentId, entryDate: notice.entryDate, contentType: "notices" });
  return { success: true, studentId: notice.studentId, entryDate: notice.entryDate };
}

export function updatePendingNotice(noticeId, message, adminId = null) {
  const id = parseInt(noticeId, 10);
  const text = typeof message === "string" ? message.trim() : "";
  if (Number.isNaN(id)) return null;
  if (!text) return { error: "Message cannot be empty.", status: 400 };

  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(id);
  if (!notice) return null;
  if (notice.approvalStatus !== "pending") {
    return { error: "Only pending notes can be edited.", status: 400 };
  }

  db.prepare(`UPDATE parent_notices SET message = ? WHERE id = ?`).run(text, id);
  return {
    success: true,
    contentId: id,
    message: text,
    studentId: notice.studentId,
    entryDate: notice.entryDate,
  };
}

export function approveNoticesGroup(studentId, entryDate, adminId) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };

  const notices = db
    .prepare(
      `SELECT id FROM parent_notices WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (notices.length === 0) return { error: "No pending notes in this group.", status: 404 };

  for (const { id } of notices) {
    approveContent("notices", id, adminId, { skipLiveBroadcast: true });
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "notices" });
  return { success: true, approvedCount: notices.length, studentId: sid, entryDate };
}

export function rejectNoticesGroup(studentId, entryDate, adminId, rejectionReason) {
  const sid = parseInt(studentId, 10);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };
  if (!reason) return { error: "Rejection reason is required.", status: 400 };

  const notices = db
    .prepare(
      `SELECT id FROM parent_notices WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(sid, entryDate);

  if (notices.length === 0) return { error: "No pending notes in this group.", status: 404 };

  for (const { id } of notices) {
    const result = rejectContent("notices", id, adminId, reason, { skipLiveBroadcast: true });
    if (result?.error) return result;
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "notices" });
  return { success: true, rejectedCount: notices.length, studentId: sid, entryDate };
}

export function updatePendingDiary(diaryId, body, adminId) {
  const id = parseInt(diaryId, 10);
  if (Number.isNaN(id)) return null;

  const row = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  if (!row) return null;
  if (row.approvalStatus !== "pending") {
    return { error: "Only pending diary entries can be edited.", status: 400 };
  }

  const payload = sanitizeDiarySummaryPayload(body);
  db.prepare(
    `UPDATE daycare_diary_entries SET
      mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(payload.mood, payload.activities, payload.suppliesJson, payload.teacherRemarks, id);

  const updated = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  const events = getDiaryEventsForStudent(updated.studentId, updated.entryDate);
  notifyContentLiveUpdate({
    studentId: updated.studentId,
    entryDate: updated.entryDate,
    contentType: "diary",
  });
  return { success: true, diary: buildDiaryView(updated, events), reviewedBy: adminId };
}

function contentTableForType(contentType) {
  if (contentType === "diary") return "daycare_diary_entries";
  if (contentType === "notices") return "parent_notices";
  if (contentType === "gallery") return "gallery_photos";
  return null;
}

export function correctApprovedDiary(diaryId, body, actorId, options = {}) {
  const id = parseInt(diaryId, 10);
  if (Number.isNaN(id)) return null;

  const channel = options.channel ?? "admin_edit";
  const actorRole = options.actorRole ?? "admin";

  const row = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  if (!row) return null;
  if (row.approvalStatus !== "approved") {
    return { error: "Only approved diary entries can be edited.", status: 400 };
  }

  const payload = sanitizeDiarySummaryPayload(body);
  const isAdminCorrection = actorRole !== "teacher";
  if (isAdminCorrection) {
    const correctedAt = new Date().toISOString();
    db.prepare(
      `UPDATE daycare_diary_entries SET
        mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?,
        adminCorrectedAt = ?, adminCorrectedBy = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.mood,
      payload.activities,
      payload.suppliesJson,
      payload.teacherRemarks,
      correctedAt,
      actorId,
      id,
    );
  } else {
    const resetToDraft = !payload.mood;
    const submitForApproval = !!options.submitForApproval;
    if (resetToDraft) {
      db.prepare(
        `UPDATE daycare_diary_entries SET
          mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?,
          approvalStatus = 'draft', rejectionReason = NULL,
          submittedAt = NULL, reviewedAt = NULL, reviewedBy = NULL,
          updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(payload.mood, payload.activities, payload.suppliesJson, payload.teacherRemarks, id);
    } else if (submitForApproval) {
      const submittedAt = new Date().toISOString();
      db.prepare(
        `UPDATE daycare_diary_entries SET
          mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?,
          approvalStatus = 'pending', rejectionReason = NULL,
          submittedAt = ?, reviewedAt = NULL, reviewedBy = NULL,
          updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(
        payload.mood,
        payload.activities,
        payload.suppliesJson,
        payload.teacherRemarks,
        submittedAt,
        id,
      );
    } else {
      db.prepare(
        `UPDATE daycare_diary_entries SET
          mood = ?, activities = ?, suppliesJson = ?, teacherRemarks = ?,
          updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(payload.mood, payload.activities, payload.suppliesJson, payload.teacherRemarks, id);
    }
  }

  const snapshotJson = captureApprovalSnapshot("diary", id);
  insertContentApprovalHistory({
    contentType: "diary",
    contentId: id,
    studentId: row.studentId,
    entryDate: row.entryDate,
    teacherId: row.teacherId,
    action: isAdminCorrection ? "admin_corrected" : "teacher_edited",
    rejectionReason: null,
    reviewedBy: actorId,
    snapshotJson,
  });

  if (!isAdminCorrection && options.submitForApproval && payload.mood) {
    notifyTeacherContentSubmitted({
      contentType: "diary",
      contentId: id,
      teacherId: row.teacherId,
      studentId: row.studentId,
    });
  } else {
    notifyContentLiveUpdate({
      studentId: row.studentId,
      entryDate: row.entryDate,
      contentType: "diary",
    });
  }

  const updated = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  const events = getDiaryEventsForStudent(updated.studentId, updated.entryDate);
  return { success: true, diary: buildDiaryView(updated, events) };
}

export function correctApprovedNotice(noticeId, message, actorId, options = {}) {
  const id = parseInt(noticeId, 10);
  const text = typeof message === "string" ? message.trim() : "";
  if (Number.isNaN(id)) return null;
  if (!text) return { error: "Message cannot be empty.", status: 400 };

  const notice = db.prepare(`SELECT * FROM parent_notices WHERE id = ?`).get(id);
  if (!notice) return null;
  if (notice.approvalStatus !== "approved") {
    return { error: "Only approved notes can be edited.", status: 400 };
  }

  const channel = options.channel ?? "admin_edit";
  const actorRole = options.actorRole ?? "admin";
  const isAdminCorrection = actorRole !== "teacher";

  if (isAdminCorrection) {
    const correctedAt = new Date().toISOString();
    db.prepare(
      `UPDATE parent_notices SET message = ?, adminCorrectedAt = ?, adminCorrectedBy = ? WHERE id = ?`,
    ).run(text, correctedAt, actorId, id);
  } else if (options.submitForApproval) {
    const submittedAt = new Date().toISOString();
    db.prepare(
      `UPDATE parent_notices SET message = ?, approvalStatus = 'pending', rejectionReason = NULL,
       submittedAt = ?, reviewedAt = NULL, reviewedBy = NULL,
       adminCorrectedAt = NULL, adminCorrectedBy = NULL
       WHERE id = ?`,
    ).run(text, submittedAt, id);
  } else {
    db.prepare(`UPDATE parent_notices SET message = ? WHERE id = ?`).run(text, id);
  }

  const snapshotJson = captureApprovalSnapshot("notices", id);
  insertContentApprovalHistory({
    contentType: "notices",
    contentId: id,
    studentId: notice.studentId,
    entryDate: notice.entryDate,
    teacherId: notice.teacherId,
    action: isAdminCorrection ? "admin_corrected" : "teacher_edited",
    rejectionReason: null,
    reviewedBy: actorId,
    snapshotJson,
  });

  if (!isAdminCorrection && options.submitForApproval) {
    notifyTeacherContentSubmitted({
      contentType: "notices",
      contentId: id,
      teacherId: notice.teacherId,
      studentId: notice.studentId,
    });
  } else {
    notifyContentLiveUpdate({
      studentId: notice.studentId,
      entryDate: notice.entryDate,
      contentType: "notices",
    });
  }

  return {
    success: true,
    contentId: id,
    message: text,
    studentId: notice.studentId,
    entryDate: notice.entryDate,
  };
}

export function reopenApprovedContent(contentType, contentId, adminId, rejectionReason, options = {}) {
  const id = parseInt(contentId, 10);
  if (Number.isNaN(id)) return null;

  const table = contentTableForType(contentType);
  if (!table) return null;

  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (!reason) return { error: "A reason is required when sending content back to the teacher.", status: 400 };

  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing) return null;
  if (existing.approvalStatus !== "approved") {
    return { error: "Only approved content can be sent back to the teacher.", status: 400 };
  }

  const snapshotJson = captureApprovalSnapshot(contentType, id);
  db.prepare(
    `UPDATE ${table} SET approvalStatus = 'rejected', rejectionReason = ?,
     reviewedAt = CURRENT_TIMESTAMP, reviewedBy = ? WHERE id = ?`,
  ).run(reason, adminId, id);

  insertContentApprovalHistory({
    contentType,
    contentId: id,
    studentId: existing.studentId,
    entryDate: existing.entryDate,
    teacherId: existing.teacherId,
    action: "reopened",
    rejectionReason: reason,
    reviewedBy: adminId,
    snapshotJson,
  });

  if (!options.skipLiveBroadcast) {
    notifyContentLiveUpdate({
      studentId: existing.studentId,
      entryDate: existing.entryDate,
      contentType,
    });
  }

  return getContentSubmission(contentType, id);
}

export function reopenApprovedNoticesGroup(studentId, entryDate, adminId, rejectionReason) {
  const sid = parseInt(studentId, 10);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };
  if (!reason) return { error: "A reason is required when sending content back to the teacher.", status: 400 };

  const notices = db
    .prepare(
      `SELECT id FROM parent_notices WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
    )
    .all(sid, entryDate);

  if (notices.length === 0) {
    return { error: "No approved notes in this group.", status: 404 };
  }

  for (const { id } of notices) {
    const result = reopenApprovedContent("notices", id, adminId, reason, { skipLiveBroadcast: true });
    if (result?.error) return result;
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "notices" });
  return { success: true, reopenedCount: notices.length, studentId: sid, entryDate };
}

export function reopenApprovedGalleryGroup(studentId, entryDate, adminId, rejectionReason) {
  const sid = parseInt(studentId, 10);
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (Number.isNaN(sid) || !entryDate) return { error: "Invalid group.", status: 400 };
  if (!reason) return { error: "A reason is required when sending content back to the teacher.", status: 400 };

  const photos = db
    .prepare(
      `SELECT id FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
    )
    .all(sid, entryDate);

  if (photos.length === 0) {
    return { error: "No approved photos in this group.", status: 404 };
  }

  for (const { id } of photos) {
    const result = reopenApprovedContent("gallery", id, adminId, reason, { skipLiveBroadcast: true });
    if (result?.error) return result;
  }
  notifyContentLiveUpdate({ studentId: sid, entryDate, contentType: "gallery" });
  return { success: true, reopenedCount: photos.length, studentId: sid, entryDate };
}

export function canTeacherDeleteNotice(notice, _teacher) {
  if (!notice) return false;
  const status = notice.approvalStatus ?? "approved";
  if (status === "approved") return false;
  return status === "pending" || status === "rejected" || status === "draft";
}

export function applyContentDraftOnSave(_teacherId, _contentType) {
  return {
    approvalStatus: "draft",
    submittedAt: null,
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

export function applyContentApprovalOnSubmit(teacherId, contentType) {
  const status = resolveContentApprovalStatus(teacherId, contentType);
  return {
    approvalStatus: status,
    submittedAt: status === "pending" ? new Date().toISOString() : null,
    rejectionReason: null,
    reviewedAt: status === "approved" ? new Date().toISOString() : null,
    reviewedBy: null,
  };
}

function formatStaffContentEventRow(row) {
  if (!row) return null;
  return {
    id: `content-event-${row.id}`,
    kind: "content_event",
    eventType: row.eventType,
    contentType: row.contentType,
    contentId: row.contentId ?? undefined,
    studentId: row.studentId,
    studentName: row.studentName,
    studentRollNo: row.studentRollNo,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    entryDate: row.entryDate,
    submittedAt: row.createdAt,
    preview: row.preview ?? null,
    imageUrl: row.imagePath ? publicUploadUrl(row.imagePath) : null,
    contentLabel: CONTENT_LABELS[row.contentType] ?? row.contentType,
  };
}

export function recordStaffContentEvent({
  eventType,
  contentType,
  contentId,
  studentId,
  entryDate,
  teacherId,
  preview = null,
  imagePath = null,
}) {
  db.prepare(
    `INSERT INTO staff_content_events (
      eventType, contentType, contentId, studentId, entryDate, teacherId, preview, imagePath
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    eventType,
    contentType,
    contentId ?? null,
    studentId,
    entryDate,
    teacherId,
    preview,
    imagePath,
  );
  return db.prepare(`SELECT last_insert_rowid() AS id`).get().id;
}

export function listStaffContentEvents({ limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = db
    .prepare(
      `SELECT e.*, s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName
       FROM staff_content_events e
       JOIN students s ON s.id = e.studentId
       JOIN users u ON u.id = e.teacherId
       ORDER BY e.createdAt DESC
       LIMIT ?`,
    )
    .all(safeLimit);
  return rows.map(formatStaffContentEventRow).filter(Boolean);
}

function broadcastStaffContentEvent(eventType, submission) {
  broadcastStaffEvent({ type: "teacher_content_event", eventType, submission });
}

export function notifyStaffContentSubmitted(submission, { eventType = "submitted" } = {}) {
  if (!submission) return null;

  const eventId = recordStaffContentEvent({
    eventType,
    contentType: submission.contentType,
    contentId: submission.contentId,
    studentId: submission.studentId,
    entryDate: submission.entryDate,
    teacherId: submission.teacherId,
    preview: submission.preview ?? null,
    imagePath: submission.imagePath ?? null,
  });

  broadcastStaffContentEvent(eventType, submission);
  notifyContentInbox(submission, { eventType });

  if (submission?.studentId && submission?.entryDate) {
    notifyContentLiveUpdate({
      studentId: submission.studentId,
      entryDate: submission.entryDate,
      contentType: submission.contentType ?? "all",
    });
  }

  if (eventType === "submitted") {
    const roll = submission.studentRollNo ? `Roll ${submission.studentRollNo}` : "Student";
    const body = `${roll} · ${submission.studentName} · ${submission.contentLabel}`;
    void sendPushToAllAdmins({
      title: "Teacher submission pending approval",
      body,
      url: "/staff/content-approvals",
      contentType: submission.contentType,
      contentId: submission.contentId,
    });
  } else if (eventType === "withdrawn") {
    const roll = submission.studentRollNo ? `Roll ${submission.studentRollNo}` : "Student";
    void sendPushToAllAdmins({
      title: "Teacher withdrew a submission",
      body: `${roll} · ${submission.studentName} · ${submission.contentLabel}`,
      url: "/staff/content-approvals",
      contentType: submission.contentType,
      contentId: submission.contentId,
    });
  }

  return { eventId, submission };
}

export function notifyTeacherContentSubmitted({ contentType, contentId, teacherId, studentId }) {
  const submission = getContentSubmission(contentType, contentId);
  if (!submission) return null;
  return notifyStaffContentSubmitted(submission, { eventType: "submitted" });
}

function buildGalleryGroupSubmission(studentId, entryDate, teacherId) {
  const student = db.prepare(`SELECT name, rollNo FROM students WHERE id = ?`).get(studentId);
  const teacher = db.prepare(`SELECT name FROM users WHERE id = ?`).get(teacherId);
  const photos = db
    .prepare(
      `SELECT id, caption, filePath FROM gallery_photos WHERE studentId = ? AND entryDate = ? ORDER BY id ASC`,
    )
    .all(studentId, entryDate);
  const first = photos[0];
  return {
    id: `gallery-group-${studentId}-${entryDate}`,
    kind: "content_submission",
    contentType: "gallery",
    isGroup: true,
    studentId,
    studentName: student?.name ?? "",
    studentRollNo: student?.rollNo ?? "",
    teacherId,
    teacherName: teacher?.name ?? "",
    entryDate,
    submittedAt: new Date().toISOString(),
    preview: first?.caption ?? `${photos.length} photo${photos.length === 1 ? "" : "s"}`,
    imagePath: first?.filePath ?? null,
    contentLabel: CONTENT_LABELS.gallery,
    photoCount: photos.length,
  };
}

export function submitDiaryForApproval(studentId, entryDate, teacherId) {
  const row = db
    .prepare(`SELECT id, approvalStatus, mood FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  if (!row) return { error: "Save the diary before submitting.", status: 400 };
  if (row.approvalStatus === "pending") return { error: "Diary is already submitted for approval.", status: 400 };
  if (row.approvalStatus === "approved" && row.mood) {
    return { error: "Diary is already approved.", status: 400 };
  }
  if (!requiresApproval(teacherId, "diary")) return { error: "Diary approval is not required.", status: 400 };

  db.prepare(
    `UPDATE daycare_diary_entries SET approvalStatus = 'pending', submittedAt = CURRENT_TIMESTAMP,
     rejectionReason = NULL, reviewedAt = NULL, reviewedBy = NULL,
     adminCorrectedAt = NULL, adminCorrectedBy = NULL, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(row.id);

  notifyTeacherContentSubmitted({
    contentType: "diary",
    contentId: row.id,
    teacherId,
    studentId,
  });

  return { success: true, diary: getDiaryForStudent(studentId, entryDate) };
}

export function submitDiaryForPublish(studentId, entryDate, teacherId) {
  const row = db
    .prepare(`SELECT id, approvalStatus, mood FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  if (!row) return { error: "Save the diary before submitting.", status: 400 };
  if (row.approvalStatus === "approved" && row.mood) {
    return { error: "Diary is already published.", status: 400 };
  }
  if (row.approvalStatus === "pending") {
    return { error: "Diary is already submitted for approval.", status: 400 };
  }
  if (requiresApproval(teacherId, "diary")) {
    return { error: "Diary requires admin approval.", status: 400 };
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE daycare_diary_entries SET approvalStatus = 'approved', submittedAt = ?, rejectionReason = NULL,
     reviewedAt = ?, reviewedBy = NULL, adminCorrectedAt = NULL, adminCorrectedBy = NULL,
     updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(now, now, row.id);

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "diary" });
  return { success: true, diary: getDiaryForStudent(studentId, entryDate) };
}

export {
  approveDiaryEventsGroup,
  rejectDiaryEventsGroup,
  deletePendingDiaryEvent,
} from "./diaryEvents.js";

export function buildDiaryEventsGroupSubmission(studentId, entryDate, teacherId) {
  const student = db.prepare(`SELECT name, rollNo FROM students WHERE id = ?`).get(studentId);
  const teacher = db.prepare(`SELECT name FROM users WHERE id = ?`).get(teacherId);
  const events = db
    .prepare(
      `SELECT id, eventType, payloadJson, submittedAt FROM daycare_diary_events
       WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'
       ORDER BY id ASC`,
    )
    .all(studentId, entryDate);
  return {
    id: `diary-events-group-${studentId}-${entryDate}`,
    kind: "content_submission",
    contentType: "diary_events",
    isGroup: true,
    studentId,
    studentName: student?.name ?? "",
    studentRollNo: student?.rollNo ?? "",
    teacherId,
    teacherName: teacher?.name ?? "",
    entryDate,
    submittedAt: new Date().toISOString(),
    preview: `${events.length} activit${events.length === 1 ? "y" : "ies"}`,
    contentLabel: CONTENT_LABELS.diary_events,
    diaryEvents: events.map((e) => {
      const mapped = mapDiaryEventRow(e);
      return { contentId: e.id, eventType: e.eventType, ...stripEventMeta(mapped) };
    }),
  };
}

export function withdrawDiarySubmission(studentId, entryDate, teacherId) {
  const row = db
    .prepare(`SELECT id, approvalStatus FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  if (!row) return { error: "Diary not found.", status: 404 };
  if (row.approvalStatus !== "pending") {
    return { error: "Only pending diary submissions can be withdrawn.", status: 400 };
  }

  db.prepare(
    `UPDATE daycare_diary_entries SET approvalStatus = 'draft', submittedAt = NULL,
     updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(row.id);

  const submission = getContentSubmission("diary", row.id);
  notifyStaffContentSubmitted(submission, { eventType: "withdrawn" });

  return { success: true, diary: getDiaryForStudent(studentId, entryDate) };
}

export function submitGalleryForPublish(studentId, entryDate, teacherId) {
  if (requiresApproval(teacherId, "gallery")) {
    return { error: "Gallery requires admin approval.", status: 400 };
  }

  const drafts = db
    .prepare(
      `SELECT id FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus IN ('draft', 'rejected')`,
    )
    .all(studentId, entryDate);
  if (drafts.length === 0) return { error: "Add at least one photo before submitting.", status: 400 };

  const now = new Date().toISOString();
  for (const { id } of drafts) {
    db.prepare(
      `UPDATE gallery_photos SET approvalStatus = 'approved', submittedAt = ?, rejectionReason = NULL,
       reviewedAt = ?, reviewedBy = NULL, adminCorrectedAt = NULL, adminCorrectedBy = NULL WHERE id = ?`,
    ).run(now, now, id);
  }

  notifyContentLiveUpdate({ studentId, entryDate, contentType: "gallery" });
  return {
    success: true,
    submittedCount: drafts.length,
    photos: getGalleryForStudent(studentId, entryDate),
  };
}

export function submitGalleryForApproval(studentId, entryDate, teacherId) {
  if (!requiresApproval(teacherId, "gallery")) {
    return { error: "Gallery approval is not required.", status: 400 };
  }

  const drafts = db
    .prepare(
      `SELECT id FROM gallery_photos
       WHERE studentId = ? AND entryDate = ? AND approvalStatus IN ('draft', 'rejected')`,
    )
    .all(studentId, entryDate);
  if (drafts.length === 0) return { error: "Add at least one photo before submitting.", status: 400 };

  for (const { id } of drafts) {
    db.prepare(
      `UPDATE gallery_photos SET approvalStatus = 'pending', submittedAt = CURRENT_TIMESTAMP,
       rejectionReason = NULL, reviewedAt = NULL, reviewedBy = NULL,
       adminCorrectedAt = NULL, adminCorrectedBy = NULL WHERE id = ?`,
    ).run(id);
  }

  const submission = buildGalleryGroupSubmission(studentId, entryDate, teacherId);
  notifyStaffContentSubmitted(submission, { eventType: "submitted" });

  return {
    success: true,
    submittedCount: drafts.length,
    photos: getGalleryForStudent(studentId, entryDate),
  };
}

export function withdrawGallerySubmission(studentId, entryDate, teacherId) {
  const pending = db
    .prepare(
      `SELECT id FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'pending'`,
    )
    .all(studentId, entryDate);
  if (pending.length === 0) {
    return { error: "No pending photos to withdraw.", status: 400 };
  }

  for (const { id } of pending) {
    const row = db.prepare(`SELECT pendingDeletion FROM gallery_photos WHERE id = ?`).get(id);
    if (row?.pendingDeletion) {
      db.prepare(
        `UPDATE gallery_photos SET approvalStatus = 'approved', pendingDeletion = 0,
         submittedAt = NULL, rejectionReason = NULL, reviewedAt = NULL, reviewedBy = NULL WHERE id = ?`,
      ).run(id);
    } else {
      db.prepare(
        `UPDATE gallery_photos SET approvalStatus = 'draft', submittedAt = NULL WHERE id = ?`,
      ).run(id);
    }
  }

  const submission = buildGalleryGroupSubmission(studentId, entryDate, teacherId);
  notifyStaffContentSubmitted(submission, { eventType: "withdrawn" });

  return {
    success: true,
    withdrawnCount: pending.length,
    photos: getGalleryForStudent(studentId, entryDate),
  };
}

export function isGalleryLockedForTeacher(_studentId, _entryDate, _teacher) {
  return false;
}

export function canTeacherFillPublishedSummaryExtras(row, body) {
  if (!row || row.approvalStatus !== "approved") return false;

  const payload = sanitizeDiarySummaryPayload(body);
  if (payload.mood !== (row.mood ?? null)) return false;
  if (payload.activities || payload.teacherRemarks) return false;

  const existingSupplies = parseJsonArray(row.suppliesJson);
  const nextSupplies = parseJsonArray(payload.suppliesJson);

  if (
    existingSupplies.length > 0 &&
    JSON.stringify([...nextSupplies].sort()) !== JSON.stringify([...existingSupplies].sort())
  ) {
    return false;
  }

  return existingSupplies.length === 0 && nextSupplies.length > 0;
}

export function fillPublishedDiarySummaryExtras(diaryId, body, teacherId) {
  const id = parseInt(diaryId, 10);
  if (Number.isNaN(id)) return null;

  const row = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  if (!row) return null;
  if (!canTeacherFillPublishedSummaryExtras(row, body)) {
    return { error: "You can only fill in fields that were not published yet.", status: 400 };
  }

  const payload = sanitizeDiarySummaryPayload(body);
  db.prepare(
    `UPDATE daycare_diary_entries SET
      mood = ?, suppliesJson = ?, teacherId = ?,
      updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(payload.mood, payload.suppliesJson, teacherId, id);

  const updated = db.prepare(`SELECT * FROM daycare_diary_entries WHERE id = ?`).get(id);
  const events = getDiaryEventsForStudent(updated.studentId, updated.entryDate);
  notifyContentLiveUpdate({
    studentId: updated.studentId,
    entryDate: updated.entryDate,
    contentType: "diary",
  });
  return { success: true, diary: buildDiaryView(updated, events) };
}

export function canTeacherEditDiary(studentId, entryDate, teacher) {
  const row = db
    .prepare(`SELECT approvalStatus FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ?`)
    .get(studentId, entryDate);
  if (!row) return true;
  const status = row.approvalStatus ?? "approved";
  if (status === "approved") return canTeacherEditPublished(teacher);
  if (status === "pending") return false;
  return status === "draft" || status === "rejected";
}

export function canTeacherEditPublishedNotice(teacher) {
  return canTeacherEditPublished(teacher);
}

export function deleteTeacherAccount(teacherId) {
  const id = parseInt(teacherId, 10);
  if (Number.isNaN(id)) return null;

  const user = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id);
  if (!user || user.role !== "teacher") return null;

  const runDelete = db.transaction(() => {
    for (const table of ["daycare_diary_entries", "parent_notices", "gallery_photos"]) {
      db.prepare(`UPDATE ${table} SET reviewedBy = NULL WHERE reviewedBy = ?`).run(id);
      db.prepare(`UPDATE ${table} SET adminCorrectedBy = NULL WHERE adminCorrectedBy = ?`).run(id);
    }

    db.prepare(`UPDATE content_approval_history SET teacherId = NULL WHERE teacherId = ?`).run(id);
    db.prepare(`UPDATE content_approval_history SET reviewedBy = NULL WHERE reviewedBy = ?`).run(id);

    db.prepare(`DELETE FROM staff_content_events WHERE teacherId = ?`).run(id);

    const photos = db
      .prepare(`SELECT filePath FROM gallery_photos WHERE teacherId = ?`)
      .all(id);
    for (const { filePath } of photos) {
      const abs = path.join(uploadsRoot, filePath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }

    db.prepare(`DELETE FROM gallery_photos WHERE teacherId = ?`).run(id);
    db.prepare(`DELETE FROM daycare_diary_events WHERE teacherId = ?`).run(id);
    db.prepare(`DELETE FROM parent_notices WHERE teacherId = ?`).run(id);
    db.prepare(`DELETE FROM daycare_diary_entries WHERE teacherId = ?`).run(id);
    db.prepare(`DELETE FROM teacher_content_settings WHERE teacherId = ?`).run(id);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  });

  runDelete();
  return { success: true };
}

export function listPublishedOverview({ entryDate, classGroupId = null } = {}) {
  const date = entryDate || todayEntryDate();
  let query = `
    SELECT s.id, s.name, s.rollNo, s.classGroupId, cg.name AS classGroupName
    FROM students s
    LEFT JOIN class_groups cg ON cg.id = s.classGroupId
    WHERE s.status = 'active' AND COALESCE(s.enrollmentStatus, 'enrolled') = 'enrolled'`;
  const params = [];
  if (classGroupId != null && String(classGroupId).trim() !== "") {
    const cgId = parseInt(classGroupId, 10);
    if (!Number.isNaN(cgId)) {
      query += ` AND s.classGroupId = ?`;
      params.push(cgId);
    }
  }
  query += ` ORDER BY cg.name ASC, s.rollNo ASC, s.name ASC`;

  const students = db.prepare(query).all(...params);

  return students.map((s) => {
    const diary = db
      .prepare(
        `SELECT id FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
      )
      .get(s.id, date);
    const hasApprovedEvents = db
      .prepare(
        `SELECT COUNT(*) AS c FROM daycare_diary_events
         WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
      )
      .get(s.id, date)?.c;
    const noticeCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM parent_notices WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
      )
      .get(s.id, date)?.c ?? 0;
    const photoCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
      )
      .get(s.id, date)?.c ?? 0;
    const attendance = db
      .prepare(`SELECT status FROM student_attendance WHERE studentId = ? AND entryDate = ?`)
      .get(s.id, date);

    return {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      classGroupId: s.classGroupId,
      classGroupName: s.classGroupName,
      entryDate: date,
      attendance: attendance?.status ?? null,
      diary: (diary || (hasApprovedEvents ?? 0) > 0) ? "published" : null,
      notices: noticeCount > 0 ? "published" : null,
      photos: photoCount > 0 ? "published" : null,
    };
  });
}

export function getPublishedContentForAdmin(studentId, entryDate, contentType) {
  const sid = parseInt(studentId, 10);
  const date = entryDate || todayEntryDate();
  if (Number.isNaN(sid)) return { error: "Invalid student.", status: 400 };

  const student = db
    .prepare(
      `SELECT s.id, s.name, s.rollNo, cg.name AS classGroupName
       FROM students s LEFT JOIN class_groups cg ON cg.id = s.classGroupId WHERE s.id = ?`,
    )
    .get(sid);
  if (!student) return { error: "Student not found.", status: 404 };

  if (contentType === "diary") {
    const summaryRow = db
      .prepare(
        `SELECT * FROM daycare_diary_entries WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved'`,
      )
      .get(sid, date);
    const events = getDiaryEventsForStudent(sid, date, { approvedOnly: true });
    const diary = buildDiaryView(summaryRow, events, { forParent: true });
    if (!diary) return { error: "No published diary for this date.", status: 404 };
    return {
      student,
      entryDate: date,
      contentType: "diary",
      detail: { type: "diary", diary },
    };
  }

  if (contentType === "notices") {
    const rows = db
      .prepare(
        `SELECT * FROM parent_notices WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved' ORDER BY id ASC`,
      )
      .all(sid, date);
    if (!rows.length) return { error: "No published notes for this date.", status: 404 };
    return {
      student,
      entryDate: date,
      contentType: "notices",
      notices: rows.map(mapNoticeRow),
    };
  }

  if (contentType === "gallery") {
    const rows = db
      .prepare(
        `SELECT * FROM gallery_photos WHERE studentId = ? AND entryDate = ? AND approvalStatus = 'approved' ORDER BY id ASC`,
      )
      .all(sid, date);
    if (!rows.length) return { error: "No published photos for this date.", status: 404 };
    return {
      student,
      entryDate: date,
      contentType: "gallery",
      photos: rows.map((r) => ({
        id: r.id,
        imageUrl: publicUploadUrl(r.filePath),
        caption: r.caption,
      })),
    };
  }

  return { error: "Invalid content type.", status: 400 };
}
