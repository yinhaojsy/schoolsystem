import type { DiaryEventApproval } from "../../types";
import { formatDiaryAteRating } from "../../../shared/diaryAteRatings";

const EVENT_LABELS: Record<string, string> = {
  drank: "Drank",
  slept: "Slept",
  ate: "Ate",
  medicine: "Medicine",
  fun: "I had fun",
  remarks: "Teacher's remarks",
  potty: "Potty",
};

const formatDrinkTime = (when?: string) => {
  if (!when?.trim()) return "—";
  const match = when.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return when;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatDiaryTime = formatDrinkTime;

const formatSleepEntry = (row: { from?: string; to?: string; when?: string; duration?: string }) => {
  const from = row.from || row.when;
  const parts: string[] = [];
  if (from || row.to) {
    parts.push(`${formatDiaryTime(from)} – ${formatDiaryTime(row.to)}`);
  }
  if (row.duration) parts.push(row.duration);
  return parts.length ? parts.join(" · ") : "—";
};

function formatEvent(event: DiaryEventApproval) {
  switch (event.eventType) {
    case "drank":
      return `${event.what || "—"} · ${event.amount || "—"} · ${formatDrinkTime(event.when)}`;
    case "slept":
      return formatSleepEntry(event);
    case "ate":
      return [event.what, event.when ? formatDiaryTime(event.when) : "", event.rating ? formatDiaryAteRating(event.rating) : ""].filter(Boolean).join(" · ");
    case "medicine":
      return `${event.what || "—"} · ${formatDiaryTime(event.when)}${event.notes ? ` · ${event.notes}` : ""}`;
    case "fun":
    case "remarks":
      return event.text || "—";
    case "potty":
      return `${event.type || "—"} · ${formatDrinkTime(event.when)}`;
    default:
      return "Activity";
  }
}

export default function DiaryEventsApprovalList({
  events,
  onDelete,
  deletingId,
  readOnly = false,
}: {
  events: DiaryEventApproval[];
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  readOnly?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-sm italic text-slate-500">No activities in this submission.</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.contentId} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {EVENT_LABELS[event.eventType] ?? event.eventType}
            </p>
            <p className="mt-1 capitalize text-slate-800">{formatEvent(event)}</p>
          </div>
          {!readOnly && onDelete && (
            <button
              type="button"
              disabled={deletingId === event.contentId}
              onClick={() => onDelete(event.contentId)}
              className="shrink-0 text-xs font-semibold text-red-600 disabled:opacity-50"
            >
              {deletingId === event.contentId ? "…" : "Remove"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
