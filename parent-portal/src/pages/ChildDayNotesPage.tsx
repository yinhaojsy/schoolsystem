import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useGetChildDayNotesQuery, usePostChildDayNoteMutation } from "../services/api";

function formatWhen(iso: string) {
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function ChildDayNotesPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetChildDayNotesQuery(studentId, { skip: !studentId });
  const [postNote, { isLoading: sending }] = usePostChildDayNoteMutation();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const note = data?.note;
  const messages = note?.messages ?? [];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const message = draft.trim();
    if (!message) {
      setError("Write a short note for the teacher.");
      return;
    }
    try {
      await postNote({ studentId, message }).unwrap();
      setDraft("");
    } catch (err) {
      setError(err && typeof err === "object" && "data" in err
        ? String((err as { data?: { error?: string } }).data?.error ?? "Could not send note.")
        : "Could not send note.");
    }
  };

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-medium text-brand-700">
        ← Home
      </Link>
      <div>
        <h2 className="text-lg font-bold text-slate-900">Note for teacher</h2>
        <p className="text-sm text-slate-500">
          {data?.student.name} · today — health, food, pickup, medicine…
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="text-3xl">📝</p>
          <p className="mt-2 text-sm text-slate-500">
            No note yet for today. Tell the teacher anything they should know about your child.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const fromParent = m.authorRole === "parent";
            return (
              <li
                key={m.id}
                className={`rounded-2xl p-4 text-sm shadow-sm ${
                  fromParent ? "bg-brand-50 text-brand-950" : "bg-amber-50 text-amber-950"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  <span>{fromParent ? "You" : m.authorName || "Teacher"}</span>
                  <span className="normal-case tracking-normal">{formatWhen(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={onSubmit} className="space-y-2 rounded-3xl bg-white p-4 shadow-sm">
        <label htmlFor="day-note" className="text-xs font-bold uppercase text-slate-500">
          {messages.length ? "Add another message" : "Write today’s note"}
        </label>
        <textarea
          id="day-note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="e.g. Feeling unwell — please skip dairy. Or: Late pickup around 5:30."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="w-full rounded-2xl bg-brand-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : messages.length ? "Send" : "Send to teacher"}
        </button>
      </form>
    </div>
  );
}
