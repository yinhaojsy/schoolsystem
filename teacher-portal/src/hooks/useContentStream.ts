import { useEffect, useRef } from "react";
import { useAppSelector } from "../app/hooks";
import { api, useGetContentStreamTokenMutation } from "../services/api";
import { store } from "../app/store";

type ContentUpdatedEvent = {
  type: "content_updated";
  studentId: number;
  entryDate: string;
  contentType: string;
};

function invalidateTeacherContentTags(event: ContentUpdatedEvent) {
  const tags: Parameters<typeof api.util.invalidateTags>[0] = ["Roster"];
  const { contentType, studentId } = event;

  if (contentType === "all" || contentType === "diary" || contentType === "diary_events") {
    tags.push({ type: "Diary", id: studentId });
  }
  if (contentType === "all" || contentType === "notices") {
    tags.push({ type: "Notices", id: studentId });
  }
  if (contentType === "all" || contentType === "gallery") {
    tags.push({ type: "Gallery", id: studentId });
  }

  store.dispatch(api.util.invalidateTags(tags));
}

export function useContentStream() {
  const user = useAppSelector((s) => s.auth.user);
  const [fetchToken] = useGetContentStreamTokenMutation();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const connect = async () => {
      try {
        const { token } = await fetchToken().unwrap();
        if (cancelled) return;

        sourceRef.current?.close();
        const es = new EventSource(`/api/teacher/stream?token=${encodeURIComponent(token)}`);
        sourceRef.current = es;

        es.addEventListener("content", (message) => {
          try {
            const event = JSON.parse(message.data) as ContentUpdatedEvent;
            if (event?.type === "content_updated") {
              invalidateTeacherContentTags(event);
            }
          } catch {
            // ignore malformed events
          }
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
  }, [user?.id, fetchToken]);
}
