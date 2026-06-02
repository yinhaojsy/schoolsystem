import { useState } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import NoticeApprovalList from "../components/contentApprovals/NoticeApprovalList";
import DiaryApprovalEditor from "../components/contentApprovals/DiaryApprovalEditor";
import GalleryApprovalEditor from "../components/contentApprovals/GalleryApprovalEditor";
import PublishedOverviewTab from "../components/contentApprovals/PublishedOverviewTab";
import { SubmissionDetailPreview } from "../components/contentApprovals/SubmissionDetailPreview";
import {
  useGetContentApprovalsQuery,
  useApproveContentSubmissionMutation,
  useRejectContentSubmissionMutation,
  useRemovePendingGalleryPhotoMutation,
  useRemoveGalleryPhotoMutation,
  useApproveGalleryGroupMutation,
  useRejectGalleryGroupMutation,
  useRemovePendingNoticeMutation,
  useUpdatePendingNoticeMutation,
  useApproveNoticesGroupMutation,
  useRejectNoticesGroupMutation,
  useUpdatePendingDiaryMutation,
  useCorrectApprovedDiaryMutation,
  useCorrectApprovedNoticeMutation,
  useReopenContentSubmissionMutation,
  useReopenNoticesGroupMutation,
  useReopenGalleryGroupMutation,
} from "../services/api";
import type { ContentSubmissionNotification, DiarySubmissionDetail } from "../types";

const PAGE_SIZE = 20;

type ApprovalTab = "pending" | "approved" | "rejected" | "published";

const TAB_LABELS: { id: ApprovalTab; label: string; description: string }[] = [
  {
    id: "pending",
    label: "Pending",
    description: "Review what teachers submitted before it goes to parents. Edit diaries and notes, remove individual photos, then approve.",
  },
  {
    id: "approved",
    label: "Approved",
    description: "Content live for parents. Edit diaries, notes, and photos directly (changes appear immediately), or send back to the teacher for resubmission.",
  },
  {
    id: "published",
    label: "Published",
    description: "See what parents have today — diary, notes, and photos per student, plus who is absent.",
  },
  {
    id: "rejected",
    label: "Rejected",
    description: "History of rejected submissions and your reasons. Entries stay here even after a teacher resubmits.",
  },
];

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function groupCountLabel(item: ContentSubmissionNotification) {
  if (item.isGroup && item.contentType === "gallery" && item.photos?.length) {
    return ` · ${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}`;
  }
  if (item.isGroup && item.contentType === "notices" && item.notices?.length) {
    return ` · ${item.notices.length} note${item.notices.length === 1 ? "" : "s"}`;
  }
  return "";
}

