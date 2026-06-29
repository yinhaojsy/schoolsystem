import { db } from "./db.js";
import { roundMoney } from "./paymentEngine.js";

/** @param {import('better-sqlite3').Database} database */
export function nextParticipantCode(database) {
  const row = database
    .prepare(
      `SELECT participantCode FROM event_participants
       WHERE participantCode GLOB 'ex[0-9]*'
       ORDER BY CAST(substr(participantCode, 3) AS INTEGER) DESC
       LIMIT 1`,
    )
    .get();
  if (!row?.participantCode) return "ex001";
  const match = /^ex(\d+)$/i.exec(String(row.participantCode).trim());
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `ex${String(next).padStart(3, "0")}`;
}

export function mapEventRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    defaultPrice: row.defaultPrice,
    startDate: row.startDate,
    endDate: row.endDate,
    enrollmentDeadline: row.enrollmentDeadline,
    status: row.status,
    notes: row.notes,
    copiedFromEventId: row.copiedFromEventId,
    createdAt: row.createdAt,
    participantCount: row.participantCount ?? undefined,
    invoicedCount: row.invoicedCount ?? undefined,
    paidCount: row.paidCount ?? undefined,
  };
}

export function mapEventParticipantRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName,
    studentId: row.studentId ?? null,
    studentRollNo: row.studentRollNo ?? null,
    participantCode: row.participantCode,
    participantName: row.participantName,
    invoiceDescription: row.invoiceDescription,
    agreedAmount: row.agreedAmount,
    age: row.age,
    guardianName: row.guardianName,
    email: row.email,
    contactNo: row.contactNo,
    status: row.status,
    invoiceId: row.invoiceId,
    invoiceNo: row.invoiceNo,
    invoiceStatus: row.invoiceStatus,
    createdAt: row.createdAt,
    extras: row.extras ?? undefined,
  };
}

export function mapParticipantExtraRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    participantId: row.participantId,
    extraOptionId: row.extraOptionId ?? null,
    label: row.label,
    amount: row.amount,
    createdAt: row.createdAt,
  };
}

export function getParticipantExtras(participantId) {
  const pid = parseInt(participantId, 10);
  if (Number.isNaN(pid)) return [];
  return db
    .prepare(
      `SELECT id, participantId, extraOptionId, label, amount, createdAt
       FROM event_participant_extras WHERE participantId = ? ORDER BY id ASC`,
    )
    .all(pid)
    .map(mapParticipantExtraRow);
}

export function getParticipantExtrasMap(participantIds) {
  const ids = [...new Set(participantIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))];
  const map = {};
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, participantId, extraOptionId, label, amount, createdAt
       FROM event_participant_extras WHERE participantId IN (${placeholders}) ORDER BY id ASC`,
    )
    .all(...ids);
  for (const row of rows) {
    const mapped = mapParticipantExtraRow(row);
    if (!map[mapped.participantId]) map[mapped.participantId] = [];
    map[mapped.participantId].push(mapped);
  }
  return map;
}

export function normalizeParticipantExtras(rawExtras) {
  if (!Array.isArray(rawExtras)) return [];
  const out = [];
  for (const raw of rawExtras) {
    const included = raw.included === true || raw.included === 1 || raw.included === "1";
    if (!included) continue;
    const label = String(raw.label ?? raw.name ?? "").trim();
    if (!label) continue;
    const amount = roundMoney(Number(raw.amount));
    if (Number.isNaN(amount) || amount < 0) continue;
    const extraOptionIdRaw = raw.extraOptionId;
    const extraOptionId =
      extraOptionIdRaw != null && extraOptionIdRaw !== ""
        ? parseInt(String(extraOptionIdRaw), 10)
        : null;
    out.push({
      extraOptionId: extraOptionId != null && !Number.isNaN(extraOptionId) ? extraOptionId : null,
      label,
      amount,
    });
  }
  return out;
}

export function replaceParticipantExtras(participantId, rawExtras) {
  const pid = parseInt(participantId, 10);
  if (Number.isNaN(pid)) return [];
  const extras = normalizeParticipantExtras(rawExtras);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM event_participant_extras WHERE participantId = ?`).run(pid);
    const insert = db.prepare(
      `INSERT INTO event_participant_extras (participantId, extraOptionId, label, amount) VALUES (?, ?, ?, ?)`,
    );
    for (const x of extras) {
      insert.run(pid, x.extraOptionId, x.label, x.amount);
    }
  });
  tx();
  return getParticipantExtras(pid);
}

