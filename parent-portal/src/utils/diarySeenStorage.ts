import type { DaycareDiary } from "../types";

export type DiarySectionKey =
  | "drank"
  | "slept"
  | "ate"
  | "medicine"
  | "potty"
  | "fun"
  | "remarks";

export type DiarySeenSnapshot = {
  drank: number;
  slept: number;
  ate: number;
  medicine: number;
  potty: number;
  fun: number;
  remarks: number;
  mood: string | null;
  suppliesKey: string;
  initialized: boolean;
};

const EMPTY_SNAPSHOT: DiarySeenSnapshot = {
  drank: 0,
  slept: 0,
  ate: 0,
  medicine: 0,
  potty: 0,
  fun: 0,
  remarks: 0,
  mood: null,
  suppliesKey: "",
  initialized: false,
};

function storageKey(studentId: number, entryDate: string) {
  return `diary-seen:${studentId}:${entryDate}`;
}

function countVisible<T>(rows: T[], hasContent: (row: T) => boolean) {
  return rows.filter(hasContent).length;
}

function suppliesKey(supplies: string[]) {
  return supplies.join("\u0001");
}

export function buildSnapshotFromDiary(diary: DaycareDiary): DiarySeenSnapshot {
  return {
    drank: countVisible(diary.drank, (r) => !!(r.what || r.when || r.amount)),
    slept: countVisible(diary.slept, (r) => !!(r.from || r.to || r.when || r.duration)),
    ate: countVisible(diary.ate, (r) => !!(r.what || r.when)),
    medicine: countVisible(diary.medicine ?? [], (r) => !!(r.what || r.when || r.notes)),
    potty: countVisible(diary.potty, (r) => !!r.when),
    fun: countVisible(diary.fun ?? [], (r) => !!r.text?.trim()),
    remarks: countVisible(diary.remarks ?? [], (r) => !!r.text?.trim()),
    mood: diary.mood ?? null,
    suppliesKey: suppliesKey(diary.supplies),
    initialized: true,
  };
}

export function loadDiarySeenSnapshot(studentId: number, entryDate: string): DiarySeenSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(studentId, entryDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiarySeenSnapshot;
    return { ...EMPTY_SNAPSHOT, ...parsed, initialized: true };
  } catch {
    return null;
  }
}

export function saveDiarySeenSnapshot(studentId: number, entryDate: string, snapshot: DiarySeenSnapshot) {
  try {
    localStorage.setItem(storageKey(studentId, entryDate), JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

export type NewDiarySections = Record<DiarySectionKey, number[]>;

export function diffNewSectionIndices(
  diary: DaycareDiary,
  previous: DiarySeenSnapshot | null,
): { newIndices: NewDiarySections; isFirstVisit: boolean } {
  const current = buildSnapshotFromDiary(diary);
  if (!previous?.initialized) {
    return {
      isFirstVisit: true,
      newIndices: {
        drank: [],
        slept: [],
        ate: [],
        medicine: [],
        potty: [],
        fun: [],
        remarks: [],
      },
    };
  }

  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

  const newIndices: NewDiarySections = {
    drank: range(previous.drank, current.drank),
    slept: range(previous.slept, current.slept),
    ate: range(previous.ate, current.ate),
    medicine: range(previous.medicine, current.medicine),
    potty: range(previous.potty, current.potty),
    fun: range(previous.fun, current.fun),
    remarks: range(previous.remarks, current.remarks),
  };

  return { newIndices, isFirstVisit: false };
}

export function sectionsWithNewItems(newIndices: NewDiarySections): DiarySectionKey[] {
  const order: DiarySectionKey[] = ["drank", "ate", "slept", "medicine", "potty", "fun", "remarks"];
  return order.filter((key) => newIndices[key].length > 0);
}

/** Top-to-bottom order as shown on ChildDiaryPage. */
const PAGE_SECTION_ORDER: DiarySectionKey[] = [
  "drank",
  "slept",
  "ate",
  "medicine",
  "fun",
  "potty",
  "remarks",
];

export function firstNewScrollTarget(
  newIndices: NewDiarySections,
): { section: DiarySectionKey; index: number } | null {
  for (const section of PAGE_SECTION_ORDER) {
    const indices = newIndices[section];
    if (indices.length > 0) {
      return { section, index: indices[indices.length - 1]! };
    }
  }
  return null;
}
