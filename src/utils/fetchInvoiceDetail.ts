import type { Invoice } from "../types";

export async function fetchInvoiceDetailById(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load invoice");
  }
  return res.json() as Promise<Invoice>;
}
