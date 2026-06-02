import { Link, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useGetChildDiaryQuery } from "../services/api";

export default function ChildDiaryPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetChildDiaryQuery(studentId, { skip: !studentId });

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  const diary = data?.diary;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-medium text-brand-700">← Home</Link>
      <h2 className="text-lg font-bold">{data?.student.name}&apos;s diary</h2>
      <p className="text-sm text-slate-500">Today only</p>

      {!diary ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📔</p>
          <p className="mt-2 text-sm text-slate-500">No diary entry yet for today.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {diary.mood && (
            <section className="rounded-2xl bg-emerald-50 p-4">
              <h3 className="text-xs font-bold uppercase text-emerald-800">I was</h3>
              <p className="mt-1 capitalize text-lg font-semibold text-emerald-900">{diary.mood}</p>
            </section>
          )}
          {diary.drank.some((r) => r.when || r.amount) && (
            <Section title="I drank" color="sky">
              {diary.drank.filter((r) => r.when || r.amount).map((r, i) => (
                <p key={i} className="text-sm">{r.when || "—"} · {r.amount || "—"}</p>
              ))}
            </Section>
          )}
          {diary.slept.some((r) => r.when || r.duration) && (
            <Section title="I slept" color="indigo">
              {diary.slept.filter((r) => r.when || r.duration).map((r, i) => (
                <p key={i} className="text-sm">{r.when || "—"} · {r.duration || "—"}</p>
              ))}
            </Section>
          )}
          {diary.ate.some((r) => r.what || r.when) && (
            <Section title="I ate" color="amber">
              {diary.ate.filter((r) => r.what || r.when).map((r, i) => (
                <p key={i} className="text-sm">{r.what} {r.when && `· ${r.when}`} {r.rating && `· ${r.rating}`}</p>
              ))}
            </Section>
          )}
          {(diary.medicine ?? []).some((r) => r.when) && (
            <Section title="Medicine" color="teal">
              {(diary.medicine ?? []).filter((r) => r.when).map((r, i) => (
                <p key={i} className="text-sm">{r.when}{r.notes ? ` · ${r.notes}` : ""}</p>
              ))}
            </Section>
          )}
          {diary.activities && (
            <Section title="I had fun" color="cyan">{diary.activities}</Section>
          )}
          {diary.potty.some((r) => r.when) && (
            <Section title="I went" color="rose">
              {diary.potty.filter((r) => r.when).map((r, i) => (
                <p key={i} className="text-sm capitalize">{r.type} · {r.when}</p>
              ))}
            </Section>
          )}
          {diary.supplies.length > 0 && (
            <Section title="I need" color="violet">
              <p className="text-sm capitalize">{diary.supplies.join(", ")}</p>
            </Section>
          )}
          {diary.teacherRemarks && (
            <Section title="Teacher's remarks" color="slate">{diary.teacherRemarks}</Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  const bg: Record<string, string> = {
    sky: "bg-sky-50", amber: "bg-amber-50", indigo: "bg-indigo-50",
    cyan: "bg-cyan-50", rose: "bg-rose-50", violet: "bg-violet-50", slate: "bg-slate-100", teal: "bg-teal-50",
  };
  return (
    <section className={`rounded-2xl p-4 ${bg[color] ?? "bg-white"}`}>
      <h3 className="text-xs font-bold uppercase text-slate-700">{title}</h3>
      <div className="mt-2 text-slate-800">{children}</div>
    </section>
  );
}
