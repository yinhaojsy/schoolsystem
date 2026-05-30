import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../app/store";
import type { ParentUser, ChildCard, ParentInvoice, ParentInvoiceDetail, InboxItem, DaycareDiary, ParentNotice, GalleryPhoto } from "../types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/parent",
    prepareHeaders: (headers, { getState }) => {
      const user = (getState() as RootState).auth.user;
      if (user?.id != null) {
        headers.set("X-User-Id", String(user.id));
      }
      return headers;
    },
  }),
  tagTypes: ["Auth", "Children", "Invoices", "Inbox", "Profile", "Diary", "Notices", "Gallery"],
  endpoints: (builder) => ({
    login: builder.mutation<{ user: ParentUser }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: ["Auth", "Profile"],
    }),
    getProfile: builder.query<ParentUser, void>({
      query: () => "/me",
      providesTags: ["Profile"],
    }),
    getChildren: builder.query<ChildCard[], void>({
      query: () => "/children",
      providesTags: ["Children"],
    }),
    getChildDiary: builder.query<
      { entryDate: string; student: { id: number; name: string }; diary: DaycareDiary | null },
      number
    >({
      query: (id) => `/children/${id}/diary`,
      providesTags: (_r, _e, id) => [{ type: "Diary", id }, "Children", "Inbox"],
    }),
    getChildNotices: builder.query<
      { entryDate: string; student: { id: number; name: string }; notices: ParentNotice[] },
      number
    >({
      query: (id) => `/children/${id}/notices`,
      providesTags: (_r, _e, id) => [{ type: "Notices", id }, "Children", "Inbox"],
    }),
    getChildGallery: builder.query<
      { entryDate: string; student: { id: number; name: string }; photos: GalleryPhoto[] },
      number
    >({
      query: (id) => `/children/${id}/gallery`,
      providesTags: (_r, _e, id) => [{ type: "Gallery", id }, "Children", "Inbox"],
    }),
    getInbox: builder.query<{ items: InboxItem[]; unreadCount: number }, void>({
      query: () => "/inbox",
      providesTags: ["Inbox"],
    }),
    getInvoices: builder.query<ParentInvoice[], void>({
      query: () => "/invoices",
      providesTags: ["Invoices"],
    }),
    getInvoiceDetail: builder.query<ParentInvoiceDetail, number>({
      query: (id) => `/invoices/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Invoices", id }],
    }),
    changeEmail: builder.mutation<{ user: ParentUser }, { email: string }>({
      query: (body) => ({ url: "/account/email", method: "PATCH", body }),
      invalidatesTags: ["Profile", "Auth"],
    }),
    changePassword: builder.mutation<{ success: boolean }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/account/password", method: "PATCH", body }),
    }),
    uploadPaymentProof: builder.mutation<{ success: boolean }, { invoiceId: number; file: File }>({
      query: ({ invoiceId, file }) => {
        const form = new FormData();
        form.append("proof", file);
        return {
          url: `/invoices/${invoiceId}/payment-proof`,
          method: "POST",
          body: form,
        };
      },
      invalidatesTags: ["Invoices", "Inbox", "Children"],
    }),
  }),
});

export const {
  useLoginMutation,
  useGetProfileQuery,
  useGetChildrenQuery,
  useGetChildDiaryQuery,
  useGetChildNoticesQuery,
  useGetChildGalleryQuery,
  useGetInboxQuery,
  useGetInvoicesQuery,
  useGetInvoiceDetailQuery,
  useChangeEmailMutation,
  useChangePasswordMutation,
  useUploadPaymentProofMutation,
} = api;
