import { useState, useRef, useCallback, useEffect } from "react";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import {
  loadInvoiceTemplate,
  saveInvoiceTemplate,
  DEFAULT_TEMPLATE,
  type InvoiceTemplateSettings,
} from "../invoice/invoiceTemplate";
import { buildInvoicePdfDoc } from "../invoice/buildInvoicePdf";
import type { Invoice } from "../types";
import { formatBillingPeriodLabel } from "../utils/billingMonths";
import {
  billingDefaultsFromInvoiceDate,
  dueDateForDisplay,
  invoiceDateForDisplay,
  todayYmd,
} from "../utils/invoiceDates";
import {
  buildInvoiceNumber,
  describeInvoiceNumberPattern,
  type InvoiceNumberSequenceDigits,
  type InvoiceNumberStudentPart,
} from "../utils/invoiceNumber";

// ── Sample invoice for preview / test PDF ────────────────────────────────────
const SAMPLE_INVOICE_DATE = "2026-05-01";
const sampleBilling = billingDefaultsFromInvoiceDate(SAMPLE_INVOICE_DATE)!;
const SAMPLE_INVOICE: Invoice = {
  id: 0,
  studentId: 0,
  invoiceNo: "INV-32202605001",
  month: sampleBilling.months[0],
  year: sampleBilling.year,
  amount: 13000,
  invoiceDate: SAMPLE_INVOICE_DATE,
  dueDate: sampleBilling.dueDate,
  status: "pending",
  createdAt: new Date().toISOString(),
  studentName: "Sample Student",
  studentRollNo: "32",
  classGroupName: "Class A",
  items: [{ description: "Monthly Fee", amount: 13000, type: "charge", chargeType: "monthly" }],
} as Invoice & { admissionDate?: string };

