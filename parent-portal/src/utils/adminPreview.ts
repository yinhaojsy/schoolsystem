export const PARENT_ADMIN_PREVIEW_KEY = "parent_admin_preview";
export const PARENT_AUTH_STORAGE_KEY = "parent_auth_user";

export interface ParentAdminPreview {
  parentName?: string;
  parentEmail?: string;
}

export function clearAdminPreview() {
  sessionStorage.removeItem(PARENT_ADMIN_PREVIEW_KEY);
}

export function readAdminPreview(): ParentAdminPreview | null {
  const raw = sessionStorage.getItem(PARENT_ADMIN_PREVIEW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParentAdminPreview;
  } catch {
    return null;
  }
}

export function saveAdminPreview(preview: ParentAdminPreview) {
  sessionStorage.setItem(PARENT_ADMIN_PREVIEW_KEY, JSON.stringify(preview));
}

/** Dev-only: staff (5173) and parent (5175) portals do not share localStorage. */
export function captureAdminAuthFromHash(): boolean {
  const hash = window.location.hash;
  if (!hash.startsWith("#auth=")) return false;

  try {
    const payload = decodeURIComponent(hash.slice("#auth=".length));
    const user = JSON.parse(payload) as unknown;
    localStorage.setItem(PARENT_AUTH_STORAGE_KEY, JSON.stringify(user));
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    return true;
  } catch {
    return false;
  }
}

export function getStaffParentManagementUrl(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:5173/staff/parent-management";
  }
  return "/staff/parent-management";
}

/** Read adminPreview query params once, persist to sessionStorage, and strip from URL. */
export function captureAdminPreviewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("adminPreview") !== "1") return;

  saveAdminPreview({
    parentName: params.get("parentName") ?? undefined,
    parentEmail: params.get("parentEmail") ?? undefined,
  });

  params.delete("adminPreview");
  params.delete("parentName");
  params.delete("parentEmail");
  const remainder = params.toString();
  const nextUrl = `${window.location.pathname}${remainder ? `?${remainder}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}
