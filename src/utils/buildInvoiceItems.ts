import type {
  CreateInvoiceItemPayload,
  FeeStructure,
  Invoice,
  Student,
  StudentAdditionalCharge,
  StudentFeeOverride,
} from "../types";
import { academicYearStart } from "./academicYear";
import { chargeLineDescription, joinBillingMonths, sortBillingMonths } from "./billingMonths";
import { countAnnualChargeLinesInAcademicYear, countRegistrationLines } from "./invoiceBilling";
import { isRecurringStudentExtra, isStudentAdditionalChargeBillableOnInvoice } from "../components/students/StudentAdditionalChargesList";
import { siblingMonthlyBillingActive } from "./siblingDiscount";

export type BuildInvoiceItemsSuccess = {
  ok: true;
  items: CreateInvoiceItemPayload[];
  periodNet: number;
  monthField: string;
  billingMonths: string[];
};

export type BuildInvoiceItemsFailure = {
  ok: false;
  reason: string;
};

export type BuildInvoiceItemsResult = BuildInvoiceItemsSuccess | BuildInvoiceItemsFailure;

export type BuildInvoiceItemsInput = {
  student: Student;
  allStudents: Student[];
  feeStructure: FeeStructure;
  billingMonths: string[];
  year: number;
  pastInvoices: Invoice[];
  feeOverrides: StudentFeeOverride[];
  additionalCharges: StudentAdditionalCharge[];
  manualLines?: { description: string; amount: number }[];
  discount?: { description: string; amount: number } | null;
};

/** Build charge/discount lines for a new invoice (same rules as single-student create). */
export function buildInvoiceItems(input: BuildInvoiceItemsInput): BuildInvoiceItemsResult {
  const {
    student,
    allStudents,
    feeStructure,
    billingMonths: rawMonths,
    year,
    pastInvoices,
    feeOverrides,
    additionalCharges,
    manualLines = [],
    discount = null,
  } = input;

  const billingMonths = sortBillingMonths(rawMonths, year);
  if (billingMonths.length === 0) {
    return { ok: false, reason: "Select at least one billing month." };
  }

  const monthField = joinBillingMonths(billingMonths, year);
  const primaryMonth = billingMonths[0];
  const ayForThisInvoice = academicYearStart(primaryMonth, year);
  const multiMonth = billingMonths.length > 1;

  const getOverride = (chargeType: string) =>
    feeOverrides.find((o) => o.chargeType === chargeType);

  const items: CreateInvoiceItemPayload[] = [];
  let totalAmount = 0;

  if (feeStructure.monthlyFee) {
    const override = getOverride("monthly");
    if (!override?.isExempt) {
      for (const billingMonth of billingMonths) {
        const monthSuffix = multiMonth ? ` (${billingMonth})` : "";
        const useSibling = siblingMonthlyBillingActive(student, allStudents, billingMonth, year);
        if (useSibling) {
          const pre = Number(student.siblingPreMonthly);
          const post = Number(student.siblingPostMonthly);
          const disc = Math.round((pre - post) * 100) / 100;
          items.push({
            description: `Monthly Fee (before sibling discount)${monthSuffix}`,
            amount: pre,
            type: "charge",
            chargeType: "monthly",
          });
          if (disc > 0) {
            items.push({
              description: `Sibling discount (household)${monthSuffix}`,
              amount: disc,
              type: "discount",
            });
          }
          totalAmount += post;
        } else {
          const amount = override?.amount ?? feeStructure.monthlyFee;
          items.push({
            description: multiMonth ? `Monthly Fee (${billingMonth})` : "Monthly Fee",
            amount,
            type: "charge",
            chargeType: "monthly",
          });
          totalAmount += amount;
        }
      }
    }
  }

  const regSlots = feeStructure.registrationFeeInstallments || 1;
  const regLinesPrior = countRegistrationLines(pastInvoices);

  if (feeStructure.registrationFee && regLinesPrior < regSlots) {
    const override = getOverride("registration");
    if (!override?.isExempt) {
      const baseAmount = override?.amount ?? feeStructure.registrationFee;
      const installmentAmount = feeStructure.registrationFeeInstallments
        ? baseAmount / feeStructure.registrationFeeInstallments
        : baseAmount;
      items.push({
        description: feeStructure.registrationFeeInstallments
          ? `Registration Fee (${feeStructure.registrationFeeInstallments} installments)`
          : "Registration Fee",
        amount: installmentAmount,
        type: "charge",
        chargeType: "registration",
      });
      totalAmount += installmentAmount;
    }
  }

  const annualSlots = feeStructure.annualChargesInstallments || 1;
  const annualLinesAlready = countAnnualChargeLinesInAcademicYear(pastInvoices, ayForThisInvoice);

  if (feeStructure.annualCharges && annualLinesAlready < annualSlots) {
    const override = getOverride("annual");
    if (!override?.isExempt) {
      const baseAmount = override?.amount ?? feeStructure.annualCharges;
      const installmentAmount = feeStructure.annualChargesInstallments
        ? baseAmount / feeStructure.annualChargesInstallments
        : baseAmount;
      items.push({
        description: feeStructure.annualChargesInstallments
          ? `Annual Charges (${feeStructure.annualChargesInstallments} installments)`
          : "Annual Charges",
        amount: installmentAmount,
        type: "charge",
        chargeType: "annual",
      });
      totalAmount += installmentAmount;
    }
  }

  for (const ch of additionalCharges) {
    if (!isStudentAdditionalChargeBillableOnInvoice(ch)) continue;
    if (isRecurringStudentExtra(ch)) {
      for (const billingMonth of billingMonths) {
        items.push({
          description: chargeLineDescription(ch.description, billingMonth, multiMonth),
          amount: ch.amount,
          type: "charge",
          chargeType: "other",
        });
        totalAmount += ch.amount;
      }
    } else {
      items.push({
        description: ch.description,
        amount: ch.amount,
        type: "charge",
        chargeType: "other",
        additionalChargeId: ch.id,
      });
      totalAmount += ch.amount;
    }
  }

  for (const row of manualLines) {
    if (!row.description.trim() || row.amount <= 0) continue;
    items.push({
      description: row.description.trim(),
      amount: row.amount,
      type: "charge",
      chargeType: "other",
    });
    totalAmount += row.amount;
  }

  if (discount?.description && discount.amount > 0) {
    const discDesc = discount.description.trim();
    items.push({
      description: discDesc.toLowerCase().startsWith("discount") ? discDesc : `Discount: ${discDesc}`,
      amount: discount.amount,
      type: "discount",
    });
    totalAmount -= discount.amount;
  }

  const chargeLineCount = items.filter((i) => i.type !== "discount").length;
  if (chargeLineCount === 0) {
    return {
      ok: false,
      reason: "No charges to include (fee plan may be exempt or empty for this period).",
    };
  }

  if (totalAmount <= 0) {
    return {
      ok: false,
      reason: "Invoice total must be greater than zero after discounts.",
    };
  }

  return {
    ok: true,
    items,
    periodNet: totalAmount,
    monthField,
    billingMonths,
  };
}
