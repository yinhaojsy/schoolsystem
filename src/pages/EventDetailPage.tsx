import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import SearchableSelect from "../components/common/SearchableSelect";
import type { EventParticipant, EventParticipantExtra } from "../types";
import {
  useGetEventQuery,
  useUpdateEventMutation,
  useGetEventParticipantsQuery,
  useAddEventParticipantMutation,
  useUpdateEventParticipantMutation,
  useDeleteEventParticipantMutation,
  useGetStudentsQuery,
  useGetEventInvoiceDescriptionsQuery,
  useAddEventInvoiceDescriptionMutation,
  useGetEventExtraOptionsQuery,
  useAddEventExtraOptionMutation,
} from "../services/api";
import { compareRollNo } from "../utils/rollNo";

type AlertType = "error" | "warning" | "info" | "success";
type ParticipantMode = "student" | "guest";

type ExtraLineForm = {
  extraOptionId: number;
  label: string;
  included: boolean;
  amount: string;
};

function buildExtraLines(
  options: { id: number; name: string; defaultAmount: number }[],
  saved?: EventParticipantExtra[],
): ExtraLineForm[] {
  const savedByOption = new Map(
    (saved ?? [])
      .filter((x) => x.extraOptionId != null)
      .map((x) => [x.extraOptionId as number, x]),
  );
  return options.map((opt) => {
    const s = savedByOption.get(opt.id);
    return {
      extraOptionId: opt.id,
      label: opt.name,
      included: Boolean(s),
      amount: s != null ? String(s.amount) : String(opt.defaultAmount),
    };
  });
}

