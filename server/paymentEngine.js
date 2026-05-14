import { db } from "./db.js";

const MONTH_INDEX = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function periodSortKey(monthStr, year) {
  const m = MONTH_INDEX[String(monthStr || "").trim().toLowerCase()] ?? 0;
  const y = Number(year) || 0;
  return y * 100 + m;
}

function chargeTypeOrder(chargeType) {
  const order = { registration: 1, annual: 2, monthly: 3, meals: 4 };
  return order[chargeType] || 5;
}

/** Sum of charge lines only (excludes discounts) — for ledger / gross billed. */
export function invoiceChargesGross(invoiceId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_items
       WHERE invoiceId = ? AND (type IS NULL OR TRIM(type) = '' OR type = 'charge')`,
    )
    .get(invoiceId);
  return roundMoney(row.s || 0);
}

/** Net amount for an invoice from line items (charges minus discounts). */
export function invoiceNetFromItems(invoiceId) {
  const row = db
    .prepare(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END), 0) AS charges,
         COALESCE(SUM(CASE WHEN type = 'discount' THEN amount ELSE 0 END), 0) AS discounts
       FROM invoice_items WHERE invoiceId = ?`,
    )
    .get(invoiceId);
  return roundMoney((row.charges || 0) - (row.discounts || 0));
}

/** Sum of paidAmount on charge lines only. */
export function invoicePaidOnCharges(invoiceId) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(paidAmount), 0) AS s FROM invoice_items WHERE invoiceId = ? AND type = 'charge'`,
    )
    .get(invoiceId);
  return roundMoney(r.s || 0);
}

/** Remaining balance on one invoice (net − paid on charges). */
export function invoiceUnpaidBalance(invoiceId) {
  const net = invoiceNetFromItems(invoiceId);
  const paid = invoicePaidOnCharges(invoiceId);
  return roundMoney(Math.max(0, net - paid));
}

/**
 * Unpaid total from invoices strictly before the given billing period (FIFO “prior balance”).
 */
export function priorOpenBalanceForPeriod(studentId, month, year) {
  const sid = parseInt(studentId, 10);
  const cutoff = periodSortKey(month, year);
  const invs = db
    .prepare(`SELECT id, month, year FROM invoices WHERE studentId = ?`)
    .all(sid);
  let sum = 0;
  for (const inv of invs) {
    if (periodSortKey(inv.month, inv.year) >= cutoff) continue;
    sum += invoiceUnpaidBalance(inv.id);
  }
  return roundMoney(sum);
}

/**
 * Ordered open charge lines: oldest invoice period first, then registration→annual→monthly→meals→other.
 */
export function getOpenChargeItemsOrdered(studentId, restrictToInvoiceId = null) {
  const sid = parseInt(studentId, 10);
  const sql = restrictToInvoiceId
    ? `SELECT ii.id, ii.invoiceId, ii.amount, ii.paidAmount, ii.chargeType, ii.description,
              i.month, i.year, i.invoiceNo, i.studentId
       FROM invoice_items ii
       INNER JOIN invoices i ON i.id = ii.invoiceId
       WHERE i.studentId = ? AND ii.invoiceId = ? AND ii.type = 'charge'`
    : `SELECT ii.id, ii.invoiceId, ii.amount, ii.paidAmount, ii.chargeType, ii.description,
              i.month, i.year, i.invoiceNo, i.studentId
       FROM invoice_items ii
       INNER JOIN invoices i ON i.id = ii.invoiceId
       WHERE i.studentId = ? AND ii.type = 'charge'`;
  const rows = restrictToInvoiceId
    ? db.prepare(sql).all(sid, restrictToInvoiceId)
    : db.prepare(sql).all(sid);

  rows.sort((a, b) => {
    const ka = periodSortKey(a.month, a.year);
    const kb = periodSortKey(b.month, b.year);
    if (ka !== kb) return ka - kb;
    const oa = chargeTypeOrder(a.chargeType);
    const ob = chargeTypeOrder(b.chargeType);
    if (oa !== ob) return oa - ob;
    return a.id - b.id;
  });

  return rows.filter((r) => roundMoney(r.amount - (r.paidAmount || 0)) > 0.0001);
}

/**
 * Simulate applying `amount` without persisting. Returns allocation rows with invoice context.
 */
export function previewAllocation(studentId, amount, restrictToInvoiceId = null) {
  const rounded = roundMoney(amount);
  const items = getOpenChargeItemsOrdered(studentId, restrictToInvoiceId);
  let remaining = rounded;
  const allocations = [];
  for (const it of items) {
    if (remaining <= 0) break;
    const unpaid = roundMoney(it.amount - (it.paidAmount || 0));
    if (unpaid <= 0) continue;
    const part = roundMoney(Math.min(remaining, unpaid));
    allocations.push({
      invoiceItemId: it.id,
      invoiceId: it.invoiceId,
      invoiceNo: it.invoiceNo,
      month: it.month,
      year: it.year,
      description: it.description,
      chargeType: it.chargeType,
      lineAmount: it.amount,
      paidBefore: it.paidAmount || 0,
      allocated: part,
      remainingOnLine: roundMoney(unpaid - part),
    });
    remaining = roundMoney(remaining - part);
  }
  return { allocations, remainingAmount: Math.max(0, remaining) };
}

export function recalcPaidAmountForItem(invoiceItemId) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM fee_payment_allocations WHERE invoiceItemId = ?`,
    )
    .get(invoiceItemId);
  db.prepare(`UPDATE invoice_items SET paidAmount = ? WHERE id = ?`).run(roundMoney(r.s || 0), invoiceItemId);
}

