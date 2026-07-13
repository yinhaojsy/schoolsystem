import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { setUser } from "../app/authSlice";
import { clearAdminPreview } from "../utils/adminPreview";
import { useGetProfileQuery, useChangePasswordMutation } from "../services/api";

export default function AccountPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { data: profile } = useGetProfileQuery();
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  const display = profile ?? user;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (newPassword.length < 6) {
      setMessage("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setMessage(msg || "Could not update password.");
    }
  };

  const logout = () => {
    clearAdminPreview();
    dispatch(setUser(null));
    navigate("/login");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Account</h2>
      <section className="rounded-3xl bg-white p-5 shadow-sm text-sm">
        <p className="font-semibold">{display?.name}</p>
        <p className="text-slate-500">{display?.email}</p>
        {display?.classGroupName && <p className="mt-1 text-brand-700">{display.classGroupName}</p>}
      </section>
      {message && <p className="text-sm text-brand-700">{message}</p>}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Change password</h3>
        <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" required />
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" required />
        <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" required />
        <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-brand-50 py-3 text-sm font-semibold text-brand-800">
          Update password
        </button>
      </form>
      <button type="button" onClick={logout} className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white">
        Log out
      </button>
    </div>
  );
}
