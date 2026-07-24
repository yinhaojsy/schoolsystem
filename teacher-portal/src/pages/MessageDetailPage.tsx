import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useGetStudentDayNotesQuery, useReplyDayNoteMutation } from "../services/api";

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
  const [reply, { isLoading: sending }] = useReplyDayNoteMutation();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const note = data?.note;
  const messages = note?.messages ?? [];
  const studentName = data?.student?.name ?? note?.student?.name ?? "Student";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const message = draft.trim();
    if (!message) {
      setError("Write a short reply.");
      return;
    }
    try {
      await reply({ studentId, message }).unwrap();
      setDraft("");
    } catch (err) {
      setError(
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: { error?: string } }).data?.error ?? "Could not send reply.")
          : "Could not send reply.",
      );
    }
  };

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

      {!note ? (
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
            {messages.map((m) => {
              const fromTeacher = m.authorRole === "teacher";
              return (
                <li
                  key={m.id}
                  className={`rounded-2xl p-4 text-sm shadow-sm ${
                    fromTeacher ? "bg-brand-50 text-brand-950" : "bg-rose-50 text-rose-950"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    <span>{fromTeacher ? "You" : m.authorName || "Parent"}</span>
                    <span className="normal-case tracking-normal">{formatWhen(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </li>
              );
            })}
          </ul>

          <form onSubmit={onSubmit} className="space-y-2 rounded-3xl bg-white p-4 shadow-sm">
            <label htmlFor="teacher-reply" className="text-xs font-bold uppercase text-slate-500">
              Reply to parent
            </label>
            <textarea
              id="teacher-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Got it — medicine given at 11:00. Or ask a quick clarifying question."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="w-full rounded-2xl bg-brand-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
            <p className="text-center text-xs text-slate-400">
              Daycare updates for the diary still go in Teacher&apos;s remarks.
            </p>
          </form>

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
