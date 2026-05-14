export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
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
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
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

export interface DashboardStats {
  totalStudents: number;
  totalInvoices: number;
  pendingInvoices: number;
  paidInvoices: number;
  totalRevenue: number;
  pendingRevenue: number;
  /** Sum of force-close write-offs by reason (lifetime). */
  writeOffBadDebtTotal: number;
  writeOffWaiveTotal: number;
  writeOffOtherTotal: number;
  writeOffsTotal: number;
}
