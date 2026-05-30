import { useEffect, useState, FormEvent, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useGetNoticesQuery,
  useAddNoticeMutation,
  useDeleteNoticeMutation,
  useGetGalleryQuery,
  useUploadPhotoMutation,
  useDeletePhotoMutation,
  useGetRosterQuery,
} from "../services/api";
import type { DaycareDiary, DiaryAteRow, DiaryPottyRow } from "../types";
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
  activities: "",
  potty: [{ type: "wet", when: "" }],
  supplies: [],
  teacherRemarks: "",
});

export default function StudentHubPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const [tab, setTab] = useState<Tab>("diary");
  const { data: roster } = useGetRosterQuery();
  const student = roster?.students.find((s) => s.id === studentId);

  const { data: diaryData, isLoading: diaryLoading } = useGetDiaryQuery(studentId, { skip: !studentId });
  const [saveDiary, { isLoading: saving }] = useSaveDiaryMutation();
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
        activities: d.activities ?? "",
        potty: d.potty?.length ? d.potty : [{ type: "wet", when: "" }],
        supplies: d.supplies ?? [],
        teacherRemarks: d.teacherRemarks ?? "",
      });
    } else if (!diaryLoading) {
      setForm(emptyDiary());
    }
  }, [diaryData, diaryLoading]);

  const handleSaveDiary = async (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg("");
    try {
      await saveDiary({ studentId, diary: form }).unwrap();
      setSavedMsg("Diary saved for today.");
    } catch {
      setSavedMsg("Could not save diary.");
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

          <section>
            <h3 className="mb-2 text-sm font-bold text-emerald-800">I was…</h3>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, mood: m })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                    form.mood === m ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-900"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </section>

          <RepeatSection title="I drank" rows={form.drank} onChange={(drank) => setForm({ ...form, drank })}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input placeholder="When" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                <input placeholder="How much" value={row.amount} onChange={(e) => update({ ...row, amount: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
              </div>
            )}
            newRow={() => ({ when: "", amount: "" })}
          />

          <RepeatSection title="I slept" rows={form.slept} onChange={(slept) => setForm({ ...form, slept })}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input placeholder="When" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                <input placeholder="How long" value={row.duration} onChange={(e) => update({ ...row, duration: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
              </div>
            )}
            newRow={() => ({ when: "", duration: "" })}
          />

          <RepeatSection title="I ate" rows={form.ate} onChange={(ate) => setForm({ ...form, ate })}
            renderRow={(row, i, update) => (
              <div key={i} className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2">
                <input placeholder="What" value={row.what} onChange={(e) => update({ ...row, what: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="When" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
                  <select value={row.rating} onChange={(e) => update({ ...row, rating: e.target.value as DiaryAteRow["rating"] })} className="rounded-lg border px-2 py-2 text-sm">
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

          <section>
            <h3 className="mb-2 text-sm font-bold text-sky-800">I had fun</h3>
            <textarea
              value={form.activities ?? ""}
              onChange={(e) => setForm({ ...form, activities: e.target.value })}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Activities today…"
            />
          </section>

          <RepeatSection title="I went (potty)" rows={form.potty} onChange={(potty) => setForm({ ...form, potty })}
            renderRow={(row, i, update) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <select value={row.type} onChange={(e) => update({ ...row, type: e.target.value as DiaryPottyRow["type"] })} className="rounded-lg border px-2 py-2 text-sm">
                  <option value="wet">Wet</option>
                  <option value="poo">Poo</option>
                </select>
                <input placeholder="When" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
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
                    onClick={() =>
                      setForm({
                        ...form,
                        supplies: checked ? form.supplies.filter((x) => x !== s) : [...form.supplies, s],
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
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
              onChange={(e) => setForm({ ...form, teacherRemarks: e.target.value })}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Notes for parents…"
            />
          </section>

          <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save today&apos;s diary"}
          </button>
        </form>
      )}

      {tab === "notice" && <NoticePanel studentId={studentId} />}
      {tab === "photos" && <GalleryPanel studentId={studentId} />}
    </div>
  );
}

function RepeatSection<T>({
  title,
  rows,
  onChange,
  renderRow,
  newRow,
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  renderRow: (row: T, index: number, update: (row: T) => void) => ReactNode;
  newRow: () => T;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <button type="button" onClick={() => onChange([...rows, newRow()])} className="text-xs font-semibold text-brand-700">
          + Add row
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) =>
          renderRow(row, i, (updated) => onChange(rows.map((r, j) => (j === i ? updated : r)))),
        )}
      </div>
    </section>
  );
}

function NoticePanel({ studentId }: { studentId: number }) {
  const { data } = useGetNoticesQuery(studentId);
  const [addNotice, { isLoading }] = useAddNoticeMutation();
  const [deleteNotice] = useDeleteNoticeMutation();
  const [message, setMessage] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await addNotice({ studentId, message: message.trim() });
    setMessage("");
  };

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
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
          <li key={n.id} className="flex items-start justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm">
            <span>{n.message}</span>
            <button type="button" onClick={() => deleteNotice(n.id)} className="shrink-0 text-xs text-red-600">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalleryPanel({ studentId }: { studentId: number }) {
  const { data } = useGetGalleryQuery(studentId);
  const [uploadPhoto, { isLoading }] = useUploadPhotoMutation();
  const [deletePhoto] = useDeletePhotoMutation();

  return (
    <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
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
      <div className="grid grid-cols-2 gap-2">
        {(data?.photos ?? []).map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-xl">
            <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            <button
              type="button"
              onClick={() => deletePhoto(p.id)}
              className="absolute right-1 top-1 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
