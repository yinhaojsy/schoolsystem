import { useEffect, useRef, useState, FormEvent, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useSaveDiaryEventsMutation,
  useSubmitDiaryMutation,
  useSubmitDiaryEventsMutation,
  useWithdrawDiaryMutation,
  useWithdrawDiaryEventsMutation,
  useDeletePublishedDiaryEventMutation,
  useGetNoticesQuery,
  useAddNoticeMutation,
  useDeleteNoticeMutation,
  useGetGalleryQuery,
  useUploadPhotoMutation,
  useDeletePhotoMutation,
  useSubmitGalleryMutation,
  useWithdrawGalleryMutation,
  useGetRosterQuery,
  useGetContentSettingsQuery,
  useGetProfileQuery,
  useUpdatePublishedNoticeMutation,
  useUploadStudentProfilePhotoMutation,
  useDeleteStudentProfilePhotoMutation,
} from "../services/api";
import PhotoLightbox from "../components/PhotoLightbox";
import type { DiaryAteRow, DiaryPottyRow, DiaryDrankRow, DiarySleptRow, DiaryMedicineRow, DiaryFunRow, DiaryRemarkRow, DiaryRowMeta, ContentApprovalStatus, ParentNotice, DaycareDiary, GalleryPhoto } from "../types";
import { MOOD_OPTIONS, SUPPLY_OPTIONS } from "../types";

type Tab = "diary" | "notice" | "photos";
type DiaryForm = {
  mood: string;
  supplies: string[];
  drank: DiaryDrankRow[];
  slept: DiarySleptRow[];
  ate: DiaryAteRow[];
  medicine: DiaryMedicineRow[];
  fun: DiaryFunRow[];
  potty: DiaryPottyRow[];
  remarks: DiaryRemarkRow[];
};

