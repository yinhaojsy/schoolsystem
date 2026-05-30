import { useEffect, useRef } from "react";
import { useAppSelector } from "../app/hooks";
import { api, useGetNotificationStreamTokenMutation } from "../services/api";
import { store } from "../app/store";

export function useStaffNotificationStream(enabled: boolean) {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = enabled && user?.role === "admin";
  const [fetchToken] = useGetNotificationStreamTokenMutation();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAdmin || user?.id == null) return;

    let cancelled = false;

    const connect = async () => {
      try {
        const { token } = await fetchToken().unwrap();
        if (cancelled) return;

        sourceRef.current?.close();
        const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
        sourceRef.current = es;

        es.addEventListener("staff", () => {
          store.dispatch(
            api.util.invalidateTags([
              { type: "NotificationPreview", id: "LIST" },
              { type: "NotificationList", id: "LIST" },
            ]),
          );
        });

        es.onerror = () => {
          es.close();
          if (!cancelled) {
            retryRef.current = setTimeout(connect, 5000);
          }
        };
      } catch {
        if (!cancelled) {
          retryRef.current = setTimeout(connect, 10000);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [isAdmin, user?.id, fetchToken]);
}
