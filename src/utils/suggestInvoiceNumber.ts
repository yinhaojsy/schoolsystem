import { fetchInvoiceTemplate, loadInvoiceTemplate } from "../invoice/invoiceTemplate";
import type { InvoiceNumberSettings } from "./invoiceNumber";

export async function suggestInvoiceNumber(
  studentId: number,
  invoiceDate: string,
  numbering?: InvoiceNumberSettings,
): Promise<string> {
  let t = loadInvoiceTemplate();
  try {
    t = await fetchInvoiceTemplate();
  } catch {
    // Keep using cached/default settings if template API is unavailable.
  }
  const settings = numbering ?? {
    invoiceNoPrefix: t.invoiceNoPrefix,
    invoiceNoStudentPart: t.invoiceNoStudentPart,
    invoiceNoSequenceDigits: t.invoiceNoSequenceDigits,
  };
  const res = await fetch("/api/invoices/suggest-number", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, invoiceDate, numbering: settings }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to suggest invoice number");
  }
  const data = (await res.json()) as { invoiceNo: string };
  return data.invoiceNo;
}
