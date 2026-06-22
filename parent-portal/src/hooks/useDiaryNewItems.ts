import { useEffect, useMemo, useRef, useState } from "react";
import type { DaycareDiary } from "../types";
import {
  buildSnapshotFromDiary,
  diffNewSectionIndices,
  loadDiarySeenSnapshot,
  saveDiarySeenSnapshot,
  firstNewScrollTarget,
  sectionsWithNewItems,
  type DiarySectionKey,
  type NewDiarySections,
} from "../utils/diarySeenStorage";

export type DiaryScrollTarget = { section: DiarySectionKey; index: number };

const HIGHLIGHT_MS = 4500;
const SAVE_DELAY_MS = 5000;

export function useDiaryNewItems(
  studentId: number,
  entryDate: string | undefined,
  diary: DaycareDiary | null | undefined,
) {
  const [highlighting, setHighlighting] = useState(true);
  const [celebrationQueue, setCelebrationQueue] = useState<DiarySectionKey[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<DiarySectionKey | null>(null);
  const [newIndices, setNewIndices] = useState<NewDiarySections>({
    drank: [],
    slept: [],
    ate: [],
    medicine: [],
    potty: [],
    fun: [],
    remarks: [],
  });
  const [scrollTarget, setScrollTarget] = useState<DiaryScrollTarget | null>(null);
  const [scrollGeneration, setScrollGeneration] = useState(0);
  const processedRef = useRef<string | null>(null);

  const diaryFingerprint = useMemo(() => {
    if (!diary) return "";
    return JSON.stringify(buildSnapshotFromDiary(diary));
  }, [diary]);

  useEffect(() => {
    if (!studentId || !entryDate || !diary) return;
    const token = `${studentId}:${entryDate}:${diaryFingerprint}`;
    if (processedRef.current === token) return;
    processedRef.current = token;

    const previous = loadDiarySeenSnapshot(studentId, entryDate);
    const { newIndices: diff, isFirstVisit } = diffNewSectionIndices(diary, previous);
    setNewIndices(diff);

    if (isFirstVisit) {
      saveDiarySeenSnapshot(studentId, entryDate, buildSnapshotFromDiary(diary));
      setHighlighting(false);
      setCelebrationQueue([]);
      setActiveCelebration(null);
      setScrollTarget(null);
      return;
    }

    const queue = sectionsWithNewItems(diff);
    if (queue.length === 0) {
      setHighlighting(false);
      setCelebrationQueue([]);
      setActiveCelebration(null);
      setScrollTarget(null);
      return;
    }

    setHighlighting(true);
    setCelebrationQueue(queue);
    setActiveCelebration(queue[0] ?? null);
    const target = firstNewScrollTarget(diff);
    setScrollTarget(target);
    if (target) setScrollGeneration((n) => n + 1);

    const highlightTimer = window.setTimeout(() => setHighlighting(false), HIGHLIGHT_MS);
    const saveTimer = window.setTimeout(() => {
      saveDiarySeenSnapshot(studentId, entryDate, buildSnapshotFromDiary(diary));
    }, SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(saveTimer);
    };
  }, [studentId, entryDate, diary, diaryFingerprint]);

  const dismissCelebration = () => {
    setCelebrationQueue((queue) => {
      const [, ...rest] = queue;
      setActiveCelebration(rest[0] ?? null);
      return rest;
    });
  };

  const isNewRow = (section: DiarySectionKey, index: number) =>
    highlighting && newIndices[section].includes(index);

  const hasNewSection = (section: DiarySectionKey) =>
    highlighting && newIndices[section].length > 0;

  const shouldScrollToRow = (section: DiarySectionKey, index: number) =>
    scrollTarget?.section === section && scrollTarget.index === index;

  return {
    isNewRow,
    hasNewSection,
    highlighting,
    activeCelebration,
    dismissCelebration,
    shouldScrollToRow,
    scrollGeneration,
  };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
