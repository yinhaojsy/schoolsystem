import { useEffect, useState } from "react";
import { DiarySubmissionPreview } from "./SubmissionDetailPreview";
import type { DiarySubmissionDetail } from "../../types";

const MOOD_OPTIONS = [
  "happy",
  "merry",
  "sweet",
  "silly",
  "excited",
  "calm",
  "quiet",
  "curious",
  "tired",
  "sad",
  "sensitive",
  "upset",
] as const;
const SUPPLY_OPTIONS = ["diapers", "wipes", "clothes", "formula/milk", "other"] as const;

function diaryToForm(diary: DiarySubmissionDetail): DiarySubmissionDetail {
  return {
    mood: diary.mood ?? "",
    drank: [],
    slept: [],
    ate: [],
    medicine: [],
    activities: diary.activities ?? "",
    potty: [],
    supplies: diary.supplies ?? [],
    teacherRemarks: diary.teacherRemarks ?? "",
  };
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
    return <DiarySubmissionPreview diary={diary} summaryOnly />;
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
            Edit summary
          </button>
        </div>
        <DiarySubmissionPreview diary={diary} summaryOnly />
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
