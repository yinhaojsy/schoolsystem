import { useEffect, useState, type ReactNode } from "react";
import { DiarySubmissionPreview } from "./SubmissionDetailPreview";
import type { DiarySubmissionDetail } from "../../types";

const MOOD_OPTIONS = ["happy", "sweet", "sad", "sensitive", "quiet", "silly"] as const;
const SUPPLY_OPTIONS = ["diapers", "wipes", "clothes", "formula/milk", "other"] as const;

type AteRow = DiarySubmissionDetail["ate"][number];
type PottyRow = DiarySubmissionDetail["potty"][number];

const emptyAteRow = (): AteRow => ({ what: "", when: "", rating: "" });

function diaryToForm(diary: DiarySubmissionDetail): DiarySubmissionDetail {
  return {
    mood: diary.mood ?? "",
    drank: diary.drank?.length ? diary.drank : [{ when: "", amount: "" }],
    slept: diary.slept?.length ? diary.slept : [{ when: "", duration: "" }],
    ate: diary.ate?.length ? diary.ate : [emptyAteRow()],
    medicine: diary.medicine?.length ? diary.medicine : [{ when: "", notes: "" }],
    activities: diary.activities ?? "",
    potty: diary.potty?.length ? diary.potty : [{ type: "wet", when: "" }],
    supplies: diary.supplies ?? [],
    teacherRemarks: diary.teacherRemarks ?? "",
  };
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
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <button type="button" onClick={() => onChange([...rows, newRow()])} className="text-xs font-semibold text-blue-600">
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

export default function DiaryApprovalEditor({
  diary,
  onSave,
  saving,
  readOnly = false,
}: {
  diary: DiarySubmissionDetail;
  onSave: (diary: DiarySubmissionDetail) => void | Promise<void>;
  saving: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DiarySubmissionDetail>(() => diaryToForm(diary));

  useEffect(() => {
    if (!editing) setForm(diaryToForm(diary));
  }, [diary, editing]);

  if (readOnly) {
    return <DiarySubmissionPreview diary={diary} />;
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit diary
          </button>
        </div>
        <DiarySubmissionPreview diary={diary} />
      </div>
    );
  }

  const handleSave = async () => {
    await onSave(form);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-sm font-bold text-emerald-800">I was…</h4>
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
              <select value={row.rating} onChange={(e) => update({ ...row, rating: e.target.value })} className="rounded-lg border px-2 py-2 text-sm">
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

      <RepeatSection title="Medicine" rows={form.medicine ?? []} onChange={(medicine) => setForm({ ...form, medicine })}
        renderRow={(row, i, update) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input placeholder="Time taken" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
            <input placeholder="Notes (optional)" value={row.notes ?? ""} onChange={(e) => update({ ...row, notes: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
          </div>
        )}
        newRow={() => ({ when: "", notes: "" })}
      />

      <section>
        <h4 className="mb-2 text-sm font-bold text-sky-800">I had fun</h4>
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
            <select value={row.type} onChange={(e) => update({ ...row, type: e.target.value })} className="rounded-lg border px-2 py-2 text-sm">
              <option value="wet">Wet</option>
              <option value="poo">Poo</option>
            </select>
            <input placeholder="When" value={row.when} onChange={(e) => update({ ...row, when: e.target.value })} className="rounded-lg border px-2 py-2 text-sm" />
          </div>
        )}
        newRow={() => ({ type: "wet", when: "" })}
      />

      <section>
        <h4 className="mb-2 text-sm font-bold text-violet-800">I need</h4>
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
        <h4 className="mb-2 text-sm font-bold text-slate-800">Teacher&apos;s remarks</h4>
        <textarea
          value={form.teacherRemarks ?? ""}
          onChange={(e) => setForm({ ...form, teacherRemarks: e.target.value })}
          rows={3}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Notes for parents…"
        />
      </section>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => {
            setForm(diaryToForm(diary));
            setEditing(false);
          }}
          className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
