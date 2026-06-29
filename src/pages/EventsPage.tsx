import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { SchoolEvent } from "../types";
import {
  useGetEventsQuery,
  useAddEventMutation,
  useDeleteEventMutation,
  useDuplicateEventMutation,
} from "../services/api";

type AlertType = "error" | "warning" | "info" | "success";

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "—";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "—";
}

export default function EventsPage() {
  const { data: events = [], isLoading } = useGetEventsQuery();
  const [addEvent, { isLoading: isSaving }] = useAddEventMutation();
  const [deleteEvent, { isLoading: isDeleting }] = useDeleteEventMutation();
  const [duplicateEvent, { isLoading: isDuplicating }] = useDuplicateEventMutation();

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: AlertType }>({
    isOpen: false,
    message: "",
    type: "error",
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    eventId: null as number | null,
  });

  const [form, setForm] = useState({
    name: "",
    defaultPrice: "",
    startDate: "",
    endDate: "",
    enrollmentDeadline: "",
    notes: "",
  });

  const resetForm = () => {
    setForm({
      name: "",
      defaultPrice: "",
      startDate: "",
      endDate: "",
      enrollmentDeadline: "",
      notes: "",
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setAlertModal({ isOpen: true, message: "Event name is required.", type: "warning" });
      return;
    }
    try {
      await addEvent({
        name: form.name.trim(),
        defaultPrice: form.defaultPrice ? Number(form.defaultPrice) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        enrollmentDeadline: form.enrollmentDeadline || null,
        status: "open",
        notes: form.notes.trim() || null,
      }).unwrap();
      resetForm();
      setAlertModal({ isOpen: true, message: "Event created.", type: "success" });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to create event.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  const handleDeleteClick = (event: SchoolEvent) => {
    setConfirmModal({
      isOpen: true,
      message: `Delete "${event.name}"? This cannot be undone.`,
      eventId: event.id,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmModal.eventId) return;
    try {
      await deleteEvent(confirmModal.eventId).unwrap();
      setAlertModal({ isOpen: true, message: "Event deleted.", type: "success" });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to delete event.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
    setConfirmModal({ isOpen: false, message: "", eventId: null });
  };

  const handleDuplicate = async (eventId: number) => {
    try {
      const copy = await duplicateEvent(eventId).unwrap();
      setAlertModal({
        isOpen: true,
        message: `Created "${copy.name}". Open it to adjust dates and add participants.`,
        type: "success",
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to duplicate event.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  if (isLoading) {
    return <div className="py-10 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Create event" subtitle="Camps, seminars, and other one-time programs.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">
                Event name <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Summer Camp 2026"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Default price (reference)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.defaultPrice}
                onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="20000"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Start date (optional)</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">End date (optional)</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Last enrollment date (optional)</span>
              <input
                type="date"
                value={form.enrollmentDeadline}
                onChange={(e) => setForm({ ...form, enrollmentDeadline: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Notes (optional)</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Creating…" : "Create event"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Events" subtitle="Manage participants on each event, then generate invoices under Invoices → Event invoices.">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4">Event</th>
                  <th className="py-3 pr-4">Dates</th>
                  <th className="py-3 pr-4">Default price</th>
                  <th className="py-3 pr-4">Participants</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4">
                      <Link
                        to={`/events/${event.id}`}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {event.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{formatDateRange(event.startDate, event.endDate)}</td>
                    <td className="py-3 pr-4 tabular-nums">{formatMoney(event.defaultPrice)}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {event.participantCount ?? 0}
                      {event.invoicedCount ? ` · ${event.invoicedCount} invoiced` : ""}
                    </td>
                    <td className="py-3 pr-4 capitalize text-slate-600">{event.status}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/events/${event.id}`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(event.id)}
                          disabled={isDuplicating}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(event)}
                          disabled={isDeleting}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal((s) => ({ ...s, isOpen: false }))}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setConfirmModal({ isOpen: false, message: "", eventId: null })}
      />
    </div>
  );
}
