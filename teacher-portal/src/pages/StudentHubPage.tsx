import { useEffect, useState, FormEvent, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useSubmitDiaryMutation,
  useWithdrawDiaryMutation,
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
import type { DaycareDiary, DiaryAteRow, DiaryPottyRow, ContentApprovalStatus, ParentNotice } from "../types";
import { MOOD_OPTIONS, SUPPLY_OPTIONS } from "../types";

type Tab = "diary" | "notice" | "photos";
type DiaryForm = Omit<DaycareDiary, "studentId" | "entryDate">;

const emptyAteRow = (): DiaryAteRow => ({ what: "", when: "", rating: "" });

const normalizeAteRows = (rows: { what: string; when: string; rating: string }[]): DiaryAteRow[] =>
  rows.map((row) => ({
    what: row.what,
    when: row.when,
    rating: (row.rating === "yummy" || row.rating === "so-so" || row.rating === "yucky" ? row.rating : "") as DiaryAteRow["rating"],
  }));

const emptyDiary = (): DiaryForm => ({
  mood: "",
  drank: [{ when: "", amount: "" }],
  slept: [{ when: "", duration: "" }],
  ate: [emptyAteRow()],
  medicine: [{ when: "", notes: "" }],
  activities: "",
  potty: [{ type: "wet", when: "" }],
  supplies: [],
  teacherRemarks: "",
});

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
  const [submitDiary, { isLoading: submittingDiary }] = useSubmitDiaryMutation();
  const [withdrawDiary, { isLoading: withdrawingDiary }] = useWithdrawDiaryMutation();
  const [form, setForm] = useState<DiaryForm>(emptyDiary);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const d = diaryData?.diary;
    if (d) {
      setForm({
        mood: d.mood ?? "",
        drank: d.drank?.length ? d.drank : [{ when: "", amount: "" }],
        slept: d.slept?.length ? d.slept : [{ when: "", duration: "" }],
        ate: d.ate?.length ? normalizeAteRows(d.ate) : [emptyAteRow()],
        medicine: d.medicine?.length ? d.medicine : [{ when: "", notes: "" }],
        activities: d.activities ?? "",
        potty: d.potty?.length ? d.potty : [{ type: "wet", when: "" }],
        supplies: d.supplies ?? [],
        teacherRemarks: d.teacherRemarks ?? "",
      });
    } else if (!diaryLoading) {
      setForm(emptyDiary());
    }
  }, [diaryData, diaryLoading]);

  const diaryStatus = diaryData?.diary?.approvalStatus;
  const diaryLocked =
    diaryStatus === "pending" || (diaryStatus === "approved" && !canEditPublished);
  const diaryPending = diaryStatus === "pending";
  const diarySchoolAdminEdit = diaryStatus === "approved" && canEditPublished;

  const handleSaveDiary = async (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg("");
    try {
      const result = await saveDiary({ studentId, diary: form }).unwrap();
      setSavedMsg(
        diarySchoolAdminEdit
          ? "Diary updated for parents."
          : diaryApprovalRequired
            ? "Draft saved."
            : result.diary?.approvalStatus === "pending"
              ? "Diary saved. Waiting for admin approval."
              : "Diary saved for today.",
      );
    } catch {
      setSavedMsg("Could not save diary.");
    }
  };

  const handleSubmitDiary = async () => {
    setSavedMsg("");
    try {
      await submitDiary({ studentId, diary: form }).unwrap();
      setSavedMsg("Diary submitted for admin approval.");
    } catch {
      setSavedMsg("Could not submit diary.");
    }
  };

  const handleWithdrawDiary = async () => {
    setSavedMsg("");
    try {
      await withdrawDiary(studentId).unwrap();
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
          {diaryApprovalRequired && !diarySchoolAdminEdit && (
            <ApprovalBanner status={diaryData?.diary?.approvalStatus} reason={diaryData?.diary?.rejectionReason} />
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold text-emerald-800">I was…</h3>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={diaryLocked}
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

          <RepeatSection title="I drank" rows={form.drank} onChange={(drank) => setForm({ ...form, drank })} readOnly={diaryLocked}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input placeholder="When" value={row.when} disabled={diaryLocked} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                <input placeholder="How much" value={row.amount} disabled={diaryLocked} onChange={(e) => update({ ...row, amount: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
              </div>
            )}
            newRow={() => ({ when: "", amount: "" })}
          />

          <RepeatSection title="I slept" rows={form.slept} onChange={(slept) => setForm({ ...form, slept })} readOnly={diaryLocked}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input placeholder="When" value={row.when} disabled={diaryLocked} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                <input placeholder="How long" value={row.duration} disabled={diaryLocked} onChange={(e) => update({ ...row, duration: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
              </div>
            )}
            newRow={() => ({ when: "", duration: "" })}
          />

          <RepeatSection title="I ate" rows={form.ate} onChange={(ate) => setForm({ ...form, ate })} readOnly={diaryLocked}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2">
                <input placeholder="What" value={row.what} disabled={diaryLocked} onChange={(e) => update({ ...row, what: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="When" value={row.when} disabled={diaryLocked} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                  <select value={row.rating} disabled={diaryLocked} onChange={(e) => update({ ...row, rating: e.target.value as DiaryAteRow["rating"] })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50">
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

          <RepeatSection title="Medicine" rows={form.medicine} onChange={(medicine) => setForm({ ...form, medicine })} readOnly={diaryLocked}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input placeholder="Time taken" value={row.when} disabled={diaryLocked} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
                <input placeholder="Notes (optional)" value={row.notes ?? ""} disabled={diaryLocked} onChange={(e) => update({ ...row, notes: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
              </div>
            )}
            newRow={() => ({ when: "", notes: "" })}
          />

          <section>
            <h3 className="mb-2 text-sm font-bold text-sky-800">I had fun</h3>
            <textarea
              value={form.activities ?? ""}
              disabled={diaryLocked}
              onChange={(e) => setForm({ ...form, activities: e.target.value })}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="Activities today…"
            />
          </section>

          <RepeatSection title="I went (potty)" rows={form.potty} onChange={(potty) => setForm({ ...form, potty })} readOnly={diaryLocked}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <select value={row.type} disabled={diaryLocked} onChange={(e) => update({ ...row, type: e.target.value as DiaryPottyRow["type"] })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50">
                  <option value="wet">Wet</option>
                  <option value="poo">Poo</option>
                </select>
                <input placeholder="When" value={row.when} disabled={diaryLocked} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm disabled:bg-slate-50" />
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
                    disabled={diaryLocked}
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
              value={form.teacherRemarks ?? ""}
              disabled={diaryLocked}
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
                  disabled={withdrawingDiary}
                  onClick={() => void handleWithdrawDiary()}
                  className="w-full rounded-xl border border-brand-300 bg-white py-3 font-semibold text-brand-800 disabled:opacity-60"
                >
                  {withdrawingDiary ? "…" : "Edit"}
                </button>
              ) : diaryStatus === "approved" ? (
                <p className="text-center text-sm text-emerald-700">Approved — parents can see this diary.</p>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={saving || diaryLocked}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    disabled={submittingDiary}
                    onClick={() => void handleSubmitDiary()}
                    className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {submittingDiary ? "Submitting…" : "Submit for approval"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save today's diary"}
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

function RepeatSection<T>({
  title,
  rows,
  onChange,
  renderRow,
  newRow,
  readOnly = false,
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  renderRow: (row: T, index: number, update: (row: T) => void) => ReactNode;
  newRow: () => T;
  readOnly?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {!readOnly && (
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
        <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 py-8 text-sm font-semibold text-brand-800">
          {isLoading ? "Uploading…" : "+ Add photo for today"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await uploadPhoto({ studentId, file });
              e.target.value = "";
            }}
          />
        </label>
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
              {submitting ? "Submitting…" : "Submit for approval"}
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
