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
} from "../services/api";
import PhotoLightbox from "../components/PhotoLightbox";
import type { DiaryAteRow, DiaryPottyRow, DiaryDrankRow, DiarySleptRow, DiaryMedicineRow, DiaryRowMeta, ContentApprovalStatus, ParentNotice } from "../types";
import { MOOD_OPTIONS, SUPPLY_OPTIONS } from "../types";

type Tab = "diary" | "notice" | "photos";
type DiaryForm = {
  mood: string;
  activities: string;
  supplies: string[];
  teacherRemarks: string;
  drank: DiaryDrankRow[];
  slept: DiarySleptRow[];
  ate: DiaryAteRow[];
  medicine: DiaryMedicineRow[];
  potty: DiaryPottyRow[];
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

const mapSleptRow = (row: Partial<DiarySleptRow> & { when?: string }): DiarySleptRow => {
  const from = row.from ?? row.when ?? "";
  const to = row.to ?? "";
  const duration = row.duration || (from && to ? computeSleepDuration(from, to) : "");
  return { from, to, duration };
};

const emptyAteRow = (): DiaryAteRow => ({ what: "", when: "", rating: "" });

const emptyDiary = (): DiaryForm => ({
  mood: "",
  activities: "",
  supplies: [],
  teacherRemarks: "",
  drank: [{ what: "", when: "", amount: "" }],
  slept: [{ from: "", to: "", duration: "" }],
  ate: [emptyAteRow()],
  medicine: [{ what: "", when: "", notes: "" }],
  potty: [{ type: "wet", when: "" }],
});

const isRowLocked = (row: DiaryRowMeta) =>
  row.approvalStatus === "approved" || row.approvalStatus === "pending";

const normalizeAteRows = (rows: { what: string; when: string; rating: string }[]): DiaryAteRow[] =>
  rows.map((row) => ({
    what: row.what,
    when: row.when,
    rating: (row.rating === "yummy" || row.rating === "so-so" || row.rating === "yucky" ? row.rating : "") as DiaryAteRow["rating"],
  }));

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
}: {
  status?: ContentApprovalStatus;
  reason?: string | null;
}) {
  if (!status || status === "approved") return null;
  if (status === "draft") {
    return (
      <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
        Draft — tap Submit when ready for admin to review.
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
  const { data: roster } = useGetRosterQuery();
  const { data: profile } = useGetProfileQuery();
  const { data: contentSettings } = useGetContentSettingsQuery();
  const canEditPublished = !!profile?.canEditPublishedContent;
  const student = roster?.students.find((s) => s.id === studentId);
  const diaryApprovalRequired = contentSettings?.diary ?? false;
  const galleryApprovalRequired = contentSettings?.gallery ?? false;

  const { data: diaryData, isLoading: diaryLoading } = useGetDiaryQuery(studentId, { skip: !studentId });
  const [saveDiary, { isLoading: saving }] = useSaveDiaryMutation();
  const [saveDiaryEvents, { isLoading: savingEvents }] = useSaveDiaryEventsMutation();
  const [submitDiary, { isLoading: submitting }] = useSubmitDiaryMutation();
  const [submitDiaryEvents, { isLoading: submittingEvents }] = useSubmitDiaryEventsMutation();
  const [withdrawDiary, { isLoading: withdrawing }] = useWithdrawDiaryMutation();
  const [withdrawDiaryEvents, { isLoading: withdrawingEvents }] = useWithdrawDiaryEventsMutation();
  const [form, setForm] = useState<DiaryForm>(emptyDiary);
  const [savedMsg, setSavedMsg] = useState("");

  const savingAny = saving || savingEvents;
  const submittingAny = submitting || submittingEvents;
  const withdrawingAny = withdrawing || withdrawingEvents;

  useEffect(() => {
    const d = diaryData?.diary;
    if (d) {
      setForm({
        mood: d.mood ?? "",
        activities: d.activities ?? "",
        supplies: d.supplies ?? [],
        teacherRemarks: d.teacherRemarks ?? "",
        drank: d.drank?.length ? d.drank.map((r) => ({ what: r.what ?? "", when: r.when ?? "", amount: r.amount ?? "" })) : [{ what: "", when: "", amount: "" }],
        slept: d.slept?.length ? d.slept.map(mapSleptRow) : [{ from: "", to: "", duration: "" }],
        ate: d.ate?.length ? normalizeAteRows(d.ate) : [emptyAteRow()],
        medicine: d.medicine?.length
          ? d.medicine.map((r) => ({ what: r.what ?? "", when: r.when ?? "", notes: r.notes ?? "" }))
          : [{ what: "", when: "", notes: "" }],
        potty: d.potty?.length ? d.potty : [{ type: "wet", when: "" }],
      });
    } else if (!diaryLoading) {
      setForm(emptyDiary());
    }
  }, [diaryData, diaryLoading]);

  const summaryStatus = diaryData?.diary?.summaryApprovalStatus ?? diaryData?.diary?.approvalStatus;
  const summaryLocked =
    summaryStatus === "pending" || (summaryStatus === "approved" && !canEditPublished);
  const summaryPending = summaryStatus === "pending";
  const diarySchoolAdminEdit = summaryStatus === "approved" && canEditPublished;
  const eventsPending = !!diaryData?.diary?.hasPendingEvents;
  const diaryPending = summaryPending || eventsPending;

  const summaryPayload = {
    mood: form.mood,
    activities: form.activities,
    supplies: form.supplies,
    teacherRemarks: form.teacherRemarks,
  };
  const eventsPayload = {
    drank: form.drank,
    slept: form.slept,
    ate: form.ate,
    medicine: form.medicine,
    potty: form.potty,
  };

  const canSubmitSummary = !summaryLocked && summaryStatus !== "approved";
  const hasSubmittableEvents = [form.drank, form.slept, form.ate, form.medicine, form.potty]
    .flat()
    .some((row) => !isRowLocked(row));

  const handleSaveDiary = async (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg("");
    try {
      if (!summaryLocked) {
        await saveDiary({ studentId, diary: summaryPayload }).unwrap();
      }
      if (!eventsPending) {
        await saveDiaryEvents({ studentId, events: eventsPayload }).unwrap();
      }
      setSavedMsg(
        diarySchoolAdminEdit
          ? "Diary updated for parents."
          : diaryApprovalRequired
            ? "Draft saved."
            : "Diary saved for today.",
      );
    } catch {
      setSavedMsg("Could not save diary.");
    }
  };

  const handleSubmitDiary = async () => {
    setSavedMsg("");
    try {
      if (!summaryLocked) {
        await saveDiary({ studentId, diary: summaryPayload }).unwrap();
      }
      if (!eventsPending) {
        await saveDiaryEvents({ studentId, events: eventsPayload }).unwrap();
      }
      if (diaryApprovalRequired) {
        if (canSubmitSummary) {
          await submitDiary({ studentId, diary: summaryPayload }).unwrap();
        }
        if (hasSubmittableEvents && !eventsPending) {
          await submitDiaryEvents({ studentId, events: eventsPayload }).unwrap();
        }
      }
      setSavedMsg("Diary submitted for admin approval.");
    } catch {
      setSavedMsg("Could not submit diary.");
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
        {student?.profilePhotoUrl ? (
          <img src={student.profilePhotoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
            {student?.name?.slice(0, 2).toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{student?.name ?? "Student"}</h2>
          <p className="text-sm text-slate-500">Today only · resets at midnight</p>
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
          {diarySchoolAdminEdit && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <p className="font-semibold">School admin edit mode</p>
              <p className="mt-0.5">Changes save directly for parents.</p>
            </div>
          )}
          {diaryApprovalRequired && diaryData?.diary?.adminCorrectedAt && <AdminEditBanner />}
          {diaryApprovalRequired && !diarySchoolAdminEdit && diaryPending && (
            <ApprovalBanner status="pending" />
          )}
          {diaryApprovalRequired && !diarySchoolAdminEdit && !diaryPending && summaryStatus === "rejected" && (
            <ApprovalBanner status={summaryStatus} reason={diaryData?.diary?.rejectionReason} />
          )}
          {diaryApprovalRequired && !diarySchoolAdminEdit && !diaryPending && summaryStatus === "draft" && (
            <ApprovalBanner status="draft" />
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold text-emerald-800">I was…</h3>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={summaryLocked}
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
            canAdd={!eventsPending}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-2">
                <input
                  placeholder="What"
                  value={row.what ?? ""}
                  disabled={isRowLocked(row)}
                  onChange={(e) => update({ ...row, what: e.target.value })}
                  className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="How much"
                    value={row.amount}
                    disabled={isRowLocked(row)}
                    onChange={(e) => update({ ...row, amount: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                  />
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    disabled={isRowLocked(row)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}
            newRow={() => ({ what: "", when: "", amount: "" })}
          />

          <RepeatSection<DiarySleptRow>
            title="I slept"
            rows={form.slept}
            onChange={(slept) => setForm({ ...form, slept })}
            canAdd={!eventsPending}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-indigo-800">From</span>
                    <input
                      type="time"
                      value={normalizeTimeInput(row.from)}
                      disabled={isRowLocked(row)}
                      onChange={(e) => {
                        const from = e.target.value;
                        update({ ...row, from, duration: computeSleepDuration(from, row.to) });
                      }}
                      className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-indigo-800">To</span>
                    <input
                      type="time"
                      value={normalizeTimeInput(row.to)}
                      disabled={isRowLocked(row)}
                      onChange={(e) => {
                        const to = e.target.value;
                        update({ ...row, to, duration: computeSleepDuration(row.from, to) });
                      }}
                      className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                    />
                  </label>
                </div>
                {row.duration && (
                  <p className="text-xs font-medium text-indigo-700">{row.duration}</p>
                )}
              </div>
            )}
            newRow={() => ({ from: "", to: "", duration: "" })}
          />

          <RepeatSection<DiaryAteRow>
            title="I ate"
            rows={form.ate}
            onChange={(ate) => setForm({ ...form, ate })}
            canAdd={!eventsPending}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2">
                <input placeholder="What" value={row.what} disabled={isRowLocked(row)} onChange={(e) => update({ ...row, what: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    disabled={isRowLocked(row)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                  />
                  <select value={row.rating} disabled={isRowLocked(row)} onChange={(e) => update({ ...row, rating: e.target.value as DiaryAteRow["rating"] })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50">
                    <option value="">Rating</option>
                    <option value="yummy">Yummy</option>
                    <option value="so-so">So-so</option>
                    <option value="yucky">Yucky</option>
                  </select>
                </div>
              </div>
            )}
            newRow={emptyAteRow}
          />

          <RepeatSection<DiaryMedicineRow>
            title="Medicine"
            rows={form.medicine}
            onChange={(medicine) => setForm({ ...form, medicine })}
            canAdd={!eventsPending}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-2">
                <input
                  placeholder="What"
                  value={row.what ?? ""}
                  disabled={isRowLocked(row)}
                  onChange={(e) => update({ ...row, what: e.target.value })}
                  className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={normalizeTimeInput(row.when)}
                    disabled={isRowLocked(row)}
                    onChange={(e) => update({ ...row, when: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                  />
                  <input
                    placeholder="Notes (optional)"
                    value={row.notes ?? ""}
                    disabled={isRowLocked(row)}
                    onChange={(e) => update({ ...row, notes: e.target.value })}
                    className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}
            newRow={() => ({ what: "", when: "", notes: "" })}
          />

          <section>
            <h3 className="mb-2 text-sm font-bold text-sky-800">I had fun</h3>
            <textarea
              value={form.activities}
              disabled={summaryLocked}
              onChange={(e) => setForm({ ...form, activities: e.target.value })}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="Activities today…"
            />
          </section>

          <RepeatSection<DiaryPottyRow>
            title="I went (potty)"
            rows={form.potty}
            onChange={(potty) => setForm({ ...form, potty })}
            canAdd={!eventsPending}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <select value={row.type} disabled={isRowLocked(row)} onChange={(e) => update({ ...row, type: e.target.value as DiaryPottyRow["type"] })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50">
                  <option value="wet">Wet</option>
                  <option value="poo">Poo</option>
                </select>
                <input placeholder="When" value={row.when} disabled={isRowLocked(row)} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
              </div>
            )}
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
                    disabled={summaryLocked}
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

          <section>
            <h3 className="mb-2 text-sm font-bold text-slate-800">Teacher&apos;s remarks</h3>
            <textarea
              value={form.teacherRemarks}
              disabled={summaryLocked}
              onChange={(e) => setForm({ ...form, teacherRemarks: e.target.value })}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="Notes for parents…"
            />
          </section>

          {diaryApprovalRequired ? (
            <div className="flex flex-col gap-2">
              {diaryPending ? (
                <button
                  type="button"
                  disabled={withdrawingAny}
                  onClick={() => void handleWithdrawDiary()}
                  className="w-full rounded-xl border border-brand-300 bg-white py-3 font-semibold text-brand-800 disabled:opacity-60"
                >
                  {withdrawingAny ? "…" : "Edit"}
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={savingAny}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {savingAny ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    disabled={submittingAny}
                    onClick={() => void handleSubmitDiary()}
                    className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {submittingAny ? "Submitting…" : "Submit"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button type="submit" disabled={savingAny} className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60">
              {savingAny ? "Saving…" : "Save today's diary"}
            </button>
          )}
        </form>
      )}

      {tab === "notice" && (
        <NoticePanel
          studentId={studentId}
          approvalRequired={contentSettings?.notices ?? false}
          canEditPublished={canEditPublished}
        />
      )}
      {tab === "photos" && <GalleryPanel studentId={studentId} approvalRequired={galleryApprovalRequired} />}
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
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  renderRow: (row: T, index: number, update: (row: T) => void) => ReactNode;
  newRow: () => T;
  canAdd?: boolean;
}) {
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
        {rows.map((row, i) =>
          renderRow(row, i, (updated) => onChange(rows.map((r, j) => (j === i ? updated : r)))),
        )}
      </div>
    </section>
  );
}

function NoticePanel({
  studentId,
  approvalRequired,
  canEditPublished,
}: {
  studentId: number;
  approvalRequired: boolean;
  canEditPublished: boolean;
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
      setNoticeMsg("Note updated for parents.");
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
              <div className="flex shrink-0 flex-col gap-1">
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
            {noticesApprovalRequired && n.adminCorrectedAt && <AdminEditBanner />}
            {noticesApprovalRequired && n.approvalStatus !== "approved" && (
              <ApprovalBanner status={n.approvalStatus} reason={n.rejectionReason} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalleryPanel({ studentId, approvalRequired }: { studentId: number; approvalRequired: boolean }) {
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
    if (file) await uploadPhoto({ studentId, file });
  };

  const photos = data?.photos ?? [];
  const lightboxPhotos = photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
  const hasPending = photos.some((p) => p.approvalStatus === "pending");
  const hasApprovedOnly = photos.length > 0 && photos.every((p) => p.approvalStatus === "approved");
  const hasSubmittable = photos.some((p) => p.approvalStatus === "draft" || p.approvalStatus === "rejected");
  const galleryLocked = approvalRequired && photos.some((p) => p.approvalStatus === "pending" || p.approvalStatus === "approved");
  const canRemove = (status?: ContentApprovalStatus) =>
    !approvalRequired || status === "draft" || status === "rejected";

  const handleSubmit = async () => {
    setMessage("");
    try {
      await submitGallery(studentId).unwrap();
      setMessage("Photos submitted for admin approval.");
    } catch {
      setMessage("Could not submit photos.");
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

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
      {message && <p className="text-sm text-brand-700">{message}</p>}
      {approvalRequired && photos.some((p) => p.adminCorrectedAt) && <AdminEditBanner />}
      {approvalRequired && hasPending && (
        <ApprovalBanner status="pending" />
      )}
      {approvalRequired && !hasPending && photos.some((p) => p.approvalStatus === "draft") && (
        <ApprovalBanner status="draft" />
      )}

      {!galleryLocked && (
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
      )}

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
              {canRemove(p.approvalStatus) && (
                <button
                  type="button"
                  onClick={() => deletePhoto(p.id)}
                  className="absolute right-1 top-1 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white"
                >
                  Remove
                </button>
              )}
            </div>
            {approvalRequired && (
              <ApprovalBanner status={p.approvalStatus} reason={p.rejectionReason} />
            )}
          </div>
        ))}
      </div>

      {approvalRequired && (
        <div className="flex flex-col gap-2">
          {hasPending ? (
            <button
              type="button"
              disabled={withdrawing}
              onClick={() => void handleWithdraw()}
              className="w-full rounded-xl border border-brand-300 bg-white py-3 font-semibold text-brand-800 disabled:opacity-60"
            >
              {withdrawing ? "…" : "Edit"}
            </button>
          ) : hasApprovedOnly ? (
            <p className="text-center text-sm text-emerald-700">Approved — parents can see these photos.</p>
          ) : (
            <button
              type="button"
              disabled={submitting || !hasSubmittable}
              onClick={() => void handleSubmit()}
              className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          )}
        </div>
      )}

      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
