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
  tagTypes: ["Roster", "Diary", "Notices", "Gallery", "Profile"],
  endpoints: (builder) => ({
    login: builder.mutation<{ user: TeacherUser }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    getProfile: builder.query<TeacherUser, void>({
      query: () => "/me",
      providesTags: ["Profile"],
    }),
    getRoster: builder.query<{ entryDate: string; students: RosterStudent[] }, void>({
      query: () => "/students",
      providesTags: ["Roster"],
    }),
    getDiary: builder.query<{ entryDate: string; diary: DaycareDiary | null }, number>({
      query: (studentId) => `/students/${studentId}/diary`,
      providesTags: (_r, _e, id) => [{ type: "Diary", id }],
    }),
    saveDiary: builder.mutation<{ diary: DaycareDiary | null }, { studentId: number; diary: Partial<DaycareDiary> }>({
      query: ({ studentId, diary }) => ({
        url: `/students/${studentId}/diary`,
        method: "PUT",
        body: diary,
      }),
      invalidatesTags: (_r, _e, { studentId }) => [{ type: "Diary", id: studentId }, "Roster"],
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
    changePassword: builder.mutation<{ success: boolean }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/account/password", method: "PATCH", body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useGetProfileQuery,
  useGetRosterQuery,
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useGetNoticesQuery,
  useAddNoticeMutation,
  useDeleteNoticeMutation,
  useGetGalleryQuery,
  useUploadPhotoMutation,
  useDeletePhotoMutation,
  useChangePasswordMutation,
} = api;
