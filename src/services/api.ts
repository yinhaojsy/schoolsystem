import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../app/store";
import type {
  User,
  AuthResponse,
  DatabaseInfo,
  ClassGroup,
  Household,
  FeeStructure,
  StudentAdmissionCustomFee,
  StudentLedgerResponse,
  Student,
  Invoice,
  DashboardStats,
  StudentAdditionalCharge,
  CreateInvoiceItemPayload,
  StudentFeeVersion,
  CreateStudentFeeVersionPayload,
  ParentAccount,
  TeacherAccount,
  PaymentProof,
  NotificationListResponse,
  TeacherWithContentSettings,
  ContentApprovalListResponse,
  ContentSubmissionNotification,
  StaffNotificationItem,
  DiarySubmissionDetail,
  PublishedOverviewResponse,
  PublishedContentResponse,
  AttendanceSheetResponse,
} from "../types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    prepareHeaders: (headers, { getState }) => {
      const user = (getState() as RootState).auth.user;
      if (user?.id != null) {
        headers.set("X-User-Id", String(user.id));
      }
      return headers;
    },
  }),
  tagTypes: [
    "Student",
    "StudentExtras",
    "StudentFeeVersions",
    "FeeStructure",
    "FeeBuilderTemplate",
    "ClassGroup",
    "Household",
    "ParentAccount",
    "TeacherAccount",
    "Invoice",
    "Auth",
    "Stats",
    "Ledger",
    "NotificationPreview",
    "NotificationList",
    "ContentApproval",
    "TeacherContentSettings",
    "PublishedOverview",
    "AttendanceSheet",
  ],
  refetchOnReconnect: true,
  endpoints: (builder) => ({
    // Auth
    login: builder.mutation<AuthResponse, { email: string; password: string }>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["Auth"],
    }),

    // Students
    getStudents: builder.query<Student[], void>({
      query: () => "/students",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Student" as const, id })),
              { type: "Student" as const, id: "LIST" },
            ]
          : [{ type: "Student" as const, id: "LIST" }],
    }),
    getStudent: builder.query<Student, number>({
      query: (id) => `/students/${id}`,
      providesTags: (result, error, id) => [{ type: "Student", id }],
    }),
    addStudent: builder.mutation<Student, Partial<Student> & { customFee?: StudentAdmissionCustomFee }>({
      query: (body) => ({
        url: "/students",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Student", id: "LIST" }, { type: "FeeStructure", id: "LIST" }, { type: "Household", id: "LIST" }, "Stats"],
    }),
    updateStudent: builder.mutation<Student, { id: number; data: Partial<Student> }>({
      query: ({ id, data }) => ({
        url: `/students/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Student", id },
        { type: "Student", id: "LIST" },
        { type: "Household", id: "LIST" },
        "Stats",
      ],
    }),
    deleteStudent: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/students/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Student", id: "LIST" }, { type: "Household", id: "LIST" }, "Stats"],
    }),

    getStudentLedger: builder.query<StudentLedgerResponse, number>({
      query: (studentId) => `/students/${studentId}/ledger`,
      keepUnusedDataFor: 0,
      providesTags: (result, error, studentId) => [{ type: "Ledger" as const, id: studentId }],
    }),

    getStudentFeeVersions: builder.query<StudentFeeVersion[], number>({
      query: (studentId) => `/students/${studentId}/fee-versions`,
      providesTags: (result, error, studentId) => [{ type: "StudentFeeVersions", id: studentId }],
    }),
    createStudentFeeVersion: builder.mutation<
      { versions: StudentFeeVersion[] },
      { studentId: number; body: CreateStudentFeeVersionPayload }
    >({
      query: ({ studentId, body }) => ({
        url: `/students/${studentId}/fee-versions`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { studentId }) => [
        { type: "StudentFeeVersions", id: studentId },
        { type: "Student", id: studentId },
        { type: "Student", id: "LIST" },
        { type: "FeeStructure", id: "LIST" },
        { type: "StudentExtras", id: studentId },
      ],
    }),

    getStudentAdditionalCharges: builder.query<StudentAdditionalCharge[], number>({
      query: (studentId) => `/students/${studentId}/additional-charges`,
      providesTags: (result, error, studentId) => [{ type: "StudentExtras", id: studentId }],
    }),
    addStudentAdditionalCharge: builder.mutation<
      StudentAdditionalCharge,
      { studentId: number; description: string; amount: number; recurring: boolean }
    >({
      query: ({ studentId, ...body }) => ({
        url: `/students/${studentId}/additional-charges`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { studentId }) => [{ type: "StudentExtras", id: studentId }],
    }),
    deleteStudentAdditionalCharge: builder.mutation<
      { success: boolean },
      { studentId: number; chargeId: number }
    >({
      query: ({ studentId, chargeId }) => ({
        url: `/students/${studentId}/additional-charges/${chargeId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { studentId }) => [{ type: "StudentExtras", id: studentId }],
    }),
    updateStudentAdditionalCharge: builder.mutation<
      StudentAdditionalCharge,
      { studentId: number; chargeId: number; active: boolean }
    >({
      query: ({ studentId, chargeId, active }) => ({
        url: `/students/${studentId}/additional-charges/${chargeId}`,
        method: "PATCH",
        body: { active },
      }),
      invalidatesTags: (result, error, { studentId }) => [{ type: "StudentExtras", id: studentId }],
    }),

    // Fee Structures
    getFeeStructures: builder.query<FeeStructure[], void>({
      query: () => "/fee-structures",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "FeeStructure" as const, id })),
              { type: "FeeStructure" as const, id: "LIST" },
            ]
          : [{ type: "FeeStructure" as const, id: "LIST" }],
    }),
    addFeeStructure: builder.mutation<FeeStructure, Partial<FeeStructure>>({
      query: (body) => ({
        url: "/fee-structures",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "FeeStructure", id: "LIST" }],
    }),
    updateFeeStructure: builder.mutation<FeeStructure, { id: number; data: Partial<FeeStructure> }>({
      query: ({ id, data }) => ({
        url: `/fee-structures/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "FeeStructure", id },
        { type: "FeeStructure", id: "LIST" },
      ],
    }),
    deleteFeeStructure: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/fee-structures/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "FeeStructure", id: "LIST" }],
    }),

    getFeeBuilderTemplate: builder.query<{ schema: string; updatedAt?: string }, void>({
      query: () => "/fee-builder-template",
      providesTags: ["FeeBuilderTemplate"],
    }),
    updateFeeBuilderTemplate: builder.mutation<
      { schema: string; updatedAt?: string },
      { schema: object | string }
    >({
      query: (body) => ({
        url: "/fee-builder-template",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["FeeBuilderTemplate"],
    }),

    // Class Groups
    getClassGroups: builder.query<ClassGroup[], void>({
      query: () => "/class-groups",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "ClassGroup" as const, id })),
              { type: "ClassGroup" as const, id: "LIST" },
            ]
          : [{ type: "ClassGroup" as const, id: "LIST" }],
    }),
    addClassGroup: builder.mutation<ClassGroup, Partial<ClassGroup>>({
      query: (body) => ({
        url: "/class-groups",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "ClassGroup", id: "LIST" }],
    }),
    updateClassGroup: builder.mutation<ClassGroup, { id: number; data: Partial<ClassGroup> }>({
      query: ({ id, data }) => ({
        url: `/class-groups/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "ClassGroup", id },
        { type: "ClassGroup", id: "LIST" },
      ],
    }),
    deleteClassGroup: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/class-groups/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ClassGroup", id: "LIST" }],
    }),

    getHouseholds: builder.query<Household[], void>({
      query: () => "/households",
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Household" as const, id })),
              { type: "Household" as const, id: "LIST" },
            ]
          : [{ type: "Household" as const, id: "LIST" }],
    }),
    addHousehold: builder.mutation<Household, { label?: string | null }>({
      query: (body) => ({
        url: "/households",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Household", id: "LIST" }],
    }),
    deleteHousehold: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/households/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Household", id: "LIST" }],
    }),

    // Invoices
    getInvoices: builder.query<Invoice[], { studentId?: number; month?: string; year?: number; status?: string }>({
      query: (params) => ({
        url: "/invoices",
        params,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Invoice" as const, id })),
              { type: "Invoice" as const, id: "LIST" },
            ]
          : [{ type: "Invoice" as const, id: "LIST" }],
    }),
    getInvoice: builder.query<Invoice, number>({
      query: (id) => `/invoices/${id}`,
      providesTags: (result, error, id) => [{ type: "Invoice", id }],
    }),
    addInvoice: builder.mutation<
      Invoice,
      Partial<Invoice> & { items?: CreateInvoiceItemPayload[]; studentId: number }
    >({
      query: (body) => ({
        url: "/invoices",
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "Invoice", id: "LIST" },
        "Stats",
        { type: "Student", id: arg.studentId },
        { type: "StudentExtras", id: arg.studentId },
      ],
    }),
    updateInvoice: builder.mutation<Invoice, { id: number; data: Partial<Invoice> }>({
      query: ({ id, data }) => ({
        url: `/invoices/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Invoice", id },
        { type: "Invoice", id: "LIST" },
        "Stats",
      ],
    }),
    forceCloseInvoice: builder.mutation<
      { success: boolean; invoice: Invoice; amountWrittenOff: number; reasonCode: string },
      { id: number; reasonCode: "waive" | "bad_debt" | "other"; customReason?: string; createdBy?: number | null }
    >({
      query: ({ id, reasonCode, customReason, createdBy }) => ({
        url: "/invoices/close-balance",
        method: "POST",
        body: { invoiceId: id, reasonCode, customReason, createdBy },
      }),
      invalidatesTags: (result, error, arg) => {
        const sid = result?.invoice?.studentId;
        return [
          { type: "Invoice" as const, id: arg.id },
          { type: "Invoice" as const, id: "LIST" },
          "Stats",
          ...(typeof sid === "number"
            ? ([{ type: "Student" as const, id: sid }, { type: "Ledger" as const, id: sid }] as const)
            : []),
        ];
      },
    }),
    deleteInvoice: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/invoices/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Invoice", id: "LIST" }, "Stats"],
    }),

    // Dashboard
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => "/dashboard/stats",
      providesTags: ["Stats"],
    }),

    getDatabaseInfo: builder.query<DatabaseInfo, void>({
      query: () => "/settings/database-info",
    }),

    getParentAccounts: builder.query<ParentAccount[], void>({
      query: () => "/parent-accounts",
      providesTags: [{ type: "ParentAccount", id: "LIST" }],
    }),
    createParentAccount: builder.mutation<
      ParentAccount,
      { name: string; email: string; studentIds: number[]; householdId?: number | null; password?: string }
    >({
      query: (body) => ({ url: "/parent-accounts", method: "POST", body }),
      invalidatesTags: [{ type: "ParentAccount", id: "LIST" }],
    }),
    updateParentAccount: builder.mutation<
      ParentAccount,
      { id: number; data: Partial<ParentAccount> & { password?: string; studentIds?: number[] } }
    >({
      query: ({ id, data }) => ({ url: `/parent-accounts/${id}`, method: "PUT", body: data }),
      invalidatesTags: [{ type: "ParentAccount", id: "LIST" }],
    }),
    resetParentPassword: builder.mutation<ParentAccount, number>({
      query: (id) => ({ url: `/parent-accounts/${id}/reset-password`, method: "POST" }),
      invalidatesTags: [{ type: "ParentAccount", id: "LIST" }],
    }),
    deleteParentAccount: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({ url: `/parent-accounts/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "ParentAccount", id: "LIST" }],
    }),
    uploadStudentPhoto: builder.mutation<Student, { id: number; file: File }>({
      query: ({ id, file }) => {
        const form = new FormData();
        form.append("photo", file);
        return { url: `/students/${id}/photo`, method: "POST", body: form };
      },
      invalidatesTags: (_r, _e, { id }) => [{ type: "Student", id }, { type: "Student", id: "LIST" }],
    }),

    getTeacherAccounts: builder.query<TeacherAccount[], void>({
      query: () => "/teacher-accounts",
      providesTags: [{ type: "TeacherAccount", id: "LIST" }],
    }),
    createTeacherAccount: builder.mutation<
      TeacherAccount,
      {
        name: string;
        email: string;
        teacherScope?: "class" | "school";
        classGroupId?: number | null;
        canEditPublishedContent?: boolean;
        password?: string;
      }
    >({
      query: (body) => ({ url: "/teacher-accounts", method: "POST", body }),
      invalidatesTags: [
        { type: "TeacherAccount", id: "LIST" },
        { type: "TeacherContentSettings", id: "LIST" },
      ],
    }),
    updateTeacherAccount: builder.mutation<
      TeacherAccount,
      { id: number; data: Partial<TeacherAccount> & { password?: string } }
    >({
      query: ({ id, data }) => ({ url: `/teacher-accounts/${id}`, method: "PUT", body: data }),
      invalidatesTags: [{ type: "TeacherAccount", id: "LIST" }],
    }),
    resetTeacherPassword: builder.mutation<TeacherAccount, number>({
      query: (id) => ({ url: `/teacher-accounts/${id}/reset-password`, method: "POST" }),
      invalidatesTags: [{ type: "TeacherAccount", id: "LIST" }],
    }),
    deleteTeacherAccount: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({ url: `/teacher-accounts/${id}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "TeacherAccount", id: "LIST" },
        { type: "TeacherContentSettings", id: "LIST" },
      ],
    }),

    getPublishedOverview: builder.query<
      PublishedOverviewResponse,
      { entryDate?: string; classGroupId?: number | null }
    >({
      query: (args) => {
        const params = new URLSearchParams();
        if (args?.entryDate) params.set("entryDate", args.entryDate);
        if (args?.classGroupId != null) params.set("classGroupId", String(args.classGroupId));
        const q = params.toString();
        return `/content-approvals/published-overview${q ? `?${q}` : ""}`;
      },
      providesTags: [{ type: "PublishedOverview", id: "LIST" }],
    }),
    getPublishedContent: builder.query<
      PublishedContentResponse,
      { studentId: number; entryDate: string; contentType: "diary" | "notices" | "gallery" }
    >({
      query: ({ studentId, entryDate, contentType }) =>
        `/content-approvals/published-content?studentId=${studentId}&entryDate=${encodeURIComponent(entryDate)}&contentType=${contentType}`,
      providesTags: (_r, _e, arg) => [{ type: "PublishedOverview", id: `${arg.studentId}-${arg.contentType}` }],
    }),
    getAttendanceSheet: builder.query<
      AttendanceSheetResponse,
      { classGroupId: number; year: number; month: number }
    >({
      query: ({ classGroupId, year, month }) =>
        `/attendance-sheet?classGroupId=${classGroupId}&year=${year}&month=${month}`,
      providesTags: (_r, _e, arg) => [
        { type: "AttendanceSheet", id: `${arg.classGroupId}-${arg.year}-${arg.month}` },
      ],
    }),

    getTeacherContentSettings: builder.query<TeacherWithContentSettings[], void>({
      query: () => "/teacher-content-settings",
      providesTags: [{ type: "TeacherContentSettings", id: "LIST" }],
    }),
    updateTeacherContentSettings: builder.mutation<
      { teacherId: number; settings: TeacherWithContentSettings["settings"] },
      { teacherId: number; settings: TeacherWithContentSettings["settings"] }
    >({
      query: ({ teacherId, settings }) => ({
        url: `/teacher-accounts/${teacherId}/content-settings`,
        method: "PUT",
        body: settings,
      }),
      invalidatesTags: [{ type: "TeacherContentSettings", id: "LIST" }],
    }),

    getContentApprovals: builder.query<
      ContentApprovalListResponse,
      { page?: number; limit?: number; status?: "pending" | "approved" | "rejected" } | void
    >({
      query: (args) => {
        const page = args?.page;
        const limit = args?.limit ?? 20;
        const status = args?.status ?? "pending";
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (status !== "pending") params.set("status", status);
        if (page != null) params.set("page", String(page));
        return `/content-approvals?${params.toString()}`;
      },
      providesTags: [{ type: "ContentApproval", id: "LIST" }],
    }),
    approveContentSubmission: builder.mutation<
      ContentSubmissionNotification,
      { contentType: string; contentId: number }
    >({
      query: ({ contentType, contentId }) => ({
        url: `/content-approvals/${contentType}/${contentId}/approve`,
        method: "PATCH",
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    rejectContentSubmission: builder.mutation<
      ContentSubmissionNotification,
      { contentType: string; contentId: number; reason: string }
    >({
      query: ({ contentType, contentId, reason }) => ({
        url: `/content-approvals/${contentType}/${contentId}/reject`,
        method: "PATCH",
        body: { reason },
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    removePendingGalleryPhoto: builder.mutation<
      { success: boolean },
      number
    >({
      query: (photoId) => ({
        url: `/content-approvals/gallery/${photoId}?pendingOnly=true`,
        method: "DELETE",
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    removeGalleryPhoto: builder.mutation<{ success: boolean }, number>({
      query: (photoId) => ({ url: `/content-approvals/gallery/${photoId}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    uploadApprovedGalleryPhoto: builder.mutation<
      { success: boolean; photo: unknown },
      FormData
    >({
      query: (body) => ({
        url: "/content-approvals/gallery/upload",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    approveGalleryGroup: builder.mutation<
      { success: boolean; approvedCount: number },
      { studentId: number; entryDate: string }
    >({
      query: (body) => ({
        url: "/content-approvals/gallery/group/approve",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    rejectGalleryGroup: builder.mutation<
      { success: boolean; rejectedCount: number },
      { studentId: number; entryDate: string; reason: string }
    >({
      query: (body) => ({
        url: "/content-approvals/gallery/group/reject",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    removePendingNotice: builder.mutation<{ success: boolean }, number>({
      query: (noticeId) => ({ url: `/content-approvals/notices/${noticeId}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    updatePendingNotice: builder.mutation<
      { success: boolean; contentId: number; message: string },
      { noticeId: number; message: string }
    >({
      query: ({ noticeId, message }) => ({
        url: `/content-approvals/notices/${noticeId}`,
        method: "PATCH",
        body: { message },
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    approveNoticesGroup: builder.mutation<
      { success: boolean; approvedCount: number },
      { studentId: number; entryDate: string }
    >({
      query: (body) => ({
        url: "/content-approvals/notices/group/approve",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    rejectNoticesGroup: builder.mutation<
      { success: boolean; rejectedCount: number },
      { studentId: number; entryDate: string; reason: string }
    >({
      query: (body) => ({
        url: "/content-approvals/notices/group/reject",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    updatePendingDiary: builder.mutation<
      { success: boolean; diary: DiarySubmissionDetail },
      { diaryId: number; diary: DiarySubmissionDetail }
    >({
      query: ({ diaryId, diary }) => ({
        url: `/content-approvals/diary/${diaryId}`,
        method: "PATCH",
        body: diary,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    correctApprovedDiary: builder.mutation<
      { success: boolean; diary: DiarySubmissionDetail },
      { diaryId: number; diary: DiarySubmissionDetail }
    >({
      query: ({ diaryId, diary }) => ({
        url: `/content-approvals/diary/${diaryId}/correct`,
        method: "PATCH",
        body: diary,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
      ],
    }),
    correctApprovedNotice: builder.mutation<
      { success: boolean; contentId: number; message: string },
      { noticeId: number; message: string }
    >({
      query: ({ noticeId, message }) => ({
        url: `/content-approvals/notices/${noticeId}/correct`,
        method: "PATCH",
        body: { message },
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
      ],
    }),
    reopenContentSubmission: builder.mutation<
      ContentSubmissionNotification,
      { contentType: string; contentId: number; reason: string }
    >({
      query: ({ contentType, contentId, reason }) => ({
        url: `/content-approvals/${contentType}/${contentId}/reopen`,
        method: "PATCH",
        body: { reason },
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    reopenNoticesGroup: builder.mutation<
      { success: boolean; reopenedCount: number },
      { studentId: number; entryDate: string; reason: string }
    >({
      query: (body) => ({
        url: "/content-approvals/notices/group/reopen",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    reopenGalleryGroup: builder.mutation<
      { success: boolean; reopenedCount: number },
      { studentId: number; entryDate: string; reason: string }
    >({
      query: (body) => ({
        url: "/content-approvals/gallery/group/reopen",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        { type: "ContentApproval", id: "LIST" },
        { type: "PublishedOverview", id: "LIST" },
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),

    getNotificationPreview: builder.query<NotificationListResponse, void>({
      query: () => "/notifications?limit=5",
      providesTags: [{ type: "NotificationPreview", id: "LIST" }],
      keepUnusedDataFor: 300,
    }),
    getNotifications: builder.query<NotificationListResponse, { page: number; limit?: number }>({
      query: ({ page, limit = 20 }) => `/notifications?page=${page}&limit=${limit}`,
      providesTags: [{ type: "NotificationList", id: "LIST" }],
      keepUnusedDataFor: 300,
    }),
    markPaymentProofRead: builder.mutation<PaymentProof, number>({
      query: (id) => ({ url: `/payment-proofs/${id}/read`, method: "PATCH" }),
      invalidatesTags: [
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
      async onQueryStarted(proofId, { dispatch, queryFulfilled }) {
        const markRead = (draft: NotificationListResponse) => {
          const item = draft.items.find((i) => i.kind !== "content_submission" && i.id === proofId) as PaymentProof | undefined;
          if (draft.unreadCount > 0 && item && !item.reviewedAt) {
            draft.unreadCount -= 1;
          }
          if (item && !item.reviewedAt) {
            item.reviewedAt = new Date().toISOString();
          }
        };
        const patchPreview = dispatch(
          api.util.updateQueryData("getNotificationPreview", undefined, markRead),
        );
        const patchList = dispatch(
          api.util.updateQueryData("getNotifications", { page: 1, limit: 20 }, markRead),
        );
        try {
          await queryFulfilled;
        } catch {
          patchPreview.undo();
          patchList.undo();
        }
      },
    }),
    markPaymentProofReviewed: builder.mutation<PaymentProof, number>({
      query: (id) => ({ url: `/payment-proofs/${id}/read`, method: "PATCH" }),
      invalidatesTags: [
        { type: "NotificationPreview", id: "LIST" },
        { type: "NotificationList", id: "LIST" },
      ],
    }),
    getNotificationStreamToken: builder.mutation<{ token: string; expiresIn: number }, void>({
      query: () => ({ url: "/notifications/stream-token", method: "POST" }),
    }),
    getPushVapidPublicKey: builder.query<{ enabled: boolean; publicKey: string | null }, void>({
      query: () => "/push/vapid-public-key",
    }),
    subscribePush: builder.mutation<{ success: boolean }, { subscription: Record<string, unknown> }>({
      query: (body) => ({ url: "/push/subscribe", method: "POST", body }),
    }),
    unsubscribePush: builder.mutation<{ success: boolean }, { endpoint: string }>({
      query: (body) => ({ url: "/push/subscribe", method: "DELETE", body }),
    }),
  }),
});

export const {
  useLoginMutation,
  useGetStudentsQuery,
  useGetStudentQuery,
  useAddStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  useGetStudentLedgerQuery,
  useGetStudentFeeVersionsQuery,
  useCreateStudentFeeVersionMutation,
  useGetStudentAdditionalChargesQuery,
  useAddStudentAdditionalChargeMutation,
  useDeleteStudentAdditionalChargeMutation,
  useUpdateStudentAdditionalChargeMutation,
  useGetFeeStructuresQuery,
  useAddFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  useGetFeeBuilderTemplateQuery,
  useUpdateFeeBuilderTemplateMutation,
  useGetClassGroupsQuery,
  useAddClassGroupMutation,
  useUpdateClassGroupMutation,
  useDeleteClassGroupMutation,
  useGetHouseholdsQuery,
  useAddHouseholdMutation,
  useDeleteHouseholdMutation,
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useAddInvoiceMutation,
  useUpdateInvoiceMutation,
  useForceCloseInvoiceMutation,
  useDeleteInvoiceMutation,
  useGetDashboardStatsQuery,
  useGetDatabaseInfoQuery,
  useGetParentAccountsQuery,
  useCreateParentAccountMutation,
  useUpdateParentAccountMutation,
  useResetParentPasswordMutation,
  useDeleteParentAccountMutation,
  useUploadStudentPhotoMutation,
  useGetTeacherAccountsQuery,
  useCreateTeacherAccountMutation,
  useUpdateTeacherAccountMutation,
  useResetTeacherPasswordMutation,
  useDeleteTeacherAccountMutation,
  useGetPublishedOverviewQuery,
  useGetPublishedContentQuery,
  useGetAttendanceSheetQuery,
  useGetTeacherContentSettingsQuery,
  useUpdateTeacherContentSettingsMutation,
  useGetContentApprovalsQuery,
  useApproveContentSubmissionMutation,
  useRejectContentSubmissionMutation,
  useRemovePendingGalleryPhotoMutation,
  useRemoveGalleryPhotoMutation,
  useUploadApprovedGalleryPhotoMutation,
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
  useGetNotificationPreviewQuery,
  useGetNotificationsQuery,
  useMarkPaymentProofReadMutation,
  useMarkPaymentProofReviewedMutation,
  useGetNotificationStreamTokenMutation,
  useGetPushVapidPublicKeyQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
} = api;
