import { useRef } from "react";

type PaymentProofUploadProps = {
  onUpload: (file: File) => void | Promise<void>;
  uploading?: boolean;
  hasPaymentProof?: boolean;
  /** Filled green on detail page; outlined on fees list */
  variant?: "primary" | "outline";
};

export default function PaymentProofUpload({
  onUpload,
  uploading = false,
  hasPaymentProof = false,
  variant = "primary",
}: PaymentProofUploadProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (file) void onUpload(file);
  };

  const galleryLabel = hasPaymentProof ? "Replace from gallery" : "Choose from gallery";
  const primaryClass =
    variant === "primary"
      ? "w-full rounded-xl bg-brand-700 py-3 text-sm font-semibold text-white disabled:opacity-60"
      : "w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-800 disabled:opacity-60";

  return (
    <div className="space-y-2">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => galleryRef.current?.click()}
        className={primaryClass}
      >
        {uploading ? "Uploading…" : galleryLabel}
      </button>
      <button
        type="button"
        disabled={uploading}
        onClick={() => cameraRef.current?.click()}
        className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-60"
      >
        Take a photo
      </button>
    </div>
  );
}
