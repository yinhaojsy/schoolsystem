/**
 * School letterhead & footer for PDF invoices.
 * Edit this file to match your school (name, address, notes).
 *
 * Optional logo (advanced): in `buildInvoicePdf.ts`, after creating `doc`, you can call
 * `doc.addImage(base64DataUrl, "PNG", x, y, widthMm, heightMm)` using a PNG/JPEG loaded as
 * base64 (same-origin or inlined) so the PDF does not depend on network fetches at save time.
 */
export const SCHOOL_LETTERHEAD = {
  schoolName: "Your School Name",
  tagline: "Motto or short tagline",
  addressLines: ["123 School Road", "City, Province / State", "Country"],
  phone: "+94 XX XXX XXXX",
  email: "office@yourschool.edu",
  website: "www.yourschool.edu",
  /** Shown in small text at the bottom of the first page */
  footerNote: "Thank you for your prompt payment. For queries, contact the office during school hours.",
};
