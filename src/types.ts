export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status?: string;
  householdId?: number | null;
  invitePassword?: string | null;
  createdAt: string;
}

export type TeacherScope = "class" | "school";

export interface TeacherAccount {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  classGroupId: number | null;
  classGroupName?: string | null;
  teacherScope?: TeacherScope;
  canEditPublishedContent?: boolean;
  invitePassword?: string | null;
  daycareStudentCount?: number;
  createdAt: string;
}

export interface PublishedOverviewStudent {
  id: number;
  name: string;
  rollNo: string;
  classGroupId: number | null;
  classGroupName: string | null;
  entryDate: string;
  attendance: "absent" | "present" | null;
  diary: "published" | null;
  notices: "published" | null;
  photos: "published" | null;
}

export interface PublishedOverviewResponse {
  entryDate?: string;
  students: PublishedOverviewStudent[];
}

export interface PublishedContentResponse {
  student: { id: number; name: string; rollNo: string; classGroupName?: string | null };
  entryDate: string;
  contentType: "diary" | "diary_events" | "notices" | "gallery";
  detail?: ContentSubmissionDetail;
  notices?: { id: number; message: string }[];
  photos?: { id: number; imageUrl: string; caption?: string | null }[];
}

export interface AttendanceSheetStudent {
  id: number;
  rollNo: string;
  name: string;
  days: Record<number, "A" | "P" | null>;
}

export interface AttendanceSheetResponse {
  year: number;
  month: number;
  daysInMonth: number;
  classGroupId: number;
  classGroupName: string;
  students: AttendanceSheetStudent[];
}

export interface ParentAccount {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  householdId: number | null;
  householdLabel?: string | null;
  invitePassword?: string | null;
  parentDiaryAnimations?: boolean;
  activeChildrenCount?: number;
  studentIds?: number[];
  studentNames?: string[];
  linkedStudents?: { id: number; name: string; rollNo: string; classGroupName?: string }[];
  createdAt: string;
}

export interface AuthResponse {
  user: User;
}

export interface DatabaseInfo {
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  students: number;
  invoices: number;
  users: number;
}

export interface DatabaseRestoreResponse {
  success: boolean;
  message: string;
  safetyBackupPath: string;
}

export interface ClassGroup {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Household {
  id: number;
  label?: string | null;
  createdAt: string;
  /** Present on GET /households list */
  activeMemberCount?: number;
  /** All students (any status) linked to this household */
  memberCount?: number;
}

export interface FeeStructure {
  id: number;
  name: string;
  registrationFee?: number;
  registrationFeeInstallments?: number;
  annualCharges?: number;
  annualChargesInstallments?: number;
  monthlyFee: number;
  meals?: number;
  description?: string;
  /** JSON FeeBuilderSchema v1 — optional; legacy rows use flat columns only */
  builderSchema?: string | null;
  createdAt: string;
}

export interface Student {
  id: number;
  name: string;
  parentsName?: string;
  contactNo?: string;
  rollNo: string;
  feeStructureId: number;
  classGroupId: number;
  address?: string;
  dateOfBirth?: string;
  admissionDate: string;
  status: 'active' | 'inactive';
  enrollmentStatus?: "enrolled" | "left";
  leftAt?: string | null;
  leftReasonType?: "parent_decision" | "school_terminated" | "other" | null;
  leftRemarks?: string | null;
  createdAt: string;
  feeStructureName?: string;
  monthlyFee?: number;
  classGroupName?: string;
  /** Same household = siblings for monthly sibling discount */
  householdId?: number | null;
  householdLabel?: string | null;
  receivesSiblingDiscount?: number | boolean;
  siblingPreMonthly?: number | null;
  siblingPostMonthly?: number | null;
  siblingDiscountFromMonth?: string | null;
  siblingDiscountFromYear?: number | null;
  profilePhotoPath?: string | null;
  profilePhotoUrl?: string | null;
  programType?: string;
}

/** Sent with POST /students when admitting with custom amounts; server creates a matching fee_structures row. */
export interface StudentAdmissionCustomFee {
  monthlyFee: number;
  registrationFee?: number;
  annualCharges?: number;
}

/** Snapshot of an override row stored on GET /students/:id/fee-versions. */
export interface StudentFeeVersionOverrideSnapshot {
  chargeType: string;
  amount?: number | null;
  isExempt: number;
  overrideNotes?: string | null;
}

/** Snapshot of an extra charge row stored on fee version history. */
export interface StudentFeeVersionExtraSnapshot {
  description: string;
  amount: number;
  recurring: number;
  active: number;
}

/** One version of a student’s agreed fee (append-only history). */
export interface StudentFeeVersion {
  id: number;
  studentId: number;
  effectiveFrom: string;
  createdAt: string;
  monthlyFee: number;
  registrationFee?: number | null;
  registrationFeeInstallments?: number | null;
  annualCharges?: number | null;
  annualChargesInstallments?: number | null;
  meals?: number | null;
  overrides: StudentFeeVersionOverrideSnapshot[];
  extras: StudentFeeVersionExtraSnapshot[];
  notes?: string | null;
}

/** POST /students/:id/fee-versions — omit optional keys to keep current values. */
export interface CreateStudentFeeVersionPayload {
  monthlyFee: number;
  registrationFee?: number | null;
  registrationFeeInstallments?: number | null;
  annualCharges?: number | null;
  annualChargesInstallments?: number | null;
  meals?: number | null;
  effectiveFrom?: string;
  notes?: string;
}

/** One row in GET /students/:id/ledger — charges (debit), discounts and receipts (credit), running balance. */
export interface StudentLedgerLine {
  transactionType: "invoice" | "discount" | "payment";
  /** YYYY-MM-DD (invoice: created date; payment: receipt date). */
  date: string;
  description: string;
  invoiceDebit: number | null;
  /** Cash receipt or discount credit (both reduce balance due). */
  paymentCredit: number | null;
  balanceAfter: number;
  invoiceNo: string;
  invoiceId: number;
}

export interface StudentLedgerResponse {
  student: {
    id: number;
    name: string;
    rollNo: string;
    parentsName?: string | null;
    contactNo?: string | null;
    classGroupName?: string | null;
  };
  lines: StudentLedgerLine[];
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    balance: number;
  };
}