export function syncInvoiceStatus(invoiceId) {
  const inv = db.prepare(`SELECT id, amount FROM invoices WHERE id = ?`).get(invoiceId);
  if (!inv) return;
  const net = invoiceNetFromItems(invoiceId);
  const paid = invoicePaidOnCharges(invoiceId);
  const paidFull = paid >= net - 0.009;
  const status = paidFull ? "paid" : "pending";
  const lastPay = paidFull
    ? db
        .prepare(
          `SELECT fp.paymentDate
           FROM fee_payment_allocations a
           INNER JOIN fee_payments fp ON fp.id = a.feePaymentId
           INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
           WHERE ii.invoiceId = ?
           ORDER BY fp.createdAt DESC, fp.id DESC
           LIMIT 1`,
        )
        .get(invoiceId)
    : null;
  const payDateVal = paidFull ? lastPay?.paymentDate || null : null;
  db.prepare(`UPDATE invoices SET status = ?, paymentDate = ? WHERE id = ?`).run(status, payDateVal, invoiceId);
}

export function syncInvoiceStatusesForInvoiceIds(invoiceIds) {
  const uniq = [...new Set(invoiceIds.filter(Boolean))];
  for (const id of uniq) syncInvoiceStatus(id);
}

/** Recompute header `invoices.amount` from prior open balance + this period net (matches POST /invoices). */
export function refreshInvoiceStatementAmount(invoiceId) {
  const iid = parseInt(invoiceId, 10);
  if (Number.isNaN(iid)) return;
  const inv = db.prepare(`SELECT studentId, month, year FROM invoices WHERE id = ?`).get(iid);
  if (!inv) return;
  const prior = priorOpenBalanceForPeriod(inv.studentId, inv.month, inv.year);
  const periodNet = invoiceNetFromItems(iid);
  db.prepare(`UPDATE invoices SET amount = ? WHERE id = ?`).run(roundMoney(prior + periodNet), iid);
}

/**
 * Record one receipt; allocate FIFO across student (or single invoice if restricted).
 */
export function recordFeePayment(studentId, amount, paymentDate, remarks, createdBy, options = {}) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid)) throw new Error("INVALID_STUDENT");
  const rounded = roundMoney(amount);
  if (rounded <= 0) throw new Error("INVALID_AMOUNT");

  const restrictToInvoiceId = options.restrictToInvoiceId ?? null;
  const preview = previewAllocation(sid, rounded, restrictToInvoiceId);
  const { allocations, remainingAmount } = preview;

  const createdAt = new Date().toISOString();
  const payDate =
    paymentDate && String(paymentDate).trim() ? String(paymentDate).trim() : createdAt.slice(0, 10);

  let feePaymentId = 0;
  const invoiceIdsTouched = [];

  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO fee_payments (studentId, totalAmount, paymentDate, remarks, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sid, rounded, payDate, remarks ?? null, createdBy ?? null, createdAt);
    feePaymentId = r.lastInsertRowid;
    const insertAlloc = db.prepare(
      `INSERT INTO fee_payment_allocations (feePaymentId, invoiceItemId, amount) VALUES (?, ?, ?)`,
    );
    const bumpPaid = db.prepare(`UPDATE invoice_items SET paidAmount = paidAmount + ? WHERE id = ?`);
    for (const a of allocations) {
      insertAlloc.run(feePaymentId, a.invoiceItemId, a.allocated);
      bumpPaid.run(a.allocated, a.invoiceItemId);
      invoiceIdsTouched.push(a.invoiceId);
    }
    syncInvoiceStatusesForInvoiceIds(invoiceIdsTouched);
  });
  tx();

  const enriched = allocations.map((a) => ({
    itemId: a.invoiceItemId,
    invoiceId: a.invoiceId,
    invoiceNo: a.invoiceNo,
    month: a.month,
    year: a.year,
    description: a.description,
    chargeType: a.chargeType,
    lineAmount: a.lineAmount,
    paidBefore: a.paidBefore,
    allocated: a.allocated,
    remainingOnLine: a.remainingOnLine,
  }));

  return {
    feePaymentId,
    allocations: enriched,
    remainingAmount,
    totalAllocated: roundMoney(rounded - remainingAmount),
  };
}