function participantBillableTotal(p: EventParticipant): number {
  const extras = (p.extras ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return (Number(p.agreedAmount) || 0) + extras;
}

function formatMoney(n: number): string {
  return `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function ageFromDateOfBirth(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth || dateOfBirth.length < 10) return null;
  const dob = new Date(dateOfBirth.slice(0, 10));
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

const emptyParticipantForm = {
  participantName: "",
  invoiceDescription: "",
  agreedAmount: "",
  age: "",
  guardianName: "",
  email: "",
  contactNo: "",
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? parseInt(id, 10) : NaN;

  const { data: event, isLoading: eventLoading } = useGetEventQuery(eventId, {
    skip: Number.isNaN(eventId),
  });
  const { data: participants = [], isLoading: participantsLoading } = useGetEventParticipantsQuery(
    { eventId },
    { skip: Number.isNaN(eventId) },
  );
  const { data: students = [] } = useGetStudentsQuery();
  const { data: invoiceDescriptions = [] } = useGetEventInvoiceDescriptionsQuery(eventId, {
    skip: Number.isNaN(eventId),
  });
  const [addInvoiceDescription, { isLoading: isAddingDescription }] =
    useAddEventInvoiceDescriptionMutation();
  const { data: extraOptions = [] } = useGetEventExtraOptionsQuery(eventId, {
    skip: Number.isNaN(eventId),
  });
  const [addExtraOption, { isLoading: isAddingExtra }] = useAddEventExtraOptionMutation();
  const [updateEvent, { isLoading: isUpdatingEvent }] = useUpdateEventMutation();
  const [addParticipant, { isLoading: isAdding }] = useAddEventParticipantMutation();
  const [updateParticipant, { isLoading: isUpdatingParticipant }] = useUpdateEventParticipantMutation();
  const [deleteParticipant, { isLoading: isDeleting }] = useDeleteEventParticipantMutation();

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: AlertType }>({
    isOpen: false,
    message: "",
    type: "error",
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    participantId: null as number | null,
  });

  const [eventForm, setEventForm] = useState({
    name: "",
    defaultPrice: "",
    startDate: "",
    endDate: "",
    enrollmentDeadline: "",
    status: "open",
    notes: "",
  });
  const [participantForm, setParticipantForm] = useState(emptyParticipantForm);
  const [participantMode, setParticipantMode] = useState<ParticipantMode>("student");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [editingParticipant, setEditingParticipant] = useState<EventParticipant | null>(null);
  const [showAddDescriptionModal, setShowAddDescriptionModal] = useState(false);
  const [newDescriptionText, setNewDescriptionText] = useState("");
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [newExtraForm, setNewExtraForm] = useState({ name: "", defaultAmount: "" });
  const [extraLines, setExtraLines] = useState<ExtraLineForm[]>([]);

  const descriptionOptions = useMemo(() => {
    const texts = new Set(invoiceDescriptions.map((d) => d.description));
    if (participantForm.invoiceDescription.trim()) {
      texts.add(participantForm.invoiceDescription.trim());
    }
    return [...texts].sort((a, b) => a.localeCompare(b));
  }, [invoiceDescriptions, participantForm.invoiceDescription]);

  useEffect(() => {
    if (!editingParticipant) {
      setExtraLines(buildExtraLines(extraOptions, []));
    }
  }, [extraOptions, editingParticipant]);

  const formBillableTotal = useMemo(() => {
    const base = parseFloat(participantForm.agreedAmount);
    const baseAmt = Number.isNaN(base) ? 0 : base;
    const extras = extraLines
      .filter((l) => l.included)
      .reduce((s, l) => {
        const n = parseFloat(l.amount);
        return s + (Number.isNaN(n) ? 0 : n);
      }, 0);
    return baseAmt + extras;
  }, [participantForm.agreedAmount, extraLines]);

  const enrolledStudents = useMemo(
    () =>
      students.filter(
        (s) => s.status === "active" && (s.enrollmentStatus ?? "enrolled") !== "left",
      ),
    [students],
  );

  const studentIdsAlreadyOnEvent = useMemo(() => {
    const ids = new Set<number>();
    for (const p of participants) {
      if (p.studentId != null) ids.add(p.studentId);
    }
    if (editingParticipant?.studentId != null) {
      ids.delete(editingParticipant.studentId);
    }
    return ids;
  }, [participants, editingParticipant]);

  const studentSelectOptions = useMemo(
    () =>
      [...enrolledStudents]
        .sort((a, b) => compareRollNo(a.rollNo, b.rollNo))
        .filter((s) => !studentIdsAlreadyOnEvent.has(s.id))
        .map((s) => ({
          value: String(s.id),
          label: `${s.name} — ${s.rollNo}`,
          searchText: `${s.name} ${s.rollNo} ${s.classGroupName ?? ""}`,
        })),
    [enrolledStudents, studentIdsAlreadyOnEvent],
  );

  const selectedStudent = selectedStudentId
    ? enrolledStudents.find((s) => s.id === parseInt(selectedStudentId, 10))
    : undefined;

  useEffect(() => {
    if (!event) return;
    setEventForm({
      name: event.name,
      defaultPrice: event.defaultPrice != null ? String(event.defaultPrice) : "",
      startDate: event.startDate ?? "",
      endDate: event.endDate ?? "",
      enrollmentDeadline: event.enrollmentDeadline ?? "",
      status: event.status ?? "open",
      notes: event.notes ?? "",
    });
  }, [event]);

  const notify = (message: string, type: AlertType = "error") => {
    setAlertModal({ isOpen: true, message, type });
  };

  const handleEventSave = async (e: FormEvent) => {
    e.preventDefault();
    if (Number.isNaN(eventId) || !eventForm.name.trim()) {
      notify("Event name is required.", "warning");
      return;
    }
    try {
      await updateEvent({
        id: eventId,
        data: {
          name: eventForm.name.trim(),
          defaultPrice: eventForm.defaultPrice ? Number(eventForm.defaultPrice) : null,
          startDate: eventForm.startDate || null,
          endDate: eventForm.endDate || null,
          enrollmentDeadline: eventForm.enrollmentDeadline || null,
          status: eventForm.status,
          notes: eventForm.notes.trim() || null,
        },
      }).unwrap();
      notify("Event updated.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to update event.";
      notify(message);
    }
  };

  const resetParticipantForm = () => {
    setParticipantForm(emptyParticipantForm);
    setParticipantMode("student");
    setSelectedStudentId("");
    setEditingParticipant(null);
    setExtraLines(buildExtraLines(extraOptions, []));
  };

  const applyStudentToForm = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = enrolledStudents.find((s) => s.id === parseInt(studentId, 10));
    if (!student) return;
    const age = ageFromDateOfBirth(student.dateOfBirth);
    setParticipantForm((prev) => ({
      ...prev,
      participantName: student.name,
      guardianName: student.parentsName ?? "",
      contactNo: student.contactNo ?? "",
      age: age != null ? String(age) : "",
      agreedAmount:
        prev.agreedAmount || (event?.defaultPrice != null ? String(event.defaultPrice) : ""),
    }));
  };

  const startEditParticipant = (p: EventParticipant) => {
    if (p.invoiceId) {
      notify("Cannot edit a participant who already has an invoice.", "warning");
      return;
    }
    setEditingParticipant(p);
    setParticipantMode(p.studentId ? "student" : "guest");
    setSelectedStudentId(p.studentId ? String(p.studentId) : "");
    setParticipantForm({
      participantName: p.participantName,
      invoiceDescription: p.invoiceDescription,
      agreedAmount: String(p.agreedAmount),
      age: p.age != null ? String(p.age) : "",
      guardianName: p.guardianName ?? "",
      email: p.email ?? "",
      contactNo: p.contactNo ?? "",
    });
    setExtraLines(buildExtraLines(extraOptions, p.extras));
  };

  const handleParticipantSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (Number.isNaN(eventId)) return;

    if (participantMode === "student" && !selectedStudentId) {
      notify("Select an enrolled student.", "warning");
      return;
    }
    if (participantMode === "guest" && !participantForm.participantName.trim()) {
      notify("Name is required.", "warning");
      return;
    }
    if (!participantForm.invoiceDescription.trim()) {
      notify("Select an invoice description.", "warning");
      return;
    }
    const amount = parseFloat(participantForm.agreedAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      notify("Enter a valid amount.", "warning");
      return;
    }

    const payload = {
      studentId: participantMode === "student" ? parseInt(selectedStudentId, 10) : null,
      participantName: participantMode === "guest" ? participantForm.participantName.trim() : undefined,
      invoiceDescription: participantForm.invoiceDescription.trim(),
      agreedAmount: amount,
      age: participantForm.age ? parseInt(participantForm.age, 10) : null,
      guardianName: participantForm.guardianName.trim() || null,
      email: participantForm.email.trim() || null,
      contactNo: participantForm.contactNo.trim() || null,
      extras: extraLines
        .filter((l) => l.included)
        .map((l) => ({
          extraOptionId: l.extraOptionId,
          label: l.label,
          amount: parseFloat(l.amount) || 0,
          included: true,
        })),
    };
    try {
      if (editingParticipant) {
        await updateParticipant({ id: editingParticipant.id, data: payload }).unwrap();
        notify("Participant updated.", "success");
      } else {
        await addParticipant({ eventId, ...payload }).unwrap();
        notify("Participant added.", "success");
      }
      resetParticipantForm();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save participant.";
      notify(message);
    }
  };

  const handleAddDescription = async (e: FormEvent) => {
    e.preventDefault();
    const text = newDescriptionText.trim();
    if (!text) {
      notify("Enter a description.", "warning");
      return;
    }
    try {
      const row = await addInvoiceDescription({ eventId, description: text }).unwrap();
      setParticipantForm((prev) => ({ ...prev, invoiceDescription: row.description }));
      setNewDescriptionText("");
      setShowAddDescriptionModal(false);
      notify("Description saved for this event.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save description.";
      notify(message);
    }
  };

  const handleAddExtra = async (e: FormEvent) => {
    e.preventDefault();
    const name = newExtraForm.name.trim();
    const defaultAmount = parseFloat(newExtraForm.defaultAmount);
    if (!name) {
      notify("Enter a name for the extra.", "warning");
      return;
    }
    if (Number.isNaN(defaultAmount) || defaultAmount < 0) {
      notify("Enter a valid default amount.", "warning");
      return;
    }
    try {
      const row = await addExtraOption({ eventId, name, defaultAmount }).unwrap();
      setExtraLines((prev) => {
        if (prev.some((l) => l.extraOptionId === row.id)) return prev;
        return [
          ...prev,
          {
            extraOptionId: row.id,
            label: row.name,
            included: false,
            amount: String(row.defaultAmount),
          },
        ];
      });
      setNewExtraForm({ name: "", defaultAmount: "" });
      setShowAddExtraModal(false);
      notify("Extra option saved for this event.", "success");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to save extra option.";
      notify(message);
    }
  };

  const handleDeleteParticipantClick = (p: EventParticipant) => {
    setConfirmModal({
      isOpen: true,
      message: `Remove ${p.participantName} (${p.participantCode})?`,
      participantId: p.id,
    });
  };

  const handleDeleteParticipantConfirm = async () => {
    if (!confirmModal.participantId) return;
    try {
      await deleteParticipant(confirmModal.participantId).unwrap();
      notify("Participant removed.", "success");
      if (editingParticipant?.id === confirmModal.participantId) resetParticipantForm();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "Failed to remove participant.";
      notify(message);
    }
    setConfirmModal({ isOpen: false, message: "", participantId: null });
  };

  if (eventLoading || Number.isNaN(eventId)) {
    return <div className="py-10 text-center text-slate-500">Loading…</div>;
  }
  if (!event) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-slate-600">Event not found.</p>
        <Link to="/events" className="text-sm font-semibold text-blue-700 hover:underline">
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/events" className="text-sm font-medium text-blue-700 hover:underline">
          ← Events
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{event.name}</h1>
      </div>

      <SectionCard title="Event details">
        <form onSubmit={handleEventSave} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Event name</span>
              <input
                type="text"
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Default price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={eventForm.defaultPrice}
                onChange={(e) => setEventForm({ ...eventForm, defaultPrice: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Status</span>
              <select
                value={eventForm.status}
                onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Start date</span>
              <input
                type="date"
                value={eventForm.startDate}
                onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">End date</span>
              <input
                type="date"
                value={eventForm.endDate}
                onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Last enrollment date</span>
              <input
                type="date"
                value={eventForm.enrollmentDeadline}
                onChange={(e) => setEventForm({ ...eventForm, enrollmentDeadline: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea
                value={eventForm.notes}
                onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                rows={2}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isUpdatingEvent}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isUpdatingEvent ? "Saving…" : "Save event"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title={editingParticipant ? "Edit participant" : "Add participant"}
        subtitle="Choose an enrolled student or add a guest. Each person gets an internal code (ex001, ex002…)."
      >
        <form onSubmit={handleParticipantSubmit} className="space-y-4">
          {!editingParticipant ? (
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
              <button
                type="button"
                onClick={() => {
                  setParticipantMode("student");
                  setParticipantForm((prev) => ({ ...prev, participantName: "" }));
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  participantMode === "student"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Enrolled student
              </button>
              <button
                type="button"
                onClick={() => {
                  setParticipantMode("guest");
                  setSelectedStudentId("");
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  participantMode === "guest"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Guest
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {participantMode === "student" ? (
              <>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="font-medium text-slate-700">
                    Student <span className="text-red-500">*</span>
                  </span>
                  <SearchableSelect
                    value={selectedStudentId}
                    onChange={applyStudentToForm}
                    options={studentSelectOptions}
                    placeholder="Search by name or roll no…"
                    searchPlaceholder="Search students…"
                    emptyMessage="No enrolled students available (or all are already on this event)."
                    required={!editingParticipant?.studentId}
                  />
                </label>
                {selectedStudent ? (
                  <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">{selectedStudent.name}</span>
                    {selectedStudent.classGroupName ? (
                      <span className="text-slate-500"> · {selectedStudent.classGroupName}</span>
                    ) : null}
                    {selectedStudent.parentsName ? (
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Parent: {selectedStudent.parentsName}
                        {selectedStudent.contactNo ? ` · ${selectedStudent.contactNo}` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="font-medium text-slate-700">
                  Name <span className="text-red-500">*</span>
                </span>
                <input
                  type="text"
                  value={participantForm.participantName}
                  onChange={(e) => setParticipantForm({ ...participantForm, participantName: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Amount to charge <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={participantForm.agreedAmount}
                onChange={(e) => setParticipantForm({ ...participantForm, agreedAmount: e.target.value })}
                placeholder={event.defaultPrice != null ? String(event.defaultPrice) : ""}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <div className="flex flex-col gap-1 text-sm md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-700">
                  Invoice description <span className="text-red-500">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddDescriptionModal(true)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Add description
                </button>
              </div>
              <select
                value={participantForm.invoiceDescription}
                onChange={(e) =>
                  setParticipantForm({ ...participantForm, invoiceDescription: e.target.value })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">
                  {descriptionOptions.length === 0
                    ? "No descriptions yet — click Add description"
                    : "Select description…"}
                </option>
                {descriptionOptions.map((desc) => (
                  <option key={desc} value={desc}>
                    {desc}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">Additional charges</p>
                  <p className="text-xs text-slate-500">
                    Optional per person — e.g. meals or transport. Set amount to 0 for free.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddExtraModal(true)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Add extra
                </button>
              </div>
              {extraOptions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No extras defined yet. Click <strong>Add extra</strong> to create Meals, Transport, etc.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3 w-10">Include</th>
                        <th className="py-2 pr-3">Extra</th>
                        <th className="py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraLines.map((line) => (
                        <tr key={line.extraOptionId} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={line.included}
                              onChange={(e) =>
                                setExtraLines((rows) =>
                                  rows.map((r) =>
                                    r.extraOptionId === line.extraOptionId
                                      ? { ...r, included: e.target.checked }
                                      : r,
                                  ),
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="py-2 pr-3 font-medium text-slate-800">{line.label}</td>
                          <td className="py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.amount}
                              disabled={!line.included}
                              onChange={(e) =>
                                setExtraLines((rows) =>
                                  rows.map((r) =>
                                    r.extraOptionId === line.extraOptionId
                                      ? { ...r, amount: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                              className="w-full max-w-[140px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-sm text-slate-600">
                Invoice total for this participant:{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatMoney(formBillableTotal)}
                </span>
              </p>
            </div>

            {participantMode === "guest" ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Age</span>
                  <input
                    type="number"
                    min="0"
                    value={participantForm.age}
                    onChange={(e) => setParticipantForm({ ...participantForm, age: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Parent / guardian</span>
                  <input
                    type="text"
                    value={participantForm.guardianName}
                    onChange={(e) => setParticipantForm({ ...participantForm, guardianName: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    value={participantForm.email}
                    onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Contact number</span>
                  <input
                    type="text"
                    value={participantForm.contactNo}
                    onChange={(e) => setParticipantForm({ ...participantForm, contactNo: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isAdding || isUpdatingParticipant}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editingParticipant
                ? isUpdatingParticipant
                  ? "Saving…"
                  : "Update participant"
                : isAdding
                  ? "Adding…"
                  : "Add participant"}
            </button>
            {editingParticipant ? (
              <button
                type="button"
                onClick={resetParticipantForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Participants">
        {participantsLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : participants.length === 0 ? (
          <p className="text-sm text-slate-500">No participants yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4">Code</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Description</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500">{p.participantCode}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">{p.participantName}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {p.studentId ? (
                        <span>Enrolled{p.studentRollNo ? ` · ${p.studentRollNo}` : ""}</span>
                      ) : (
                        <span>Guest</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{p.invoiceDescription}</td>
                    <td className="py-3 pr-4">
                      <div className="tabular-nums">{formatMoney(p.agreedAmount)}</div>
                      {(p.extras?.length ?? 0) > 0 ? (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {p.extras!.map((x) => (
                            <span key={`${x.label}-${x.amount}`} className="block">
                              + {x.label}: {x.amount > 0 ? formatMoney(x.amount) : "Free"}
                            </span>
                          ))}
                          <span className="mt-0.5 block font-medium text-slate-700">
                            Total: {formatMoney(participantBillableTotal(p))}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {p.invoiceNo ? (
                        <span>
                          {p.invoiceNo}
                          <span className="ml-1 text-xs capitalize text-slate-400">({p.status})</span>
                        </span>
                      ) : (
                        <span className="text-amber-700">Not invoiced</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {!p.invoiceId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditParticipant(p)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteParticipantClick(p)}
                              disabled={isDeleting}
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </>
                        ) : null}
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

      {showAddDescriptionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleAddDescription}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-1 text-lg font-bold text-slate-900">Add invoice description</h3>
            <p className="mb-4 text-sm text-slate-500">
              Saved only for this event. You can reuse it when adding participants.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Description</span>
              <input
                type="text"
                value={newDescriptionText}
                onChange={(e) => setNewDescriptionText(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="4 week summer camp"
                autoFocus
                required
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddDescriptionModal(false);
                  setNewDescriptionText("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingDescription}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isAddingDescription ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showAddExtraModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleAddExtra}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-1 text-lg font-bold text-slate-900">Add extra option</h3>
            <p className="mb-4 text-sm text-slate-500">
              Define a charge type for this event only (e.g. Meals, Transportation).
            </p>
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input
                  type="text"
                  value={newExtraForm.name}
                  onChange={(e) => setNewExtraForm({ ...newExtraForm, name: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Meals"
                  autoFocus
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Default amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newExtraForm.defaultAmount}
                  onChange={(e) =>
                    setNewExtraForm({ ...newExtraForm, defaultAmount: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="3000"
                  required
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddExtraModal(false);
                  setNewExtraForm({ name: "", defaultAmount: "" });
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingExtra}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isAddingExtra ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={() => void handleDeleteParticipantConfirm()}
        onCancel={() => setConfirmModal({ isOpen: false, message: "", participantId: null })}
      />
    </div>
  );
}
