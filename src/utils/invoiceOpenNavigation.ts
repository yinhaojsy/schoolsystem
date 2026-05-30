/** Navigate to Invoices and open the detail modal for this invoice id. */
export function invoiceOpenNavigation(invoiceId: number) {
  return `/invoices?openInvoice=${invoiceId}&_n=${Date.now()}`;
}
