import type { StaffInboxNotification } from "../../types";

export function formatNotificationWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function notificationIcon(item: StaffInboxNotification) {
  if (item.imageUrl) return null;
  const type = item.contentType ?? item.type;
  if (type.includes("diary")) return "📔";
  if (type.includes("notice")) return "📝";
  if (type.includes("gallery")) return "🖼️";
  if (item.type.includes("payment") || item.type.includes("invoice")) return "💳";
  return "🔔";
}

export function StaffInboxNotificationItem({
  item,
  onSelect,
  onDismiss,
  compact = false,
}: {
  item: StaffInboxNotification;
  onSelect: (item: StaffInboxNotification) => void;
  onDismiss?: (item: StaffInboxNotification) => void;
  compact?: boolean;
}) {
  const unread = !item.readAt;
  const handled = !!item.handledAt;
  const thumbSize = compact ? "h-12 w-12" : "h-16 w-16";
  const iconSize = compact ? "text-lg" : "text-2xl";

  return (
    <div className={`flex w-full gap-3 ${compact ? "px-4 py-3" : "px-1 py-4"} ${unread ? "bg-blue-50/40" : ""}`}>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={`flex min-w-0 flex-1 gap-3 text-left hover:opacity-90 ${compact ? "" : "rounded-lg hover:bg-slate-50"}`}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className={`${thumbSize} shrink-0 rounded-lg border border-slate-200 object-cover`}
          />
        ) : (
          <div
            className={`flex ${thumbSize} shrink-0 items-center justify-center rounded-lg bg-slate-100 ${iconSize}`}
          >
            {notificationIcon(item)}
          </div>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />}
            <span
              className={`block truncate ${compact ? "text-sm" : "text-sm"} ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}
            >
              {item.title}
            </span>
          </span>
          <span className={`block truncate ${compact ? "text-xs" : "text-sm"} text-slate-500`}>{item.body}</span>
          {item.parentName && (
            <span className="mt-0.5 block text-xs text-slate-500">Parent: {item.parentName}</span>
          )}
          {item.preview && (
            <span className="mt-0.5 block truncate text-xs text-slate-500">{item.preview}</span>
          )}
          <span className={`mt-1 block ${compact ? "text-[11px]" : "text-xs"} text-slate-400`}>
            {formatNotificationWhen(item.createdAt)}
            {handled ? " · Handled" : ""}
          </span>
        </span>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(item)}
          className="shrink-0 self-center rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Remove notification"
        >
          Remove
        </button>
      )}
    </div>
  );
}
