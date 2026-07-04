import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, InvoiceItem } from "../types";
import {
  invoiceAmountDueNow,
  invoiceBroughtForwardInHeader,
  invoiceDiscountTotalFromItems,
  invoiceGrossChargesFromItems,
  invoicePeriodSubtotal,
} from "../utils/invoiceBalance";
import { loadInvoiceTemplate, hexToRgb, type InvoiceTemplateSettings } from "./invoiceTemplate";
import { formatBillingPeriodLabel } from "../utils/billingMonths";
import { dueDateForDisplay, invoiceDateForDisplay } from "../utils/invoiceDates";

function fmt(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function imageFormatFromType(value?: string | null): "PNG" | "JPEG" {
  if (!value) return "PNG";
  const t = value.toLowerCase();
  if (t.includes("jpg") || t.includes("jpeg")) return "JPEG";
  return "PNG";
}

async function dataUrlFromImageUrl(url: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch logo image.");
  const blob = await res.blob();
  const format = imageFormatFromType(blob.type);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read logo image."));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format };
}


/** Build jsPDF instance (caller may .save() or .output("blob")) */
export async function buildInvoicePdfDoc(detail: Invoice, template?: InvoiceTemplateSettings): Promise<jsPDF> {
  const t = template ?? loadInvoiceTemplate();
  const isEventInvoice = detail.invoiceKind === "event";
  const eventTitle = detail.eventName
    ? `${String(detail.eventName).toUpperCase()} INVOICE`
    : "EVENT INVOICE";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // ── HEADER: Logo + School Name (centered) ────────────────────────────────
  const logoW = 26;
  const logoH = 26;
  const logoGap = 5;
  const headerTopY = y;

  // Measure text widths to calculate centered block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(42);
  const nameTextW = doc.getTextWidth(t.schoolName);
  doc.setFontSize(32);
  const subtitleTextW = doc.getTextWidth(t.schoolSubtitle);
  const maxTextW = Math.max(nameTextW, subtitleTextW);
  let logoData: { dataUrl: string; format: "PNG" | "JPEG" } | null = null;
  if (t.logoUrl) {
    try {
      logoData = await dataUrlFromImageUrl(t.logoUrl);
    } catch {
      logoData = null;
    }
  }
  const blockW = (logoData ? logoW + logoGap : 0) + maxTextW;
  const blockStartX = (pageW - blockW) / 2;
  const nameX = blockStartX + (logoData ? logoW + logoGap : 0);

  // Logo — vertically centered against the two text lines
  const nameLineH = 16;   // approx mm for 45pt line
  const subtitleLineH = 12; // approx mm for 35pt line
  const totalTextH = nameLineH + subtitleLineH;
  const logoTopY = headerTopY + (totalTextH - logoH) / 2;

  if (logoData) {
    try {
      doc.addImage(logoData.dataUrl, logoData.format, blockStartX, logoTopY, logoW, logoH);
    } catch {
      /* skip if image fails */
    }
  }

  // School name — colored fill + thin black stroke
  const [nr, ng, nb] = hexToRgb(t.schoolNameColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(42);
  doc.setTextColor(nr, ng, nb);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.text(t.schoolName, nameX, headerTopY + nameLineH, { renderingMode: "fillThenStroke" });

  // Subtitle — colored fill + thin black stroke
  const [sr, sg, sb] = hexToRgb(t.schoolSubtitleColor);
  doc.setFontSize(32);
  doc.setTextColor(sr, sg, sb);
  doc.setLineWidth(0.35);
  doc.text(t.schoolSubtitle, nameX, headerTopY + nameLineH + subtitleLineH, { renderingMode: "fillThenStroke" });

  y = headerTopY + totalTextH + 8;

  // ── TITLE: FEE INVOICE ────────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(isEventInvoice ? eventTitle : "FEE INVOICE", pageW / 2, y, { align: "center" });
  y += 6;

  doc.line(margin, y, pageW - margin, y);
  y += 8;

  const labelW = 38;
  const col2X = pageW / 2 + 2;
  const labelFontSize = 9;
  const valueFontSize = 9;
  const rowH = 6;

  const displayName = isEventInvoice
    ? detail.billingName ?? detail.studentName ?? "—"
    : detail.studentName ?? "—";

  const leftRows = isEventInvoice
    ? [
        { label: "Invoice No", value: detail.invoiceNo ?? "—" },
        { label: "Name", value: displayName },
      ]
    : [
        { label: "Invoice No", value: detail.invoiceNo ?? "—" },
        { label: "Student Name", value: displayName },
        { label: "Roll #", value: detail.studentRollNo ?? "—" },
      ];

  const rightRows = isEventInvoice
    ? [{ label: "Invoice Date", value: invoiceDateForDisplay(detail) }]
    : [
        { label: "Due Date", value: dueDateForDisplay(detail.dueDate) },
        { label: "Invoice Date", value: invoiceDateForDisplay(detail) },
        { label: "Billing Month", value: formatBillingPeriodLabel(detail.month, detail.year) },
      ];

  const infoStartY = y;

  for (let i = 0; i < leftRows.length; i++) {
    const rowY = infoStartY + i * rowH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelFontSize);
    doc.setTextColor(15, 23, 42);
    doc.text(leftRows[i].label, margin, rowY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(valueFontSize);
    doc.setTextColor(51, 65, 85);
    doc.text(leftRows[i].value, margin + labelW, rowY);
  }

  for (let i = 0; i < rightRows.length; i++) {
    const rowY = infoStartY + i * rowH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelFontSize);
    doc.setTextColor(15, 23, 42);
    doc.text(rightRows[i].label, col2X, rowY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(valueFontSize);
    doc.setTextColor(51, 65, 85);
    doc.text(rightRows[i].value, col2X + labelW, rowY);
  }

  y = infoStartY + Math.max(leftRows.length, rightRows.length) * rowH + 4;

  // ── ITEMS TABLE ────────────────────────────────────────────────────────────
  const items = detail.items ?? [];

  const body: string[][] = items
    .filter((i: InvoiceItem) => i.type !== "discount")
    .map((i: InvoiceItem) => [i.description, fmt(i.amount)]);

  if (body.length === 0) {
    body.push(["Monthly Fee", fmt(detail.amount)]);
  }

  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Description", styles: { halign: "left" } },
      { content: "Amount", styles: { halign: "right" } },
    ]],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: [15, 23, 42] },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      lineWidth: { bottom: 0.4 },
      lineColor: [30, 30, 30],
    },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
    },
    tableLineColor: [200, 210, 220],
    tableLineWidth: 0,
    didDrawPage: () => { /* no-op */ },
  });

  const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
  y = tableEnd + 4;

  const grossSubtotal = invoiceGrossChargesFromItems(items);
  const discountTotal = invoiceDiscountTotalFromItems(items);
  const broughtForward = invoiceBroughtForwardInHeader(detail);
  const amountDue = invoiceAmountDueNow(detail);

  // ── TOTALS (this period + brought forward + amount due) ───────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  const summaryRows: { label: string; value: number; bold?: boolean }[] = [
    { label: "Subtotal", value: grossSubtotal > 0 ? grossSubtotal : invoicePeriodSubtotal(detail) },
  ];
  if (discountTotal > 0.009) {
    summaryRows.push({ label: "Discount", value: -discountTotal });
  }
  if (!isEventInvoice && broughtForward > 0.009) {
    summaryRows.push({ label: "Previous Unpaid", value: broughtForward });
  }
  summaryRows.push({ label: "Amount due", value: amountDue, bold: true });

  for (const row of summaryRows) {
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.bold ? 10 : 9);
    doc.setTextColor(15, 23, 42);
    doc.text(row.label, margin + 2, y);
    doc.text(fmt(row.value), pageW - margin - 2, y, { align: "right" });
    y += row.bold ? 7 : 6;
  }

  // ── BANK DETAILS ──────────────────────────────────────────────────────────
  const bankRows = [
    { label: "Bank Name", value: t.bankName },
    { label: "Account Title", value: t.accountTitle },
    { label: "Account No", value: t.accountNo },
    { label: "Branch Code", value: t.branchCode },
    { label: "IBAN#", value: t.iban },
  ].filter((r) => r.value);

  if (bankRows.length > 0) {
    y += 22;
    const bankLabelW = 32;

    for (let i = 0; i < bankRows.length; i++) {
      const rowY = y + i * 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(bankRows[i].label, margin, rowY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(bankRows[i].value, margin + bankLabelW, rowY);
    }
  }

  // ── FOOTER NOTE ────────────────────────────────────────────────────────────
  if (t.footerNote) {
    const footerY = bankRows.length > 0 ? y + bankRows.length * 6 + 8 : y + 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const foot = doc.splitTextToSize(t.footerNote, pageW - 2 * margin);
    doc.text(foot, margin, footerY);
  }

  return doc;
}

/** Triggers a direct file download in the browser (no new tab). */
export async function downloadInvoicePdf(detail: Invoice, template?: InvoiceTemplateSettings): Promise<void> {
  const doc = await buildInvoicePdfDoc(detail, template);
  const safe = detail.invoiceNo.replace(/[^\w.-]+/g, "_");
  doc.save(`${safe}.pdf`);
}
