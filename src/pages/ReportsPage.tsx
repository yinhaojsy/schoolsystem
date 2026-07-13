import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import StatCard from "../components/common/StatCard";
import {
  useGetMonthlyIncomeReportQuery,
  useGetMonthlyExpenseReportQuery,
} from "../services/api";
import { CALENDAR_MONTH_NAMES } from "../utils/academicYear";
import { formatBillingPeriodLabel } from "../utils/billingMonths";
import {
  COLLECTION_TIER_BADGE_CLASS,
  COLLECTION_TIER_LABELS,
} from "../utils/invoiceCollection";
import type { Expense, MonthlyIncomeReportInvoice } from "../types";

type ReportTab = "income" | "expenses";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(n: number): string {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

const CATEGORY_BAR_COLORS = [
  "bg-teal-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-rose-500",
];

interface ExpenseCategoryGroup {
  categoryId: number;
  categoryName: string;
  totalAmount: number;
  includedAmount: number;
  includedCount: number;
  expenses: Expense[];
}

function isExpenseIncluded(
  expense: Expense,
  excludedCategoryIds: Set<number>,
  excludedExpenseIds: Set<number>,
): boolean {
  if (excludedCategoryIds.has(expense.categoryId)) return false;
  if (excludedExpenseIds.has(expense.id)) return false;
  return true;
}

function toggleSetMember(set: Set<number>, id: number): Set<number> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function CollectionBadge({ tier }: { tier: MonthlyIncomeReportInvoice["collectionTier"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${COLLECTION_TIER_BADGE_CLASS[tier]}`}
    >
      {COLLECTION_TIER_LABELS[tier]}
    </span>
  );
}

function MonthYearFilters({
  month,
  year,
  yearOptions,
  onMonthChange,
  onYearChange,
  monthLabel,
  isFetching,
  isLoading,
}: {
  month: string;
  year: number;
  yearOptions: number[];
  onMonthChange: (month: string) => void;
  onYearChange: (year: number) => void;
  monthLabel: string;
  isFetching: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{monthLabel}</span>
        <select
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {CALENDAR_MONTH_NAMES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Year</span>
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {isFetching && !isLoading ? (
        <span className="pb-2 text-sm text-slate-500">Refreshing…</span>
      ) : null}
    </div>
  );
}

function IncomeReportTab({ month, year }: { month: string; year: number }) {
  const { data, isLoading, error } = useGetMonthlyIncomeReportQuery({ month, year });

  const collectionRate = useMemo(() => {
    const billed = data?.summary.totalBilled ?? 0;
    const collected = data?.summary.cashCollected ?? 0;
    if (billed <= 0) return null;
    return Math.round((collected / billed) * 1000) / 10;
  }, [data?.summary]);

  if (isLoading) {
    return <div className="py-10 text-center text-slate-600">Loading report…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        Could not load the income report. Please try again.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Billed"
          value={formatMoney(data?.summary.totalBilled ?? 0)}
          className="border-slate-200 bg-white"
        />
        <StatCard
          title="Cash Collected"
          value={formatMoney(data?.summary.cashCollected ?? 0)}
          className="border-emerald-200 bg-emerald-50"
        />
        <StatCard
          title="Outstanding Receivable"
          value={formatMoney(data?.summary.outstandingReceivable ?? 0)}
          className="border-amber-200 bg-amber-50"
        />
        <StatCard
          title="Invoices"
          value={String(data?.summary.invoiceCount ?? 0)}
          className="border-blue-200 bg-blue-50"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        <span className="font-semibold text-slate-900">
          {month} {year}
        </span>
        {" · "}
        {data?.summary.invoiceCount ?? 0} invoice{(data?.summary.invoiceCount ?? 0) === 1 ? "" : "s"}
        {collectionRate != null ? (
          <>
            {" · "}
            Collection rate: <span className="font-semibold text-slate-900">{collectionRate}%</span>
          </>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Invoices covering multiple months (e.g. June and July together) are counted in their first billing month
          only. Batch billing and &ldquo;already billed&rdquo; checks are unchanged.
        </p>
      </div>

      <SectionCard title="Invoice detail">
        {(data?.invoices.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-600">No invoices billed for {month} {year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Invoice</th>
                  <th className="py-3 pr-4 font-semibold">Student</th>
                  <th className="py-3 pr-4 font-semibold">Billing period</th>
                  <th className="py-3 pr-4 font-semibold text-right">Billed</th>
                  <th className="py-3 pr-4 font-semibold text-right">Cash collected</th>
                  <th className="py-3 pr-4 font-semibold text-right">Outstanding</th>
                  <th className="py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.invoices.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900">{row.invoiceNo}</div>
                      <div className="text-xs text-slate-500">
                        {row.invoiceDate ? `Issued ${row.invoiceDate}` : null}
                        {row.invoiceDate && row.dueDate ? " · " : null}
                        {row.dueDate ? `Due ${row.dueDate.slice(0, 10)}` : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">{row.studentName}</div>
                      <div className="text-xs text-slate-500">
                        {row.studentRollNo}
                        {row.classGroupName ? ` · ${row.classGroupName}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {formatBillingPeriodLabel(row.billingMonth, row.billingYear)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums font-medium text-slate-900">
                      {formatMoney(row.billedAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">
                      {formatMoney(row.cashCollected)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-amber-700">
                      {formatMoney(row.outstandingReceivable)}
                    </td>
                    <td className="py-3">
                      <CollectionBadge tier={row.collectionTier} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td className="py-3 pr-4" colSpan={3}>
                    Totals
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatMoney(data?.summary.totalBilled ?? 0)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">
                    {formatMoney(data?.summary.cashCollected ?? 0)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-amber-700">
                    {formatMoney(data?.summary.outstandingReceivable ?? 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-slate-500">
        Billed amounts use net invoice charges (after discounts). Cash collected includes partial
        payments allocated to each invoice regardless of when payment was received. View or record
        payments on the{" "}
        <Link to="/invoices" className="font-semibold text-blue-700 hover:underline">
          Invoices
        </Link>{" "}
        page.
      </p>
    </>
  );
}

function ExpenseReportTab({ month, year }: { month: string; year: number }) {
  const { data, isLoading, error } = useGetMonthlyExpenseReportQuery({ month, year });
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<number>>(new Set());
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<number>>(new Set());
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    setExcludedCategoryIds(new Set());
    setExcludedExpenseIds(new Set());
    setExpandedCategoryId(null);
  }, [month, year]);

  const analysis = useMemo(() => {
    const allExpenses = data?.expenses ?? [];
    const fullTotal = data?.summary.totalAmount ?? 0;

    const groupMap = new Map<number, ExpenseCategoryGroup>();
    for (const expense of allExpenses) {
      const included = isExpenseIncluded(expense, excludedCategoryIds, excludedExpenseIds);
      const existing = groupMap.get(expense.categoryId);
      if (existing) {
        existing.totalAmount += expense.amount;
        existing.expenses.push(expense);
        if (included) {
          existing.includedAmount += expense.amount;
          existing.includedCount += 1;
        }
      } else {
        groupMap.set(expense.categoryId, {
          categoryId: expense.categoryId,
          categoryName: expense.categoryName ?? "Uncategorized",
          totalAmount: expense.amount,
          includedAmount: included ? expense.amount : 0,
          includedCount: included ? 1 : 0,
          expenses: [expense],
        });
      }
    }

    const effectiveTotal = allExpenses.reduce((sum, expense) => {
      if (!isExpenseIncluded(expense, excludedCategoryIds, excludedExpenseIds)) return sum;
      return sum + expense.amount;
    }, 0);

    const includedCount = allExpenses.filter((expense) =>
      isExpenseIncluded(expense, excludedCategoryIds, excludedExpenseIds),
    ).length;

    const categories = [...groupMap.values()]
      .map((category) => ({
        ...category,
        percentage: effectiveTotal > 0 ? (category.includedAmount / effectiveTotal) * 100 : 0,
        categoryExcluded: excludedCategoryIds.has(category.categoryId),
      }))
      .sort((a, b) => {
        if (a.includedAmount !== b.includedAmount) return b.includedAmount - a.includedAmount;
        return b.totalAmount - a.totalAmount;
      });

    const includedCategoryCount = categories.filter((c) => c.includedAmount > 0).length;

    return {
      allExpenses,
      fullTotal,
      effectiveTotal,
      excludedTotal: fullTotal - effectiveTotal,
      includedCount,
      excludedCount: allExpenses.length - includedCount,
      categories,
      includedCategoryCount,
      hasExclusions: excludedCategoryIds.size > 0 || excludedExpenseIds.size > 0,
    };
  }, [data?.expenses, data?.summary.totalAmount, excludedCategoryIds, excludedExpenseIds]);

  const handleToggleCategory = (categoryId: number, categoryExcluded: boolean) => {
    setExcludedCategoryIds((prev) => toggleSetMember(prev, categoryId));
    if (!categoryExcluded && expandedCategoryId === categoryId) {
      setExpandedCategoryId(null);
    }
  };

  const handleToggleExpense = (expenseId: number) => {
    setExcludedExpenseIds((prev) => toggleSetMember(prev, expenseId));
  };

  const handleResetExclusions = () => {
    setExcludedCategoryIds(new Set());
    setExcludedExpenseIds(new Set());
  };

  if (isLoading) {
    return <div className="py-10 text-center text-slate-600">Loading report…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        Could not load the expense report. Please try again.
      </div>
    );
  }

  return (
    <>
      <div className={`grid gap-4 sm:grid-cols-2 ${analysis.hasExclusions ? "xl:grid-cols-3" : ""}`}>
        <StatCard
          title={analysis.hasExclusions ? "Adjusted total" : "Total expenses"}
          value={formatMoney(analysis.effectiveTotal)}
          className="border-rose-200 bg-rose-50"
        />
        <StatCard
          title="Included entries"
          value={String(analysis.includedCount)}
          className="border-slate-200 bg-white"
        />
        {analysis.hasExclusions ? (
          <StatCard
            title="Excluded"
            value={formatMoney(analysis.excludedTotal)}
            className="border-amber-200 bg-amber-50"
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        <span className="font-semibold text-slate-900">
          {month} {year}
        </span>
        {" · "}
        {analysis.includedCategoryCount} of {analysis.categories.length} categor
        {analysis.categories.length === 1 ? "y" : "ies"}
        {" · "}
        {analysis.includedCount} of {analysis.allExpenses.length} expense
        {analysis.allExpenses.length === 1 ? "" : "s"}
        {" · "}
        Total:{" "}
        <span className="font-semibold text-rose-700">{formatMoney(analysis.effectiveTotal)}</span>
        {analysis.hasExclusions ? (
          <>
            {" "}
            <span className="text-slate-500">
              (full month: {formatMoney(analysis.fullTotal)})
            </span>
          </>
        ) : null}
      </div>

      <SectionCard
        title="Spending distribution"
        subtitle="Uncheck a category or expense to exclude it and recalculate totals and percentages."
      >
        {analysis.allExpenses.length === 0 ? (
          <p className="text-sm text-slate-600">No expenses recorded for {month} {year}.</p>
        ) : analysis.includedCount === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              All expenses are excluded. Adjust your selections to see the distribution.
            </p>
            <button
              type="button"
              onClick={handleResetExclusions}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset exclusions
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Percentages are based on included expenses only ({formatMoney(analysis.effectiveTotal)}).
              </p>
              {analysis.hasExclusions ? (
                <button
                  type="button"
                  onClick={handleResetExclusions}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset exclusions
                </button>
              ) : null}
            </div>

            <ul className="divide-y divide-slate-100">
              {analysis.categories.map((category, index) => {
                const isExpanded = expandedCategoryId === category.categoryId;
                const barColor = CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length];
                const categoryIncluded = !category.categoryExcluded;

                return (
                  <li key={category.categoryId} className="py-3 first:pt-0 last:pb-0">
                    <div
                      className={`flex items-start gap-3 ${categoryIncluded && category.includedAmount > 0 ? "" : "opacity-60"}`}
                    >
                      <input
                        type="checkbox"
                        checked={categoryIncluded}
                        onChange={() => handleToggleCategory(category.categoryId, category.categoryExcluded)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        aria-label={`Include category ${category.categoryName}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCategoryId((prev) =>
                            prev === category.categoryId ? null : category.categoryId,
                          )
                        }
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-5 shrink-0 text-sm font-medium text-slate-400 tabular-nums">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                              <span
                                className={`font-semibold text-slate-900 ${categoryIncluded && category.includedAmount > 0 ? "" : "line-through"}`}
                              >
                                {category.categoryName}
                              </span>
                              <span
                                className={`shrink-0 tabular-nums font-semibold text-slate-900 ${categoryIncluded && category.includedAmount > 0 ? "" : "line-through"}`}
                              >
                                {formatMoney(category.includedAmount > 0 ? category.includedAmount : category.totalAmount)}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${barColor}`}
                                  style={{ width: `${Math.min(category.percentage, 100)}%` }}
                                />
                              </div>
                              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">
                                {category.includedAmount > 0 ? formatPercent(category.percentage) : "—"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {category.includedCount} of {category.expenses.length} expense
                              {category.expenses.length === 1 ? "" : "s"} included
                              {category.categoryExcluded ? " · category excluded" : null}
                            </p>
                          </div>
                          <span
                            className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            aria-hidden
                          >
                            ▾
                          </span>
                        </div>
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-3 ml-7 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/80">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                              <th className="w-10 py-2.5 pl-3 pr-2 font-semibold">Incl.</th>
                              <th className="py-2.5 pr-4 font-semibold">Date</th>
                              <th className="py-2.5 pr-4 font-semibold">Description</th>
                              <th className="py-2.5 pr-4 font-semibold text-right">Amount</th>
                              <th className="py-2.5 pr-3 font-semibold">Proof</th>
                            </tr>
                          </thead>
                          <tbody>
                            {category.expenses.map((expense) => {
                              const expenseIncluded =
                                categoryIncluded &&
                                isExpenseIncluded(expense, excludedCategoryIds, excludedExpenseIds);

                              return (
                                <tr
                                  key={expense.id}
                                  className={`border-b border-slate-100 last:border-0 ${expenseIncluded ? "" : "opacity-60"}`}
                                >
                                  <td className="py-2.5 pl-3 pr-2">
                                    <input
                                      type="checkbox"
                                      checked={expenseIncluded}
                                      disabled={category.categoryExcluded}
                                      onChange={() => handleToggleExpense(expense.id)}
                                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label={`Include expense ${expense.description}`}
                                    />
                                  </td>
                                  <td className="py-2.5 pr-4 text-slate-700">{expense.expenseDate}</td>
                                  <td
                                    className={`py-2.5 pr-4 font-medium text-slate-900 ${expenseIncluded ? "" : "line-through"}`}
                                  >
                                    {expense.description}
                                  </td>
                                  <td
                                    className={`py-2.5 pr-4 text-right tabular-nums font-medium text-rose-700 ${expenseIncluded ? "" : "line-through"}`}
                                  >
                                    {formatMoney(expense.amount)}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    {expense.proofImageUrl ? (
                                      <a
                                        href={expense.proofImageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block"
                                      >
                                        <img
                                          src={expense.proofImageUrl}
                                          alt="Payment proof"
                                          className="h-8 w-8 rounded border border-slate-200 object-cover"
                                        />
                                      </a>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 font-semibold text-slate-900">
                              <td className="py-2.5 pl-3" colSpan={3}>
                                Subtotal (included)
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-rose-700">
                                {formatMoney(category.includedAmount)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-slate-500">
        Expenses are grouped by the date recorded on each entry, not the date they were added to the
        system. Record new expenses on the{" "}
        <Link to="/expenses" className="font-semibold text-blue-700 hover:underline">
          Expenses
        </Link>{" "}
        page.
      </p>
    </>
  );
}

export default function ReportsPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<ReportTab>("income");
  const [month, setMonth] = useState<string>(CALENDAR_MONTH_NAMES[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());

  const incomeQuery = useGetMonthlyIncomeReportQuery({ month, year }, { skip: activeTab !== "income" });
  const expenseQuery = useGetMonthlyExpenseReportQuery({ month, year }, { skip: activeTab !== "expenses" });

  const activeQuery = activeTab === "income" ? incomeQuery : expenseQuery;

  const yearOptions = useMemo(() => {
    const fromApi = activeQuery.data?.availableYears ?? [];
    const merged = new Set([year, ...fromApi, now.getFullYear()]);
    return [...merged].sort((a, b) => b - a);
  }, [activeQuery.data?.availableYears, year, now]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("income")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "income" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Income
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("expenses")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "expenses" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Expenses
        </button>
      </div>

      <SectionCard
        title={activeTab === "income" ? "Monthly Income Report" : "Monthly Expense Report"}
        subtitle={
          activeTab === "income"
            ? "Invoice-wise billing for the selected period. Amounts are attributed to the invoice billing month, not the payment date. Partial payments are included in cash collected."
            : "Category-wise spending for the selected month. Exclude categories or individual entries to explore adjusted totals."
        }
      >
        <MonthYearFilters
          month={month}
          year={year}
          yearOptions={yearOptions}
          onMonthChange={setMonth}
          onYearChange={setYear}
          monthLabel={activeTab === "income" ? "Billing month" : "Month"}
          isFetching={activeQuery.isFetching}
          isLoading={activeQuery.isLoading}
        />
      </SectionCard>

      {activeTab === "income" ? (
        <IncomeReportTab month={month} year={year} />
      ) : (
        <ExpenseReportTab month={month} year={year} />
      )}
    </div>
  );
}
