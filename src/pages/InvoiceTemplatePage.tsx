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

// ── Sample invoice for preview / test PDF ────────────────────────────────────
const SAMPLE_INVOICE: Invoice = {
  id: 0,
  studentId: 0,
  invoiceNo: "INV-SAMPLE",
  month: "May",
  year: 2026,
  amount: 13000,
  dueDate: new Date().toISOString().split("T")[0],
  status: "pending",
  createdAt: new Date().toISOString(),
  studentName: "Sample Student",
  studentRollNo: "001",
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

  const today = new Date();
  const invoiceDate = `${today.getDate()}-${today.toLocaleString("default", { month: "short" })}-${today.getFullYear()}`;

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
            <span className="font-bold w-28 shrink-0">Invoice Date</span>
            <span>{invoiceDate}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold w-28 shrink-0">Billing Month</span>
            <span>{invoice.month} {invoice.year}</span>
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
  const [activeTab, setActiveTab] = useState<"branding" | "bank" | "preview">("branding");
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
      const doc = buildInvoicePdfDoc(SAMPLE_INVOICE, settings);
      doc.save("sample-invoice.pdf");
    } catch (e) {
      setAlertModal({ isOpen: true, message: "Failed to generate PDF. Check your logo image.", type: "error" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "branding", label: "School Branding" },
    { id: "bank", label: "Bank Details" },
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

      {/* ── PREVIEW TAB ──────────────────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <SectionCard title="Live Preview">
          <p className="text-sm text-slate-600 mb-4">
            This is how your invoice will look. Save your settings first, then use{" "}
            <strong>Download Sample PDF</strong> to verify the actual PDF output.
          </p>
          <InvoicePreview template={settings} invoice={SAMPLE_INVOICE} />
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
