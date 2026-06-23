import { useEffect, useMemo, useRef, useState } from "react";
import SectionCard from "../components/common/SectionCard";
import { useGetAttendanceSheetQuery, useGetClassGroupsQuery } from "../services/api";
import type { ClassGroup } from "../types";

const ATTENDANCE_TAB_ORDER_KEY = "attendance-sheet-class-tab-order";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function loadTabOrder(): number[] | null {
  try {
    const raw = localStorage.getItem(ATTENDANCE_TAB_ORDER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return null;
  }
}

function saveTabOrder(order: number[]) {
  localStorage.setItem(ATTENDANCE_TAB_ORDER_KEY, JSON.stringify(order));
}

function mergeTabOrder(saved: number[] | null, groups: ClassGroup[]): number[] {
  const ids = groups.map((g) => g.id);
  if (!saved?.length) return ids;
  const ordered = saved.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !ordered.includes(id));
  return [...ordered, ...missing];
}

export default function AttendanceSheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data: classGroups = [], isLoading: loadingClasses } = useGetClassGroupsQuery();
  const [activeTab, setActiveTab] = useState<"all" | number>("all");
  const [tabOrder, setTabOrder] = useState<number[]>([]);
  const [draggingTabIdx, setDraggingTabIdx] = useState<number | null>(null);
  const dragTabIdxRef = useRef<number | null>(null);
  const dragOverTabIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!classGroups.length) return;
    setTabOrder((prev) => mergeTabOrder(prev.length > 0 ? prev : loadTabOrder(), classGroups));
  }, [classGroups]);

  const orderedClassGroups = useMemo(() => {
    if (!classGroups.length) return [];
    const order = mergeTabOrder(tabOrder.length > 0 ? tabOrder : loadTabOrder(), classGroups);
    const byId = new Map(classGroups.map((cg) => [cg.id, cg]));
    return order.map((id) => byId.get(id)).filter((cg): cg is ClassGroup => cg != null);
  }, [classGroups, tabOrder]);

  const activeClassId = activeTab === "all" ? "all" : activeTab;
  const showAllClasses = activeTab === "all";

  const onTabDragStart = (idx: number) => {
    dragTabIdxRef.current = idx;
    setDraggingTabIdx(idx);
  };

  const onTabDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverTabIdxRef.current = idx;
  };

  const onTabDrop = () => {
    const from = dragTabIdxRef.current;
    const to = dragOverTabIdxRef.current;
    if (from == null || to == null || from === to) return;
    setTabOrder((prev) => {
      const base = prev.length > 0 ? prev : orderedClassGroups.map((cg) => cg.id);
      const next = [...base];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveTabOrder(next);
      return next;
    });
    dragTabIdxRef.current = null;
    dragOverTabIdxRef.current = null;
    setDraggingTabIdx(null);
  };

  const onTabDragEnd = () => {
    dragTabIdxRef.current = null;
    dragOverTabIdxRef.current = null;
    setDraggingTabIdx(null);
  };

  const { data, isLoading, isFetching } = useGetAttendanceSheetQuery(
    { classGroupId: activeClassId, year, month },
    { skip: loadingClasses || classGroups.length === 0 },
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
          <div
            className="flex flex-wrap gap-1 border-b border-slate-200"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onTabDrop}
          >
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold ${
                showAllClasses
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-transparent text-slate-600 hover:bg-slate-50"
              }`}
            >
              All Classes
            </button>
            {orderedClassGroups.map((cg, idx) => (
              <button
                key={cg.id}
                type="button"
                draggable
                title="Drag to reorder tabs"
                onClick={() => setActiveTab(cg.id)}
                onDragStart={() => onTabDragStart(idx)}
                onDragOver={(e) => onTabDragOver(e, idx)}
                onDragEnd={onTabDragEnd}
                className={`cursor-grab rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold active:cursor-grabbing ${
                  activeTab === cg.id
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                } ${draggingTabIdx === idx ? "opacity-50" : ""}`}
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
              <p className="py-10 text-center text-sm text-slate-500">
                {showAllClasses ? "No students enrolled." : "No students in this class."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {showAllClasses && (
                        <th className="sticky left-0 z-30 min-w-[100px] border border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold text-slate-600">
                          Class
                        </th>
                      )}
                      <th
                        className={`sticky z-30 w-12 min-w-12 border border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold text-slate-600 ${
                          showAllClasses ? "left-[100px]" : "left-0"
                        }`}
                      >
                        Roll #
                      </th>
                      <th
                        className={`sticky z-20 min-w-[120px] border-t border-r border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold text-slate-600 ${
                          showAllClasses ? "left-[148px]" : "left-12"
                        }`}
                      >
                        Name
                      </th>
                      {Array.from({ length: data.daysInMonth }, (_, i) => i + 1).map((day) => (
                        <th
                          key={day}
                          className="min-w-[28px] border-t border-r border-b border-slate-200 px-0.5 py-2 text-center font-semibold text-slate-500"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.id}>
                        {showAllClasses && (
                          <td className="sticky left-0 z-30 min-w-[100px] border border-slate-200 bg-white px-2 py-1.5 font-medium whitespace-nowrap">
                            {s.classGroupName ?? "—"}
                          </td>
                        )}
                        <td
                          className={`sticky z-30 w-12 min-w-12 border border-slate-200 bg-white px-2 py-1.5 text-center font-medium whitespace-nowrap ${
                            showAllClasses ? "left-[100px]" : "left-0"
                          }`}
                        >
                          {s.rollNo}
                        </td>
                        <td
                          className={`sticky z-20 min-w-[120px] border-r border-b border-slate-200 bg-white px-2 py-1.5 font-medium whitespace-nowrap ${
                            showAllClasses ? "left-[148px]" : "left-12"
                          }`}
                        >
                          {s.name}
                        </td>
                        {Array.from({ length: data.daysInMonth }, (_, i) => i + 1).map((day) => {
                          const mark = s.days[day] ?? null;
                          return (
                            <td
                              key={day}
                              className={`border-r border-b border-slate-200 px-0.5 py-1.5 text-center font-bold ${
                                mark === "A"
                                  ? "text-red-600"
                                  : mark === "P"
                                    ? "text-emerald-600"
                                    : "text-slate-300"
                              }`}
                            >
                              {mark === "A" ? "A" : mark === "P" ? "P" : "—"}
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
                <span className="font-bold text-emerald-600">P</span> = Present (marked by teacher)
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
