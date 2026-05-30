import { Link, useParams } from "react-router-dom";
import { useGetChildNoticesQuery } from "../services/api";

export default function ChildNoticesPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetChildNoticesQuery(studentId, { skip: !studentId });

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-medium text-brand-700">← Home</Link>
      <h2 className="text-lg font-bold">Teacher notes</h2>
      <p className="text-sm text-slate-500">{data?.student.name} · today</p>

      {!data?.notices.length ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">💬</p>
          <p className="mt-2 text-sm text-slate-500">No notes for today.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.notices.map((n) => (
            <li key={n.id} className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
              {n.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
