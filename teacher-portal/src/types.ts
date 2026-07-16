/// <reference types="vite/client" />

import type { DiaryAteRating } from "../../shared/diaryAteRatings";

export type TeacherScope = "class" | "school";

export interface TeacherUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  classGroupId: number | null;
  classGroupName?: string | null;
  teacherScope?: TeacherScope;
  canEditPublishedContent?: boolean;
  createdAt: string;
}

export interface RosterStudent {
  id: number;
  name: string;
  rollNo: string;
  classGroupName?: string;
  profilePhotoUrl: string | null;
  today: string;
  hasDiary: boolean;
  diaryStatus?: string | null;
  noticeCount: number;
  photoCount: number;
  pendingNoticeCount?: number;
  pendingPhotoCount?: number;
  attendanceStatus?: "absent" | "present" | null;
  isAbsent?: boolean;
}

export interface DiaryRowMeta {
  id?: number;
  approvalStatus?: ContentApprovalStatus;
  rejectionReason?: string | null;
}

export interface DiaryDrankRow extends DiaryRowMeta { what: string; when: string; amount: string }
export interface DiarySleptRow extends DiaryRowMeta { from: string; to: string; duration: string }
export interface DiaryAteRow extends DiaryRowMeta { what: string; when: string; rating: DiaryAteRating | "" }
export interface DiaryPottyRow extends DiaryRowMeta { type: "wet" | "poo" | "pee"; when: string }
export interface DiaryMedicineRow extends DiaryRowMeta { what: string; when: string; notes?: string }
export interface DiaryFunRow extends DiaryRowMeta { text: string }
export interface DiaryRemarkRow extends DiaryRowMeta { text: string }

export interface DaycareDiary {
  id?: number;
  studentId: number;
  entryDate: string;
  mood?: string | null;
  drank: DiaryDrankRow[];
  slept: DiarySleptRow[];
  ate: DiaryAteRow[];
  medicine: DiaryMedicineRow[];
  fun: DiaryFunRow[];
  potty: DiaryPottyRow[];
  supplies: string[];
  remarks: DiaryRemarkRow[];
  approvalStatus?: ContentApprovalStatus;
  summaryApprovalStatus?: ContentApprovalStatus | null;
  rejectionReason?: string | null;
  adminCorrectedAt?: string | null;
  adminCorrectedBy?: number | null;
  hasPendingEvents?: boolean;
  hasDraftEvents?: boolean;
  pendingEventCount?: number;
  draftEventCount?: number;
  approvedEventCount?: number;
}

export type ContentApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export interface ParentNotice {
  id: number;
  studentId: number;
  entryDate: string;
  message: string;
  createdAt: string;
  approvalStatus?: ContentApprovalStatus;
  rejectionReason?: string | null;
  deletable?: boolean;
  adminCorrectedAt?: string | null;
  adminCorrectedBy?: number | null;
}

export interface GalleryPhoto {
  id: number;
  studentId: number;
  entryDate: string;
  filePath: string;
  caption?: string | null;
  url: string;
  createdAt: string;
  approvalStatus?: ContentApprovalStatus;
  rejectionReason?: string | null;
  adminCorrectedAt?: string | null;
  adminCorrectedBy?: number | null;
  pendingDeletion?: boolean;
}

export const MOOD_OPTIONS = [
  "happy",
  "merry",
  "sweet",
  "silly",
  "excited",
  "calm",
  "quiet",
  "curious",
  "tired",
  "sad",
  "sensitive",
  "upset",
] as const;
export const SUPPLY_OPTIONS = ["diapers", "wipes", "clothes", "formula/milk", "other"] as const;
