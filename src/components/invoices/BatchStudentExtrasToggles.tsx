import type { StudentAdditionalCharge } from "../../types";
import {
  useGetStudentAdditionalChargesQuery,
  useUpdateStudentAdditionalChargeMutation,
} from "../../services/api";
import {
  isRecurringStudentExtra,
  isStudentAdditionalChargeActive,
} from "../students/StudentAdditionalChargesList";

type Props = {
  studentId: number;
  disabled?: boolean;
  onError: (message: string) => void;
};

function CompactExtraToggle({
  studentId,
  charge,
  disabled,
  onError,
}: {
  studentId: number;
  charge: StudentAdditionalCharge;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [updateCharge, { isLoading }] = useUpdateStudentAdditionalChargeMutation();
  const active = isStudentAdditionalChargeActive(charge);
  const label = charge.description.trim() || "Extra";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 ${
        active ? "border-emerald-200 bg-emerald-50/80" : "border-slate-200 bg-white"
      } ${disabled ? "opacity-60" : ""}`}
      title={`${label} — Rs ${charge.amount.toLocaleString()}${active ? "" : " (paused on new invoices)"}`}
    >
      <span className={`text-xs font-medium max-w-[72px] truncate ${active ? "text-emerald-900" : "text-slate-600"}`}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${active ? "Pause" : "Include"} ${label}`}
        disabled={disabled || isLoading}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await updateCharge({
              studentId,
              chargeId: charge.id,
              active: !active,
            }).unwrap();
          } catch (err: unknown) {
            const message =
              err &&
              typeof err === "object" &&
              "data" in err &&
              err.data &&
              typeof err.data === "object" &&
              "error" in err.data
                ? String((err.data as { error?: string }).error)
                : "Failed to update extra.";
            onError(message);
          }
        }}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          active ? "bg-emerald-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            active ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** Recurring student extras as compact toggles (batch billing table). */
export default function BatchStudentExtrasToggles({ studentId, disabled, onError }: Props) {
  const { data: charges = [], isLoading, isError } = useGetStudentAdditionalChargesQuery(studentId);

  const recurring = charges.filter(isRecurringStudentExtra);

  if (isLoading) {
    return <span className="text-xs text-slate-400">…</span>;
  }

  if (isError) {
    return <span className="text-xs text-red-500">Failed to load</span>;
  }

  if (recurring.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div
      className="flex flex-wrap gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {recurring.map((ch) => (
        <CompactExtraToggle
          key={ch.id}
          studentId={studentId}
          charge={ch}
          disabled={disabled}
          onError={onError}
        />
      ))}
    </div>
  );
}
