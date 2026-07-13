export const TEACHER_ADMIN_PREVIEW_KEY = "teacher_admin_preview";

export interface TeacherAdminPreview {
  teacherName?: string;
  teacherEmail?: string;
}

export function clearAdminPreview() {
  sessionStorage.removeItem(TEACHER_ADMIN_PREVIEW_KEY);
}

export function readAdminPreview(): TeacherAdminPreview | null {
  const raw = sessionStorage.getItem(TEACHER_ADMIN_PREVIEW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TeacherAdminPreview;
  } catch {
    return null;
  }
}

export function saveAdminPreview(preview: TeacherAdminPreview) {
  sessionStorage.setItem(TEACHER_ADMIN_PREVIEW_KEY, JSON.stringify(preview));
}

/** Dev-only: staff (5173) and teacher (5176) portals do not share localStorage. */
export function captureAdminAuthFromHash(): boolean {
  const hash = window.location.hash;
  if (!hash.startsWith("#auth=")) return false;

  try {
    const payload = decodeURIComponent(hash.slice("#auth=".length));
    const user = JSON.parse(payload) as unknown;
    localStorage.setItem("teacher_auth_user", JSON.stringify(user));
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    return true;
  } catch {
    return false;
  }
}

export function getStaffTeacherManagementUrl(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:5173/staff/teacher-management";
  }
  return "/staff/teacher-management";
}

/** Read adminPreview query params once, persist to sessionStorage, and strip from URL. */
export function captureAdminPreviewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("adminPreview") !== "1") return;

  saveAdminPreview({
    teacherName: params.get("teacherName") ?? undefined,
    teacherEmail: params.get("teacherEmail") ?? undefined,
  });

  params.delete("adminPreview");
  params.delete("teacherName");
  params.delete("teacherEmail");
  const remainder = params.toString();
  const nextUrl = `${window.location.pathname}${remainder ? `?${remainder}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}
