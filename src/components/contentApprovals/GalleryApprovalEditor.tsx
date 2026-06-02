import { useRef, useState } from "react";
import PhotoLightbox from "../common/PhotoLightbox";
import { useUploadApprovedGalleryPhotoMutation } from "../../services/api";
import type { GalleryPhotoApproval } from "../../types";

function GalleryPhotoGrid({
  photos,
  onRemove,
  removingId,
  readOnly = false,
  showUploadTile = false,
  uploading = false,
  onUploadClick,
}: {
  photos: GalleryPhotoApproval[];
  onRemove?: (photoId: number) => void;
  removingId: number | null;
  readOnly?: boolean;
  showUploadTile?: boolean;
  uploading?: boolean;
  onUploadClick?: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxPhotos = photos.map((p) => ({
    id: p.contentId,
    url: p.imageUrl,
    caption: p.caption,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo, i) => (
          <div key={photo.contentId} className="space-y-1">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full cursor-pointer"
                aria-label="View photo"
              >
                <img src={photo.imageUrl} alt="" className="aspect-square w-full object-cover" />
              </button>
              {!readOnly && onRemove && (
                <button
                  type="button"
                  disabled={removingId === photo.contentId}
                  onClick={() => onRemove(photo.contentId)}
                  className="absolute right-1 top-1 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white disabled:opacity-60"
                >
                  {removingId === photo.contentId ? "…" : "Remove"}
                </button>
              )}
            </div>
            {photo.caption && (
              <p className="truncate px-1 text-[11px] text-slate-600">{photo.caption}</p>
            )}
          </div>
        ))}
        {showUploadTile && (
          <button
            type="button"
            disabled={uploading}
            onClick={onUploadClick}
            className="flex aspect-square w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60"
            aria-label="Upload photo"
          >
            {uploading ? (
              <span className="text-xs font-medium">Uploading…</span>
            ) : (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        )}
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

type GalleryMode = "pending" | "approved" | "readonly";

export default function GalleryApprovalEditor({
  photos,
  mode,
  studentId,
  entryDate,
  teacherId,
  onRemove,
  removingId,
  onUploadError,
}: {
  photos: GalleryPhotoApproval[];
  mode: GalleryMode;
  studentId?: number;
  entryDate?: string;
  teacherId?: number;
  onRemove: (photoId: number) => void;
  removingId: number | null;
  onUploadError?: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhoto] = useUploadApprovedGalleryPhotoMutation();

  if (mode === "readonly") {
    return <GalleryPhotoGrid photos={photos} removingId={null} readOnly />;
  }

  if (mode === "pending") {
    return (
      <GalleryPhotoGrid
        photos={photos}
        onRemove={onRemove}
        removingId={removingId}
        readOnly={false}
      />
    );
  }

  const handleUpload = async (file: File) => {
    if (studentId == null || !entryDate) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("studentId", String(studentId));
      formData.append("entryDate", entryDate);
      if (teacherId != null) formData.append("teacherId", String(teacherId));
      await uploadPhoto(formData).unwrap();
    } catch {
      onUploadError?.("Could not upload photo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit photos
          </button>
        </div>
        <GalleryPhotoGrid photos={photos} removingId={null} readOnly />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Done
        </button>
      </div>
      <GalleryPhotoGrid
        photos={photos}
        onRemove={onRemove}
        removingId={removingId}
        readOnly={false}
        showUploadTile
        uploading={uploading}
        onUploadClick={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
    </div>
  );
}
