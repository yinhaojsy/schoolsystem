import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  User,
  AuthResponse,
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
} from "../types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: [
    "Student",
    "StudentExtras",
    "StudentFeeVersions",
    "FeeStructure",
    "FeeBuilderTemplate",
    "ClassGroup",
    "Household",
    "Invoice",
    "Auth",
    "Stats",
    "Ledger",
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
} = api;
