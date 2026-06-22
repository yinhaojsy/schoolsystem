import { broadcastContentUpdated } from "./staffNotifications.js";

/** Notify connected teacher/parent/admin clients that student content changed. */
export function notifyContentLiveUpdate({ studentId, entryDate, contentType = "all" }) {
  const sid = parseInt(studentId, 10);
  if (Number.isNaN(sid) || !entryDate) return;
  broadcastContentUpdated({ studentId: sid, entryDate, contentType });
}
