import { useState, useEffect, FormEvent, useId } from "react";
import {
  useGetStudentAdditionalChargesQuery,
  useAddStudentAdditionalChargeMutation,
} from "../../services/api";
import StudentAdditionalChargesList from "./StudentAdditionalChargesList";
import type { ExtraChargesNotify } from "./StudentAdditionalChargesList";

export type { ExtraChargesNotify };

interface Props {
  studentId: number;
  /** If > 0, show “Add meals subscription from plan” using this amount. */
  planMealsDefault?: number;
  onNotify: ExtraChargesNotify;
}

export default function StudentExtraChargesPanel({ studentId, planMealsDefault = 0, onNotify }: Props) {
  const uid = useId();
  const recurringId = `${uid}-recurring`;

  const { data: charges = [] } = useGetStudentAdditionalChargesQuery(studentId, {
    skip: !studentId || Number.isNaN(studentId),
  });
  const [addCharge, { isLoading: isAdding }] = useAddStudentAdditionalChargeMutation();

  const [newChargeForm, setNewChargeForm] = useState({ description: "", amount: "", recurring: false });

  useEffect(() => {
    setNewChargeForm({ description: "", amount: "", recurring: false });
  }, [studentId]);

  const hasMealsSubscription = charges.some(
    (ch) => (ch.recurring === 1 || ch.recurring === true) && ch.description.trim().toLowerCase() === "meals",
  );

  const handleAddCharge = async (e?: FormEvent) => {
    e?.preventDefault();
    const desc = newChargeForm.description.trim();
    const amt = parseFloat(newChargeForm.amount);
    if (!desc) {
      onNotify("Enter a description for the charge.", "warning");
      return;
    }
    if (Number.isNaN(amt) || amt < 0) {
      onNotify("Enter a valid amount.", "warning");
      return;
    }
    try {
      await addCharge({
        studentId,
        description: desc,
        amount: amt,
        recurring: newChargeForm.recurring,
      }).unwrap();
      setNewChargeForm({ description: "", amount: "", recurring: false });
      onNotify("Charge saved for this student.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save charge.";
      onNotify(message, "error");
    }
  };

  const handleAddMealsFromPlan = async () => {
    if (!planMealsDefault || hasMealsSubscription) return;
    try {
      await addCharge({
        studentId,
        description: "Meals",
        amount: planMealsDefault,
        recurring: true,
      }).unwrap();
      onNotify("Meals subscription added. Use Active below to include it on invoices, or pause without losing the rate.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to add meals subscription.";
      onNotify(message, "error");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Extra charges for this student</h3>
      <p className="text-xs text-slate-600">
        Use for <strong>meals</strong> (recurring), speech therapy, camps, picnics, or anything not in the core fee.{" "}
        <strong>Every invoice</strong> can include recurring charges while they are <strong>Active</strong>. Turn a
        subscription <strong>Inactive</strong> to keep the amount on file but skip it on new invoices.{" "}
        <strong>One-time</strong> charges disappear from this list after they appear on an invoice. Changes here stay in
        sync with the Invoices page.
      </p>

      {planMealsDefault > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
          <span>
            This plan&apos;s default meals rate is <strong>Rs {planMealsDefault.toLocaleString()}</strong> (not billed
            until the student has a meals subscription).
          </span>
          <button
            type="button"
            disabled={isAdding || hasMealsSubscription}
            onClick={() => void handleAddMealsFromPlan()}
            className="rounded-md border border-emerald-600 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasMealsSubscription ? "Meals already on file" : "Add meals subscription from plan"}
          </button>
        </div>
      )}

      <StudentAdditionalChargesList studentId={studentId} charges={charges} onNotify={onNotify} />

      <div className="grid gap-3 md:grid-cols-12 items-end border-t border-slate-200 pt-4">
        <div className="md:col-span-5">
          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
          <input
            type="text"
            value={newChargeForm.description}
            onChange={(e) => setNewChargeForm({ ...newChargeForm, description: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Speech therapy, Summer camp"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount (Rs)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newChargeForm.amount}
            onChange={(e) => setNewChargeForm({ ...newChargeForm, amount: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2 flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id={recurringId}
            checked={newChargeForm.recurring}
            onChange={(e) => setNewChargeForm({ ...newChargeForm, recurring: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor={recurringId} className="text-xs text-slate-700 cursor-pointer">
            Every invoice
          </label>
        </div>
        <div className="md:col-span-2">
          <button
            type="button"
            disabled={isAdding}
            onClick={() => void handleAddCharge()}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {isAdding ? "Saving…" : "Save charge"}
          </button>
        </div>
      </div>
    </div>
  );
}
