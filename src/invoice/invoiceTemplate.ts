export interface InvoiceTemplateSettings {
  schoolName: string;
  schoolSubtitle: string;
  schoolNameColor: string;
  schoolSubtitleColor: string;
  logoBase64: string | null;
  logoMimeType: "PNG" | "JPEG";
  bankName: string;
  accountTitle: string;
  accountNo: string;
  branchCode: string;
  iban: string;
  footerNote: string;
}

const STORAGE_KEY = "invoiceTemplateSettings";

export const DEFAULT_TEMPLATE: InvoiceTemplateSettings = {
  schoolName: "YOUR SCHOOL NAME",
  schoolSubtitle: "DAYCARE & PRESCHOOL",
  schoolNameColor: "#d63384",
  schoolSubtitleColor: "#20c997",
  logoBase64: null,
  logoMimeType: "PNG",
  bankName: "",
  accountTitle: "",
  accountNo: "",
  branchCode: "",
  iban: "",
  footerNote: "Thank you for your prompt payment. For queries, contact the office during school hours.",
};

export function loadInvoiceTemplate(): InvoiceTemplateSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_TEMPLATE, ...(JSON.parse(raw) as Partial<InvoiceTemplateSettings>) };
    }
  } catch {
    /* ignore parse errors */
  }
  return { ...DEFAULT_TEMPLATE };
}

export function saveInvoiceTemplate(settings: InvoiceTemplateSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}
