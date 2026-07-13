const TEACHER_PORTAL_DEV_ORIGIN = "http://localhost:5176";
const PARENT_PORTAL_DEV_ORIGIN = "http://localhost:5175";

export function getTeacherPortalBaseUrl(): string {
  if (import.meta.env.DEV) {
    return `${TEACHER_PORTAL_DEV_ORIGIN}/teacher/`;
  }
  return `${window.location.origin}/teacher/`;
}

export function getTeacherPortalUrl(params?: URLSearchParams): string {
  const base = getTeacherPortalBaseUrl();
  if (!params || [...params].length === 0) return base;
  return `${base}?${params.toString()}`;
}

export function getParentPortalBaseUrl(): string {
  if (import.meta.env.DEV) {
    return `${PARENT_PORTAL_DEV_ORIGIN}/parents/`;
  }
  return `${window.location.origin}/parents/`;
}

export function getParentPortalUrl(params?: URLSearchParams): string {
  const base = getParentPortalBaseUrl();
  if (!params || [...params].length === 0) return base;
  return `${base}?${params.toString()}`;
}
