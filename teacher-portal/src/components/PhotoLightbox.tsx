import { useCallback, useEffect, useRef, type TouchEvent } from "react";

export type LightboxPhoto = {
  id: number | string;
  url: string;
  caption?: string | null;
};

type PhotoLightboxProps = {
  photos: LightboxPhoto[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const SWIPE_THRESHOLD = 50;

export default function PhotoLightbox({ photos, index, onClose, onIndexChange }: PhotoLightboxProps) {
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const open = index != null && index >= 0 && index < photos.length;
  const currentIndex = open ? index! : 0;
  const photo = open ? photos[currentIndex] : null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < photos.length - 1;

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= photos.length) return;
      onIndexChange(next);
    },
    [photos.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goTo(currentIndex - 1);
      if (e.key === "ArrowRight") goTo(currentIndex + 1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, currentIndex, onClose, goTo]);

  if (!open || !photo) return null;

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };

  const onTouchEnd = () => {
    const delta = touchDeltaX.current;
    if (delta < -SWIPE_THRESHOLD && canNext) goTo(currentIndex + 1);
    else if (delta > SWIPE_THRESHOLD && canPrev) goTo(currentIndex - 1);
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="flex shrink-0 items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm font-medium text-white/90">
          {currentIndex + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {canPrev && (
          <button
            type="button"
            onClick={() => goTo(currentIndex - 1)}
            className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur-sm"
            aria-label="Previous photo"
          >
            ‹
          </button>
        )}

        <img
          src={photo.url}
          alt=""
          className="max-h-[calc(100dvh-8rem)] max-w-full select-none object-contain"
          draggable={false}
        />

        {canNext && (
          <button
            type="button"
            onClick={() => goTo(currentIndex + 1)}
            className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur-sm"
            aria-label="Next photo"
          >
            ›
          </button>
        )}
      </div>

      {photo.caption && (
        <p className="shrink-0 px-4 py-2 text-center text-sm text-white/85">{photo.caption}</p>
      )}

      {photos.length > 1 && (
        <p className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-white/45">
          Swipe left or right to browse
        </p>
      )}
    </div>
  );
}
