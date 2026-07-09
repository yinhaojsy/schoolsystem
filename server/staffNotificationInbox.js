import { db } from "./db.js";
import { publicUploadUrl } from "./utils/uploads.js";

const CONTENT_LABELS = {
  diary: "Daycare diary",
  diary_events: "Diary activities",
  notices: "Parent notice",
  gallery: "Gallery photo",
};

function parseMetadata(row) {
  if (!row?.metadataJson) return {};
  try {
    return JSON.parse(row.metadataJson);
  } catch {
    return {};
  }
}

export function formatStaffInboxRow(row) {
  if (!row) return null;
  const meta = parseMetadata(row);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? "",
    imageUrl: row.imageUrl ?? null,
    linkPath: row.linkPath ?? "/content-approvals",
    readAt: row.readAt ?? null,
    handledAt: row.handledAt ?? null,
    dismissedAt: row.dismissedAt ?? null,
    createdAt: row.createdAt,
    sourceType: row.sourceType ?? null,
    sourceId: row.sourceId ?? null,
    ...meta,
  };
}

export function createStaffNotification({
  type,
  title,
  body = "",
  imageUrl = null,
  linkPath = "/content-approvals",
  sourceType = null,
  sourceId = null,
  metadata = {},
  createdAt = null,
  readAt = null,
  handledAt = null,
}) {
  const metadataJson = JSON.stringify(metadata);
  if (createdAt) {
    const result = db
      .prepare(
        `INSERT INTO staff_notifications (
          type, title, body, imageUrl, linkPath, sourceType, sourceId,
          metadataJson, readAt, handledAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        type,
        title,
        body,
        imageUrl,
        linkPath,
        sourceType,
        sourceId,
        metadataJson,
        readAt,
        handledAt,
        createdAt,
      );
    return formatStaffInboxRow(
      db.prepare(`SELECT * FROM staff_notifications WHERE id = ?`).get(result.lastInsertRowid),
    );
  }

  const result = db
    .prepare(
      `INSERT INTO staff_notifications (
        type, title, body, imageUrl, linkPath, sourceType, sourceId, metadataJson, readAt, handledAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(type, title, body, imageUrl, linkPath, sourceType, sourceId, metadataJson, readAt, handledAt);
  return formatStaffInboxRow(
    db.prepare(`SELECT * FROM staff_notifications WHERE id = ?`).get(result.lastInsertRowid),
  );
}

const ACTIVE_WHERE = `WHERE dismissedAt IS NULL`;

export function countUnreadStaffInboxNotifications() {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM staff_notifications ${ACTIVE_WHERE} AND readAt IS NULL`)
    .get();
  return row?.c ?? 0;
}

export function listStaffInboxNotifications({ page, limit = 20 } = {}) {
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM staff_notifications ${ACTIVE_WHERE}`)
    .get();
  const total = totalRow?.c ?? 0;
  const unreadCount = countUnreadStaffInboxNotifications();

  if (page != null) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    const rows = db
      .prepare(
        `SELECT * FROM staff_notifications ${ACTIVE_WHERE}
         ORDER BY createdAt DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, offset);
    return {
      items: rows.map(formatStaffInboxRow).filter(Boolean),
      total,
      unreadCount,
      page: safePage,
      limit: safeLimit,
    };
  }

  const previewLimit = Math.min(Math.max(limit, 1), 20);
  const rows = db
    .prepare(
      `SELECT * FROM staff_notifications ${ACTIVE_WHERE}
       ORDER BY createdAt DESC, id DESC
       LIMIT ?`,
    )
    .all(previewLimit);
  return { items: rows.map(formatStaffInboxRow).filter(Boolean), total, unreadCount };
}

export function getStaffNotificationById(id) {
  const row = db.prepare(`SELECT * FROM staff_notifications WHERE id = ?`).get(id);
  return formatStaffInboxRow(row);
}

export function markStaffNotificationRead(id) {
  db.prepare(
    `UPDATE staff_notifications SET readAt = CURRENT_TIMESTAMP WHERE id = ? AND readAt IS NULL AND dismissedAt IS NULL`,
  ).run(id);
  return getStaffNotificationById(id);
}

export function markStaffNotificationsReadBySource(sourceType, sourceId) {
  db.prepare(
    `UPDATE staff_notifications SET readAt = CURRENT_TIMESTAMP
     WHERE sourceType = ? AND sourceId = ? AND readAt IS NULL AND dismissedAt IS NULL`,
  ).run(sourceType, sourceId);
}

export function markStaffNotificationsHandledByContent(contentType, contentId, { type, body } = {}) {
  const sourceId = `${contentType}:${contentId}`;
  const updates = [`handledAt = CURRENT_TIMESTAMP`, `readAt = COALESCE(readAt, CURRENT_TIMESTAMP)`];
  const params = [];
  if (type) {
    updates.push(`type = ?`);
    params.push(type);
  }
  if (body) {
    updates.push(`body = ?`);
    params.push(body);
  }
  params.push("content_submission", sourceId);
  db.prepare(
    `UPDATE staff_notifications SET ${updates.join(", ")}
     WHERE sourceType = ? AND sourceId = ? AND dismissedAt IS NULL`,
  ).run(...params);
}

export function markStaffNotificationsHandledForInvoice(invoiceId) {
  const rows = db
    .prepare(
      `SELECT id, metadataJson FROM staff_notifications
       WHERE sourceType = 'payment_proof' AND dismissedAt IS NULL AND handledAt IS NULL`,
    )
    .all();
  const matching = rows.filter((row) => {
    const meta = parseMetadata(row);
    return meta.invoiceId === invoiceId;
  });
  for (const row of matching) {
    db.prepare(
      `UPDATE staff_notifications
       SET handledAt = CURRENT_TIMESTAMP, type = 'invoice_paid',
           body = 'Invoice marked paid', readAt = COALESCE(readAt, CURRENT_TIMESTAMP)
       WHERE id = ?`,
    ).run(row.id);
  }
}

export function dismissStaffNotification(id) {
  db.prepare(
    `UPDATE staff_notifications SET dismissedAt = CURRENT_TIMESTAMP WHERE id = ? AND dismissedAt IS NULL`,
  ).run(id);
  return getStaffNotificationById(id);
}

export function notifyPaymentProofInbox(proof) {
  if (!proof) return null;
  const roll = proof.studentRollNo ? `Roll ${proof.studentRollNo}` : "Student";
  const title = `${roll} · ${proof.studentName}`;
  const body = `Fees screenshot submitted · ${proof.invoiceNo}`;
  return createStaffNotification({
    type: "payment_proof_submitted",
    title,
    body,
    imageUrl: proof.imageUrl,
    linkPath: `/invoices?openInvoice=${proof.invoiceId}`,
    sourceType: "payment_proof",
    sourceId: String(proof.id),
    metadata: {
      studentName: proof.studentName,
      studentRollNo: proof.studentRollNo,
      parentName: proof.parentName,
      invoiceId: proof.invoiceId,
      invoiceNo: proof.invoiceNo,
      month: proof.month,
      year: proof.year,
      proofId: proof.id,
    },
  });
}

export function notifyContentInbox(submission, { eventType = "submitted" } = {}) {
  if (!submission) return null;
  const label = submission.contentLabel ?? CONTENT_LABELS[submission.contentType] ?? "Teacher submission";
  const roll = submission.studentRollNo ? `Roll ${submission.studentRollNo}` : "Student";
  const title = `${roll} · ${submission.studentName}`;
  const isWithdrawn = eventType === "withdrawn";
  const body = isWithdrawn
    ? `${label} withdrawn · ${submission.teacherName}`
    : `${label} submitted for approval · ${submission.teacherName}`;
  const contentId = submission.contentId ?? submission.id;
  return createStaffNotification({
    type: isWithdrawn ? "content_withdrawn" : "content_submitted",
    title,
    body,
    imageUrl: submission.imageUrl ?? null,
    linkPath: "/content-approvals",
    sourceType: isWithdrawn ? "content_event" : "content_submission",
    sourceId: isWithdrawn
      ? `withdrawn:${submission.contentType}:${contentId}:${submission.submittedAt ?? Date.now()}`
      : `${submission.contentType}:${contentId}`,
    metadata: {
      studentName: submission.studentName,
      studentRollNo: submission.studentRollNo,
      teacherName: submission.teacherName,
      contentLabel: label,
      contentType: submission.contentType,
      contentId,
      preview: submission.preview ?? null,
      eventType,
    },
  });
}

export function notifyContentHandledInbox(submission, status, rejectionReason = null) {
  if (!submission) return;
  const label = submission.contentLabel ?? CONTENT_LABELS[submission.contentType] ?? "Teacher submission";
  const contentId = submission.contentId ?? submission.id;
  const sourceId = `${submission.contentType}:${contentId}`;
  const existing = db
    .prepare(
      `SELECT id FROM staff_notifications
       WHERE sourceType = 'content_submission' AND sourceId = ? AND dismissedAt IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(sourceId);

  const roll = submission.studentRollNo ? `Roll ${submission.studentRollNo}` : "Student";
  const title = `${roll} · ${submission.studentName}`;
  const body =
    status === "approved"
      ? `${label} approved`
      : `${label} rejected${rejectionReason ? ` · ${rejectionReason}` : ""}`;

  if (existing) {
    db.prepare(
      `UPDATE staff_notifications
       SET type = ?, body = ?, handledAt = CURRENT_TIMESTAMP,
           readAt = COALESCE(readAt, CURRENT_TIMESTAMP)
       WHERE id = ?`,
    ).run(status === "approved" ? "content_approved" : "content_rejected", body, existing.id);
    return getStaffNotificationById(existing.id);
  }

  return createStaffNotification({
    type: status === "approved" ? "content_approved" : "content_rejected",
    title,
    body,
    imageUrl: submission.imageUrl ?? null,
    linkPath: "/content-approvals",
    sourceType: "content_submission",
    sourceId,
    metadata: {
      studentName: submission.studentName,
      studentRollNo: submission.studentRollNo,
      teacherName: submission.teacherName,
      contentLabel: label,
      contentType: submission.contentType,
      contentId,
      preview: submission.preview ?? null,
    },
    handledAt: new Date().toISOString(),
    readAt: new Date().toISOString(),
  });
}

export function backfillStaffNotifications() {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM staff_notifications`).get()?.c ?? 0;
  if (count > 0) return;

  const proofs = db
    .prepare(
      `SELECT pp.*, i.invoiceNo, i.month, i.year, i.status AS invoiceStatus, i.studentId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS parentName
       FROM payment_proofs pp
       JOIN invoices i ON i.id = pp.invoiceId
       JOIN students s ON s.id = i.studentId
       JOIN users u ON u.id = pp.parentId
       ORDER BY pp.submittedAt ASC`,
    )
    .all();

  for (const row of proofs) {
    const proof = {
      id: row.id,
      invoiceId: row.invoiceId,
      imageUrl: publicUploadUrl(row.filePath),
      invoiceNo: row.invoiceNo,
      month: row.month,
      year: row.year,
      studentName: row.studentName,
      studentRollNo: row.studentRollNo,
      parentName: row.parentName,
    };
    const notification = notifyPaymentProofInbox(proof);
    if (row.reviewedAt) {
      db.prepare(`UPDATE staff_notifications SET readAt = ? WHERE id = ?`).run(row.reviewedAt, notification.id);
    }
    if (row.invoiceStatus === "paid") {
      db.prepare(
        `UPDATE staff_notifications
         SET handledAt = COALESCE(handledAt, CURRENT_TIMESTAMP), type = 'invoice_paid',
             body = 'Invoice marked paid'
         WHERE id = ?`,
      ).run(notification.id);
    }
  }

  const events = db
    .prepare(
      `SELECT e.*, s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName
       FROM staff_content_events e
       JOIN students s ON s.id = e.studentId
       JOIN users u ON u.id = e.teacherId
       WHERE e.eventType = 'withdrawn'
       ORDER BY e.createdAt ASC`,
    )
    .all();

  for (const row of events) {
    const label = CONTENT_LABELS[row.contentType] ?? row.contentType;
    const roll = row.studentRollNo ? `Roll ${row.studentRollNo}` : "Student";
    createStaffNotification({
      type: "content_withdrawn",
      title: `${roll} · ${row.studentName}`,
      body: `${label} withdrawn · ${row.teacherName}`,
      imageUrl: row.imagePath ? publicUploadUrl(row.imagePath) : null,
      linkPath: "/content-approvals",
      sourceType: "content_event",
      sourceId: `event:${row.id}`,
      metadata: {
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        teacherName: row.teacherName,
        contentLabel: label,
        contentType: row.contentType,
        contentId: row.contentId,
        preview: row.preview,
        eventType: "withdrawn",
      },
      createdAt: row.createdAt,
    });
  }

  const pendingDiary = db
    .prepare(
      `SELECT 'diary' AS contentType, d.id AS contentId, d.submittedAt, d.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              d.mood AS preview
       FROM daycare_diary_entries d
       JOIN students s ON s.id = d.studentId
       JOIN users u ON u.id = d.teacherId
       WHERE d.approvalStatus = 'pending'`,
    )
    .all();
  const pendingNotices = db
    .prepare(
      `SELECT 'notices' AS contentType, n.id AS contentId, n.submittedAt, n.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              n.message AS preview
       FROM parent_notices n
       JOIN students s ON s.id = n.studentId
       JOIN users u ON u.id = n.teacherId
       WHERE n.approvalStatus = 'pending'`,
    )
    .all();
  const pendingGallery = db
    .prepare(
      `SELECT 'gallery' AS contentType, g.id AS contentId, g.submittedAt, g.teacherId,
              s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName,
              g.caption AS preview, g.filePath AS imagePath
       FROM gallery_photos g
       JOIN students s ON s.id = g.studentId
       JOIN users u ON u.id = g.teacherId
       WHERE g.approvalStatus = 'pending'`,
    )
    .all();

  for (const row of [...pendingDiary, ...pendingNotices, ...pendingGallery]) {
    const label = CONTENT_LABELS[row.contentType] ?? row.contentType;
    const roll = row.studentRollNo ? `Roll ${row.studentRollNo}` : "Student";
    createStaffNotification({
      type: "content_submitted",
      title: `${roll} · ${row.studentName}`,
      body: `${label} submitted for approval · ${row.teacherName}`,
      imageUrl: row.imagePath ? publicUploadUrl(row.imagePath) : null,
      linkPath: "/content-approvals",
      sourceType: "content_submission",
      sourceId: `${row.contentType}:${row.contentId}`,
      metadata: {
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        teacherName: row.teacherName,
        contentLabel: label,
        contentType: row.contentType,
        contentId: row.contentId,
        preview: row.preview,
        eventType: "submitted",
      },
      createdAt: row.submittedAt,
    });
  }

  const history = db
    .prepare(
      `SELECT h.*, s.name AS studentName, s.rollNo AS studentRollNo, u.name AS teacherName
       FROM content_approval_history h
       JOIN students s ON s.id = h.studentId
       LEFT JOIN users u ON u.id = h.teacherId
       WHERE h.action IN ('approved', 'rejected', 'approved_deletion')
       ORDER BY h.reviewedAt ASC`,
    )
    .all();

  for (const row of history) {
    const label = CONTENT_LABELS[row.contentType] ?? row.contentType;
    const roll = row.studentRollNo ? `Roll ${row.studentRollNo}` : "Student";
    const approved = row.action === "approved" || row.action === "approved_deletion";
    createStaffNotification({
      type: approved ? "content_approved" : "content_rejected",
      title: `${roll} · ${row.studentName}`,
      body: approved
        ? `${label} approved`
        : `${label} rejected${row.rejectionReason ? ` · ${row.rejectionReason}` : ""}`,
      linkPath: "/content-approvals",
      sourceType: "content_approval",
      sourceId: `history:${row.id}`,
      metadata: {
        studentName: row.studentName,
        studentRollNo: row.studentRollNo,
        teacherName: row.teacherName,
        contentLabel: label,
        contentType: row.contentType,
        contentId: row.contentId,
      },
      createdAt: row.reviewedAt,
      readAt: row.reviewedAt,
      handledAt: row.reviewedAt,
    });
  }
}
