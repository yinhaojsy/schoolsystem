import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import PhotoLightbox from "../components/PhotoLightbox";
import { useGetChildGalleryQuery } from "../services/api";

export default function ChildGalleryPage() {
  const { id } = useParams();
  const studentId = parseInt(id ?? "", 10);
  const { data, isLoading } = useGetChildGalleryQuery(studentId, { skip: !studentId });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photos = data?.photos ?? [];
  const lightboxPhotos = photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }));

  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-medium text-brand-700">← Home</Link>
      <h2 className="text-lg font-bold">Photo gallery</h2>
      <p className="text-sm text-slate-500">{data?.student.name} · today</p>

      {!photos.length ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🖼️</p>
          <p className="mt-2 text-sm text-slate-500">No photos for today yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="block overflow-hidden rounded-2xl shadow-sm"
              aria-label="View photo"
            >
              <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
