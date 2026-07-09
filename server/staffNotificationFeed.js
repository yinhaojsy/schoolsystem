import { listStaffInboxNotifications, countUnreadStaffInboxNotifications } from "./staffNotificationInbox.js";

export function countUnreadStaffNotifications() {
  return countUnreadStaffInboxNotifications();
}

export function listStaffNotifications(opts) {
  return listStaffInboxNotifications(opts);
}
