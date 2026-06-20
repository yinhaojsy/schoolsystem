import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../app/store";
import type { TeacherUser, RosterStudent, DaycareDiary, ParentNotice, GalleryPhoto } from "../types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/teacher",
    prepareHeaders: (headers, { getState }) => {
      const user = (getState() as RootState).auth.user;
      if (user?.id != null) headers.set("X-User-Id", String(user.id));
      return headers;
    },
  }),
  tagTypes: ["Roster", "Diary", "Notices", "Gallery", "Profile", "ContentSettings", "Attendance"],
  endpoints: (builder) => ({
    login: builder.mutation<{ user: TeacherUser }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    getProfile: builder.query<TeacherUser, void>({
      query: () => "/me",
      providesTags: ["Profile"],
    }),
    updatePublishedNotice: builder.mutation<
      { notice: ParentNotice },
      { noticeId: number; message: string }
    >({
      query: ({ noticeId, message }) => ({
        url: `/notices/${noticeId}`,
        method: "PATCH",
        body: { message },
      }),
      invalidatesTags: ["Notices", "Roster"],
    }),
    getRoster: builder.query<{ entryDate: string; students: RosterStudent[] }, void>({
      query: () => "/students",
      providesTags: ["Roster"],
    }),
    bulkSetAttendance: builder.mutation<
      { success: boolean; count: number },
      { studentIds: number[]; status: "absent" | "present"; entryDate?: string }
    >({
      query: (body) => ({ url: "/attendance/bulk", method: "PATCH", body }),
      invalidatesTags: ["Roster", "Attendance"],
    }),
    getDiary: builder.query<{ entryDate: string; diary: DaycareDiary | null }, number>({
      query: (studentId) => `/students/${studentId}/diary`,
      providesTags: (_r, _e, id) => [{ type: "Diary", id }],
    }),
    getContentSettings: builder.query<{ diary: boolean; notices: boolean; gallery: boolean }, void>({
      query: () => "/me/content-settings",
      providesTags: ["ContentSettings"],
    }),
    saveDiary: builder.mutation<{ diary: DaycareDiary | null }, { studentId: number; diary: Partial<DaycareDiary> }>({
      query: ({ studentId, diary }) => ({
        url: `/students/${studentId}/diary`,
        method: "PUT",
        body: diary,
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    saveDiaryEvents: builder.mutation<{ diary: DaycareDiary | null }, { studentId: number; events: Partial<DaycareDiary> }>({
      query: ({ studentId, events }) => ({
        url: `/students/${studentId}/diary/events`,
        method: "PUT",
        body: events,
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    submitDiary: builder.mutation<{ diary: DaycareDiary | null }, { studentId: number; diary: Partial<DaycareDiary> }>({
      query: ({ studentId, diary }) => ({
        url: `/students/${studentId}/diary/submit`,
        method: "POST",
        body: diary,
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    withdrawDiary: builder.mutation<{ diary: DaycareDiary | null }, number>({
      query: (studentId) => ({
        url: `/students/${studentId}/diary/withdraw`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, studentId) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    submitDiaryEvents: builder.mutation<{ diary: DaycareDiary | null }, { studentId: number; events: Partial<DaycareDiary> }>({
      query: ({ studentId, events }) => ({
        url: `/students/${studentId}/diary/events/submit`,
        method: "POST",
        body: events,
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    withdrawDiaryEvents: builder.mutation<{ diary: DaycareDiary | null }, number>({
      query: (studentId) => ({
        url: `/students/${studentId}/diary/events/withdraw`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, studentId) => [{ type: "Diary", id: studentId }, "Roster"],
    }),
    getNotices: builder.query<{ entryDate: string; notices: ParentNotice[] }, number>({
      query: (studentId) => `/students/${studentId}/notices`,
      providesTags: (_r, _e, id) => [{ type: "Notices", id }],
    }),
    addNotice: builder.mutation<{ notice: ParentNotice }, { studentId: number; message: string }>({
      query: ({ studentId, message }) => ({
        url: `/students/${studentId}/notices`,
        method: "POST",
        body: { message },
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Notices", id: studentId }, "Roster"],
    }),
    deleteNotice: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({ url: `/notices/${id}`, method: "DELETE" }),
      invalidatesTags: ["Notices", "Roster"],
    }),
    getGallery: builder.query<{ entryDate: string; photos: GalleryPhoto[] }, number>({
      query: (studentId) => `/students/${studentId}/gallery`,
      providesTags: (_r, _e, id) => [{ type: "Gallery", id }],
    }),
    uploadPhoto: builder.mutation<{ photo: GalleryPhoto }, { studentId: number; file: File; caption?: string }>({
      query: ({ studentId, file, caption }) => {
        const form = new FormData();
        form.append("photo", file);
        if (caption) form.append("caption", caption);
        return { url: `/students/${studentId}/gallery`, method: "POST", body: form };
      },
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Gallery", id: studentId }, "Roster"],
    }),
    deletePhoto: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({ url: `/gallery/${id}`, method: "DELETE" }),
      invalidatesTags: ["Gallery", "Roster"],
    }),
    submitGallery: builder.mutation<{ photos: GalleryPhoto[] }, number>({
      query: (studentId) => ({
        url: `/students/${studentId}/gallery/submit`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, studentId) => [{ type: "Gallery", id: studentId }, "Roster"],
    }),
    withdrawGallery: builder.mutation<{ photos: GalleryPhoto[] }, number>({
      query: (studentId) => ({
        url: `/students/${studentId}/gallery/withdraw`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, studentId) => [{ type: "Gallery", id: studentId }, "Roster"],
    }),
    changePassword: builder.mutation<{ success: boolean }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/account/password", method: "PATCH", body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useGetProfileQuery,
  useUpdatePublishedNoticeMutation,
  useGetRosterQuery,
  useBulkSetAttendanceMutation,
  useGetContentSettingsQuery,
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useSaveDiaryEventsMutation,
  useSubmitDiaryMutation,
  useSubmitDiaryEventsMutation,
  useWithdrawDiaryMutation,
  useWithdrawDiaryEventsMutation,
  useGetNoticesQuery,
  useAddNoticeMutation,
  useDeleteNoticeMutation,
  useGetGalleryQuery,
  useUploadPhotoMutation,
  useDeletePhotoMutation,
  useSubmitGalleryMutation,
  useWithdrawGalleryMutation,
  useChangePasswordMutation,
} = api;
