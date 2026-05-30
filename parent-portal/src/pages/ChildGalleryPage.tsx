import { Link, useParams } from "react-router-dom";
import { useGetChildGalleryQuery } from "../services/api";

export default function ChildGalleryPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetChildGalleryQuery(studentId, { skip: !studentId });

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-medium text-brand-700">← Home</Link>
      <h2 className="text-lg font-bold">Photo gallery</h2>
      <p className="text-sm text-slate-500">{data?.student.name} · today</p>

      {!data?.photos.length ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🖼️</p>
          <p className="mt-2 text-sm text-slate-500">No photos for today yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl shadow-sm">
              <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