export interface Invoice {
  id: number;
  studentId: number;
  invoiceNo: string;
  month: string;
  year: number;
  amount: number;
  /** Calendar date on the invoice (YYYY-MM-DD); defaults to create date if omitted. */
  invoiceDate?: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  /** List sort/display: partial → unpaid → paid → cancelled */
  collectionTier?: 'partial' | 'unpaid' | 'paid' | 'cancelled';
  /** Sum of paidAmount on charge lines for this invoice. */
  periodPaid?: number;
  /** Net of charge lines minus discounts on this invoice. */
  periodNet?: number;
  /** Remaining on this invoice’s lines (periodNet − periodPaid). */
  periodUnpaid?: number;
  paymentDate?: string;
  remarks?: string;
  createdBy?: number;
  createdAt: string;
  studentName?: string;
  studentRollNo?: string;
  classGroupName?: string;
  parentsName?: string;
  contactNo?: string;
  /** Unpaid total from invoices strictly before this period (for brought-forward / statements). */
  priorBalance?: number;
  /** Net of this invoice’s line items only (charges − discounts). */
  periodSubtotal?: number;
  /** priorBalance + unpaid on this invoice’s lines — current amount due on this statement. */
  grandDue?: number;
  items?: InvoiceItem[];
  paymentProof?: PaymentProof | null;
}

export interface PaymentProof {
  id: number;
  invoiceId: number;
  parentId: number;
  imageUrl: string;
  submittedAt: string;
  reviewedAt?: string | null;
  invoiceNo?: string;
  month?: string;
  year?: number;
  invoiceStatus?: string;
  studentId?: number;
  studentName?: string;
  studentRollNo?: string;
  parentName?: string;
  kind?: "payment_proof";
}

export interface DiarySubmissionDetail {
  mood?: string | null;
  drank: { what: string; when: string; amount: string }[];
  slept: { from: string; to: string; duration: string }[];
  ate: { what: string; when: string; rating: string }[];
  medicine?: { what: string; when: string; notes?: string }[];
  fun?: { text: string }[];
  potty: { type: string; when: string }[];
  supplies: string[];
  remarks?: { text: string }[];
}

export type ContentSubmissionDetail =
  | { type: "diary"; diary: DiarySubmissionDetail }
  | { type: "notices"; notice: { message: string } }
  | { type: "gallery"; photo: { url: string; caption?: string | null } };

export interface GalleryPhotoApproval {
  contentId: number;
  imageUrl: string;
  caption?: string | null;
  submittedAt: string;
  teacherName: string;
}

export interface NoticeApproval {
  contentId: number;
  message: string;
  submittedAt: string;
  teacherName: string;
}

export interface DiaryEventApproval {
  contentId: number;
  eventType: "drank" | "slept" | "ate" | "medicine" | "potty" | "fun" | "remarks";
  when?: string;
  from?: string;
  to?: string;
  amount?: string;
  duration?: string;
  what?: string;
  rating?: string;
  notes?: string;
  text?: string;
  type?: string;
  submittedAt?: string;
  teacherName?: string;
}

export interface ContentSubmissionNotification {
  id: string;
  kind: "content_submission";
  contentType: "diary" | "diary_events" | "notices" | "gallery";
  contentId?: number;
  isGroup?: boolean;
  studentId: number;
  studentName: string;
  studentRollNo: string;
  teacherId?: number;
  teacherName: string;
  entryDate: string;
  submittedAt: string;
  approvalStatus?: string;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  rejectionReason?: string | null;
  preview?: string | null;
  imageUrl?: string | null;
  contentLabel?: string;
  detail?: ContentSubmissionDetail | null;
  photos?: GalleryPhotoApproval[];
  notices?: NoticeApproval[];
  diaryEvents?: DiaryEventApproval[];
}

