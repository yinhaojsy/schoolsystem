import { useGetChildrenQuery } from "../services/api";
import KidCard from "../components/KidCard";

export default function HomePage() {
  const { data: children = [], isLoading } = useGetChildrenQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-3xl bg-slate-200" />
        ))}
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">👶</p>
        <h2 className="mt-3 text-lg font-bold text-slate-900">No children linked</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your account is not linked to any enrolled children yet. Please contact the school office.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Today</h2>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>
      {children.map((child) => (
        <KidCard key={child.id} child={child} />
      ))}
    </div>
  );
}
