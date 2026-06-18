import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import StatCard from "../components/common/StatCard";
import { useGetMonthlyIncomeReportQuery } from "../services/api";
import { CALENDAR_MONTH_NAMES } from "../utils/academicYear";
import { formatBillingPeriodLabel } from "../utils/billingMonths";
import {
  COLLECTION_TIER_BADGE_CLASS,
  COLLECTION_TIER_LABELS,
} from "../utils/invoiceCollection";
import type { MonthlyIncomeReportInvoice } from "../types";

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState<string>(CALENDAR_MONTH_NAMES[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, isFetching, error } = useGetMonthlyIncomeReportQuery({ month, year });

  const yearOptions = useMemo(() => {
    const fromApi = data?.availableYears ?? [];
    const merged = new Set([year, ...fromApi, now.getFullYear()]);
    return [...merged].sort((a, b) => b - a);
  }, [data?.availableYears, year, now]);

  const collectionRate = useMemo(() => {
    const billed = data?.summary.totalBilled ?? 0;
    const collected = data?.summary.cashCollected ?? 0;
    if (billed <= 0) return null;
    return Math.round((collected / billed) * 1000) / 10;
  }, [data?.summary]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Monthly Income Report"
        subtitle="Invoice-wise billing for the selected period. Amounts are attributed to the invoice billing month, not the payment date. Partial payments are included in cash collected."
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Billing month</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
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
              onChange={(e) => setYear(Number(e.target.value))}
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
      </SectionCard>

      {isLoading ? (
        <div className="py-10 text-center text-slate-600">Loading report…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          Could not load the report. Please try again.
        </div>
      ) : (
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
      )}
    </div>
  );
}
