import {
  DEFAULT_INVOICE_NUMBER_SETTINGS,
  type InvoiceNumberSequenceDigits,
  type InvoiceNumberStudentPart,
} from "../utils/invoiceNumber";

export interface InvoiceTemplateSettings {
  schoolName: string;
  schoolSubtitle: string;
  schoolNameColor: string;
  schoolSubtitleColor: string;
  logoPath: string | null;
  logoUrl: string | null;
  bankName: string;
  accountTitle: string;
  accountNo: string;
  branchCode: string;
  iban: string;
  footerNote: string;
  invoiceNoPrefix: string;
  invoiceNoStudentPart: InvoiceNumberStudentPart;
  invoiceNoSequenceDigits: InvoiceNumberSequenceDigits;
}

export const DEFAULT_TEMPLATE: InvoiceTemplateSettings = {
  schoolName: "YOUR SCHOOL NAME",
  schoolSubtitle: "DAYCARE & PRESCHOOL",
  schoolNameColor: "#d63384",
  schoolSubtitleColor: "#20c997",
  logoPath: null,
  logoUrl: null,
  bankName: "",
  accountTitle: "",
  accountNo: "",
  branchCode: "",
  iban: "",
  footerNote: "Thank you for your prompt payment. For queries, contact the office during school hours.",
  ...DEFAULT_INVOICE_NUMBER_SETTINGS,
};

let templateCache: InvoiceTemplateSettings = { ...DEFAULT_TEMPLATE };

function getAuthHeaders(includeJsonContentType = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const raw = localStorage.getItem("auth_user");
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: number | string };
      if (parsed?.id != null) {
        headers["X-User-Id"] = String(parsed.id);
      }
    }
  } catch {
    // Ignore malformed local auth cache and let API respond with 401.
  }
  return headers;
}

export function loadInvoiceTemplate(): InvoiceTemplateSettings {
  return { ...templateCache };
}

export function setInvoiceTemplateCache(settings: Partial<InvoiceTemplateSettings>): InvoiceTemplateSettings {
  const merged = { ...DEFAULT_TEMPLATE, ...settings };
  templateCache = {
    ...merged,
    logoUrl: merged.logoPath ? `/api/uploads/${merged.logoPath}` : null,
  };
  return { ...templateCache };
}

export async function fetchInvoiceTemplate(): Promise<InvoiceTemplateSettings> {
  const res = await fetch("/api/invoice-template", {
    method: "GET",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to fetch invoice template");
  }
  const data = (await res.json()) as { settings?: Partial<InvoiceTemplateSettings> };
  return setInvoiceTemplateCache(data.settings ?? {});
}

export async function saveInvoiceTemplate(settings: InvoiceTemplateSettings): Promise<InvoiceTemplateSettings> {
  const payload = {
    ...settings,
    logoUrl: undefined,
  };
  const res = await fetch("/api/invoice-template", {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ settings: payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to save invoice template");
  }
  const data = (await res.json()) as { settings?: Partial<InvoiceTemplateSettings> };
  return setInvoiceTemplateCache(data.settings ?? settings);
}

export async function uploadInvoiceLogo(file: File): Promise<InvoiceTemplateSettings> {
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch("/api/invoice-template/logo", {
    method: "POST",
    headers: getAuthHeaders(false),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to upload logo");
  }
  const data = (await res.json()) as { settings?: Partial<InvoiceTemplateSettings> };
  return setInvoiceTemplateCache(data.settings ?? {});
}

export async function removeInvoiceLogo(): Promise<InvoiceTemplateSettings> {
  const res = await fetch("/api/invoice-template/logo", {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to remove logo");
  }
  const data = (await res.json()) as { settings?: Partial<InvoiceTemplateSettings> };
  return setInvoiceTemplateCache(data.settings ?? {});
}

export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}
