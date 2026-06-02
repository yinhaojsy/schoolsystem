import { useEffect, useState } from "react";
import { DiarySubmissionPreview } from "./SubmissionDetailPreview";
import PhotoLightbox from "../common/PhotoLightbox";
import { useGetPublishedContentQuery } from "../../services/api";
import type { PublishedOverviewStudent } from "../../types";

type ContentType = "diary" | "notices" | "gallery";

export default function PublishedContentModal({
  student,
  entryDate,
  contentType,
  onClose,
}: {
  student: PublishedOverviewStudent;
  entryDate: string;
  contentType: ContentType;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useGetPublishedContentQuery({
    studentId: student.id,
    entryDate,
    contentType,
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const title =
    contentType === "diary" ? "Diary" : contentType === "notices" ? "Notes" : "Photos";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            {student.name} · {title}
          </p>
          <p className="truncate text-xs text-slate-500">
            {student.rollNo}
            {student.classGroupName ? ` · ${student.classGroupName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : isError || !data ? (
          <p className="py-10 text-center text-sm text-slate-500">Could not load content.</p>
        ) : contentType === "diary" && data.detail?.type === "diary" ? (
          <DiarySubmissionPreview diary={data.detail.diary} />
        ) : contentType === "notices" && data.notices?.length ? (
          <ul className="space-y-3">
            {data.notices.map((n) => (
              <li key={n.id} className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-slate-800">
                {n.message}
              </li>
            ))}
          </ul>
        ) : contentType === "gallery" && data.photos?.length ? (
          <GalleryView photos={data.photos} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Nothing published for this date.</p>
        )}
      </div>
    </div>
  );
}

function GalleryView({ photos }: { photos: { id: number; imageUrl: string; caption?: string | null }[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxPhotos = photos.map((p) => ({ id: p.id, url: p.imageUrl, caption: p.caption }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <div key={photo.id} className="space-y-1">
            <button
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="block w-full overflow-hidden rounded-xl border border-slate-200"
            >
              <img src={photo.imageUrl} alt="" className="aspect-square w-full object-cover" />
            </button>
            {photo.caption && <p className="truncate px-1 text-[11px] text-slate-600">{photo.caption}</p>}
          </div>
        ))}
      </div>
      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
