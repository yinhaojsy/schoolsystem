import { useEffect, useState } from "react";
import {
  captureAdminPreviewFromUrl,
  clearAdminPreview,
  getStaffTeacherManagementUrl,
  readAdminPreview,
  type TeacherAdminPreview,
} from "../utils/adminPreview";

export default function AdminPreviewBanner() {
  const [preview, setPreview] = useState<TeacherAdminPreview | null>(null);

  useEffect(() => {
    captureAdminPreviewFromUrl();
    setPreview(readAdminPreview());
  }, []);

  if (!preview) return null;

  const label = preview.teacherName ?? preview.teacherEmail ?? "this teacher";

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
      <p className="font-semibold">Admin preview</p>
      <p className="mt-0.5">
        You opened {label}&apos;s portal from Teacher Management. This is not a direct teacher login.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a href={getStaffTeacherManagementUrl()} className="text-xs font-semibold text-amber-900 underline">
          Back to Teacher Management
        </a>
        <button
          type="button"
          onClick={() => {
            clearAdminPreview();
            setPreview(null);
          }}
          className="text-xs font-semibold text-amber-900 underline"
        >
          Hide banner
        </button>
      </div>
    </div>
  );
}
