import type { ReactNode } from "react";
import type { ContentSubmissionDetail, DiarySubmissionDetail } from "../../types";

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

const formatSleepEntry = (row: { from?: string; to?: string; when?: string; duration?: string }) => {
  const from = row.from || row.when;
  const parts: string[] = [];
  if (from || row.to) {
    parts.push(`${formatDrinkTime(from)} – ${formatDrinkTime(row.to)}`);
  }
  if (row.duration) parts.push(row.duration);
  return parts.length ? parts.join(" · ") : "—";
};

const hasSleepContent = (row: { from?: string; to?: string; when?: string; duration?: string }) =>
  !!(row.from || row.to || row.when || row.duration);

const hasMedicineContent = (row: { what?: string; when?: string; notes?: string }) =>
  !!(row.what || row.when || row.notes);

const hasTextContent = (row: { text?: string }) => !!row.text?.trim();

export function DiarySubmissionPreview({
  diary,
  summaryOnly = false,
}: {
  diary: DiarySubmissionDetail;
  summaryOnly?: boolean;
}) {
  const hasContent =
    diary.mood ||
    (!summaryOnly &&
      (diary.drank.some((r) => r.what || r.when || r.amount) ||
        diary.slept.some(hasSleepContent) ||
        diary.ate.some((r) => r.what || r.when) ||
        (diary.medicine ?? []).some(hasMedicineContent) ||
        diary.potty.some((r) => r.when) ||
        (diary.fun ?? []).some(hasTextContent) ||
        (diary.remarks ?? []).some(hasTextContent))) ||
    diary.supplies.length > 0;

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
      {!summaryOnly && diary.drank.some((r) => r.what || r.when || r.amount) && (
        <DiarySection title="I drank" color="sky">
          {diary.drank
            .filter((r) => r.what || r.when || r.amount)
            .map((r, i) => (
              <p key={i}>
                {r.what || "—"} · {r.amount || "—"} · {formatDrinkTime(r.when)}
              </p>
            ))}
        </DiarySection>
      )}
      {!summaryOnly && diary.slept.some(hasSleepContent) && (
        <DiarySection title="I slept" color="indigo">
          {diary.slept
            .filter(hasSleepContent)
            .map((r, i) => (
              <p key={i}>{formatSleepEntry(r)}</p>
            ))}
        </DiarySection>
      )}
      {!summaryOnly && diary.ate.some((r) => r.what || r.when) && (
        <DiarySection title="I ate" color="amber">
          {diary.ate
            .filter((r) => r.what || r.when)
            .map((r, i) => (
              <p key={i}>
                {r.what}
                {r.when && ` · ${formatDrinkTime(r.when)}`}
                {r.rating && ` · ${r.rating}`}
              </p>
            ))}
        </DiarySection>
      )}
      {!summaryOnly && (diary.medicine ?? []).some(hasMedicineContent) && (
        <DiarySection title="Medicine" color="teal">
          {(diary.medicine ?? [])
            .filter(hasMedicineContent)
            .map((r, i) => (
              <p key={i}>
                {r.what || "—"} · {formatDrinkTime(r.when)}
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            ))}
        </DiarySection>
      )}
      {(diary.fun ?? []).some(hasTextContent) && (
        <DiarySection title="I had fun" color="cyan">
          {(diary.fun ?? [])
            .filter(hasTextContent)
            .map((r, i) => (
              <p key={i}>{r.text}</p>
            ))}
        </DiarySection>
      )}
      {!summaryOnly && diary.potty.some((r) => r.when) && (
        <DiarySection title="I went" color="rose">
          {diary.potty
            .filter((r) => r.when)
            .map((r, i) => (
              <p key={i} className="capitalize">
                {r.type} · {formatDrinkTime(r.when)}
              </p>
            ))}
        </DiarySection>
      )}
      {diary.supplies.length > 0 && (
        <DiarySection title="I need" color="violet">
          <p className="capitalize">{diary.supplies.join(", ")}</p>
        </DiarySection>
      )}
      {(diary.remarks ?? []).some(hasTextContent) && (
        <DiarySection title="Teacher's remarks" color="slate">
          {(diary.remarks ?? [])
            .filter(hasTextContent)
            .map((r, i) => (
              <p key={i}>{r.text}</p>
            ))}
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
