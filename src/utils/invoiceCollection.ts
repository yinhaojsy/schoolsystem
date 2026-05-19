import type { Invoice } from "../types";
import { compareInvoicesByRollNo } from "./rollNo";

export type InvoiceCollectionTier = "partial" | "unpaid" | "paid" | "cancelled";

const TIER_SORT_ORDER: Record<InvoiceCollectionTier, number> = {
  partial: 0,
  unpaid: 1,
  paid: 2,
  cancelled: 3,
};

export const COLLECTION_TIER_LABELS: Record<InvoiceCollectionTier, string> = {
  partial: "Partial",
  unpaid: "Unpaid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const COLLECTION_TIER_BADGE_CLASS: Record<InvoiceCollectionTier, string> = {
  partial: "bg-blue-100 text-blue-800",
  unpaid: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
};

/** Resolve collection tier from API field or invoice status + paid totals. */
export function getInvoiceCollectionTier(invoice: Invoice): InvoiceCollectionTier {
  if (invoice.collectionTier) return invoice.collectionTier;
  if (invoice.status === "cancelled") return "cancelled";
  if (invoice.status === "paid") return "paid";
  const paid = Number(invoice.periodPaid) || 0;
  if (paid > 0.009) return "partial";
  return "unpaid";
}

/** List order: partial → unpaid → paid → cancelled; within tier by roll # then period. */
export function compareInvoicesByCollection(a: Invoice, b: Invoice): number {
  const tierCmp =
    TIER_SORT_ORDER[getInvoiceCollectionTier(a)] - TIER_SORT_ORDER[getInvoiceCollectionTier(b)];
  if (tierCmp !== 0) return tierCmp;
  return compareInvoicesByRollNo(a, b);
}

export function isInvoiceOverdue(invoice: Invoice): boolean {
  const tier = getInvoiceCollectionTier(invoice);
  if (tier === "paid" || tier === "cancelled") return false;
  const due = invoice.dueDate?.slice(0, 10);
  if (!due) return false;
  return due < new Date().toISOString().slice(0, 10);
}

export function formatCollectionPaymentHint(invoice: Invoice): string | null {
  const tier = getInvoiceCollectionTier(invoice);
  if (tier !== "partial") return null;
  const paid = Number(invoice.periodPaid) || 0;
  const net = Number(invoice.periodNet ?? invoice.amount) || 0;
  return `Rs ${paid.toLocaleString()} / ${net.toLocaleString()} paid`;
}
