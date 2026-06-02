import { useState, type ReactNode } from "react";
import type { NoticeApproval } from "../../types";

function IconButton({
  onClick,
  disabled,
  label,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export default function NoticeApprovalList({
  notices,
  onDelete,
  onSaveEdit,
  deletingId,
  savingId,
  readOnly = false,
}: {
  notices: NoticeApproval[];
  onDelete?: (noticeId: number) => void;
  onSaveEdit?: (noticeId: number, message: string) => void;
  deletingId: number | null;
  savingId: number | null;
  readOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const startEdit = (notice: NoticeApproval) => {
    setEditingId(notice.contentId);
    setEditText(notice.message);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (noticeId: number) => {
    if (!editText.trim() || !onSaveEdit) return;
    await onSaveEdit(noticeId, editText.trim());
    cancelEdit();
  };

  return (
    <ul className="space-y-2">
      {notices.map((notice) => {
        const isEditing = editingId === notice.contentId;
        return (
          <li key={notice.contentId} className="rounded-xl border border-amber-100 bg-amber-50/80 p-3">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border px-3 py-1.5 text-sm font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!editText.trim() || savingId === notice.contentId}
                    onClick={() => void saveEdit(notice.contentId)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingId === notice.contentId ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-slate-800">{notice.message}</p>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <IconButton
                      onClick={() => startEdit(notice)}
                      label="Edit note"
                      disabled={deletingId === notice.contentId}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </IconButton>
                    <IconButton
                      onClick={() => onDelete?.(notice.contentId)}
                      label="Delete note"
                      disabled={deletingId === notice.contentId}
                      className="text-red-600 hover:bg-red-50"
                    >
                      {deletingId === notice.contentId ? (
                        <span className="text-xs">…</span>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </IconButton>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
