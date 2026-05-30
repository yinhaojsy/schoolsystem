import { db } from "./db.js";
import { publicUploadUrl } from "./utils/uploads.js";
import { broadcastStaffEvent } from "./staffNotifications.js";
import { sendPushToAllAdmins } from "./webPush.js";

export function formatPaymentProofRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    parentId: row.parentId,
    filePath: row.filePath,
    imageUrl: publicUploadUrl(row.filePath),
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt ?? null,
    invoiceNo: row.invoiceNo,
    month: row.month,
    year: row.year,
    invoiceStatus: row.invoiceStatus,
    studentId: row.studentId,
    studentName: row.studentName,
    studentRollNo: row.studentRollNo,
    parentName: row.parentName,
  };
}

const proofSelectSql = `
  SELECT pp.*,
         i.invoiceNo, i.month, i.year, i.status AS invoiceStatus, i.studentId,
         s.name AS studentName, s.rollNo AS studentRollNo,
         u.name AS parentName
  FROM payment_proofs pp
  JOIN invoices i ON i.id = pp.invoiceId
  JOIN students s ON s.id = i.studentId
  JOIN users u ON u.id = pp.parentId
`;

const ACTIVE_WHERE = `WHERE i.status != 'paid'`;

export function listPendingPaymentProofs() {
  return listActiveNotifications({ limit: 1000 }).items;
}

export function countUnreadActiveNotifications() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM payment_proofs pp
       JOIN invoices i ON i.id = pp.invoiceId
       ${ACTIVE_WHERE} AND pp.reviewedAt IS NULL`,
    )
    .get();
  return row?.c ?? 0;
}

export function listActiveNotifications({ page, limit = 20 } = {}) {
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM payment_proofs pp
       JOIN invoices i ON i.id = pp.invoiceId
       ${ACTIVE_WHERE}`,
    )
    .get();
  const total = totalRow?.c ?? 0;
  const unreadCount = countUnreadActiveNotifications();

  if (page != null) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    const rows = db
      .prepare(
        `${proofSelectSql}
         ${ACTIVE_WHERE}
         ORDER BY pp.submittedAt DESC
         LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, offset);
    return {
      items: rows.map(formatPaymentProofRow),
      total,
      unreadCount,
      page: safePage,
      limit: safeLimit,
    };
  }

  const previewLimit = Math.min(Math.max(limit, 1), 20);
  const rows = db
    .prepare(
      `${proofSelectSql}
       ${ACTIVE_WHERE}
       ORDER BY pp.submittedAt DESC
       LIMIT ?`,
    )
    .all(previewLimit);
  return {
    items: rows.map(formatPaymentProofRow),
    total,
    unreadCount,
  };
}

export function getPaymentProofById(proofId) {
  const row = db.prepare(`${proofSelectSql} WHERE pp.id = ?`).get(proofId);
  return formatPaymentProofRow(row);
}

export function getPaymentProofByInvoiceId(invoiceId) {
  const row = db.prepare(`${proofSelectSql} WHERE pp.invoiceId = ?`).get(invoiceId);
  return formatPaymentProofRow(row);
}

export function markPaymentProofReviewed(proofId) {
  db.prepare(`UPDATE payment_proofs SET reviewedAt = CURRENT_TIMESTAMP WHERE id = ? AND reviewedAt IS NULL`).run(proofId);
  return getPaymentProofById(proofId);
}

/** Alias: staff has opened / acknowledged this notification. */
export function markPaymentProofRead(proofId) {
  return markPaymentProofReviewed(proofId);
}

export function notifyPaymentProofSubmitted(proofId) {
  const proof = getPaymentProofById(proofId);
  if (!proof) return null;

  broadcastStaffEvent({ type: "payment_proof", proof });

  const roll = proof.studentRollNo ? `Roll ${proof.studentRollNo}` : "Student";
  const body = `${roll} · ${proof.studentName} · ${proof.invoiceNo}`;
  void sendPushToAllAdmins({
    title: "Fees screenshot submitted",
    body,
    url: `/staff/invoices?openInvoice=${proof.invoiceId}`,
    invoiceId: proof.invoiceId,
    proofId: proof.id,
  });

  return proof;
}