export default function ContentApprovalsPage() {
  const [tab, setTab] = useState<ApprovalTab>("pending");
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<ContentSubmissionNotification | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removingPhotoId, setRemovingPhotoId] = useState<number | null>(null);
  const [deletingNoticeId, setDeletingNoticeId] = useState<number | null>(null);
  const [savingNoticeId, setSavingNoticeId] = useState<number | null>(null);
  const [savingDiaryId, setSavingDiaryId] = useState<number | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: "" });

  const activeTab = TAB_LABELS.find((t) => t.id === tab) ?? TAB_LABELS[0];
  const isPendingTab = tab === "pending";
  const isApprovedTab = tab === "approved";
  const isRejectedTab = tab === "rejected";
  const isPublishedTab = tab === "published";
  const canEditContent = isPendingTab || isApprovedTab;

  const { data, isLoading, isFetching } = useGetContentApprovalsQuery(
    { page, limit: PAGE_SIZE, status: tab === "published" ? "pending" : tab },
    { skip: isPublishedTab },
  );
  const [approve, { isLoading: approving }] = useApproveContentSubmissionMutation();
  const [reject, { isLoading: rejecting }] = useRejectContentSubmissionMutation();
  const [removePhoto] = useRemovePendingGalleryPhotoMutation();
  const [removeApprovedPhoto] = useRemoveGalleryPhotoMutation();
  const [approveGalleryGroup, { isLoading: approvingGallery }] = useApproveGalleryGroupMutation();
  const [rejectGalleryGroup, { isLoading: rejectingGallery }] = useRejectGalleryGroupMutation();
  const [removeNotice] = useRemovePendingNoticeMutation();
  const [updateNotice] = useUpdatePendingNoticeMutation();
  const [approveNoticesGroup, { isLoading: approvingNotices }] = useApproveNoticesGroupMutation();
  const [rejectNoticesGroup, { isLoading: rejectingNotices }] = useRejectNoticesGroupMutation();
  const [updateDiary] = useUpdatePendingDiaryMutation();
  const [correctDiary] = useCorrectApprovedDiaryMutation();
  const [correctNotice] = useCorrectApprovedNoticeMutation();
  const [reopenContent, { isLoading: reopening }] = useReopenContentSubmissionMutation();
  const [reopenNoticesGroup, { isLoading: reopeningNotices }] = useReopenNoticesGroupMutation();
  const [reopenGalleryGroup, { isLoading: reopeningGallery }] = useReopenGalleryGroupMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isGalleryGroup = (item: ContentSubmissionNotification) =>
    item.isGroup && item.contentType === "gallery" && (item.photos?.length ?? 0) > 0;

  const isNoticesGroup = (item: ContentSubmissionNotification) =>
    item.isGroup && item.contentType === "notices" && (item.notices?.length ?? 0) > 0;

  const isDiaryItem = (
    item: ContentSubmissionNotification,
  ): item is ContentSubmissionNotification & {
    contentId: number;
    detail: { type: "diary"; diary: DiarySubmissionDetail };
  } => item.contentType === "diary" && item.detail?.type === "diary" && item.contentId != null;

  const isGrouped = (item: ContentSubmissionNotification) => isGalleryGroup(item) || isNoticesGroup(item);

  const handleApprove = async (item: ContentSubmissionNotification) => {
    try {
      if (isGalleryGroup(item)) {
        await approveGalleryGroup({ studentId: item.studentId, entryDate: item.entryDate }).unwrap();
        setAlertModal({ isOpen: true, message: "All photos approved — parents can now see them." });
        return;
      }
      if (isNoticesGroup(item)) {
        await approveNoticesGroup({ studentId: item.studentId, entryDate: item.entryDate }).unwrap();
        setAlertModal({ isOpen: true, message: "All notes approved — parents can now see them." });
        return;
      }
      if (item.contentId == null) return;
      await approve({ contentType: item.contentType, contentId: item.contentId }).unwrap();
      setAlertModal({ isOpen: true, message: "Approved — parents can now see this." });
    } catch {
      setAlertModal({ isOpen: true, message: "Could not approve submission." });
    }
  };

  const handleRemovePhoto = async (photoId: number, { approved = false } = {}) => {
    setRemovingPhotoId(photoId);
    try {
      if (approved) {
        await removeApprovedPhoto(photoId).unwrap();
      } else {
        await removePhoto(photoId).unwrap();
      }
    } catch {
      setAlertModal({ isOpen: true, message: "Could not remove photo." });
    } finally {
      setRemovingPhotoId(null);
    }
  };

  const handleDeleteNotice = async (noticeId: number) => {
    setDeletingNoticeId(noticeId);
    try {
      await removeNotice(noticeId).unwrap();
    } catch {
      setAlertModal({ isOpen: true, message: "Could not delete note." });
    } finally {
      setDeletingNoticeId(null);
    }
  };

  const handleSaveNotice = async (noticeId: number, message: string) => {
    setSavingNoticeId(noticeId);
    try {
      if (isApprovedTab) {
        await correctNotice({ noticeId, message }).unwrap();
        setAlertModal({ isOpen: true, message: "Note updated — parents see the changes immediately." });
      } else {
        await updateNotice({ noticeId, message }).unwrap();
      }
    } catch {
      setAlertModal({ isOpen: true, message: "Could not save note." });
    } finally {
      setSavingNoticeId(null);
    }
  };

  const handleSaveDiary = async (diaryId: number, diary: DiarySubmissionDetail) => {
    setSavingDiaryId(diaryId);
    try {
      if (isApprovedTab) {
        await correctDiary({ diaryId, diary }).unwrap();
        setAlertModal({ isOpen: true, message: "Diary updated — parents see the changes immediately." });
      } else {
        await updateDiary({ diaryId, diary }).unwrap();
      }
    } catch {
      setAlertModal({ isOpen: true, message: "Could not save diary." });
    } finally {
      setSavingDiaryId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      if (isApprovedTab) {
        if (isGalleryGroup(rejectTarget)) {
          await reopenGalleryGroup({
            studentId: rejectTarget.studentId,
            entryDate: rejectTarget.entryDate,
            reason: rejectReason.trim(),
          }).unwrap();
        } else if (isNoticesGroup(rejectTarget)) {
          await reopenNoticesGroup({
            studentId: rejectTarget.studentId,
            entryDate: rejectTarget.entryDate,
            reason: rejectReason.trim(),
          }).unwrap();
        } else if (rejectTarget.contentId != null) {
          await reopenContent({
            contentType: rejectTarget.contentType,
            contentId: rejectTarget.contentId,
            reason: rejectReason.trim(),
          }).unwrap();
        }
        setRejectTarget(null);
        setRejectReason("");
        setAlertModal({
          isOpen: true,
          message: "Sent back to teacher — they can fix and resubmit.",
        });
        return;
      }

      if (isGalleryGroup(rejectTarget)) {
        await rejectGalleryGroup({
          studentId: rejectTarget.studentId,
          entryDate: rejectTarget.entryDate,
          reason: rejectReason.trim(),
        }).unwrap();
      } else if (isNoticesGroup(rejectTarget)) {
        await rejectNoticesGroup({
          studentId: rejectTarget.studentId,
          entryDate: rejectTarget.entryDate,
          reason: rejectReason.trim(),
        }).unwrap();
      } else if (rejectTarget.contentId != null) {
        await reject({
          contentType: rejectTarget.contentType,
          contentId: rejectTarget.contentId,
          reason: rejectReason.trim(),
        }).unwrap();
      }
      setRejectTarget(null);
      setRejectReason("");
      setAlertModal({ isOpen: true, message: "Rejected — teacher will see your reason and can resubmit." });
    } catch {
      setAlertModal({ isOpen: true, message: "Could not reject submission." });
    }
  };

  const rejectModalTitle = () => {
    if (!rejectTarget) return isApprovedTab ? "Send back to teacher" : "Reject submission";
    if (isApprovedTab) {
      if (isGalleryGroup(rejectTarget)) return "Send all photos back to teacher";
      if (isNoticesGroup(rejectTarget)) return "Send all notes back to teacher";
      return "Send back to teacher";
    }
    if (isGalleryGroup(rejectTarget)) return "Reject all photos";
    if (isNoticesGroup(rejectTarget)) return "Reject all notes";
    return "Reject submission";
  };

  const sectionTitle = () => {
    if (tab === "pending") return `Pending submissions${total ? ` (${total})` : ""}`;
    if (tab === "approved") return `Approved history${total ? ` (${total})` : ""}`;
    if (tab === "published") return "Published today";
    return `Rejected history${total ? ` (${total})` : ""}`;
  };

  const emptyMessage = () => {
    if (tab === "pending") return "No pending submissions.";
    if (tab === "approved") return "No approved submissions yet.";
    return "No rejected submissions yet.";
  };

  const statusBadge = () => {
    if (tab === "approved") {
      return (
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          Approved
        </span>
      );
    }
    if (tab === "rejected") {
      return (
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
          Rejected
        </span>
      );
    }
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Pending review
      </span>
    );
  };

  const reviewMetaLine = (item: ContentSubmissionNotification) => {
    const parts = [
      `By ${item.teacherName}`,
      formatDate(item.entryDate),
      `submitted ${formatWhen(item.submittedAt)}`,
    ];
    if (!isPendingTab && item.reviewedAt) {
      const reviewer = item.reviewedByName ? ` by ${item.reviewedByName}` : "";
      parts.push(`${tab === "approved" ? "approved" : "rejected"} ${formatWhen(item.reviewedAt)}${reviewer}`);
    }
    return parts.join(" · ");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Content approvals</h2>
        <p className="mt-1 text-sm text-slate-500">{activeTab.description}</p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {TAB_LABELS.map((tabOption) => (
          <button
            key={tabOption.id}
            type="button"
            onClick={() => {
              setTab(tabOption.id);
              setPage(1);
              setRejectTarget(null);
            }}
            className={`rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === tabOption.id
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      <SectionCard title={sectionTitle()}>
        {isPublishedTab ? (
          <PublishedOverviewTab />
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">{emptyMessage()}</p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.contentLabel} · {item.studentName}
                        {item.studentRollNo ? ` (${item.studentRollNo})` : ""}
                        <span className="font-normal text-slate-500">{groupCountLabel(item)}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">{reviewMetaLine(item)}</p>
                    </div>
                    {statusBadge()}
                  </div>
                  {isRejectedTab && item.rejectionReason && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-red-700">Rejection reason</p>
                      <p className="mt-1 text-sm text-red-900">{item.rejectionReason}</p>
                    </div>
                  )}
                </div>

                <div className="px-4 py-4 sm:px-5">
                  {isGalleryGroup(item) ? (
                    <GalleryApprovalEditor
                      photos={item.photos!}
                      mode={isPendingTab ? "pending" : isApprovedTab ? "approved" : "readonly"}
                      studentId={item.studentId}
                      entryDate={item.entryDate}
                      teacherId={item.teacherId}
                      onRemove={(id) =>
                        void handleRemovePhoto(id, { approved: isApprovedTab })
                      }
                      removingId={removingPhotoId}
                      onUploadError={(message) => setAlertModal({ isOpen: true, message })}
                    />
                  ) : isNoticesGroup(item) ? (
                    <NoticeApprovalList
                      notices={item.notices!}
                      onDelete={isPendingTab ? (id) => void handleDeleteNotice(id) : undefined}
                      onSaveEdit={canEditContent ? (id, msg) => handleSaveNotice(id, msg) : undefined}
                      deletingId={deletingNoticeId}
                      savingId={savingNoticeId}
                      readOnly={!canEditContent}
                    />
                  ) : isDiaryItem(item) ? (
                    <DiaryApprovalEditor
                      diary={item.detail.diary}
                      onSave={canEditContent ? (diary) => handleSaveDiary(item.contentId, diary) : async () => {}}
                      saving={savingDiaryId === item.contentId}
                      readOnly={!canEditContent}
                    />
                  ) : (
                    <>
                      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Submitted content</p>
                      <SubmissionDetailPreview detail={item.detail} />
                    </>
                  )}
                </div>

                {isPendingTab && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      disabled={rejecting || rejectingGallery || rejectingNotices}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectReason("");
                      }}
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Reject{isGrouped(item) ? " all" : ""}
                    </button>
                    <button
                      type="button"
                      disabled={approving || approvingGallery || approvingNotices}
                      onClick={() => void handleApprove(item)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {isGrouped(item) ? "Approve all for parents" : "Approve for parents"}
                    </button>
                  </div>
                )}

                {isApprovedTab && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      disabled={reopening || reopeningGallery || reopeningNotices}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectReason("");
                      }}
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Send back to teacher{isGrouped(item) ? " (all)" : ""}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              Page {page} of {totalPages}
              {isFetching ? " · Updating…" : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {rejectTarget && (isPendingTab || isApprovedTab) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{rejectModalTitle()}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {rejectTarget.contentLabel} for {rejectTarget.studentName} —{" "}
              {isApprovedTab
                ? "explain what the teacher should fix before resubmitting."
                : "explain what needs to change."}
            </p>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border bg-slate-50 p-3">
              {isGalleryGroup(rejectTarget) && rejectTarget.photos ? (
                <GalleryApprovalEditor photos={rejectTarget.photos} mode="readonly" onRemove={() => {}} removingId={null} />
              ) : isNoticesGroup(rejectTarget) && rejectTarget.notices ? (
                <NoticeApprovalList notices={rejectTarget.notices} deletingId={null} savingId={null} readOnly />
              ) : isDiaryItem(rejectTarget) && rejectTarget.detail?.type === "diary" ? (
                <DiaryApprovalEditor
                  diary={rejectTarget.detail.diary}
                  onSave={async () => {}}
                  saving={false}
                  readOnly
                />
              ) : (
                <SubmissionDetailPreview detail={rejectTarget.detail} />
              )}
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder={isApprovedTab ? "Reason for sending back…" : "Reason for rejection…"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !rejectReason.trim() ||
                  rejecting ||
                  rejectingGallery ||
                  rejectingNotices ||
                  reopening ||
                  reopeningGallery ||
                  reopeningNotices
                }
                onClick={() => void handleReject()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isApprovedTab ? "Send back" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type="info"
        onClose={() => setAlertModal({ isOpen: false, message: "" })}
      />
    </div>
  );
}
