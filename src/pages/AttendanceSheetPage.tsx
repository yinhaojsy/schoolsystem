import { useMemo, useState } from "react";
import SectionCard from "../components/common/SectionCard";
import { useGetAttendanceSheetQuery, useGetClassGroupsQuery } from "../services/api";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AttendanceSheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data: classGroups = [], isLoading: loadingClasses } = useGetClassGroupsQuery();
  const [classGroupId, setClassGroupId] = useState<number | null>(null);

  const activeClassId = classGroupId ?? classGroups[0]?.id ?? null;

  const { data, isLoading, isFetching } = useGetAttendanceSheetQuery(
    { classGroupId: activeClassId!, year, month },
    { skip: activeClassId == null },
  );

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 2 + i);
  }, [now]);

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Attendance sheet</h2>
        <p className="mt-1 text-sm text-slate-500">
          Daily present (P) and absent (A) by class. Teachers mark absence in their portal.
        </p>
      </div>

      {loadingClasses ? (
        <p className="text-sm text-slate-500">Loading classes…</p>
      ) : classGroups.length === 0 ? (
        <p className="text-sm text-slate-500">No class groups configured.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {classGroups.map((cg) => (
              <button
                key={cg.id}
                type="button"
                onClick={() => setClassGroupId(cg.id)}
                className={`rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold ${
                  activeClassId === cg.id
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cg.name}
              </button>
            ))}
          </div>

          <SectionCard title={`${MONTH_NAMES[month - 1]} ${year}${data?.classGroupName ? ` · ${data.classGroupName}` : ""}`}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
                aria-label="Previous month"
              >
                ←
              </button>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
                aria-label="Next month"
              >
                →
              </button>
              {isFetching && <span className="text-xs text-slate-500">Refreshing…</span>}
            </div>

            {isLoading ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
            ) : !data?.students.length ? (
              <p className="py-10 text-center text-sm text-slate-500">No students in this class.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold text-slate-600">
                        Roll #
                      </th>
                      <th className="sticky left-12 z-10 min-w-[120px] border border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold text-slate-600 sm:left-16">
                        Name
                      </th>
                      {Array.from({ length: data.daysInMonth }, (_, i) => i + 1).map((day) => (
                        <th
                          key={day}
                          className="min-w-[28px] border border-slate-200 px-0.5 py-2 text-center font-semibold text-slate-500"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.id}>
                        <td className="sticky left-0 z-10 border border-slate-200 bg-white px-2 py-1.5 font-medium whitespace-nowrap">
                          {s.rollNo}
                        </td>
                        <td className="sticky left-12 z-10 border border-slate-200 bg-white px-2 py-1.5 font-medium whitespace-nowrap sm:left-16">
                          {s.name}
                        </td>
                        {Array.from({ length: data.daysInMonth }, (_, i) => i + 1).map((day) => {
                          const mark = s.days[day] ?? null;
                          return (
                            <td
                              key={day}
                              className={`border border-slate-200 px-0.5 py-1.5 text-center font-bold ${
                                mark === "A" ? "text-red-600" : "text-slate-300"
                              }`}
                            >
                              {mark === "A" ? "A" : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
              <span>
                <span className="font-bold text-slate-400">—</span> = Not recorded
              </span>
              <span>
                <span className="font-bold text-red-600">A</span> = Absent (marked by teacher)
              </span>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
