import { Link } from "react-router-dom";
import { useGetInboxQuery } from "../services/api";

const typeIcons: Record<string, string> = {
  invoice: "🧾",
  diary: "📔",
  notice: "💬",
  gallery: "🖼️",
};

function inboxLink(item: { type: string; studentId: number; invoiceId?: number }) {
  if (item.type === "diary") return `/children/${item.studentId}/diary`;
  if (item.type === "notice") return `/children/${item.studentId}/notices`;
  if (item.type === "gallery") return `/children/${item.studentId}/gallery`;
  if (item.type === "invoice" && item.invoiceId) return `/fees/${item.invoiceId}`;
  if (item.type === "invoice") return "/fees";
  return "/";
}

export default function InboxPage() {
  const { data, isLoading } = useGetInboxQuery();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Inbox</h2>
        <p className="text-sm text-slate-500">
          {data?.unreadCount ? `${data.unreadCount} unread update${data.unreadCount === 1 ? "" : "s"}` : "All caught up"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">✨</p>
          <h3 className="mt-3 font-bold text-slate-900">You&apos;re all caught up</h3>
          <p className="mt-1 text-sm text-slate-500">New diary updates, notes, and photos will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={inboxLink(item)}
                className={`flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ${item.unread ? "ring-2 ring-brand-200" : ""}`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                  {typeIcons[item.type] ?? "📌"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{item.title}</p>
                  <p className="truncate text-sm text-slate-500">{item.subtitle}</p>
                </div>
                {item.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
