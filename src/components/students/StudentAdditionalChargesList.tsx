import type { StudentAdditionalCharge } from "../../types";
import {
  useUpdateStudentAdditionalChargeMutation,
  useDeleteStudentAdditionalChargeMutation,
} from "../../services/api";

export type ExtraChargesNotify = (
  message: string,
  type: "error" | "warning" | "success" | "info",
) => void;

/** Legacy rows without `active` behave as on. */
export function isStudentAdditionalChargeActive(ch: StudentAdditionalCharge): boolean {
  return !(ch.active === 0);
}

/** Lines that may be rolled into a new invoice (respects paused / inactive extras). */
export function isStudentAdditionalChargeBillableOnInvoice(ch: StudentAdditionalCharge): boolean {
  if (!isStudentAdditionalChargeActive(ch)) return false;
  const isRecurring = ch.recurring === 1 || ch.recurring === true;
  if (isRecurring) return true;
  return ch.billedInvoiceId == null || ch.billedInvoiceId === undefined;
}

interface Props {
  studentId: number;
  charges: StudentAdditionalCharge[];
  onNotify: ExtraChargesNotify;
}

/**
 * Shared list of saved student extra charges with Active/Inactive and Remove.
 * Used under Manage fees (student list) and on Create invoice — same RTK cache (`StudentExtras`).
 */
export default function StudentAdditionalChargesList({ studentId, charges, onNotify }: Props) {
  const [updateCharge, { isLoading: isUpdating }] = useUpdateStudentAdditionalChargeMutation();
  const [deleteCharge] = useDeleteStudentAdditionalChargeMutation();

  if (charges.length === 0) {
    return <p className="text-xs text-slate-500">No saved extras — add below.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {charges.map((ch) => {
        const active = isStudentAdditionalChargeActive(ch);
        const isRecurring = ch.recurring === 1 || ch.recurring === true;
        return (
          <li
            key={ch.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 ${
              !active ? "opacity-80" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-800">{ch.description}</span>
              <span className="text-slate-600 ml-2">Rs {ch.amount.toLocaleString()}</span>
              <span
                className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${
                  isRecurring ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {isRecurring ? "Every invoice" : "One-time"}
              </span>
              {!active && (
                <span className="ml-2 text-xs font-semibold text-slate-500">Paused — not on new invoices</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={active}
                disabled={isUpdating}
                title={active ? "Pause: keep amount on file but skip on new invoices" : "Resume billing on new invoices"}
                onClick={async () => {
                  try {
                    await updateCharge({
                      studentId,
                      chargeId: ch.id,
                      active: !active,
                    }).unwrap();
                  } catch (err: unknown) {
                    const message =
                      err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
                        ? String((err.data as { error?: string }).error)
                        : "Failed to update charge.";
                    onNotify(message, "error");
                  }
                }}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                  active ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span className="sr-only">{active ? "Active" : "Inactive"}</span>
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                    active ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-xs font-medium text-slate-600 w-14">{active ? "Active" : "Inactive"}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteCharge({ studentId, chargeId: ch.id }).unwrap();
                  } catch {
                    onNotify("Failed to remove charge.", "error");
                  }
                }}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
