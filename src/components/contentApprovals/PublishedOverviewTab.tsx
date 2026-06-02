import { useMemo, useState } from "react";
import { useGetClassGroupsQuery, useGetPublishedOverviewQuery } from "../../services/api";
import PublishedContentModal from "./PublishedContentModal";
import type { PublishedOverviewStudent } from "../../types";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatusCell({
  published,
  onClick,
}: {
  published: boolean;
  onClick?: () => void;
}) {
  if (!published) {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
    >
      Published
    </button>
  );
}

export default function PublishedOverviewTab() {
  const [entryDate, setEntryDate] = useState(todayIso);
  const [classGroupId, setClassGroupId] = useState<number | null>(null);
  const [viewTarget, setViewTarget] = useState<{
    student: PublishedOverviewStudent;
    contentType: "diary" | "notices" | "gallery";
  } | null>(null);

  const { data: classGroups = [] } = useGetClassGroupsQuery();
  const { data, isLoading, isFetching } = useGetPublishedOverviewQuery({
    entryDate,
    classGroupId,
  });

  const students = data?.students ?? [];

  const summary = useMemo(() => {
    const absent = students.filter((s) => s.attendance === "absent").length;
    const diary = students.filter((s) => s.diary === "published").length;
    const notes = students.filter((s) => s.notices === "published").length;
    const photos = students.filter((s) => s.photos === "published").length;
    return { absent, diary, notes, photos, total: students.length };
  }, [students]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-sm text-slate-600">{formatDisplayDate(entryDate)}</p>
      </div>

      {classGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
          <button
            type="button"
            onClick={() => setClassGroupId(null)}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold ${
              classGroupId == null
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            All classes
          </button>
          {classGroups.map((cg) => (
            <button
              key={cg.id}
              type="button"
              onClick={() => setClassGroupId(cg.id)}
              className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold ${
                classGroupId === cg.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {cg.name}
            </button>
          ))}
        </div>
      )}

      {!isLoading && students.length > 0 && (
        <p className="text-sm text-slate-600">
          {summary.total} students · {summary.diary} diaries · {summary.notes} notes · {summary.photos} photo sets
          {summary.absent > 0 ? ` · ${summary.absent} absent` : ""}
          {isFetching ? " · refreshing…" : ""}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : students.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No active students found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Roll #</th>
                <th className="px-4 py-3">Student</th>
                <th className="hidden px-4 py-3 sm:table-cell">Class</th>
                <th className="px-4 py-3 text-center">Diary</th>
                <th className="px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-center">Photos</th>
                <th className="px-4 py-3 text-center">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className={`border-b border-slate-50 last:border-0 ${
                    s.attendance === "absent" ? "bg-slate-50 text-slate-500" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{s.rollNo}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{s.classGroupName ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusCell
                      published={s.diary === "published"}
                      onClick={
                        s.diary === "published"
                          ? () => setViewTarget({ student: s, contentType: "diary" })
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusCell
                      published={s.notices === "published"}
                      onClick={
                        s.notices === "published"
                          ? () => setViewTarget({ student: s, contentType: "notices" })
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusCell
                      published={s.photos === "published"}
                      onClick={
                        s.photos === "published"
                          ? () => setViewTarget({ student: s, contentType: "gallery" })
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.attendance === "absent" ? (
                      <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        Absent
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewTarget && (
        <PublishedContentModal
          student={viewTarget.student}
          entryDate={entryDate}
          contentType={viewTarget.contentType}
          onClose={() => setViewTarget(null)}
        />
      )}
    </div>
  );
}