export type StaffNotificationItem = PaymentProof | ContentSubmissionNotification | ContentStaffEvent;

export interface ContentStaffEvent {
  id: string;
  kind: "content_event";
  eventType: "submitted" | "withdrawn";
  contentType: "diary" | "diary_events" | "notices" | "gallery";
  contentId?: number;
  studentId: number;
  studentName: string;
  studentRollNo: string;
  teacherId?: number;
  teacherName: string;
  entryDate: string;
  submittedAt: string;
  preview?: string | null;
  imageUrl?: string | null;
  contentLabel?: string;
}

export interface TeacherContentSettings {
  diary: boolean;
  notices: boolean;
  gallery: boolean;
}

export interface TeacherWithContentSettings {
  id: number;
  name: string;
  email: string;
  status: string;
  classGroupName?: string | null;
  teacherScope?: TeacherScope;
  canEditPublishedContent?: boolean;
  settings: TeacherContentSettings;
}

export interface NotificationListResponse {
  items: StaffNotificationItem[];
  total: number;
  unreadCount: number;
  page?: number;
  limit?: number;
}

export interface ContentApprovalListResponse {
  items: ContentSubmissionNotification[];
  total: number;
  page?: number;
  limit?: number;
}

export interface InvoiceItem {
  id?: number;
  invoiceId?: number;
  description: string;
  amount: number;
  paidAmount?: number;
  type: 'charge' | 'discount';
  chargeType?: 'registration' | 'annual' | 'monthly' | 'meals' | 'other';
  createdAt?: string;
}

export interface StudentFeeOverride {
  id?: number;
  studentId: number;
  chargeType: 'registration' | 'annual' | 'monthly' | 'meals';
  amount?: number;
  isExempt: boolean;
  notes?: string;
  createdAt?: string;
}

/** Extra charges assigned to a student (therapy, camps, etc.) — rolled into invoices as line items. */
export interface StudentAdditionalCharge {
  id: number;
  studentId: number;
  description: string;
  amount: number;
  /** 1 = include on every new invoice until removed; 0 = one-time until billed once */
  recurring: number;
  /** 1 = bill on new invoices; 0 = kept on file but skipped (subscriptions you paused) */
  active?: number;
  billedInvoiceId?: number | null;
  createdAt: string;
}

/** Payload line when creating an invoice (server strips unknown fields on insert). */
export interface CreateInvoiceItemPayload {
  description: string;
  amount: number;
  type: 'charge' | 'discount';
  chargeType?: 'registration' | 'annual' | 'monthly' | 'meals' | 'other';
  /** Links to student_additional_charges for one-time marking */
  additionalChargeId?: number;
}

export interface PaymentHistory {
  id?: number;
  invoiceId: number;
  amount: number;
  paymentDate: string;
  remarks?: string;
  createdBy?: number;
  createdAt?: string;
}

export interface MonthlyIncomeReportInvoice {
  id: number;
  invoiceNo: string;
  studentId: number;
  studentName?: string;
  studentRollNo?: string;
  classGroupName?: string;
  billingMonth: string;
  billingYear: number;
  invoiceDate?: string | null;
  dueDate: string;
  status: Invoice['status'];
  collectionTier: 'partial' | 'unpaid' | 'paid' | 'cancelled';
  /** Net billed for this invoice period (charges minus discounts). */
  billedAmount: number;
  /** Cash collected against this invoice (any payment date). */
  cashCollected: number;
  /** Remaining balance on this invoice. */
  outstandingReceivable: number;
  /** Statement total at issue (may include brought-forward balance). */
  statementAmount: number;
}

export interface MonthlyIncomeReportSummary {
  invoiceCount: number;
  totalBilled: number;
  cashCollected: number;
  outstandingReceivable: number;
}

export interface MonthlyIncomeReportResponse {
  month: string;
  year: number;
  summary: MonthlyIncomeReportSummary;
  invoices: MonthlyIncomeReportInvoice[];
  availableYears: number[];
}

export interface DashboardStats {
  totalStudents: number;
  totalInvoices: number;
  pendingInvoices: number;
  paidInvoices: number;
  totalRevenue: number;
  pendingRevenue: number;
  /** Cash collected via fee receipts (includes partial payments). */
  totalReceipts: number;
  /** Unpaid balance on non-cancelled invoices (net charges minus payments). */
  totalOutstanding: number;
  /** Sum of force-close write-offs by reason (lifetime). */
  writeOffBadDebtTotal: number;
  writeOffWaiveTotal: number;
  writeOffOtherTotal: number;
  writeOffsTotal: number;
}
