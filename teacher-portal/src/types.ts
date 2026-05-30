/// <reference types="vite/client" />

export interface TeacherUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  classGroupId: number | null;
  classGroupName?: string | null;
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
  noticeCount: number;
  photoCount: number;
}

export interface DiaryDrankRow { when: string; amount: string }
export interface DiarySleptRow { when: string; duration: string }
export interface DiaryAteRow { what: string; when: string; rating: "yummy" | "so-so" | "yucky" | "" }
export interface DiaryPottyRow { type: "wet" | "poo"; when: string }

export interface DaycareDiary {
  id?: number;
  studentId: number;
  entryDate: string;
  mood?: string | null;
  drank: DiaryDrankRow[];
  slept: DiarySleptRow[];
  ate: DiaryAteRow[];
  activities?: string | null;
  potty: DiaryPottyRow[];
  supplies: string[];
  teacherRemarks?: string | null;
}

export interface ParentNotice {
  id: number;
  studentId: number;
  entryDate: string;
  message: string;
  createdAt: string;
}

export interface GalleryPhoto {
  id: number;
  studentId: number;
  entryDate: string;
  filePath: string;
  caption?: string | null;
  url: string;
  createdAt: string;
}

export const MOOD_OPTIONS = ["happy", "sweet", "sad", "sensitive", "quiet", "silly"] as const;
export const SUPPLY_OPTIONS = ["diapers", "wipes", "clothes", "formula/milk", "other"] as const;
