import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, InvoiceItem } from "../types";
import { loadInvoiceTemplate, hexToRgb, type InvoiceTemplateSettings } from "./invoiceTemplate";

function fmt(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatInvoiceDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleString("default", { month: "short" });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}


/** Build jsPDF instance (caller may .save() or .output("blob")) */
export function buildInvoicePdfDoc(detail: Invoice, template?: InvoiceTemplateSettings): jsPDF {
  const t = template ?? loadInvoiceTemplate();
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
  const blockW = (t.logoBase64 ? logoW + logoGap : 0) + maxTextW;
  const blockStartX = (pageW - blockW) / 2;
  const nameX = blockStartX + (t.logoBase64 ? logoW + logoGap : 0);

  // Logo — vertically centered against the two text lines
  const nameLineH = 16;   // approx mm for 45pt line
  const subtitleLineH = 12; // approx mm for 35pt line
  const totalTextH = nameLineH + subtitleLineH;
  const logoTopY = headerTopY + (totalTextH - logoH) / 2;

  if (t.logoBase64) {
    try {
      doc.addImage(t.logoBase64, t.logoMimeType, blockStartX, logoTopY, logoW, logoH);
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
  doc.text("FEE INVOICE", pageW / 2, y, { align: "center" });
  y += 6;

  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── STUDENT INFO (2-column grid) ─────────────────────────────────────────
  const labelW = 38;
  const col2X = pageW / 2 + 2;
  const labelFontSize = 9;
  const valueFontSize = 9;
  const rowH = 6;

  const leftRows = [
    { label: "Student Name", value: detail.studentName ?? "—" },
    { label: "Roll #", value: detail.studentRollNo ?? "—" },
  ];

  const invoiceDate = detail.createdAt ? formatInvoiceDate(detail.createdAt) : formatInvoiceDate(new Date().toISOString());

  const rightRows = [
    { label: "Invoice Date", value: invoiceDate },
    { label: "Billing Month", value: `${detail.month} ${detail.year}` },
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

  const discounts = items.filter((i: InvoiceItem) => i.type === "discount");
  for (const d of discounts) {
    body.push([d.description, `(${fmt(d.amount)})`]);
  }

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

  // ── TOTAL ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  const totalValue = detail.amount;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("TOTAL", margin + 2, y);
  doc.text(fmt(totalValue), pageW - margin - 2, y, { align: "right" });

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
export function downloadInvoicePdf(detail: Invoice, template?: InvoiceTemplateSettings): void {
  const doc = buildInvoicePdfDoc(detail, template);
  const safe = detail.invoiceNo.replace(/[^\w.-]+/g, "_");
  doc.save(`${safe}.pdf`);
}
