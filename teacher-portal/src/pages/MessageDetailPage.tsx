import { Link, useParams } from "react-router-dom";
import { useGetStudentDayNotesQuery } from "../services/api";

function formatWhen(iso: string) {
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function MessageDetailPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetStudentDayNotesQuery(studentId, { skip: !studentId });

  const note = data?.note;
  const messages = (note?.messages ?? []).filter((m) => m.authorRole === "parent");
  const studentName = data?.student?.name ?? note?.student?.name ?? "Student";

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      <Link to="/messages" className="text-sm font-medium text-brand-700">
        ← Messages
      </Link>
      <div className="flex items-center gap-3">
        {data?.student?.profilePhotoUrl ? (
          <img
            src={data.student.profilePhotoUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-800">
            {studentName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-900">{studentName}</h2>
          <p className="text-sm text-slate-500">Parent note · today</p>
        </div>
      </div>

      {!note || messages.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📝</p>
          <p className="mt-2 text-sm text-slate-500">No parent note for this child today.</p>
          <Link
            to={`/students/${studentId}`}
            className="mt-4 inline-block text-sm font-semibold text-brand-700"
          >
            Open diary →
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-950 shadow-sm">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  <span>{m.authorName || "Parent"}</span>
                  <span className="normal-case tracking-normal">{formatWhen(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              </li>
            ))}
          </ul>

          <p className="text-center text-xs text-slate-400">
            Daycare updates for parents still go in the diary Teacher&apos;s remarks.
          </p>

          <Link
            to={`/students/${studentId}`}
            className="block text-center text-sm font-semibold text-brand-700"
          >
            Open {studentName}&apos;s diary →
          </Link>
        </>
      )}
    </div>
  );
}
