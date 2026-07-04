import type { Invoice, InvoiceItem } from "../types";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum of charge lines only (excludes discounts). */
export function invoiceGrossChargesFromItems(items: InvoiceItem[] | undefined): number {
  if (!items?.length) return 0;
  return roundMoney(
    items
      .filter((it) => it.type !== "discount")
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
  );
}

/** Total discount lines on an invoice. */
export function invoiceDiscountTotalFromItems(items: InvoiceItem[] | undefined): number {
  if (!items?.length) return 0;
  return roundMoney(
    items
      .filter((it) => it.type === "discount")
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
  );
}

/** Net of charge lines minus discounts on this invoice only. */
export function invoicePeriodSubtotalFromItems(items: InvoiceItem[] | undefined): number {
  if (!items?.length) return 0;
  let charges = 0;
  let discounts = 0;
  for (const it of items) {
    const amt = Number(it.amount) || 0;
    if (it.type === "discount") discounts += amt;
    else charges += amt;
  }
  return roundMoney(charges - discounts);
}

export function invoicePeriodSubtotal(invoice: Invoice): number {
  if (invoice.periodSubtotal != null) return roundMoney(invoice.periodSubtotal);
  return invoicePeriodSubtotalFromItems(invoice.items);
}

/** Unpaid from earlier billing periods (live), from API priorBalance. */
export function invoicePriorBalanceNow(invoice: Invoice): number {
  return roundMoney(Number(invoice.priorBalance) || 0);
}

/** Header total minus this period’s line items — brought forward included when the invoice was issued/last refreshed. */
export function invoiceBroughtForwardInHeader(invoice: Invoice): number {
  const period = invoicePeriodSubtotal(invoice);
  const header = roundMoney(Number(invoice.amount) || 0);
  return roundMoney(Math.max(0, header - period));
}

/** Current amount due: prior unpaid + unpaid on this invoice’s lines. */
export function invoiceAmountDueNow(invoice: Invoice): number {
  if (invoice.grandDue != null) return roundMoney(invoice.grandDue);
  const period = invoicePeriodSubtotal(invoice);
  const paidOnCharges = (invoice.items ?? [])
    .filter((it) => it.type !== "discount")
    .reduce((s, it) => s + (Number(it.paidAmount) || 0), 0);
  const unpaidThis = roundMoney(Math.max(0, period - paidOnCharges));
  return roundMoney(invoicePriorBalanceNow(invoice) + unpaidThis);
}
