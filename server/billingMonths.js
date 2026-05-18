const MONTH_INDEX = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_NAMES = Object.keys(MONTH_INDEX).map(
  (k) => k.charAt(0).toUpperCase() + k.slice(1),
);

function compareCalendarPeriod(monthA, yearA, monthB, yearB) {
  const ta = yearA * 12 + (MONTH_INDEX[String(monthA || "").trim().toLowerCase()] ?? 0);
  const tb = yearB * 12 + (MONTH_INDEX[String(monthB || "").trim().toLowerCase()] ?? 0);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

export function parseBillingMonths(monthStr) {
  if (!monthStr?.trim()) return [];
  const seen = new Set();
  const result = [];
  for (const part of String(monthStr).split(/,\s*|\s*&\s*|\|/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const canonical =
      MONTH_NAMES.find((m) => m.toLowerCase() === key) ??
      t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    result.push(canonical);
  }
  return result;
}

export function sortBillingMonths(months, year) {
  return [...months].sort((a, b) => compareCalendarPeriod(a, year, b, year));
}

export function earliestBillingMonth(monthStr, year) {
  const months = parseBillingMonths(monthStr);
  if (months.length === 0) return String(monthStr || "").trim();
  return sortBillingMonths(months, year)[0];
}

export function billingPeriodOverlaps(invoiceMonthField, targetMonth) {
  const covered = parseBillingMonths(invoiceMonthField);
  const target = String(targetMonth || "").trim().toLowerCase();
  if (covered.length === 0) {
    return String(invoiceMonthField || "").trim().toLowerCase() === target;
  }
  return covered.some((m) => m.toLowerCase() === target);
}

export function invoiceOverlapsAnyMonth(existingMonthField, selectedMonths) {
  for (const m of selectedMonths) {
    if (billingPeriodOverlaps(existingMonthField, m)) return true;
  }
  return false;
}
