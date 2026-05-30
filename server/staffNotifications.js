import crypto from "node:crypto";

/** @type {Set<{ res: import('express').Response; userId: number }>} */
const sseClients = new Set();

/** @type {Map<string, { userId: number; expiresAt: number }>} */
const streamTokens = new Map();

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createStreamToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  streamTokens.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function validateStreamToken(token) {
  if (!token) return null;
  const entry = streamTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    streamTokens.delete(token);
    return null;
  }
  return entry.userId;
}

export function addSseClient(res, userId) {
  sseClients.add({ res, userId });
}

export function removeSseClient(res) {
  for (const client of sseClients) {
    if (client.res === res) {
      sseClients.delete(client);
      break;
    }
  }
}

export function broadcastStaffEvent(payload) {
  const data = JSON.stringify(payload);
  for (const client of sseClients) {
    try {
      client.res.write("event: staff\n");
      client.res.write(`data: ${data}\n\n`);
    } catch {
      removeSseClient(client.res);
    }
  }
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
