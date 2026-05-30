import webpush from "web-push";
import { db } from "./db.js";

let pushEnabled = false;

const vapidPublic = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const vapidSubject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@school.com";

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  pushEnabled = true;
} else if (process.env.NODE_ENV !== "production") {
  console.warn(
    "[web-push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — browser push disabled. Run: npx web-push generate-vapid-keys",
  );
}

export function isWebPushEnabled() {
  return pushEnabled;
}

export function getVapidPublicKey() {
  return pushEnabled ? vapidPublic : null;
}

export async function sendPushToUser(userId, payload) {
  if (!pushEnabled) return;
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE userId = ?`).all(userId);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
    } catch (err) {
      const status = err && typeof err === "object" && "statusCode" in err ? err.statusCode : null;
      if (status === 404 || status === 410) {
        db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
      }
    }
  }
}

export async function sendPushToAllAdmins(payload) {
  if (!pushEnabled) return;
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all();
  await Promise.all(admins.map((a) => sendPushToUser(a.id, payload)));
}

export function savePushSubscription(userId, subscription, userAgent) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("INVALID_SUBSCRIPTION");
  }

  db.prepare(
    `INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, userAgent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       userId = excluded.userId,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       userAgent = excluded.userAgent`,
  ).run(userId, endpoint, p256dh, auth, userAgent ?? null);
}

export function deletePushSubscription(userId, endpoint) {
  db.prepare(`DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?`).run(userId, endpoint);
}
