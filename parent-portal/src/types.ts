export interface ParentUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  householdId: number | null;
  householdLabel?: string | null;
  createdAt: string;
}

export interface ChildCard {
  id: number;
  name: string;
  rollNo: string;
  classGroupName?: string;
  programType: string;
  profilePhotoUrl: string | null;
  unread: {
    diary: number;
    notices: number;
    gallery: number;
    invoice: number;
  };
}

export interface ParentInvoiceItem {
  id: number;
  invoiceId: number;
  description: string;
  amount: number;
  type?: string | null;
  chargeType?: string | null;
  paidAmount?: number | null;
}

export interface ParentInvoice {
  id: number;
  studentId: number;
  invoiceNo: string;
  month: string;
  year: number;
  amount: number;
  dueDate: string;
  status: string;
  studentName?: string;
  classGroupName?: string;
  periodNet?: number;
  periodPaid?: number;
  periodUnpaid?: number;
  hasPaymentProof?: boolean;
  unread?: boolean;
}

export interface ParentInvoiceDetail extends ParentInvoice {
  studentRollNo?: string;
  parentsName?: string;
  contactNo?: string;
  remarks?: string | null;
  items: ParentInvoiceItem[];
  priorBalance?: number;
  periodSubtotal?: number;
  grandDue?: number;
  collectionTier?: string;
}

export interface InboxItem {
  id: string;
  type: "invoice" | "diary" | "notice" | "gallery";
  title: string;
  subtitle: string;
  studentId: number;
  invoiceId?: number;
  createdAt: string;
  unread: boolean;
}

export interface DaycareDiary {
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

export interface ParentNotice {
  id: number;
  message: string;
  createdAt: string;
}

export interface GalleryPhoto {
  id: number;
  url: string;
  caption?: string | null;
}
