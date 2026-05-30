import { Link } from "react-router-dom";
import { useGetRosterQuery } from "../services/api";

export default function TodayPage() {
  const { data, isLoading } = useGetRosterQuery();
  const students = data?.students ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Today&apos;s class</h2>
        <p className="text-sm text-slate-500">
          {data?.entryDate
            ? new Date(data.entryDate + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "Daycare roster"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">👶</p>
          <p className="mt-2 text-sm text-slate-500">No active daycare students in your class.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                to={`/students/${s.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm active:scale-[0.99]"
              >
                {s.profilePhotoUrl ? (
                  <img src={s.profilePhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.rollNo}</p>
                </div>
                <div className="flex shrink-0 gap-1.5 text-[10px] font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${s.hasDiary ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    Diary{s.hasDiary ? " ✓" : ""}
                  </span>
                  {s.noticeCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{s.noticeCount} note</span>
                  )}
                  {s.photoCount > 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{s.photoCount} pic</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