const normalizeTimeInput = (when: string) => {
  const match = when.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const parseTimeMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const computeSleepDuration = (from: string, to: string) => {
  const fromMinutes = parseTimeMinutes(from);
  const toMinutes = parseTimeMinutes(to);
  if (fromMinutes === null || toMinutes === null) return "";
  let diff = toMinutes - fromMinutes;
  if (diff <= 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return `${mins} min${mins === 1 ? "" : "s"}`;
  if (mins === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr${hours === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
};

const emptyAteRow = (): DiaryAteRow => ({ what: "", when: "", rating: "" });

const formatDiaryTime = (when: string) => {
  if (!when.trim()) return "—";
  const normalized = normalizeTimeInput(when);
  if (!normalized) return when;
  const [hours, minutes] = normalized.split(":").map(Number);
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

const withRowMeta = <T extends DiaryRowMeta>(row: T, fields: Omit<T, keyof DiaryRowMeta>): T => ({
  ...fields,
  id: row.id,
  approvalStatus: row.approvalStatus,
  rejectionReason: row.rejectionReason ?? null,
} as T);

const mapSleptFields = (row: Partial<DiarySleptRow> & { when?: string }) => {
  const from = row.from ?? row.when ?? "";
  const to = row.to ?? "";
  const duration = row.duration || (from && to ? computeSleepDuration(from, to) : "");
  return { from, to, duration };
};

const mapAteFields = (row: DiaryAteRow) => ({
  what: row.what,
  when: row.when,
  rating: (row.rating === "yummy" || row.rating === "so-so" || row.rating === "yucky" ? row.rating : "") as DiaryAteRow["rating"],
});

const drankHasContent = (row: DiaryDrankRow) => !!(row.what?.trim() || row.when?.trim() || row.amount?.trim());
const sleptHasContent = (row: DiarySleptRow) => !!(row.from?.trim() || row.to?.trim() || row.duration?.trim());
const sleptIsCompleteForSubmit = (row: DiarySleptRow) => !!(row.from?.trim() && row.to?.trim());
const ateHasContent = (row: DiaryAteRow) => !!(row.what?.trim() || row.when?.trim() || row.rating);
const medicineHasContent = (row: DiaryMedicineRow) => !!(row.what?.trim() || row.when?.trim() || row.notes?.trim());
const funHasContent = (row: DiaryFunRow) => !!row.text?.trim();
const remarkHasContent = (row: DiaryRemarkRow) => !!row.text?.trim();
const pottyHasContent = (row: DiaryPottyRow) => !!row.when?.trim();

type IsRowLocked = (row: DiaryRowMeta) => boolean;

const filterEventRows = <T extends DiaryRowMeta>(
  rows: T[] | undefined,
  isLocked: IsRowLocked,
  hasContent: (row: T) => boolean,
  mapRow: (row: T) => T,
  emptyRow: () => T,
): T[] => {
  if (!rows?.length) return [emptyRow()];
  const kept = rows.map(mapRow).filter((row) => isLocked(row) || hasContent(row));
  return kept.length ? kept : [emptyRow()];
};

const buildDiaryForm = (diary: DaycareDiary, isLocked: IsRowLocked): DiaryForm => {
  return {
    mood: diary.mood ?? "",
    supplies: diary.supplies ?? [],
    drank: filterEventRows(
      diary.drank,
      isLocked,
      drankHasContent,
      (r) => withRowMeta(r, { what: r.what ?? "", when: r.when ?? "", amount: r.amount ?? "" }),
      () => ({ what: "", when: "", amount: "" }),
    ),
    slept: filterEventRows(
      diary.slept,
      isLocked,
      sleptHasContent,
      (r) => withRowMeta(r, mapSleptFields(r)),
      () => ({ from: "", to: "", duration: "" }),
    ),
    ate: filterEventRows(
      diary.ate,
      isLocked,
      ateHasContent,
      (r) => withRowMeta(r, mapAteFields(r)),
      emptyAteRow,
    ),
    medicine: filterEventRows(
      diary.medicine,
      isLocked,
      medicineHasContent,
      (r) => withRowMeta(r, { what: r.what ?? "", when: r.when ?? "", notes: r.notes ?? "" }),
      () => ({ what: "", when: "", notes: "" }),
    ),
    fun: filterEventRows(
      diary.fun ?? [],
      isLocked,
      funHasContent,
      (r) => withRowMeta(r, { text: r.text ?? "" }),
      () => ({ text: "" }),
    ),
    potty: filterEventRows(
      diary.potty,
      isLocked,
      pottyHasContent,
      (r) => withRowMeta(r, { type: r.type === "poo" ? "poo" : "wet", when: r.when ?? "" }),
      () => ({ type: "wet", when: "" }),
    ),
    remarks: filterEventRows(
      diary.remarks ?? [],
      isLocked,
      remarkHasContent,
      (r) => withRowMeta(r, { text: r.text ?? "" }),
      () => ({ text: "" }),
    ),
  };
};

function LockedEventRow({
  status,
  publishedLabel = false,
  onEdit,
  children,
}: {
  status?: ContentApprovalStatus;
  publishedLabel?: boolean;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm text-slate-800">{children}</div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {onEdit && (
            <button type="button" onClick={onEdit} className="text-xs font-semibold text-violet-700">
              Edit
            </button>
          )}
          {status === "approved" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              {publishedLabel ? "Published" : "Approved"}
            </span>
          )}
          {status === "pending" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              Pending
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const eventRowKey = (section: string, row: DiaryRowMeta, index: number) =>
  row.id != null ? `${section}-${row.id}` : `${section}-new-${index}`;

function PublishedEditActions({
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="mb-1 flex justify-end gap-3">
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="text-xs font-semibold text-emerald-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {onDelete && (
        <button
          type="button"
          disabled={saving}
          onClick={onDelete}
          className="text-xs font-semibold text-red-600 disabled:opacity-60"
        >
          Delete
        </button>
      )}
      <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-600">
        Cancel
      </button>
    </div>
  );
}

const emptyDiary = (): DiaryForm => ({
  mood: "",
  supplies: [],
  drank: [{ what: "", when: "", amount: "" }],
  slept: [{ from: "", to: "", duration: "" }],
  ate: [emptyAteRow()],
  medicine: [{ what: "", when: "", notes: "" }],
  fun: [{ text: "" }],
  potty: [{ type: "wet", when: "" }],
  remarks: [{ text: "" }],
});

function wasAdminCorrection(
  adminCorrectedAt?: string | null,
  adminCorrectedBy?: number | null,
  currentUserId?: number,
) {
  if (!adminCorrectedAt) return false;
  if (currentUserId != null && adminCorrectedBy === currentUserId) return false;
  return true;
}

function AdminEditBanner() {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <p className="font-semibold">Admin edit</p>
      <p className="mt-0.5">An admin updated this after approval. Parents see the latest version.</p>
    </div>
  );
}

function ApprovalBanner({
  status,
  reason,
  directPublish = false,
}: {
  status?: ContentApprovalStatus;
  reason?: string | null;
  directPublish?: boolean;
}) {
  if (!status || status === "approved") return null;
  if (status === "draft") {
    return (
      <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
        {directPublish
          ? "Draft — tap Submit to publish for parents."
          : "Draft — tap Submit when ready for admin to review."}
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Pending admin approval — parents will see this after it is approved.
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
      <p className="font-semibold">Rejected — update and submit again.</p>
      {reason && <p className="mt-1">{reason}</p>}
    </div>
  );
}

export default function StudentHubPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const [tab, setTab] = useState<Tab>("diary");
  const [profilePhotoMsg, setProfilePhotoMsg] = useState("");
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const { data: roster } = useGetRosterQuery();
  const { data: profile } = useGetProfileQuery(undefined, { refetchOnMountOrArgChange: true });
  const { data: contentSettings } = useGetContentSettingsQuery();
  const canEditPublished = !!profile?.canEditPublishedContent;
  const student = roster?.students.find((s) => s.id === studentId);
  const diaryApprovalRequired = contentSettings?.diary ?? false;
  const galleryApprovalRequired = contentSettings?.gallery ?? false;

  const isRowLocked = (row: DiaryRowMeta) =>
    row.approvalStatus === "pending" || row.approvalStatus === "approved";

  const isRowEditing = (section: string, row: DiaryRowMeta, index: number) =>
    editingEventKey === eventRowKey(section, row, index);

  const rowShowsLocked = (section: string, row: DiaryRowMeta, index: number) =>
    isRowLocked(row) && !isRowEditing(section, row, index);

  const isRowEditableForPayload = (section: string, row: DiaryRowMeta, index: number) => {
    if (!isRowLocked(row)) return true;
    return row.approvalStatus === "approved" && isRowEditing(section, row, index);
  };

  const publishedRowLabel = !diaryApprovalRequired;

  const [uploadStudentProfilePhoto, { isLoading: isUploadingProfilePhoto }] =
    useUploadStudentProfilePhotoMutation();
  const [deleteStudentProfilePhoto, { isLoading: isDeletingProfilePhoto }] =
    useDeleteStudentProfilePhotoMutation();
  const isProfilePhotoBusy = isUploadingProfilePhoto || isDeletingProfilePhoto;

  const { data: diaryData, isLoading: diaryLoading } = useGetDiaryQuery(studentId, { skip: !studentId });
  const [saveDiary, { isLoading: saving }] = useSaveDiaryMutation();
  const [saveDiaryEvents, { isLoading: savingEvents }] = useSaveDiaryEventsMutation();
  const [submitDiary, { isLoading: submitting }] = useSubmitDiaryMutation();
  const [submitDiaryEvents, { isLoading: submittingEvents }] = useSubmitDiaryEventsMutation();
  const [withdrawDiary, { isLoading: withdrawing }] = useWithdrawDiaryMutation();
  const [withdrawDiaryEvents, { isLoading: withdrawingEvents }] = useWithdrawDiaryEventsMutation();
  const [deletePublishedDiaryEvent, { isLoading: deletingEvent }] = useDeletePublishedDiaryEventMutation();
  const [form, setForm] = useState<DiaryForm>(emptyDiary);
  const [savedMsg, setSavedMsg] = useState("");
  const [editingEventKey, setEditingEventKey] = useState<string | null>(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [sleepFieldHighlight, setSleepFieldHighlight] = useState<{ index: number; field: "from" | "to" } | null>(
    null,
  );
  const sleepSectionRef = useRef<HTMLElement>(null);
  const sleepFromInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const sleepToInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const savingAny = saving || savingEvents || deletingEvent;
  const submittingAny = submitting || submittingEvents;
  const withdrawingAny = withdrawing || withdrawingEvents;

  useEffect(() => {
    const d = diaryData?.diary;
    if (d) {
      setForm(buildDiaryForm(d, isRowLocked));
    } else if (!diaryLoading) {
      setForm(emptyDiary());
    }
    setEditingEventKey(null);
    setSummaryEditing(false);
  }, [diaryData, diaryLoading, diaryApprovalRequired, canEditPublished]);

  const summaryStatus = diaryData?.diary?.summaryApprovalStatus ?? diaryData?.diary?.approvalStatus;
  const summaryPending = summaryStatus === "pending";
  const summaryPublished = summaryStatus === "approved";
  const savedDiary = diaryData?.diary;
  const savedMood = (savedDiary?.mood ?? "").trim();
  const moodPublished = summaryPublished && savedMood.length > 0;
  const savedSupplies = savedDiary?.supplies ?? [];
  const suppliesLocked = summaryPending || (summaryPublished && savedSupplies.length > 0 && !canEditPublished);
  const moodLocked =
    summaryPending || (moodPublished && !(canEditPublished && summaryEditing));
  const canFillEmptySummaryExtras =
    summaryPublished &&
    !summaryEditing &&
    savedSupplies.length === 0;
  const canSavePublishedSummaryExtras =
    summaryPublished && !summaryEditing && (canEditPublished || canFillEmptySummaryExtras);
  const summaryExtrasDirty =
    !!savedDiary &&
    JSON.stringify([...form.supplies].sort()) !== JSON.stringify([...savedSupplies].sort()) &&
    !suppliesLocked;
  const shouldSaveSummary =
    (!moodLocked && !moodPublished) ||
    (summaryEditing && canEditPublished && moodPublished) ||
    (canSavePublishedSummaryExtras && summaryExtrasDirty);
  const editingPublishedContent = summaryEditing || editingEventKey != null;
  const eventsPending = !!diaryData?.diary?.hasPendingEvents;
  const diaryPending = summaryPending || eventsPending;
  const canAddEventRows = !eventsPending;
  const diaryFullyPublished =
    moodPublished &&
    summaryStatus === "approved" &&
    !eventsPending &&
    !diaryData?.diary?.hasDraftEvents &&
    !diaryData?.diary?.hasPendingEvents;

  const summaryPayload = {
    mood: form.mood,
    supplies: form.supplies,
  };
  const eventsPayload = {
    drank: form.drank.filter((r, i) => isRowEditableForPayload("drank", r, i) && drankHasContent(r)),
    slept: form.slept.filter((r, i) => isRowEditableForPayload("slept", r, i) && sleptHasContent(r)),
    ate: form.ate.filter((r, i) => isRowEditableForPayload("ate", r, i) && ateHasContent(r)),
    medicine: form.medicine.filter((r, i) => isRowEditableForPayload("medicine", r, i) && medicineHasContent(r)),
    fun: form.fun.filter((r, i) => isRowEditableForPayload("fun", r, i) && funHasContent(r)),
    potty: form.potty.filter((r, i) => isRowEditableForPayload("potty", r, i) && pottyHasContent(r)),
    remarks: form.remarks.filter((r, i) => isRowEditableForPayload("remarks", r, i) && remarkHasContent(r)),
  };
  const submitEventsPayload = {
    ...eventsPayload,
    slept: form.slept.filter((r, i) => isRowEditableForPayload("slept", r, i) && sleptIsCompleteForSubmit(r)),
  };

  const findIncompleteSleepRow = () => {
    for (let i = 0; i < form.slept.length; i++) {
      const row = form.slept[i];
      if (!isRowEditableForPayload("slept", row, i)) continue;
      const from = row.from?.trim() ?? "";
      const to = row.to?.trim() ?? "";
      if (!from && !to) continue;
      if (from && to) continue;
      if (from && !to) return { index: i, field: "to" as const };
      return { index: i, field: "from" as const };
    }
    return null;
  };

  const focusSleepField = (index: number, field: "from" | "to") => {
    setSleepFieldHighlight({ index, field });
    sleepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      const input =
        field === "to" ? sleepToInputRefs.current.get(index) : sleepFromInputRefs.current.get(index);
      input?.focus();
    });
  };

  const syncFormFromDiary = (diary: DaycareDiary | null | undefined) => {
    if (diary) setForm(buildDiaryForm(diary, isRowLocked));
    setEditingEventKey(null);
    setSummaryEditing(false);
  };

  const summaryAlreadySubmitted = summaryPublished || summaryPending;
  const hasSummaryContent = form.mood.trim().length > 0 || form.supplies.length > 0;
  const hasSubmittableEvents =
    form.drank.some((r) => !isRowLocked(r) && drankHasContent(r)) ||
    form.slept.some((r) => !isRowLocked(r) && sleptHasContent(r)) ||
    form.ate.some((r) => !isRowLocked(r) && ateHasContent(r)) ||
    form.medicine.some((r) => !isRowLocked(r) && medicineHasContent(r)) ||
    form.fun.some((r) => !isRowLocked(r) && funHasContent(r)) ||
    form.potty.some((r) => !isRowLocked(r) && pottyHasContent(r)) ||
    form.remarks.some((r) => !isRowLocked(r) && remarkHasContent(r));
  const hasCompleteEventsToSubmit =
    submitEventsPayload.drank.length > 0 ||
    submitEventsPayload.slept.length > 0 ||
    submitEventsPayload.ate.length > 0 ||
    submitEventsPayload.medicine.length > 0 ||
    submitEventsPayload.fun.length > 0 ||
    submitEventsPayload.potty.length > 0 ||
    submitEventsPayload.remarks.length > 0;
  const needsEventsSubmit = hasSubmittableEvents && !eventsPending && hasCompleteEventsToSubmit;
  const hasPublishableSummaryExtras =
    canSavePublishedSummaryExtras &&
    summaryExtrasDirty &&
    form.supplies.length > 0 &&
    !suppliesLocked;
  /** POST /diary/submit — only when mood/supplies still need first-time (or re-)publish. */
  const needsSummaryPublish =
    !moodLocked &&
    ((summaryStatus === "rejected" && hasSummaryContent) ||
      (!summaryAlreadySubmitted && hasSummaryContent));
  const canSubmit = needsSummaryPublish || needsEventsSubmit || hasPublishableSummaryExtras;
  const canSaveOrSubmit = shouldSaveSummary || hasSubmittableEvents || editingPublishedContent;
  const showPublishedEditHint =
    diaryFullyPublished &&
    canEditPublished &&
    !editingPublishedContent &&
    !hasSubmittableEvents &&
    !needsSummaryPublish &&
    !canSavePublishedSummaryExtras;

  const cancelPublishedEdits = () => {
    syncFormFromDiary(diaryData?.diary);
  };

  const handleDeletePublishedMood = async () => {
    setSavedMsg("");
    try {
      const result = await saveDiary({ studentId, diary: { mood: "", supplies: form.supplies } }).unwrap();
      syncFormFromDiary(result.diary);
    } catch {
      setSavedMsg("Could not remove mood.");
    }
  };

  const handleDeletePublishedEvent = async (eventId: number) => {
    setSavedMsg("");
    try {
      const result = await deletePublishedDiaryEvent(eventId).unwrap();
      syncFormFromDiary(result.diary);
      setSavedMsg("Removed for parents.");
    } catch {
      setSavedMsg("Could not remove item.");
    }
  };

  const saveDiaryChanges = async () => {
    setSavedMsg("");
    try {
      let latestDiary = diaryData?.diary ?? null;
      let didSave = false;
      const saveSummary = shouldSaveSummary;
      const saveEvents =
        !eventsPending && (editingPublishedContent ? !!editingEventKey : true);

      if (saveSummary) {
        const result = await saveDiary({ studentId, diary: summaryPayload }).unwrap();
        latestDiary = result.diary ?? latestDiary;
        didSave = true;
      }
      if (saveEvents) {
        const result = await saveDiaryEvents({ studentId, events: eventsPayload }).unwrap();
        latestDiary = result.diary ?? latestDiary;
        didSave = true;
      }
      if (didSave) {
        syncFormFromDiary(latestDiary);
      }
      const editedPublishedForApproval =
        diaryApprovalRequired &&
        ((summaryEditing && moodPublished) || editingEventKey != null);
      setSavedMsg(
        editedPublishedForApproval
          ? "Submitted for admin approval."
          : editingPublishedContent || canSavePublishedSummaryExtras
            ? "Diary updated for parents."
            : "Draft saved.",
      );
    } catch {
      setSavedMsg("Could not save diary.");
    }
  };

  const handleSaveDiary = async (e: FormEvent) => {
    e.preventDefault();
    await saveDiaryChanges();
  };

  const handleSubmitDiary = async () => {
    setSavedMsg("");
    const incompleteSleep = findIncompleteSleepRow();
    if (incompleteSleep) {
      setSavedMsg(
        incompleteSleep.field === "to"
          ? "Select a To time for each sleep entry before submitting."
          : "Select a From time for each sleep entry before submitting.",
      );
      focusSleepField(incompleteSleep.index, incompleteSleep.field);
      return;
    }
    try {
      let latestDiary = diaryData?.diary ?? null;
      const shouldPersistSummary =
        hasPublishableSummaryExtras ||
        (shouldSaveSummary && (hasSummaryContent || (summaryEditing && canEditPublished)));
      if (shouldPersistSummary) {
        const result = await saveDiary({ studentId, diary: summaryPayload }).unwrap();
        latestDiary = result.diary ?? latestDiary;
      }
      if (!eventsPending) {
        const result = await saveDiaryEvents({ studentId, events: submitEventsPayload }).unwrap();
        latestDiary = result.diary ?? latestDiary;
      }
      if (needsSummaryPublish) {
        const result = await submitDiary({ studentId, diary: summaryPayload }).unwrap();
        latestDiary = result.diary ?? latestDiary;
      }
      if (needsEventsSubmit) {
        const submitResult = await submitDiaryEvents({ studentId, events: submitEventsPayload }).unwrap();
        latestDiary = submitResult.diary ?? latestDiary;
      }
      if (latestDiary) {
        syncFormFromDiary(latestDiary);
      }
      if (needsSummaryPublish || needsEventsSubmit) {
        setSavedMsg(
          diaryApprovalRequired ? "Diary submitted for admin approval." : "Diary published for parents.",
        );
      } else if (hasPublishableSummaryExtras) {
        setSavedMsg("Diary updated for parents.");
      } else {
        setSavedMsg("Nothing new to publish.");
      }
    } catch (err: unknown) {
      const apiError =
        err &&
        typeof err === "object" &&
        "data" in err &&
        err.data &&
        typeof err.data === "object" &&
        "error" in err.data &&
        typeof err.data.error === "string"
          ? err.data.error
          : null;
      setSavedMsg(apiError ?? "Could not submit diary.");
    }
  };

  const handleWithdrawDiary = async () => {
    setSavedMsg("");
    try {
      if (summaryPending) await withdrawDiary(studentId).unwrap();
      if (eventsPending) await withdrawDiaryEvents(studentId).unwrap();
      setSavedMsg("Submission withdrawn — you can edit again.");
    } catch {
      setSavedMsg("Could not withdraw submission.");
    }
  };

  if (!studentId || Number.isNaN(studentId)) {
    return <p className="text-sm text-slate-500">Invalid student.</p>;
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
        ← Back to class
      </Link>

      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isProfilePhotoBusy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setProfilePhotoMsg("");
              try {
                await uploadStudentProfilePhoto({ studentId, file }).unwrap();
                setProfilePhotoMsg("Profile photo updated.");
              } catch {
                setProfilePhotoMsg("Could not upload profile photo.");
              }
            }}
          />
          <button
            type="button"
            disabled={isProfilePhotoBusy}
            onClick={() => profilePhotoInputRef.current?.click()}
            className="relative block disabled:opacity-60"
            aria-label="Change profile photo"
          >
            {student?.profilePhotoUrl ? (
              <img src={student.profilePhotoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
                {student?.name?.slice(0, 2).toUpperCase() ?? "?"}
              </div>
            )}
            <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[10px] text-white shadow">
              📷
            </span>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{student?.name ?? "Student"}</h2>
          <p className="text-sm text-slate-500">Today only · resets at midnight</p>
          {profilePhotoMsg && <p className="mt-0.5 text-xs text-brand-700">{profilePhotoMsg}</p>}
          {student?.profilePhotoUrl && (
            <button
              type="button"
              disabled={isProfilePhotoBusy}
              onClick={async () => {
                setProfilePhotoMsg("");
                try {
                  await deleteStudentProfilePhoto(studentId).unwrap();
                  setProfilePhotoMsg("Profile photo removed.");
                } catch {
                  setProfilePhotoMsg("Could not remove profile photo.");
                }
              }}
              className="mt-1 text-xs font-medium text-red-600 disabled:opacity-60"
            >
              {isDeletingProfilePhoto ? "Removing…" : "Remove photo"}
            </button>
          )}
        </div>
      </div>

      {student?.isAbsent && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">Marked absent today</p>
          <p className="mt-0.5 text-red-800/90">You can still add diary, notes, or photos if needed.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-sm">
        {(["diary", "notice", "photos"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl py-2.5 text-sm font-semibold capitalize ${
              tab === t ? "bg-brand-700 text-white" : "text-slate-600"
            }`}
          >
            {t === "notice" ? "Notes" : t === "photos" ? "Photos" : "Diary"}
          </button>
        ))}
      </div>

      {tab === "diary" && (
        <form onSubmit={handleSaveDiary} className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
          {savedMsg && <p className="text-sm text-brand-700">{savedMsg}</p>}
          {wasAdminCorrection(
            diaryData?.diary?.adminCorrectedAt,
            diaryData?.diary?.adminCorrectedBy,
            profile?.id,
          ) && <AdminEditBanner />}
          {diaryPending && <ApprovalBanner status="pending" />}
          {!diaryPending && summaryStatus === "rejected" && (
            <ApprovalBanner status={summaryStatus} reason={diaryData?.diary?.rejectionReason} directPublish={!diaryApprovalRequired} />
          )}
          {!diaryPending && summaryStatus === "draft" && savedMood.length > 0 && (
            <ApprovalBanner status="draft" directPublish={!diaryApprovalRequired} />
          )}

          {moodPublished && canEditPublished && !summaryEditing && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-700">Mood</span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                  {publishedRowLabel ? "Published" : "Approved"}
                </span>
                <button
                  type="button"
                  onClick={() => setSummaryEditing(true)}
                  className="text-xs font-semibold text-violet-700"
                >
                  Edit
                </button>
              </div>
            </div>
          )}
          {summaryEditing && (
            <PublishedEditActions
              saving={savingAny}
              onSave={() => void saveDiaryChanges()}
              onCancel={cancelPublishedEdits}
              onDelete={() => void handleDeletePublishedMood()}
            />
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold text-emerald-800">I was…</h3>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={moodLocked}
                  onClick={() => setForm({ ...form, mood: m })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize disabled:opacity-60 ${
                    form.mood === m ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-900"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </section>

          <RepeatSection<DiaryDrankRow>
            title="I drank"
            rows={form.drank}
            onChange={(drank) => setForm({ ...form, drank })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("drank", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("drank", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("drank", row, i))
                        : undefined
                    }
                  >
                    {row.what || "—"} · {row.amount || "—"} · {formatDiaryTime(row.when)}
                  </LockedEventRow>
                );
              }
              return (
              <div key={i} className="space-y-2">
                {isRowEditing("drank", row, i) && (
                  <PublishedEditActions
                    saving={savingAny}
                    onSave={() => void saveDiaryChanges()}
                    onCancel={cancelPublishedEdits}
                    onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                  />
                )}
              <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-2">
                <input
                  placeholder="What"
                  value={row.what ?? ""}
                  onChange={(e) => update({ ...row, what: e.target.value })}
                  className="w-full rounded-lg border px-2 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="How much"
                    value={row.amount}
                    onChange={(e) => update({ ...row, amount: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm"
                  />
                </div>
              </div>
              </div>
              );
            }}
            newRow={() => ({ what: "", when: "", amount: "" })}
          />

          <section ref={sleepSectionRef}>
          <RepeatSection<DiarySleptRow>
            title="I slept"
            rows={form.slept}
            onChange={(slept) => setForm({ ...form, slept })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("slept", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("slept", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("slept", row, i))
                        : undefined
                    }
                  >
                    {formatSleepEntry(row)}
                  </LockedEventRow>
                );
              }
              const highlightFrom = sleepFieldHighlight?.index === i && sleepFieldHighlight.field === "from";
              const highlightTo = sleepFieldHighlight?.index === i && sleepFieldHighlight.field === "to";
              return (
              <div key={i} className="space-y-2">
                {isRowEditing("slept", row, i) && (
                  <PublishedEditActions
                    saving={savingAny}
                    onSave={() => void saveDiaryChanges()}
                    onCancel={cancelPublishedEdits}
                    onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                  />
                )}
              <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-indigo-800">From</span>
                    <input
                      ref={(el) => {
                        if (el) sleepFromInputRefs.current.set(i, el);
                        else sleepFromInputRefs.current.delete(i);
                      }}
                      type="time"
                      value={normalizeTimeInput(row.from)}
                      onChange={(e) => {
                        setSleepFieldHighlight(null);
                        const from = e.target.value;
                        update({ ...row, from, duration: computeSleepDuration(from, row.to) });
                      }}
                      className={`w-full rounded-lg border px-2 py-2 text-sm ${
                        highlightFrom ? "border-amber-500 ring-2 ring-amber-500" : ""
                      }`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-indigo-800">To</span>
                    <input
                      ref={(el) => {
                        if (el) sleepToInputRefs.current.set(i, el);
                        else sleepToInputRefs.current.delete(i);
                      }}
                      type="time"
                      value={normalizeTimeInput(row.to)}
                      onChange={(e) => {
                        setSleepFieldHighlight(null);
                        const to = e.target.value;
                        update({ ...row, to, duration: computeSleepDuration(row.from, to) });
                      }}
                      className={`w-full rounded-lg border px-2 py-2 text-sm ${
                        highlightTo ? "border-amber-500 ring-2 ring-amber-500" : ""
                      }`}
                    />
                  </label>
                </div>
                {highlightTo && (
                  <p className="text-xs font-medium text-amber-700">Select a To time to submit this sleep entry.</p>
                )}
                {highlightFrom && (
                  <p className="text-xs font-medium text-amber-700">Select a From time to submit this sleep entry.</p>
                )}
                {row.duration && (
                  <p className="text-xs font-medium text-indigo-700">{row.duration}</p>
                )}
              </div>
              </div>
              );
            }}
            newRow={() => ({ from: "", to: "", duration: "" })}
          />
          </section>

          <RepeatSection<DiaryAteRow>
            title="I ate"
            rows={form.ate}
            onChange={(ate) => setForm({ ...form, ate })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("ate", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("ate", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("ate", row, i))
                        : undefined
                    }
                  >
                    {row.what || "—"}
                    {row.when && ` · ${formatDiaryTime(row.when)}`}
                    {row.rating && ` · ${row.rating}`}
                  </LockedEventRow>
                );
              }
              return (
              <div key={i} className="space-y-2">
                {isRowEditing("ate", row, i) && (
                  <PublishedEditActions
                    saving={savingAny}
                    onSave={() => void saveDiaryChanges()}
                    onCancel={cancelPublishedEdits}
                    onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                  />
                )}
              <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2">
                <input placeholder="What" value={row.what} onChange={(e) => update({ ...row, what: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm"
                  />
                  <select value={row.rating} onChange={(e) => update({ ...row, rating: e.target.value as DiaryAteRow["rating"] })} className="rounded-lg border px-2 py-2 text-sm">
                    <option value="">Rating</option>
                    <option value="yummy">Yummy</option>
                    <option value="so-so">So-so</option>
                    <option value="yucky">Yucky</option>
                  </select>
                </div>
              </div>
              </div>
              );
            }}
            newRow={emptyAteRow}
          />

          <RepeatSection<DiaryMedicineRow>
            title="Medicine"
            rows={form.medicine}
            onChange={(medicine) => setForm({ ...form, medicine })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("medicine", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("medicine", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("medicine", row, i))
                        : undefined
                    }
                  >
                    {row.what || "—"} · {formatDiaryTime(row.when)}{row.notes ? ` · ${row.notes}` : ""}
                  </LockedEventRow>
                );
              }
              return (
              <div key={i} className="space-y-2">
                {isRowEditing("medicine", row, i) && (
                  <PublishedEditActions
                    saving={savingAny}
                    onSave={() => void saveDiaryChanges()}
                    onCancel={cancelPublishedEdits}
                    onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                  />
                )}
              <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-2">
                <input
                  placeholder="What"
                  value={row.what ?? ""}
                  onChange={(e) => update({ ...row, what: e.target.value })}
                  className="w-full rounded-lg border px-2 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm"
                  />
                  <input
                    placeholder="Notes (optional)"
                    value={row.notes ?? ""}
                    onChange={(e) => update({ ...row, notes: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm"
                  />
                </div>
              </div>
              </div>
              );
            }}
            newRow={() => ({ what: "", when: "", notes: "" })}
          />

          <RepeatSection<DiaryFunRow>
            title="I had fun"
            rows={form.fun}
            onChange={(fun) => setForm({ ...form, fun })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("fun", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("fun", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("fun", row, i))
                        : undefined
                    }
                  >
                    {row.text || "—"}
                  </LockedEventRow>
                );
              }
              return (
                <div key={i} className="space-y-2">
                  {isRowEditing("fun", row, i) && (
                    <PublishedEditActions
                      saving={savingAny}
                      onSave={() => void saveDiaryChanges()}
                      onCancel={cancelPublishedEdits}
                      onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                    />
                  )}
                  <textarea
                    value={row.text}
                    onChange={(e) => update({ ...row, text: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2 text-sm"
                    placeholder="Activities today…"
                  />
                </div>
              );
            }}
            newRow={() => ({ text: "" })}
          />

          <RepeatSection<DiaryPottyRow>
            title="I went (potty)"
            rows={form.potty}
            onChange={(potty) => setForm({ ...form, potty })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("potty", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("potty", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("potty", row, i))
                        : undefined
                    }
                  >
                    <span className="capitalize">{row.type}</span> · {formatDiaryTime(row.when)}
                  </LockedEventRow>
                );
              }
              return (
              <div key={i} className="space-y-2">
                {isRowEditing("potty", row, i) && (
                  <PublishedEditActions
                    saving={savingAny}
                    onSave={() => void saveDiaryChanges()}
                    onCancel={cancelPublishedEdits}
                    onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                  />
                )}
              <div className="grid grid-cols-2 gap-2">
                <select value={row.type} onChange={(e) => update({ ...row, type: e.target.value as DiaryPottyRow["type"] })} className="rounded-lg border px-2 py-2 text-sm">
                  <option value="wet">Wet</option>
                  <option value="poo">Poo</option>
                </select>
                <input
                  type="time"
                  value={normalizeTimeInput(row.when)}
                  onChange={(e) => update({ ...row, when: e.target.value })}
                  className="rounded-lg border px-2 py-2 text-sm"
                />
              </div>
              </div>
              );
            }}
            newRow={() => ({ type: "wet" as const, when: "" })}
          />

          <section>
            <h3 className="mb-2 text-sm font-bold text-violet-800">I need</h3>
            <div className="flex flex-wrap gap-2">
              {SUPPLY_OPTIONS.map((s) => {
                const checked = form.supplies.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={suppliesLocked}
                    onClick={() =>
                      setForm({
                        ...form,
                        supplies: checked ? form.supplies.filter((x) => x !== s) : [...form.supplies, s],
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize disabled:opacity-60 ${
                      checked ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-900"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </section>

          <RepeatSection<DiaryRemarkRow>
            title="Teacher's remarks"
            rows={form.remarks}
            onChange={(remarks) => setForm({ ...form, remarks })}
            canAdd={canAddEventRows}
            isRowLocked={isRowLocked}
            isRowEditable={(row, i) => !isRowLocked(row) || isRowEditing("remarks", row, i)}
            renderRow={(row, i, update) => {
              if (rowShowsLocked("remarks", row, i)) {
                return (
                  <LockedEventRow
                    key={row.id ?? i}
                    status={row.approvalStatus}
                    publishedLabel={publishedRowLabel}
                    onEdit={
                      canEditPublished && row.approvalStatus === "approved"
                        ? () => setEditingEventKey(eventRowKey("remarks", row, i))
                        : undefined
                    }
                  >
                    {row.text || "—"}
                  </LockedEventRow>
                );
              }
              return (
                <div key={i} className="space-y-2">
                  {isRowEditing("remarks", row, i) && (
                    <PublishedEditActions
                      saving={savingAny}
                      onSave={() => void saveDiaryChanges()}
                      onCancel={cancelPublishedEdits}
                      onDelete={row.id != null ? () => void handleDeletePublishedEvent(row.id!) : undefined}
                    />
                  )}
                  <textarea
                    value={row.text}
                    onChange={(e) => update({ ...row, text: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                    placeholder="Notes for parents…"
                  />
                </div>
              );
            }}
            newRow={() => ({ text: "" })}
          />

          <div className="flex flex-col gap-2">
            {editingPublishedContent ? (
              <>
                <button
                  type="button"
                  disabled={savingAny}
                  onClick={() => void saveDiaryChanges()}
                  className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {savingAny ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={cancelPublishedEdits}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : diaryApprovalRequired && diaryPending ? (
              <button
                type="button"
                disabled={withdrawingAny}
                onClick={() => void handleWithdrawDiary()}
                className="w-full rounded-xl border border-brand-300 bg-white py-3 font-semibold text-brand-800 disabled:opacity-60"
              >
                {withdrawingAny ? "…" : "Withdraw submission"}
              </button>
            ) : showPublishedEditHint ? (
              <p className="text-center text-sm text-slate-600">
                {diaryApprovalRequired ? "Approved" : "Published"} — tap Edit on an item to update it for parents.
              </p>
            ) : diaryFullyPublished &&
              !canEditPublished &&
              !canFillEmptySummaryExtras &&
              !hasPublishableSummaryExtras &&
              !hasSubmittableEvents ? (
              <p className="text-center text-sm text-emerald-700">
                {diaryApprovalRequired ? "Approved" : "Published"} — parents can see this diary.
              </p>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={savingAny || !canSaveOrSubmit}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-semibold text-slate-700 disabled:opacity-60"
                >
                  {savingAny ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  disabled={submittingAny || !canSubmit}
                  onClick={() => void handleSubmitDiary()}
                  className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {submittingAny ? "Submitting…" : "Submit"}
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {tab === "notice" && (
        <NoticePanel
          studentId={studentId}
          approvalRequired={contentSettings?.notices ?? false}
          canEditPublished={canEditPublished}
          currentUserId={profile?.id}
        />
      )}
      {tab === "photos" && (
        <GalleryPanel
          studentId={studentId}
          approvalRequired={galleryApprovalRequired}
          canEditPublished={canEditPublished}
          currentUserId={profile?.id}
        />
      )}
    </div>
  );
}

function RepeatSection<T extends DiaryRowMeta>({
  title,
  rows,
  onChange,
  renderRow,
  newRow,
  canAdd = true,
  isRowLocked,
  isRowEditable,
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  renderRow: (row: T, index: number, update: (row: T) => void) => ReactNode;
  newRow: () => T;
  canAdd?: boolean;
  isRowLocked?: (row: T) => boolean;
  isRowEditable?: (row: T, index: number) => boolean;
}) {
  const rowCanEdit = (row: T, index: number) =>
    isRowEditable ? isRowEditable(row, index) : !(isRowLocked?.(row) ?? false);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {canAdd && (
          <button type="button" onClick={() => onChange([...rows, newRow()])} className="text-xs font-semibold text-brand-700">
            + Add row
          </button>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`}>
            {rowCanEdit(row, i) && !isRowLocked?.(row) && (
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            )}
            {renderRow(row, i, (updated) => {
              if (!rowCanEdit(row, i)) return;
              onChange(rows.map((r, j) => (j === i ? updated : r)));
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function NoticePanel({
  studentId,
  approvalRequired,
  canEditPublished,
  currentUserId,
}: {
  studentId: number;
  approvalRequired: boolean;
  canEditPublished: boolean;
  currentUserId?: number;
}) {
  const { data: settings } = useGetContentSettingsQuery();
  const noticesApprovalRequired = settings?.notices ?? approvalRequired;
  const { data } = useGetNoticesQuery(studentId, { refetchOnMountOrArgChange: true });
  const [addNotice, { isLoading }] = useAddNoticeMutation();
  const [deleteNotice] = useDeleteNoticeMutation();
  const [updatePublishedNotice] = useUpdatePublishedNoticeMutation();
  const [message, setMessage] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const canShowDelete = (notice: ParentNotice) => {
    if (notice.deletable === false) return false;
    if (notice.deletable === true) return true;
    const status = notice.approvalStatus ?? "approved";
    if (noticesApprovalRequired) {
      return status === "pending" || status === "rejected" || status === "draft";
    }
    return status !== "approved";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await addNotice({ studentId, message: message.trim() });
    setMessage("");
  };

  const handleDeleteNotice = async (noticeId: number) => {
    setNoticeMsg("");
    try {
      await deleteNotice(noticeId).unwrap();
    } catch {
      setNoticeMsg("Published notes cannot be removed.");
    }
  };

  const handleSavePublishedNotice = async (noticeId: number) => {
    setNoticeMsg("");
    try {
      await updatePublishedNotice({ noticeId, message: editText.trim() }).unwrap();
      setEditingNoticeId(null);
      setEditText("");
      setNoticeMsg(
        noticesApprovalRequired ? "Note submitted for admin approval." : "Note updated for parents.",
      );
    } catch {
      setNoticeMsg("Could not update note.");
    }
  };

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
      {noticeMsg && <p className="text-sm text-red-700">{noticeMsg}</p>}
      <p className="text-sm text-slate-500">Messages parents see today (e.g. bring diapers tomorrow).</p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a note for parents…"
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
        />
        <button type="submit" disabled={isLoading} className="shrink-0 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white">
          Send
        </button>
      </form>
      <ul className="space-y-2">
        {(data?.notices ?? []).map((n) => (
          <li key={n.id} className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              {editingNoticeId === n.id ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
                />
              ) : (
                <span>{n.message}</span>
              )}
              <div className="flex shrink-0 flex-col items-end gap-1">
                {n.approvalStatus === "approved" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                    {noticesApprovalRequired ? "Approved" : "Published"}
                  </span>
                )}
                {canEditPublished && n.approvalStatus === "approved" && editingNoticeId !== n.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNoticeId(n.id);
                      setEditText(n.message);
                    }}
                    className="text-xs font-semibold text-violet-700"
                  >
                    Edit
                  </button>
                )}
                {editingNoticeId === n.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSavePublishedNotice(n.id)}
                      className="text-xs font-semibold text-emerald-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNoticeId(null)}
                      className="text-xs text-slate-600"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {canShowDelete(n) && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteNotice(n.id)}
                    className="text-xs text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {wasAdminCorrection(n.adminCorrectedAt, n.adminCorrectedBy, currentUserId) && <AdminEditBanner />}
            {n.approvalStatus !== "approved" && (
              <ApprovalBanner
                status={n.approvalStatus}
                reason={n.rejectionReason}
                directPublish={!noticesApprovalRequired}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalleryPanel({
  studentId,
  approvalRequired,
  canEditPublished,
  currentUserId,
}: {
  studentId: number;
  approvalRequired: boolean;
  canEditPublished: boolean;
  currentUserId?: number;
}) {
  const { data } = useGetGalleryQuery(studentId);
  const [uploadPhoto, { isLoading }] = useUploadPhotoMutation();
  const [deletePhoto] = useDeletePhotoMutation();
  const [submitGallery, { isLoading: submitting }] = useSubmitGalleryMutation();
  const [withdrawGallery, { isLoading: withdrawing }] = useWithdrawGalleryMutation();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      await uploadPhoto({ studentId, file }).unwrap();
    } catch {
      setMessage("Could not upload photo.");
    }
  };

  const photos = data?.photos ?? [];
  const lightboxPhotos = photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
  const hasPending = photos.some((p) => p.approvalStatus === "pending" && !p.pendingDeletion);
  const hasPendingRemoval = photos.some((p) => p.pendingDeletion);
  const hasApproved = photos.some((p) => p.approvalStatus === "approved");
  const hasSubmittable = photos.some((p) => p.approvalStatus === "draft" || p.approvalStatus === "rejected");
  const canRemovePhoto = (photo: GalleryPhoto) => {
    if (photo.pendingDeletion) return false;
    if (photo.approvalStatus === "draft" || photo.approvalStatus === "rejected") return true;
    if (photo.approvalStatus === "approved" && canEditPublished) return true;
    return false;
  };

  const handleRemovePhoto = async (photoId: number) => {
    setMessage("");
    try {
      const result = await deletePhoto(photoId).unwrap();
      setMessage(
        result.pendingDeletion ? "Removal submitted for admin approval." : "Photo removed.",
      );
    } catch (err: unknown) {
      const apiError =
        err &&
        typeof err === "object" &&
        "data" in err &&
        err.data &&
        typeof err.data === "object" &&
        "error" in err.data &&
        typeof err.data.error === "string"
          ? err.data.error
          : null;
      setMessage(apiError ?? "Could not remove photo.");
    }
  };

  const handleSubmit = async () => {
    setMessage("");
    try {
      await submitGallery(studentId).unwrap();
      setMessage(
        approvalRequired ? "Photos submitted for admin approval." : "Photos published for parents.",
      );
    } catch (err: unknown) {
      const apiError =
        err &&
        typeof err === "object" &&
        "data" in err &&
        err.data &&
        typeof err.data === "object" &&
        "error" in err.data &&
        typeof err.data.error === "string"
          ? err.data.error
          : null;
      setMessage(apiError ?? "Could not submit photos.");
    }
  };

  const handleWithdraw = async () => {
    setMessage("");
    try {
      await withdrawGallery(studentId).unwrap();
      setMessage("Submission withdrawn — you can edit again.");
    } catch {
      setMessage("Could not withdraw submission.");
    }
  };

  const showWithdraw = approvalRequired && (hasPending || hasPendingRemoval);
  const showPublishedHint =
    hasApproved && !canEditPublished && !hasSubmittable && !hasPending && !hasPendingRemoval;

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
      {message && <p className="text-sm text-brand-700">{message}</p>}
      {photos.some((p) => wasAdminCorrection(p.adminCorrectedAt, p.adminCorrectedBy, currentUserId)) && (
        <AdminEditBanner />
      )}
      {hasPending && <ApprovalBanner status="pending" />}
      {hasPendingRemoval && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Photo removal pending admin approval.
        </div>
      )}
      {!hasPending && photos.some((p) => p.approvalStatus === "draft") && (
        <ApprovalBanner status="draft" directPublish={!approvalRequired} />
      )}

      <div className="space-y-2">
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            await handlePhotoFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            await handlePhotoFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => galleryRef.current?.click()}
          className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 py-8 text-sm font-semibold text-brand-800 disabled:opacity-60"
        >
          {isLoading ? "Uploading…" : "+ Add photo from gallery"}
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => cameraRef.current?.click()}
          className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-60"
        >
          Take a photo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {photos.map((p, i) => (
          <div key={p.id} className="space-y-1">
            <div className="relative overflow-hidden rounded-xl">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full cursor-pointer"
                aria-label="View photo"
              >
                <img src={p.url} alt="" className="aspect-square w-full object-cover" />
              </button>
              {canRemovePhoto(p) && (
                <button
                  type="button"
                  onClick={() => void handleRemovePhoto(p.id)}
                  className="absolute right-1 top-1 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white"
                >
                  Remove
                </button>
              )}
            </div>
            {p.pendingDeletion && (
              <span className="block rounded-full bg-amber-100 px-2 py-0.5 text-center text-[10px] font-bold uppercase text-amber-900">
                Removal pending
              </span>
            )}
            {!p.pendingDeletion && p.approvalStatus === "approved" && (
              <span className="block rounded-full bg-emerald-100 px-2 py-0.5 text-center text-[10px] font-bold uppercase text-emerald-800">
                {approvalRequired ? "Approved" : "Published"}
              </span>
            )}
            {!p.pendingDeletion && p.approvalStatus !== "approved" && (
              <ApprovalBanner status={p.approvalStatus} reason={p.rejectionReason} directPublish={!approvalRequired} />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {showWithdraw && (
          <button
            type="button"
            disabled={withdrawing}
            onClick={() => void handleWithdraw()}
            className="w-full rounded-xl border border-brand-300 bg-white py-3 font-semibold text-brand-800 disabled:opacity-60"
          >
            {withdrawing ? "…" : "Withdraw submission"}
          </button>
        )}
        {showPublishedHint ? (
          <p className="text-center text-sm text-emerald-700">
            {approvalRequired ? "Approved" : "Published"} — parents can see these photos. You can still add more.
          </p>
        ) : hasSubmittable ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        ) : null}
      </div>

      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
