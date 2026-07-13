import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { useAppSelector } from "../app/hooks";
import { useGetChildDiaryQuery, useGetProfileQuery } from "../services/api";
import { useDiaryNewItems, usePrefersReducedMotion } from "../hooks/useDiaryNewItems";
import DiaryCelebrationOverlay from "../components/diary/DiaryCelebrationOverlay";
import { formatDiaryAteRating } from "../../../shared/diaryAteRatings";

const formatDiaryTime = (when: string) => {
  if (!when.trim()) return "—";
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
    parts.push(`${formatDiaryTime(from ?? "")} – ${formatDiaryTime(row.to ?? "")}`);
  }
  if (row.duration) parts.push(row.duration);
  return parts.length ? parts.join(" · ") : "—";
};

const hasSleepContent = (row: { from?: string; to?: string; when?: string; duration?: string }) =>
  !!(row.from || row.to || row.when || row.duration);

const hasMedicineContent = (row: { what?: string; when?: string; notes?: string }) =>
  !!(row.what || row.when || row.notes);

export default function ChildDiaryPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const authUser = useAppSelector((s) => s.auth.user);
  const { data: profile } = useGetProfileQuery();
  const { data, isLoading } = useGetChildDiaryQuery(studentId, { skip: !studentId });
  const reducedMotion = usePrefersReducedMotion();

  const diary = data?.diary;
  const animationsEnabled =
    (profile?.parentDiaryAnimations ?? authUser?.parentDiaryAnimations ?? true) && !reducedMotion;

  const {
    isNewRow,
    hasNewSection,
    activeCelebration,
    dismissCelebration,
    shouldScrollToRow,
    scrollGeneration,
  } = useDiaryNewItems(studentId, data?.entryDate, diary);

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      {animationsEnabled && (
        <DiaryCelebrationOverlay section={activeCelebration} onDone={dismissCelebration} />
      )}

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
          {diary.drank.some((r) => r.what || r.when || r.amount) && (
            <Section title="I drank" color="sky" isNew={hasNewSection("drank")}>
              {diary.drank
                .filter((r) => r.what || r.when || r.amount)
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("drank", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("drank", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {r.what || "—"} · {r.amount || "—"} · {formatDiaryTime(r.when)}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {diary.slept.some(hasSleepContent) && (
            <Section title="I slept" color="indigo" isNew={hasNewSection("slept")}>
              {diary.slept
                .filter(hasSleepContent)
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("slept", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("slept", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {formatSleepEntry(r)}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {diary.ate.some((r) => r.what || r.when) && (
            <Section title="I ate" color="amber" isNew={hasNewSection("ate")}>
              {diary.ate
                .filter((r) => r.what || r.when)
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("ate", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("ate", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {r.what} {r.when && `· ${formatDiaryTime(r.when)}`} {r.rating && `· ${formatDiaryAteRating(r.rating)}`}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {(diary.medicine ?? []).some(hasMedicineContent) && (
            <Section title="Medicine" color="teal" isNew={hasNewSection("medicine")}>
              {(diary.medicine ?? [])
                .filter(hasMedicineContent)
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("medicine", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("medicine", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {r.what || "—"} · {formatDiaryTime(r.when)}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {(diary.fun ?? []).some((r) => r.text?.trim()) && (
            <Section title="I had fun" color="cyan" isNew={hasNewSection("fun")}>
              {(diary.fun ?? [])
                .filter((r) => r.text?.trim())
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("fun", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("fun", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {r.text}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {diary.potty.some((r) => r.when) && (
            <Section title="I went" color="rose" isNew={hasNewSection("potty")}>
              {diary.potty
                .filter((r) => r.when)
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("potty", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("potty", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    <span className="capitalize">{r.type}</span> · {formatDiaryTime(r.when)}
                  </DiaryRow>
                ))}
            </Section>
          )}
          {diary.supplies.length > 0 && (
            <Section title="I need" color="violet">
              <p className="text-sm capitalize">{diary.supplies.join(", ")}</p>
            </Section>
          )}
          {(diary.remarks ?? []).some((r) => r.text?.trim()) && (
            <Section title="Teacher's remarks" color="slate" isNew={hasNewSection("remarks")}>
              {(diary.remarks ?? [])
                .filter((r) => r.text?.trim())
                .map((r, visibleIndex) => (
                  <DiaryRow
                    key={visibleIndex}
                    isNew={isNewRow("remarks", visibleIndex)}
                    scrollIntoView={shouldScrollToRow("remarks", visibleIndex)}
                    scrollGeneration={scrollGeneration}
                    smoothScroll={!reducedMotion}
                  >
                    {r.text}
                  </DiaryRow>
                ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function DiaryRow({
  isNew,
  scrollIntoView,
  scrollGeneration,
  smoothScroll,
  children,
}: {
  isNew: boolean;
  scrollIntoView?: boolean;
  scrollGeneration?: number;
  smoothScroll?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!scrollIntoView || !ref.current) return;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: smoothScroll ? "smooth" : "instant",
        block: "center",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [scrollIntoView, scrollGeneration, smoothScroll]);

  return (
    <p ref={ref} className={`scroll-mt-28 text-sm ${isNew ? "diary-row-new" : ""}`}>
      {children}
    </p>
  );
}

function Section({
  title,
  color,
  children,
  isNew = false,
}: {
  title: string;
  color: string;
  children: ReactNode;
  isNew?: boolean;
}) {
  const bg: Record<string, string> = {
    sky: "bg-sky-50",
    amber: "bg-amber-50",
    indigo: "bg-indigo-50",
    cyan: "bg-cyan-50",
    rose: "bg-rose-50",
    violet: "bg-violet-50",
    slate: "bg-slate-100",
    teal: "bg-teal-50",
  };
  return (
    <section className={`rounded-2xl p-4 ${bg[color] ?? "bg-white"}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase text-slate-700">{title}</h3>
        {isNew && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            New
          </span>
        )}
      </div>
      <div className="mt-2 text-slate-800">{children}</div>
    </section>
  );
}
