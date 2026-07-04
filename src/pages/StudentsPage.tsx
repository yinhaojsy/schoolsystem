import { useState, FormEvent, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SectionCard from "../components/common/SectionCard";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import type { Student, StudentAdmissionCustomFee } from "../types";
import {
  useGetStudentQuery,
  useAddStudentMutation,
  useUpdateStudentMutation,
  useGetStudentsQuery,
  useGetFeeStructuresQuery,
  useGetClassGroupsQuery,
  useGetHouseholdsQuery,
  useAddHouseholdMutation,
  useDeleteHouseholdMutation,
  useAddStudentAdditionalChargeMutation,
  useUploadStudentPhotoMutation,
  useDeleteStudentPhotoMutation,
} from "../services/api";
import { CALENDAR_MONTH_NAMES } from "../utils/academicYear";
import { todayYmd } from "../utils/invoiceDates";
import { suggestNextNumericRollNo, suggestNextDropInRollNo } from "../utils/rollNo";

export default function StudentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  
  const { data: students = [] } = useGetStudentsQuery();
  const { data: feeStructures = [] } = useGetFeeStructuresQuery();
  const { data: classGroups = [] } = useGetClassGroupsQuery();
  const { data: households = [] } = useGetHouseholdsQuery();
  const [addHousehold, { isLoading: isCreatingHousehold }] = useAddHouseholdMutation();
  const [deleteHousehold, { isLoading: isDeletingHousehold }] = useDeleteHouseholdMutation();
  const { data: studentToEdit, isLoading: isLoadingStudent } = useGetStudentQuery(
    editId ? parseInt(editId) : 0,
    { skip: !editId }
  );
  const [addStudent, { isLoading: isSaving }] = useAddStudentMutation();
  const [updateStudent, { isLoading: isUpdating }] = useUpdateStudentMutation();
  const [uploadStudentPhoto, { isLoading: isUploadingPhoto }] = useUploadStudentPhotoMutation();
  const [deleteStudentPhoto, { isLoading: isDeletingPhoto }] = useDeleteStudentPhotoMutation();
  const isPhotoBusy = isUploadingPhoto || isDeletingPhoto;
  const [addStudentAdditionalCharge, { isLoading: isAddingAdmissionExtra }] = useAddStudentAdditionalChargeMutation();

  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; type: "error" | "warning" | "success" | "info" }>({ isOpen: false, message: "", type: "error" });
  const [confirmDeleteHousehold, setConfirmDeleteHousehold] = useState<{
    isOpen: boolean;
    id: number | null;
    label: string;
  }>({ isOpen: false, id: null, label: "" });
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const rollNoManuallyEdited = useRef(false);

  const suggestedRollNo = useMemo(() => {
    const rolls = students
      .filter((s) => !editingStudent || s.id !== editingStudent.id)
      .map((s) => s.rollNo);
    return suggestNextNumericRollNo(rolls);
  }, [students, editingStudent]);

  const [enrollmentType, setEnrollmentType] = useState<"regular" | "drop_in">("regular");
  const [dropInForm, setDropInForm] = useState({
    sessionType: "half" as "half" | "full",
    rate: "",
    mealsMonthly: "",
  });

  const suggestedDropInRollNo = useMemo(() => {
    const rolls = students
      .filter((s) => !editingStudent || s.id !== editingStudent.id)
      .map((s) => s.rollNo);
    return suggestNextDropInRollNo(rolls);
  }, [students, editingStudent]);

  const dropInClassGroupId = useMemo(() => {
    const cg = classGroups.find((c) => {
      const n = c.name.trim().toLowerCase();
      return n === "drop-in" || n === "drop in";
    });
    return cg ? String(cg.id) : "";
  }, [classGroups]);

  const isDropInStudent =
    (editingStudent?.enrollmentType ?? enrollmentType) === "drop_in";

  const [form, setForm] = useState({
    name: "",
    parentsName: "",
    contactNo: "",
    rollNo: "",
    feeStructureId: "",
    classGroupId: "",
    address: "",
    dateOfBirth: "",
    admissionDate: todayYmd(),
    status: "active" as "active" | "inactive",
    householdId: "",
    receivesSiblingDiscount: false,
    siblingPreMonthly: "",
    siblingPostMonthly: "",
    siblingDiscountFromMonth: "",
    siblingDiscountFromYear: "",
  });

  const [newHouseholdLabel, setNewHouseholdLabel] = useState("");

  const [feeMode, setFeeMode] = useState<"structure" | "custom">("structure");
  const [includePlanMealsSubscription, setIncludePlanMealsSubscription] = useState(false);
  const [customFee, setCustomFee] = useState({
    registrationFee: "",
    monthlyFee: "",
    annualCharges: "",
    mealsMonthly: "",
  });

  const planMealsDefault = useMemo(() => {
    if (feeMode !== "structure" || !form.feeStructureId) return 0;
    const fs = feeStructures.find((f) => String(f.id) === form.feeStructureId);
    return fs?.meals != null && fs.meals > 0 ? fs.meals : 0;
  }, [feeMode, form.feeStructureId, feeStructures]);

  useEffect(() => {
    if (feeMode === "custom") setIncludePlanMealsSubscription(false);
  }, [feeMode]);

  useEffect(() => {
    if (planMealsDefault <= 0) setIncludePlanMealsSubscription(false);
  }, [planMealsDefault]);

  useEffect(() => {
    if (!editId) rollNoManuallyEdited.current = false;
  }, [editId]);

  useEffect(() => {
    if (editId) return;
    if (rollNoManuallyEdited.current) return;
    const nextRoll = enrollmentType === "drop_in" ? suggestedDropInRollNo : suggestedRollNo;
    setForm((f) => (f.rollNo === nextRoll ? f : { ...f, rollNo: nextRoll }));
  }, [editId, enrollmentType, suggestedDropInRollNo, suggestedRollNo]);

  useEffect(() => {
    if (editId || enrollmentType !== "drop_in" || !dropInClassGroupId) return;
    setForm((f) => (f.classGroupId === dropInClassGroupId ? f : { ...f, classGroupId: dropInClassGroupId }));
  }, [editId, enrollmentType, dropInClassGroupId]);

  useEffect(() => {
    if (studentToEdit) {
      rollNoManuallyEdited.current = true;
      setEditingStudent(studentToEdit);
      setEnrollmentType(studentToEdit.enrollmentType === "drop_in" ? "drop_in" : "regular");
      setDropInForm({
        sessionType: studentToEdit.dropInSessionType === "full" ? "full" : "half",
        rate: studentToEdit.dropInRate != null ? String(studentToEdit.dropInRate) : "",
        mealsMonthly: "",
      });
      setFeeMode("structure");
      setIncludePlanMealsSubscription(false);
      setCustomFee({ registrationFee: "", monthlyFee: "", annualCharges: "", mealsMonthly: "" });
      setForm({
        name: studentToEdit.name,
        parentsName: studentToEdit.parentsName || "",
        contactNo: studentToEdit.contactNo || "",
        rollNo: studentToEdit.rollNo,
        feeStructureId: studentToEdit.feeStructureId.toString(),
        classGroupId: studentToEdit.classGroupId.toString(),
        address: studentToEdit.address || "",
        dateOfBirth: studentToEdit.dateOfBirth || "",
        admissionDate:
          studentToEdit.admissionDate && String(studentToEdit.admissionDate).length >= 10
            ? String(studentToEdit.admissionDate).slice(0, 10)
            : todayYmd(),
        status: studentToEdit.status,
        householdId: studentToEdit.householdId != null ? String(studentToEdit.householdId) : "",
        receivesSiblingDiscount: !!(studentToEdit.receivesSiblingDiscount === 1 || studentToEdit.receivesSiblingDiscount === true),
        siblingPreMonthly:
          studentToEdit.siblingPreMonthly != null ? String(studentToEdit.siblingPreMonthly) : "",
        siblingPostMonthly:
          studentToEdit.siblingPostMonthly != null ? String(studentToEdit.siblingPostMonthly) : "",
        siblingDiscountFromMonth: studentToEdit.siblingDiscountFromMonth || "",
        siblingDiscountFromYear:
          studentToEdit.siblingDiscountFromYear != null ? String(studentToEdit.siblingDiscountFromYear) : "",
      });
    }
  }, [studentToEdit]);

  const resetForm = () => {
    rollNoManuallyEdited.current = false;
    setForm({
      name: "",
      parentsName: "",
      contactNo: "",
      rollNo: suggestNextNumericRollNo(students.map((s) => s.rollNo)),
      feeStructureId: "",
      classGroupId: "",
      address: "",
      dateOfBirth: "",
      admissionDate: todayYmd(),
      status: "active",
      householdId: "",
      receivesSiblingDiscount: false,
      siblingPreMonthly: "",
      siblingPostMonthly: "",
      siblingDiscountFromMonth: "",
      siblingDiscountFromYear: "",
    });
    setNewHouseholdLabel("");
    setEnrollmentType("regular");
    setDropInForm({ sessionType: "half", rate: "", mealsMonthly: "" });
    setFeeMode("structure");
    setIncludePlanMealsSubscription(false);
    setCustomFee({ registrationFee: "", monthlyFee: "", annualCharges: "", mealsMonthly: "" });
    setEditingStudent(null);
    navigate("/students");
  };

  const handleCreateHousehold = async () => {
    try {
      const label = newHouseholdLabel.trim() || undefined;
      const h = await addHousehold({ label: label ?? null }).unwrap();
      setForm((f) => ({ ...f, householdId: String(h.id) }));
      setNewHouseholdLabel("");
      setAlertModal({ isOpen: true, message: "Household created and selected.", type: "success" });
    } catch {
      setAlertModal({ isOpen: true, message: "Could not create household.", type: "error" });
    }
  };

  const selectedHouseholdMeta = form.householdId
    ? households.find((h) => String(h.id) === form.householdId)
    : undefined;
  const householdMemberCount = selectedHouseholdMeta?.memberCount ?? 0;

  const handleDeleteHouseholdClick = () => {
    if (!selectedHouseholdMeta) return;
    setConfirmDeleteHousehold({
      isOpen: true,
      id: selectedHouseholdMeta.id,
      label:
        (selectedHouseholdMeta.label && selectedHouseholdMeta.label.trim()) ||
        `Household #${selectedHouseholdMeta.id}`,
    });
  };

  const handleConfirmDeleteHousehold = async () => {
    if (confirmDeleteHousehold.id == null) return;
    try {
      await deleteHousehold(confirmDeleteHousehold.id).unwrap();
      setForm((f) =>
        String(f.householdId) === String(confirmDeleteHousehold.id) ? { ...f, householdId: "" } : f,
      );
      setConfirmDeleteHousehold({ isOpen: false, id: null, label: "" });
      setAlertModal({ isOpen: true, message: "Household deleted.", type: "success" });
    } catch (err: any) {
      const message = err?.data?.error || "Could not delete household.";
      setAlertModal({ isOpen: true, message, type: "error" });
      setConfirmDeleteHousehold({ isOpen: false, id: null, label: "" });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.rollNo.trim()) {
      setAlertModal({ isOpen: true, message: "Please fill in all required fields.", type: "warning" });
      return;
    }

    if (!form.admissionDate.trim()) {
      setAlertModal({ isOpen: true, message: "Admission date is required.", type: "warning" });
      return;
    }

    if (!form.classGroupId) {
      setAlertModal({ isOpen: true, message: "Please select a class group.", type: "warning" });
      return;
    }

    if (editingStudent) {
      if (!isDropInStudent && !form.feeStructureId) {
        setAlertModal({ isOpen: true, message: "Please select a fee structure.", type: "warning" });
        return;
      }
      if (isDropInStudent) {
        const rate = Number(dropInForm.rate);
        if (!Number.isFinite(rate) || rate <= 0) {
          setAlertModal({
            isOpen: true,
            message: "Drop-in students require a valid daily charge greater than zero.",
            type: "warning",
          });
          return;
        }
      }
    } else if (enrollmentType === "drop_in") {
      const rate = Number(dropInForm.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        setAlertModal({
          isOpen: true,
          message: "Drop-in students require a valid daily charge greater than zero.",
          type: "warning",
        });
        return;
      }
    } else if (feeMode === "structure") {
      if (!form.feeStructureId) {
        setAlertModal({ isOpen: true, message: "Please select a fee structure.", type: "warning" });
        return;
      }
    } else {
      const monthly = Number(customFee.monthlyFee);
      if (!Number.isFinite(monthly) || monthly <= 0) {
        setAlertModal({
          isOpen: true,
          message: "Custom fee requires a valid monthly charge greater than zero.",
          type: "warning",
        });
        return;
      }
      const parseOptional = (raw: string, label: string): boolean => {
        const t = raw.trim();
        if (!t) return true;
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) {
          setAlertModal({ isOpen: true, message: `Invalid ${label}. Use a number zero or greater, or leave blank.`, type: "warning" });
          return false;
        }
        return true;
      };
      if (!parseOptional(customFee.registrationFee, "registration fee")) return;
      if (!parseOptional(customFee.annualCharges, "annual charges")) return;
      const mealsTrim = customFee.mealsMonthly.trim();
      if (mealsTrim) {
        const mn = Number(mealsTrim);
        if (!Number.isFinite(mn) || mn <= 0) {
          setAlertModal({
            isOpen: true,
            message: "Optional meals rate must be a positive number, or leave the field blank.",
            type: "warning",
          });
          return;
        }
      }
    }

    if (!isDropInStudent && form.receivesSiblingDiscount) {
      if (!form.householdId.trim()) {
        setAlertModal({
          isOpen: true,
          message: "Sibling discount requires a household. Create one or select an existing household.",
          type: "warning",
        });
        return;
      }
      const pre = parseFloat(form.siblingPreMonthly);
      const post = parseFloat(form.siblingPostMonthly);
      if (!Number.isFinite(pre) || !Number.isFinite(post) || post <= 0 || post >= pre) {
        setAlertModal({
          isOpen: true,
          message: "Sibling discount needs valid monthly amounts: \"after\" must be less than \"before\", both positive.",
          type: "warning",
        });
        return;
      }
      if (!form.siblingDiscountFromMonth || !form.siblingDiscountFromYear.trim()) {
        setAlertModal({
          isOpen: true,
          message: "Choose the first invoice month and year when the sibling monthly discount should start.",
          type: "warning",
        });
        return;
      }
    }

    const householdSibling = {
      householdId: form.householdId.trim() ? parseInt(form.householdId, 10) : null,
      receivesSiblingDiscount: form.receivesSiblingDiscount,
      siblingPreMonthly: form.receivesSiblingDiscount ? parseFloat(form.siblingPreMonthly) : null,
      siblingPostMonthly: form.receivesSiblingDiscount ? parseFloat(form.siblingPostMonthly) : null,
      siblingDiscountFromMonth: form.receivesSiblingDiscount ? form.siblingDiscountFromMonth : null,
      siblingDiscountFromYear: form.receivesSiblingDiscount ? parseInt(form.siblingDiscountFromYear, 10) : null,
    };

    const admissionMealsAmount = (): number => {
      if (isDropInStudent || enrollmentType === "drop_in") {
        const t = dropInForm.mealsMonthly.trim();
        if (!t) return 0;
        const n = Number(t);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
      if (feeMode === "structure" && includePlanMealsSubscription && planMealsDefault > 0) {
        return planMealsDefault;
      }
      if (feeMode === "custom") {
        const t = customFee.mealsMonthly.trim();
        if (!t) return 0;
        const n = Number(t);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
      return 0;
    };

    const mealErrToMessage = (mealErr: unknown) =>
      mealErr && typeof mealErr === "object" && "data" in mealErr && mealErr.data && typeof mealErr.data === "object" && "error" in mealErr.data
        ? String((mealErr.data as { error?: string }).error)
        : "Unknown error";

    const notifyAfterNewAdmission = async (studentId: number) => {
      const mealsAmt = admissionMealsAmount();
      if (mealsAmt <= 0) {
        setAlertModal({ isOpen: true, message: "Student admitted successfully!", type: "success" });
        return;
      }
      try {
        await addStudentAdditionalCharge({
          studentId,
          description: "Meals",
          amount: mealsAmt,
          recurring: true,
        }).unwrap();
        setAlertModal({
          isOpen: true,
          message: "Student admitted successfully, with meals subscription added.",
          type: "success",
        });
      } catch (mealErr: unknown) {
        setAlertModal({
          isOpen: true,
          message: `Student admitted, but meals could not be saved (${mealErrToMessage(mealErr)}). Add it under Extra charges on the student list.`,
          type: "warning",
        });
      }
    };

    try {
      const base = {
        name: form.name.trim(),
        parentsName: form.parentsName.trim() || undefined,
        contactNo: form.contactNo.trim() || undefined,
        rollNo: form.rollNo.trim(),
        classGroupId: parseInt(form.classGroupId, 10),
        address: form.address.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        admissionDate: form.admissionDate.trim(),
        status: (editingStudent ? form.status : "active") as "active" | "inactive",
        ...householdSibling,
      };

      if (editingStudent) {
        if (isDropInStudent) {
          const studentData = {
            ...base,
            dropInSessionType: dropInForm.sessionType,
            dropInRate: Number(dropInForm.rate),
          };
          await updateStudent({ id: editingStudent.id, data: studentData }).unwrap();
        } else {
          const studentData = {
            ...base,
            feeStructureId: parseInt(form.feeStructureId, 10),
          };
          await updateStudent({ id: editingStudent.id, data: studentData }).unwrap();
        }
        setAlertModal({ isOpen: true, message: "Student updated successfully!", type: "success" });
        setTimeout(() => navigate("/students-list"), 1500);
      } else if (enrollmentType === "drop_in") {
        const studentData = {
          ...base,
          enrollmentType: "drop_in" as const,
          dropInSessionType: dropInForm.sessionType,
          dropInRate: Number(dropInForm.rate),
        };
        const created = await addStudent(studentData).unwrap();
        await notifyAfterNewAdmission(created.id);
        setTimeout(() => navigate("/students-list"), 1500);
      } else if (feeMode === "structure") {
        const studentData = {
          ...base,
          feeStructureId: parseInt(form.feeStructureId, 10),
        };
        const created = await addStudent(studentData).unwrap();
        await notifyAfterNewAdmission(created.id);
        setTimeout(() => navigate("/students-list"), 1500);
      } else {
        const monthly = Number(customFee.monthlyFee);
        const regTrim = customFee.registrationFee.trim();
        const annTrim = customFee.annualCharges.trim();
        const payload: typeof base & { customFee: StudentAdmissionCustomFee } = {
          ...base,
          customFee: { monthlyFee: monthly },
        };
        if (regTrim) {
          const r = Number(regTrim);
          if (r > 0) payload.customFee.registrationFee = r;
        }
        if (annTrim) {
          const a = Number(annTrim);
          if (a > 0) payload.customFee.annualCharges = a;
        }
        const created = await addStudent(payload).unwrap();
        await notifyAfterNewAdmission(created.id);
        setTimeout(() => navigate("/students-list"), 1500);
      }

      resetForm();
    } catch (err: any) {
      const message = err?.data?.error || "Failed to save student. Please try again.";
      setAlertModal({ isOpen: true, message, type: "error" });
    }
  };

  if (isLoadingStudent) {
    return <div className="text-center py-10">Loading student data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <button
          onClick={() => navigate("/students-list")}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          View All Students
        </button>
      </div>
      <SectionCard title={editingStudent ? "Edit Student" : "New Admission"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingStudent && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-800 mb-3">Enrollment type</p>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="enrollmentType"
                    checked={enrollmentType === "regular"}
                    onChange={() => {
                      rollNoManuallyEdited.current = false;
                      setEnrollmentType("regular");
                    }}
                    className="border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Regular
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="enrollmentType"
                    checked={enrollmentType === "drop_in"}
                    onChange={() => {
                      rollNoManuallyEdited.current = false;
                      setEnrollmentType("drop_in");
                    }}
                    className="border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Drop-in
                </label>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Student Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Parents Name
              </label>
              <input
                type="text"
                value={form.parentsName}
                onChange={(e) => setForm({ ...form, parentsName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contact No.
              </label>
              <input
                type="tel"
                value={form.contactNo}
                onChange={(e) => setForm({ ...form, contactNo: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Roll No. <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.rollNo}
                onChange={(e) => {
                  rollNoManuallyEdited.current = true;
                  setForm({ ...form, rollNo: e.target.value });
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
              {!editingStudent && (
                <p className="mt-1 text-xs text-slate-500">
                  {enrollmentType === "drop_in"
                    ? "Auto-filled with the next drop-in roll (D1, D2, …)."
                    : "Auto-filled with the lowest available roll number (e.g. gap at 8, or next after the highest)."}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Admission Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.admissionDate}
                onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Class Group <span className="text-red-500">*</span>
              </label>
              <select
                value={form.classGroupId}
                onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="">Select Class Group</option>
                {classGroups.map((cg) => (
                  <option key={cg.id} value={cg.id}>
                    {cg.name}
                  </option>
                ))}
              </select>
            </div>

            {editingStudent && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Profile photo (parent portal)</label>
                <div className="flex flex-wrap items-center gap-4">
                  {editingStudent.profilePhotoUrl ? (
                    <img
                      src={editingStudent.profilePhotoUrl}
                      alt={editingStudent.name}
                      className="h-16 w-16 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">
                      No photo
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {isUploadingPhoto ? "Uploading…" : "Upload photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isPhotoBusy}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !editingStudent) return;
                          try {
                            const updated = await uploadStudentPhoto({ id: editingStudent.id, file }).unwrap();
                            setEditingStudent(updated);
                            setAlertModal({ isOpen: true, message: "Profile photo updated.", type: "success" });
                          } catch {
                            setAlertModal({ isOpen: true, message: "Failed to upload photo.", type: "error" });
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {editingStudent.profilePhotoUrl && (
                      <button
                        type="button"
                        disabled={isPhotoBusy}
                        onClick={async () => {
                          if (!editingStudent) return;
                          try {
                            const updated = await deleteStudentPhoto(editingStudent.id).unwrap();
                            setEditingStudent(updated);
                            setAlertModal({ isOpen: true, message: "Profile photo removed.", type: "success" });
                          } catch {
                            setAlertModal({ isOpen: true, message: "Failed to remove photo.", type: "error" });
                          }
                        }}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {isDeletingPhoto ? "Removing…" : "Remove photo"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {editingStudent && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Student status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive (left school)</option>
                </select>
              </div>
            )}

            {!editingStudent && !isDropInStudent && (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-800 mb-3">Fee billing</p>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="feeMode"
                      checked={feeMode === "structure"}
                      onChange={() => setFeeMode("structure")}
                      className="border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Existing fee structure
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="feeMode"
                      checked={feeMode === "custom"}
                      onChange={() => setFeeMode("custom")}
                      className="border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Custom fee (new structure for this student)
                  </label>
                </div>
              </div>
            )}

            {isDropInStudent && (
              <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-4">
                <p className="text-sm font-semibold text-slate-900">Drop-in daily charge</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Agreed session type and rate with the parent. Monthly invoices are created manually under{" "}
                  <strong>Invoices → Drop-in invoices</strong>.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Session type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={dropInForm.sessionType}
                      onChange={(e) =>
                        setDropInForm({
                          ...dropInForm,
                          sessionType: e.target.value as "half" | "full",
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    >
                      <option value="half">Half day</option>
                      <option value="full">Full day</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Daily charge (Rs) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={dropInForm.rate}
                      onChange={(e) => setDropInForm({ ...dropInForm, rate: e.target.value })}
                      placeholder="e.g. 650"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {(editingStudent && !isDropInStudent) || (!editingStudent && enrollmentType === "regular" && feeMode === "structure") ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fee Structure <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.feeStructureId}
                  onChange={(e) => setForm({ ...form, feeStructureId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Fee Structure</option>
                  {feeStructures.map((fs) => (
                    <option key={fs.id} value={fs.id}>
                      {fs.name} (Monthly: Rs {fs.monthlyFee})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {!editingStudent && enrollmentType === "regular" && feeMode === "custom" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Registration fee (Rs) <span className="text-slate-400 font-normal">optional</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customFee.registrationFee}
                    onChange={(e) => setCustomFee({ ...customFee, registrationFee: e.target.value })}
                    placeholder="e.g. 5000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Annual charges (Rs) <span className="text-slate-400 font-normal">optional</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customFee.annualCharges}
                    onChange={(e) => setCustomFee({ ...customFee, annualCharges: e.target.value })}
                    placeholder="e.g. 12000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Monthly tuition (Rs) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customFee.monthlyFee}
                    onChange={(e) => setCustomFee({ ...customFee, monthlyFee: e.target.value })}
                    placeholder="e.g. 8000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Meals subscription (Rs/month) <span className="text-slate-400 font-normal">optional</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={customFee.mealsMonthly}
                    onChange={(e) => setCustomFee({ ...customFee, mealsMonthly: e.target.value })}
                    placeholder="e.g. 2500 — recurring on every invoice"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Uses the same additional-charges API as Extra charges; leave blank if the family is not taking meals.
                  </p>
                </div>
              </>
            )}

            {!editingStudent && (
              <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Meals subscription at admission</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Recurring <strong>Meals</strong> lines are stored with the shared <strong>StudentExtras</strong> cache used
                  on the student list and Invoices pages, so amounts stay in sync everywhere.
                </p>
                {enrollmentType === "drop_in" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Meals subscription (Rs/month) <span className="text-slate-400 font-normal">optional</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={dropInForm.mealsMonthly}
                      onChange={(e) => setDropInForm({ ...dropInForm, mealsMonthly: e.target.value })}
                      placeholder="e.g. 2500 — recurring on every invoice"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Leave blank if the family is not taking meals.
                    </p>
                  </div>
                )}
                {enrollmentType === "regular" && feeMode === "structure" && !form.feeStructureId && (
                  <p className="text-xs text-slate-500">Select a fee structure to see if this plan includes a default meals rate.</p>
                )}
                {enrollmentType === "regular" && feeMode === "structure" && form.feeStructureId && planMealsDefault > 0 && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={includePlanMealsSubscription}
                      onChange={(e) => setIncludePlanMealsSubscription(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                    />
                    <span>
                      Add recurring <strong>Meals</strong> now at{" "}
                      <strong>Rs {planMealsDefault.toLocaleString()}/month</strong> (same as &quot;Add meals subscription
                      from plan&quot; under Extra charges).
                    </span>
                  </label>
                )}
                {enrollmentType === "regular" && feeMode === "structure" && form.feeStructureId && planMealsDefault <= 0 && (
                  <p className="text-xs text-slate-600">
                    This fee plan has no default meals rate. You can add meals later from the student list under{" "}
                    <strong>Extra charges</strong>, or pick a plan that defines meals.
                  </p>
                )}
                {enrollmentType === "regular" && feeMode === "custom" && (
                  <p className="text-xs text-slate-600">
                    For custom fees, enter an optional meals amount in the field above. If set, a recurring Meals charge
                    is created right after the student is saved.
                  </p>
                )}
              </div>
            )}

            {!isDropInStudent && (
            <div className="md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
              <p className="text-sm font-semibold text-slate-800">Household (siblings)</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Put siblings in the same household. The monthly fee on invoices can use a fixed before/after sibling rate
                only while at least two students in that household are <strong>active</strong>. Registration and other
                one-time discounts stay manual on each invoice.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Household</label>
                  <select
                    value={form.householdId}
                    onChange={(e) => setForm({ ...form, householdId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {(h.label && h.label.trim()) || `Household #${h.id}`} ({h.activeMemberCount ?? 0} active,{" "}
                        {h.memberCount ?? 0} assigned)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New household label (optional)</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newHouseholdLabel}
                      onChange={(e) => setNewHouseholdLabel(e.target.value)}
                      placeholder="e.g. Khan family"
                      className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleCreateHousehold}
                      disabled={isCreatingHousehold}
                      className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {isCreatingHousehold ? "Creating…" : "Create household"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteHouseholdClick}
                      disabled={
                        !selectedHouseholdMeta ||
                        householdMemberCount > 0 ||
                        isDeletingHousehold ||
                        isCreatingHousehold
                      }
                      title={
                        householdMemberCount > 0
                          ? "Remove this household from all students first, then you can delete it."
                          : "Delete the selected household (only when no students are assigned)"
                      }
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDeletingHousehold ? "Deleting…" : "Delete household"}
                    </button>
                  </div>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.receivesSiblingDiscount}
                  onChange={(e) => setForm({ ...form, receivesSiblingDiscount: e.target.checked })}
                />
                <span>
                  This student uses the <strong>fixed sibling monthly</strong> rate (configured amounts below). At least
                  one other <strong>active</strong> student must share this household.
                </span>
              </label>
              {form.receivesSiblingDiscount && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly before discount (Rs)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.siblingPreMonthly}
                      onChange={(e) => setForm({ ...form, siblingPreMonthly: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly after discount (Rs)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.siblingPostMonthly}
                      onChange={(e) => setForm({ ...form, siblingPostMonthly: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discount from month</label>
                    <select
                      value={form.siblingDiscountFromMonth}
                      onChange={(e) => setForm({ ...form, siblingDiscountFromMonth: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select month</option>
                      {CALENDAR_MONTH_NAMES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discount from year</label>
                    <input
                      type="number"
                      value={form.siblingDiscountFromYear}
                      onChange={(e) => setForm({ ...form, siblingDiscountFromYear: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving || isUpdating || isAddingAdmissionExtra}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingStudent ? (isUpdating ? "Updating..." : "Update Student") : (isSaving ? "Saving..." : "Add Student")}
            </button>
            {editingStudent && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </SectionCard>

      <AlertModal
        isOpen={alertModal.isOpen}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ isOpen: false, message: "", type: "error" })}
      />

      <ConfirmModal
        isOpen={confirmDeleteHousehold.isOpen}
        message={`Delete household "${confirmDeleteHousehold.label}"? This cannot be undone.`}
        onConfirm={handleConfirmDeleteHousehold}
        onCancel={() => setConfirmDeleteHousehold({ isOpen: false, id: null, label: "" })}
      />
    </div>
  );
}
