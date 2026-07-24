import { Link } from "react-router-dom";
import { useGetDayNotesQuery } from "../services/api";

export default function MessagesPage() {
  const { data, isLoading } = useGetDayNotesQuery();
  const notes = data?.notes ?? [];

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Messages</h2>
        <p className="text-sm text-slate-500">
          {data?.entryDate
            ? new Date(data.entryDate + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Parent notes for today"}
          {data?.unreadCount ? ` · ${data.unreadCount} unread` : ""}
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">📭</p>
          <h3 className="mt-3 font-bold text-slate-900">No parent notes yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            When a parent writes a note about their child, it will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const name = n.student?.name ?? "Student";
            const photo = n.student?.profilePhotoUrl;
            return (
              <li key={n.id}>
                <Link
                  to={`/messages/${n.studentId}`}
                  className={`flex w-full items-center gap-3 rounded-2xl border-l-4 bg-white p-4 text-left shadow-sm active:scale-[0.99] ${
                    n.unread ? "border-l-rose-500 ring-2 ring-rose-100" : "border-l-slate-200"
                  }`}
                >
                  {photo ? (
                    <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-800">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{name}</p>
                      {n.unread && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{n.preview || "Parent note"}</p>
                  </div>
                  {n.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
