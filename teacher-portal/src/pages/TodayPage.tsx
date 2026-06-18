import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBulkSetAttendanceMutation, useGetRosterQuery } from "../services/api";
import type { RosterStudent } from "../types";

function attendanceCardClass(
  status: RosterStudent["attendanceStatus"],
  selected: boolean,
  attendanceMode: boolean,
) {
  const base = "flex w-full items-center gap-3 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] border-l-4";
  const absent = status === "absent";
  const present = status === "present";
  if (attendanceMode && selected) {
    return `${base} ring-2 ring-brand-500 ${absent ? "border-l-red-500 bg-red-50" : present ? "border-l-emerald-500 bg-emerald-50/40" : "border-l-slate-300 bg-slate-50"}`;
  }
  if (absent) {
    return `${base} border-l-red-500 bg-red-50/80`;
  }
  if (present) {
    return `${base} border-l-emerald-500 bg-white`;
  }
  return `${base} border-l-slate-200 bg-white`;
}

function AttendanceBadge({ status }: { status: RosterStudent["attendanceStatus"] }) {
  if (status === "absent") {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
        Absent
      </span>
    );
  }
  if (status === "present") {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
        Present
      </span>
    );
  }
  return null;
}

function StudentRowContent({
  s,
  attendanceMode,
  selected,
  onToggleSelect,
}: {
  s: RosterStudent;
  attendanceMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const absent = s.attendanceStatus === "absent";
  const present = s.attendanceStatus === "present";

  return (
    <>
      {attendanceMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-5 shrink-0 rounded border-slate-300"
          aria-label={`Select ${s.name}`}
        />
      )}
      {s.profilePhotoUrl ? (
        <img src={s.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${
            absent ? "bg-red-100 text-red-800" : present ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {s.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{s.name}</p>
        <p className="text-xs text-slate-500">{s.rollNo}</p>
      </div>
      <AttendanceBadge status={s.attendanceStatus} />
      {!attendanceMode && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 text-[10px] font-semibold">
          <span
            className={`rounded-full px-2 py-0.5 ${
              s.diaryStatus === "pending"
                ? "bg-amber-100 text-amber-800"
                : s.diaryStatus === "rejected"
                  ? "bg-red-100 text-red-800"
                  : s.hasDiary
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
            }`}
          >
            Diary{s.hasDiary ? (s.diaryStatus === "pending" ? " ⏳" : s.diaryStatus === "rejected" ? " ✗" : " ✓") : ""}
          </span>
          {s.noticeCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              {s.noticeCount} note{s.pendingNoticeCount ? ` (${s.pendingNoticeCount} pending)` : ""}
            </span>
          )}
          {s.photoCount > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
              {s.photoCount} pic{s.pendingPhotoCount ? ` (${s.pendingPhotoCount} pending)` : ""}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export default function TodayPage() {
  const { data, isLoading } = useGetRosterQuery();
  const [bulkAttendance, { isLoading: savingAttendance }] = useBulkSetAttendanceMutation();
  const [search, setSearch] = useState("");
  const [attendanceMode, setAttendanceMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const students = data?.students ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q),
    );
  }, [students, search]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedStudents = filtered.filter((s) => selected.has(s.id));
  const allSelectedAbsent =
    selectedStudents.length > 0 && selectedStudents.every((s) => s.attendanceStatus === "absent");
  const allSelectedPresent =
    selectedStudents.length > 0 &&
    selectedStudents.every((s) => s.attendanceStatus === "present" || s.attendanceStatus == null);

  const applyAttendance = async (status: "absent" | "present") => {
    if (!selected.size || !data?.entryDate) return;
    try {
      await bulkAttendance({
        studentIds: [...selected],
        status,
        entryDate: data.entryDate,
      }).unwrap();
      setSelected(new Set());
      setAttendanceMode(false);
    } catch {
      // roster refetch will show current state
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s students</h2>
          <p className="text-sm text-slate-500">
            {data?.entryDate
              ? new Date(data.entryDate + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Class roster"}
          </p>
        </div>
        {students.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAttendanceMode((v) => !v);
              setSelected(new Set());
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              attendanceMode
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {attendanceMode ? "Done" : "Attendance"}
          </button>
        )}
      </div>

      {students.length > 0 && !attendanceMode && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-emerald-500" />
            Green = marked present
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-red-500" />
            Red = marked absent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-slate-300" />
            No badge = not marked yet
          </span>
        </div>
      )}

      {attendanceMode && selected.size > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="self-center text-sm text-slate-600">{selected.size} selected</span>
          {!allSelectedAbsent && !allSelectedPresent && (
            <p className="w-full text-xs text-slate-500">
              Select only absent or only present students, then apply.
            </p>
          )}
          {allSelectedPresent && (
            <button
              type="button"
              disabled={savingAttendance}
              onClick={() => void applyAttendance("absent")}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mark absent
            </button>
          )}
          {allSelectedAbsent && (
            <button
              type="button"
              disabled={savingAttendance}
              onClick={() => void applyAttendance("present")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mark present
            </button>
          )}
        </div>
      )}

      {students.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or roll no…"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
        />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">👶</p>
          <p className="mt-2 text-sm text-slate-500">No active students in your class.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">No students match &ldquo;{search.trim()}&rdquo;.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => {
            const cardClass = attendanceCardClass(s.attendanceStatus, selected.has(s.id), attendanceMode);

            if (attendanceMode) {
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(s.id)}
                    className={cardClass}
                  >
                    <StudentRowContent
                      s={s}
                      attendanceMode
                      selected={selected.has(s.id)}
                      onToggleSelect={() => toggleSelect(s.id)}
                    />
                  </button>
                </li>
              );
            }

            return (
              <li key={s.id}>
                <Link to={`/students/${s.id}`} className={cardClass}>
                  <StudentRowContent
                    s={s}
                    attendanceMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