/**
 * Remove all fee allocations targeting this invoice’s line items, then shrink or delete parent receipts.
 * Recalculates paid amounts on every line still linked to touched receipts (including other invoices).
 * Call before DELETE invoice. Does not wrap in a transaction (caller may wrap).
 */
export function stripFeeAllocationsForInvoice(invoiceId) {
  const iid = parseInt(invoiceId, 10);
  if (Number.isNaN(iid)) throw new Error("INVALID_INVOICE");

  const itemRows = db.prepare(`SELECT id FROM invoice_items WHERE invoiceId = ?`).all(iid);
  const itemIds = itemRows.map((r) => r.id);
  if (itemIds.length === 0) return { removedAllocations: 0 };

  const placeholders = itemIds.map(() => "?").join(",");

  const fpRows = db
    .prepare(
      `SELECT DISTINCT a.feePaymentId AS id FROM fee_payment_allocations a WHERE a.invoiceItemId IN (${placeholders})`,
    )
    .all(...itemIds);
  const feePaymentIds = fpRows.map((r) => r.id);
  if (feePaymentIds.length === 0) return { removedAllocations: 0 };

  const allItemIdsToRecalc = new Set();
  for (const fpId of feePaymentIds) {
    const rows = db
      .prepare(`SELECT DISTINCT invoiceItemId FROM fee_payment_allocations WHERE feePaymentId = ?`)
      .all(fpId);
    rows.forEach((r) => allItemIdsToRecalc.add(r.invoiceItemId));
  }

  const removed = db
    .prepare(`DELETE FROM fee_payment_allocations WHERE invoiceItemId IN (${placeholders})`)
    .run(...itemIds).changes;

  for (const fpId of feePaymentIds) {
    const sumRow = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM fee_payment_allocations WHERE feePaymentId = ?`)
      .get(fpId);
    const s = roundMoney(sumRow.s || 0);
    if (s < 0.01) {
      db.prepare(`DELETE FROM fee_payments WHERE id = ?`).run(fpId);
    } else {
      db.prepare(`UPDATE fee_payments SET totalAmount = ? WHERE id = ?`).run(s, fpId);
    }
  }

  const invoiceIdsToSync = new Set();
  for (const itemId of allItemIdsToRecalc) {
    const row = db.prepare(`SELECT invoiceId FROM invoice_items WHERE id = ?`).get(itemId);
    if (row) {
      recalcPaidAmountForItem(itemId);
      invoiceIdsToSync.add(row.invoiceId);
    }
  }
  for (const invId of invoiceIdsToSync) {
    syncInvoiceStatus(invId);
  }

  return { removedAllocations: removed, feePaymentsAdjusted: feePaymentIds.length };
}

export function deleteFeePayment(feePaymentId) {
  const id = parseInt(feePaymentId, 10);
  if (Number.isNaN(id)) throw new Error("INVALID_PAYMENT");

  const row = db.prepare(`SELECT id FROM fee_payments WHERE id = ?`).get(id);
  if (!row) throw new Error("NOT_FOUND");

  const itemIds = db
    .prepare(`SELECT DISTINCT invoiceItemId FROM fee_payment_allocations WHERE feePaymentId = ?`)
    .all(id)
    .map((x) => x.invoiceItemId);

  const invIds = db
    .prepare(
      `SELECT DISTINCT ii.invoiceId FROM fee_payment_allocations a
       INNER JOIN invoice_items ii ON ii.id = a.invoiceItemId
       WHERE a.feePaymentId = ?`,
    )
    .all(id)
    .map((x) => x.invoiceId);

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM fee_payments WHERE id = ?`).run(id);
    for (const iid of itemIds) {
      recalcPaidAmountForItem(iid);
    }
    syncInvoiceStatusesForInvoiceIds(invIds);
  });
  tx();

  return { recalculatedItemIds: itemIds, invoiceIds: invIds };
}

export function migrateLegacyPayments() {
  const tbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fee_payments'`).get();
  if (!tbl) return;

  const done = db.prepare(`SELECT 1 FROM app_meta WHERE key = 'fee_payments_migrated_v1'`).get();
  if (done) return;

  const countPh = db.prepare(`SELECT COUNT(*) as c FROM payment_history`).get().c;
  if (countPh === 0) {
    db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('fee_payments_migrated_v1', '1')`).run();
    return;
  }

  db.prepare(`UPDATE invoice_items SET paidAmount = 0`).run();
  const rows = db
    .prepare(
      `SELECT ph.*, i.studentId
         FROM payment_history ph
         INNER JOIN invoices i ON i.id = ph.invoiceId
         ORDER BY ph.id ASC`,
    )
    .all();
  for (const ph of rows) {
    recordFeePayment(ph.studentId, ph.amount, ph.paymentDate, ph.remarks, ph.createdBy, {
      restrictToInvoiceId: ph.invoiceId,
    });
  }
  db.prepare(`DELETE FROM payment_history`).run();
  db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('fee_payments_migrated_v1', '1')`).run();
  console.log("Migrated payment_history to fee_payments + fee_payment_allocations.");
}