export function participantInvoiceLineItems(participant, extras) {
  const lines = [];
  const mainAmount = roundMoney(Number(participant.agreedAmount) || 0);
  if (mainAmount > 0) {
    lines.push({
      description: participant.invoiceDescription,
      amount: mainAmount,
    });
  }
  for (const x of extras || []) {
    const amt = roundMoney(Number(x.amount) || 0);
    if (amt > 0.009) {
      lines.push({ description: x.label, amount: amt });
    }
  }
  return lines;
}

export function participantTotalAmount(participant, extras) {
  return roundMoney(
    participantInvoiceLineItems(participant, extras).reduce((s, l) => s + l.amount, 0),
  );
}

function fetchParticipantRow(participantId) {
  return db
    .prepare(
      `SELECT ep.*, e.name AS eventName, s.rollNo AS studentRollNo, i.invoiceNo, i.status AS invoiceStatus
       FROM event_participants ep
       INNER JOIN events e ON e.id = ep.eventId
       LEFT JOIN students s ON s.id = ep.studentId
       LEFT JOIN invoices i ON i.id = ep.invoiceId
       WHERE ep.id = ?`,
    )
    .get(participantId);
}

export function mapParticipantResponse(participantId) {
  const row = fetchParticipantRow(participantId);
  if (!row) return null;
  const extras = getParticipantExtras(participantId);
  return { ...mapEventParticipantRow(row), extras };
}

function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth || String(dateOfBirth).trim().length < 10) return null;
  const dob = new Date(String(dateOfBirth).slice(0, 10));
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function resolveParticipantFromBody(body, { eventId, existingStudentId = null, excludeParticipantId = null } = {}) {
  let studentId = null;
  if (Object.prototype.hasOwnProperty.call(body, "studentId")) {
    if (body.studentId != null && body.studentId !== "") {
      studentId = parseInt(String(body.studentId), 10);
      if (Number.isNaN(studentId)) studentId = null;
    }
  } else if (existingStudentId != null && existingStudentId !== "") {
    studentId = parseInt(String(existingStudentId), 10);
    if (Number.isNaN(studentId)) studentId = null;
  }

  let participantName = body.participantName ? String(body.participantName).trim() : "";
  let guardianName = body.guardianName ? String(body.guardianName).trim() : null;
  let email = body.email ? String(body.email).trim() : null;
  let contactNo = body.contactNo ? String(body.contactNo).trim() : null;
  let age =
    body.age != null && body.age !== "" ? parseInt(String(body.age), 10) : null;

  if (studentId != null && !Number.isNaN(studentId)) {
    const student = db
      .prepare(
        `SELECT id, name, parentsName, contactNo, dateOfBirth, status, enrollmentStatus
         FROM students WHERE id = ?`,
      )
      .get(studentId);
    if (!student) {
      return { error: "Student not found." };
    }
    if (student.status !== "active" || (student.enrollmentStatus ?? "enrolled") === "left") {
      return { error: "That student is not currently enrolled." };
    }
    const dup = db
      .prepare(
        `SELECT id FROM event_participants WHERE eventId = ? AND studentId = ? AND id != COALESCE(?, -1)`,
      )
      .get(eventId, studentId, excludeParticipantId);
    if (dup) {
      return { error: "This student is already on the participant list for this event." };
    }
    participantName = student.name;
    if (!guardianName && student.parentsName) guardianName = String(student.parentsName).trim();
    if (!contactNo && student.contactNo) contactNo = String(student.contactNo).trim();
    if ((age == null || Number.isNaN(age)) && student.dateOfBirth) {
      age = ageFromDateOfBirth(student.dateOfBirth);
    }
  } else if (!participantName) {
    return { error: "Name is required." };
  }

  const invoiceDescription = body.invoiceDescription ? String(body.invoiceDescription).trim() : "";
  if (!invoiceDescription) {
    return { error: "Invoice description is required." };
  }

  const amount = roundMoney(Number(body.agreedAmount));
  if (Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }

  return {
    studentId: studentId != null && !Number.isNaN(studentId) ? studentId : null,
    participantName,
    invoiceDescription,
    agreedAmount: amount,
    age: age != null && !Number.isNaN(age) ? age : null,
    guardianName: guardianName || null,
    email: email || null,
    contactNo: contactNo || null,
  };
}