// ── Helpers ────────────────────────────────────────────────────────────────────
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stripMimePrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function detectMimeType(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

// ── Live invoice preview (HTML) ───────────────────────────────────────────────
function InvoicePreview({
  template,
  invoice,
}: {
  template: InvoiceTemplateSettings;
  invoice: Invoice;
}) {
  const logoSrc = template.logoBase64
    ? `data:image/${template.logoMimeType === "PNG" ? "png" : "jpeg"};base64,${template.logoBase64}`
    : null;

  const items = invoice.items ?? [];
  const charges = items.filter((i) => i.type !== "discount");
  const discounts = items.filter((i) => i.type === "discount");

  const bankRows = [
    { label: "Bank Name", value: template.bankName },
    { label: "Account Title", value: template.accountTitle },
    { label: "Account No", value: template.accountNo },
    { label: "Branch Code", value: template.branchCode },
    { label: "IBAN#", value: template.iban },
  ].filter((r) => r.value);

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl shadow-sm mx-auto p-8 text-slate-900"
      style={{ width: "100%", maxWidth: 560, fontFamily: "Arial, sans-serif", fontSize: 12 }}
    >
      {/* Header — centered */}
      <div className="flex items-center justify-center gap-4 mb-4">
        {logoSrc ? (
          <img src={logoSrc} alt="School logo" className="w-16 h-16 object-contain shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs shrink-0">
            Logo
          </div>
        )}
        <div className="text-center">
          <div
            className="font-extrabold leading-tight"
            style={{
              fontSize: "2.2rem",
              color: template.schoolNameColor,
              WebkitTextStroke: "1px black",
            }}
          >
            {template.schoolName || "YOUR SCHOOL NAME"}
          </div>
          <div
            className="font-bold leading-tight"
            style={{
              fontSize: "1.65rem",
              color: template.schoolSubtitleColor,
              WebkitTextStroke: "0.8px black",
            }}
          >
            {template.schoolSubtitle || "SUBTITLE"}
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="border-t border-b border-slate-800 py-2 text-center font-bold text-sm tracking-wider mb-4">
        FEE INVOICE
      </div>

      {/* Student Info */}
      <div className="grid grid-cols-2 gap-x-4 mb-4 text-xs">
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Invoice No</span>
            <span>{invoice.invoiceNo}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Student Name</span>
            <span>{invoice.studentName}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Roll #</span>
            <span>{invoice.studentRollNo}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Due Date</span>
            <span>{dueDateForDisplay(invoice.dueDate)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Invoice Date</span>
            <span>{invoiceDateForDisplay(invoice)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Billing Month</span>
            <span>{formatBillingPeriodLabel(invoice.month, invoice.year)}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-xs mb-0">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left py-1.5 font-bold">Description</th>
            <th className="text-right py-1.5 font-bold pr-0">Amount</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((item, idx) => (
            <tr key={idx}>
              <td className="py-1.5">{item.description}</td>
              <td className="text-right py-1.5">{Number(item.amount).toLocaleString()}</td>
            </tr>
          ))}
          {discounts.map((item, idx) => (
            <tr key={`d-${idx}`} className="text-slate-500">
              <td className="py-1.5">{item.description}</td>
              <td className="text-right py-1.5">({Number(item.amount).toLocaleString()})</td>
            </tr>
          ))}
          {/* spacer rows to make it look like the screenshot */}
          {Array.from({ length: Math.max(0, 3 - charges.length) }).map((_, i) => (
            <tr key={`spacer-${i}`}>
              <td className="py-1.5">&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="border-t border-slate-800 mt-1 flex justify-between font-bold py-2 text-sm">
        <span>TOTAL</span>
        <span>{Number(invoice.amount).toLocaleString()}</span>
      </div>

      {/* Spacer */}
      <div className="mt-6" />

      {/* Bank Details */}
      {bankRows.length > 0 && (
        <div className="mt-4 text-xs space-y-1.5">
          {bankRows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <span className="font-bold w-28 shrink-0">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Color picker field ─────────────────────────────────────────────────────────
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-slate-300 p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

// ── Text field ────────────────────────────────────────────────────────────────
function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function InvoiceTemplatePage() {
  const [settings, setSettings] = useState<InvoiceTemplateSettings>(() => loadInvoiceTemplate());
  const [saved, setSaved] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: "error" | "success" | "info" | "warning" }>({
    isOpen: false,
    message: "",
    type: "success",
  });
  const [activeTab, setActiveTab] = useState<"branding" | "bank" | "numbering" | "preview">("branding");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reload from storage on mount (in case another tab saved)
  useEffect(() => {
    setSettings(loadInvoiceTemplate());
  }, []);

  const update = useCallback(<K extends keyof InvoiceTemplateSettings>(
    key: K,
    value: InvoiceTemplateSettings[K],
  ) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAlertModal({ isOpen: true, message: "Please upload an image file (PNG or JPEG).", type: "error" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAlertModal({ isOpen: true, message: "Image must be under 2 MB.", type: "error" });
      return;
    }
    try {
      const dataUrl = await toBase64(file);
      const mimeType = detectMimeType(dataUrl);
      const base64 = stripMimePrefix(dataUrl);
      setSaved(false);
      setSettings((prev) => ({ ...prev, logoBase64: base64, logoMimeType: mimeType }));
    } catch {
      setAlertModal({ isOpen: true, message: "Failed to read image file.", type: "error" });
    }
    // reset input so same file can be re-uploaded
    e.target.value = "";
  };

  const handleSave = () => {
    saveInvoiceTemplate(settings);
    setSaved(true);
    setAlertModal({ isOpen: true, message: "Invoice template saved! All future PDFs will use this design.", type: "success" });
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_TEMPLATE });
    setSaved(false);
  };

  const handleTestPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const doc = buildInvoicePdfDoc(previewInvoice, settings);
      doc.save("sample-invoice.pdf");
    } catch (e) {
      setAlertModal({ isOpen: true, message: "Failed to generate PDF. Check your logo image.", type: "error" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const previewInvoice: Invoice = {
    ...SAMPLE_INVOICE,
    invoiceNo: buildInvoiceNumber(
      {
        invoiceNoPrefix: settings.invoiceNoPrefix,
        invoiceNoStudentPart: settings.invoiceNoStudentPart,
        invoiceNoSequenceDigits: settings.invoiceNoSequenceDigits,
      },
      { rollNo: SAMPLE_INVOICE.studentRollNo, name: SAMPLE_INVOICE.studentName },
      SAMPLE_INVOICE.invoiceDate ?? todayYmd(),
      1,
    ),
  };

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "branding", label: "School Branding" },
    { id: "bank", label: "Bank Details" },
    { id: "numbering", label: "Invoice Number" },
    { id: "preview", label: "Live Preview" },
  ];

  return (
    <div className="space-y-6">
      {/* Tab header */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors rounded-t-lg border-b-2 ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700 bg-blue-50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── BRANDING TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "branding" && (
        <SectionCard title="School Branding">
          <div className="space-y-6">
            <p className="text-sm text-slate-600">
              Configure your school name, colors, and logo. These appear on every PDF invoice.
            </p>

            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">School Logo</label>
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                  {settings.logoBase64 ? (
                    <img
                      src={`data:image/${settings.logoMimeType === "PNG" ? "png" : "jpeg"};base64,${settings.logoBase64}`}
                      alt="Logo preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400 text-center px-2">No logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => void handleLogoUpload(e)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Upload Logo
                  </button>
                  {settings.logoBase64 && (
                    <button
                      type="button"
                      onClick={() => update("logoBase64", null)}
                      className="block text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove logo
                    </button>
                  )}
                  <p className="text-xs text-slate-500">PNG or JPEG, max 2 MB. Appears top-left on the invoice.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="School Name (main title)"
                value={settings.schoolName}
                onChange={(v) => update("schoolName", v)}
                placeholder="SPROUTS VALLEY"
              />
              <TextField
                label="School Subtitle"
                value={settings.schoolSubtitle}
                onChange={(v) => update("schoolSubtitle", v)}
                placeholder="DAYCARE & PRESCHOOL"
              />
              <ColorField
                label="School Name Color"
                value={settings.schoolNameColor}
                onChange={(v) => update("schoolNameColor", v)}
              />
              <ColorField
                label="Subtitle Color"
                value={settings.schoolSubtitleColor}
                onChange={(v) => update("schoolSubtitleColor", v)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Footer Note</label>
              <textarea
                value={settings.footerNote}
                onChange={(e) => update("footerNote", e.target.value)}
                rows={2}
                placeholder="Thank you for your prompt payment..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">Shown in small italic text at the bottom of the PDF.</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── BANK TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === "bank" && (
        <SectionCard title="Bank Details">
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              These details appear at the bottom of every invoice so parents know where to deposit fees.
              Leave fields blank to hide them.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Bank Name"
                value={settings.bankName}
                onChange={(v) => update("bankName", v)}
                placeholder="United Bank Limited"
              />
              <TextField
                label="Account Title"
                value={settings.accountTitle}
                onChange={(v) => update("accountTitle", v)}
                placeholder="SPROUTS VALLEY"
              />
              <TextField
                label="Account Number"
                value={settings.accountNo}
                onChange={(v) => update("accountNo", v)}
                placeholder="337820661"
              />
              <TextField
                label="Branch Code"
                value={settings.branchCode}
                onChange={(v) => update("branchCode", v)}
                placeholder="459"
              />
              <div className="md:col-span-2">
                <TextField
                  label="IBAN #"
                  value={settings.iban}
                  onChange={(v) => update("iban", v)}
                  placeholder="PK48UNIL0109000337820661"
                />
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── INVOICE NUMBER TAB ───────────────────────────────────────────────── */}
      {activeTab === "numbering" && (
        <SectionCard title="Invoice Number Format">
          <div className="space-y-6">
            <p className="text-sm text-slate-600">
              Configure how invoice numbers are built when you create invoices. The sequence increments for each
              new invoice in the same calendar month (from the invoice date).
            </p>
            <p className="text-sm font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Pattern: {describeInvoiceNumberPattern(settings)}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Prefix (optional)"
                value={settings.invoiceNoPrefix}
                onChange={(v) => update("invoiceNoPrefix", v)}
                placeholder="INV"
                hint='Shown before a hyphen, e.g. "INV" → INV-32202605001. Leave empty for no prefix.'
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Student identifier</label>
                <select
                  value={settings.invoiceNoStudentPart}
                  onChange={(e) =>
                    update("invoiceNoStudentPart", e.target.value as InvoiceNumberStudentPart)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="rollNo">Roll #</option>
                  <option value="studentName">Student name</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Roll # uses the roll as-is (e.g. 32). Name uses uppercase letters and numbers only.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sequence padding</label>
                <select
                  value={String(settings.invoiceNoSequenceDigits)}
                  onChange={(e) =>
                    update("invoiceNoSequenceDigits", Number(e.target.value) as InvoiceNumberSequenceDigits)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="3">3 digits (001, 002, …)</option>
                  <option value="4">4 digits (0001, 0002, …)</option>
                </select>
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-950 mb-1">Example (preview)</p>
              <p className="text-sm text-blue-900">
                Roll # <strong>32</strong>, invoice date <strong>May 2026</strong>, first invoice that month:
              </p>
              <p className="mt-2 text-lg font-mono font-bold text-blue-950">{previewInvoice.invoiceNo}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── PREVIEW TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <SectionCard title="Live Preview">
          <p className="text-sm text-slate-600 mb-4">
            This is how your invoice will look. Save your settings first, then use{" "}
            <strong>Download Sample PDF</strong> to verify the actual PDF output.
          </p>
          <InvoicePreview template={settings} invoice={previewInvoice} />
        </SectionCard>
      )}

      {/* ── SAVE / ACTIONS ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          {saved ? "Saved ✓" : "Save Template"}
        </button>
        <button
          type="button"
          onClick={handleTestPdf}
          disabled={isGeneratingPdf}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGeneratingPdf ? "Generating…" : "Download Sample PDF"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Reset to Defaults
        </button>
        {!saved && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false, message: "", type: "success" })}
      />
    </div>
  );
}
