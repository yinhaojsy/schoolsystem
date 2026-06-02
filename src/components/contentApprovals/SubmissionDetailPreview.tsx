import type { ReactNode } from "react";
import type { ContentSubmissionDetail, DiarySubmissionDetail } from "../types";

function DiarySection({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  const bg: Record<string, string> = {
    sky: "bg-sky-50",
    amber: "bg-amber-50",
    indigo: "bg-indigo-50",
    cyan: "bg-cyan-50",
    rose: "bg-rose-50",
    violet: "bg-violet-50",
    slate: "bg-slate-100",
    teal: "bg-teal-50",
    emerald: "bg-emerald-50",
  };
  return (
    <section className={`rounded-xl p-3 ${bg[color] ?? "bg-white"}`}>
      <h4 className="text-xs font-bold uppercase text-slate-700">{title}</h4>
      <div className="mt-1.5 text-sm text-slate-800">{children}</div>
    </section>
  );
}

export function DiarySubmissionPreview({ diary }: { diary: DiarySubmissionDetail }) {
  const hasContent =
    diary.mood ||
    diary.drank.some((r) => r.when || r.amount) ||
    diary.slept.some((r) => r.when || r.duration) ||
    diary.ate.some((r) => r.what || r.when) ||
    (diary.medicine ?? []).some((r) => r.when) ||
    diary.activities ||
    diary.potty.some((r) => r.when) ||
    diary.supplies.length > 0 ||
    diary.teacherRemarks;

  if (!hasContent) {
    return <p className="text-sm italic text-slate-500">Diary saved but no fields filled in yet.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {diary.mood && (
        <DiarySection title="I was" color="emerald">
          <p className="capitalize font-semibold">{diary.mood}</p>
        </DiarySection>
      )}
      {diary.drank.some((r) => r.when || r.amount) && (
        <DiarySection title="I drank" color="sky">
          {diary.drank
            .filter((r) => r.when || r.amount)
            .map((r, i) => (
              <p key={i}>
                {r.when || "—"} · {r.amount || "—"}
              </p>
            ))}
        </DiarySection>
      )}
      {diary.slept.some((r) => r.when || r.duration) && (
        <DiarySection title="I slept" color="indigo">
          {diary.slept
            .filter((r) => r.when || r.duration)
            .map((r, i) => (
              <p key={i}>
                {r.when || "—"} · {r.duration || "—"}
              </p>
            ))}
        </DiarySection>
      )}
      {diary.ate.some((r) => r.what || r.when) && (
        <DiarySection title="I ate" color="amber">
          {diary.ate
            .filter((r) => r.what || r.when)
            .map((r, i) => (
              <p key={i}>
                {r.what}
                {r.when && ` · ${r.when}`}
                {r.rating && ` · ${r.rating}`}
              </p>
            ))}
        </DiarySection>
      )}
      {(diary.medicine ?? []).some((r) => r.when) && (
        <DiarySection title="Medicine" color="teal">
          {(diary.medicine ?? [])
            .filter((r) => r.when)
            .map((r, i) => (
              <p key={i}>
                {r.when}
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            ))}
        </DiarySection>
      )}
      {diary.activities && (
        <DiarySection title="I had fun" color="cyan">
          {diary.activities}
        </DiarySection>
      )}
      {diary.potty.some((r) => r.when) && (
        <DiarySection title="I went" color="rose">
          {diary.potty
            .filter((r) => r.when)
            .map((r, i) => (
              <p key={i} className="capitalize">
                {r.type} · {r.when}
              </p>
            ))}
        </DiarySection>
      )}
      {diary.supplies.length > 0 && (
        <DiarySection title="I need" color="violet">
          <p className="capitalize">{diary.supplies.join(", ")}</p>
        </DiarySection>
      )}
      {diary.teacherRemarks && (
        <DiarySection title="Teacher's remarks" color="slate">
          {diary.teacherRemarks}
        </DiarySection>
      )}
    </div>
  );
}

export function SubmissionDetailPreview({ detail }: { detail: ContentSubmissionDetail | null | undefined }) {
  if (!detail) {
    return <p className="text-sm text-slate-500">Could not load submission content.</p>;
  }

  if (detail.type === "diary") {
    return <DiarySubmissionPreview diary={detail.diary} />;
  }

  if (detail.type === "notices") {
    return (
      <div className="rounded-xl bg-amber-50 p-4">
        <h4 className="text-xs font-bold uppercase text-amber-900">Message for parents</h4>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{detail.notice.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <img src={detail.photo.url} alt="" className="max-h-80 w-full rounded-xl border object-contain bg-slate-50" />
      {detail.photo.caption && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Caption:</span> {detail.photo.caption}
        </p>
      )}
    </div>
  );
}
