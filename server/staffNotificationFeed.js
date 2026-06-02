import {
  listActiveNotifications as listPaymentProofNotifications,
  countUnreadActiveNotifications as countUnreadPaymentProofs,
} from "./paymentProofs.js";
import {
  listPendingContentSubmissions,
  countPendingContentSubmissions,
  listStaffContentEvents,
} from "./teacherContent.js";

function mergeNotificationItems(paymentItems, contentItems, contentEvents) {
  const payment = paymentItems.map((p) => ({ ...p, kind: "payment_proof" }));
  const content = contentItems.map((c) => ({ ...c, kind: "content_submission" }));
  const events = contentEvents.map((e) => ({ ...e, kind: "content_event" }));
  return [...payment, ...content, ...events].sort((a, b) => {
    const aTime = new Date(a.submittedAt).getTime();
    const bTime = new Date(b.submittedAt).getTime();
    return bTime - aTime;
  });
}

export function countUnreadStaffNotifications() {
  return countUnreadPaymentProofs() + countPendingContentSubmissions();
}

export function listStaffNotifications({ page, limit = 20 } = {}) {
  const paymentData = listPaymentProofNotifications({ page, limit: 1000 });
  const contentData = listPendingContentSubmissions({ limit: 1000 });
  const contentEvents = listStaffContentEvents({ limit: 200 });
  const merged = mergeNotificationItems(paymentData.items, contentData.items, contentEvents);
  const unreadCount = countUnreadStaffNotifications();
  const total = merged.length;

  if (page != null) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    const items = merged.slice(offset, offset + safeLimit);
    return { items, total, unreadCount, page: safePage, limit: safeLimit };
  }

  const previewLimit = Math.min(Math.max(limit, 1), 20);
  return {
    items: merged.slice(0, previewLimit),
    total,
    unreadCount,
  };
}
