import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { setUser } from "../app/authSlice";
import { clearAdminPreview } from "../utils/adminPreview";
import {
  useGetProfileQuery,
  useChangeEmailMutation,
  useChangePasswordMutation,
} from "../services/api";

export default function AccountPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { data: profile } = useGetProfileQuery();
  const [changeEmail, { isLoading: savingEmail }] = useChangeEmailMutation();
  const [changePassword, { isLoading: savingPassword }] = useChangePasswordMutation();

  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const displayUser = profile ?? user;

  useEffect(() => {
    if (displayUser?.email) {
      setEmail(displayUser.email);
    }
  }, [displayUser?.email]);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await changeEmail({ email: email.trim() }).unwrap();
      dispatch(setUser(res.user));
      setEditingEmail(false);
      setMessage({ text: "Email updated successfully.", type: "success" });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setMessage({ text: msg || "Could not update email.", type: "error" });
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (newPassword.length < 6) {
      setMessage({ text: "New password must be at least 6 characters.", type: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: "New passwords do not match.", type: "error" });
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ text: "Password updated successfully.", type: "success" });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setMessage({ text: msg || "Could not update password.", type: "error" });
    }
  };

  const logout = () => {
    clearAdminPreview();
    dispatch(setUser(null));
    navigate("/login");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Account</h2>
        <p className="text-sm text-slate-500">Manage your profile and sign-in</p>
      </div>

      {message && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Profile</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">{displayUser?.name ?? "—"}</dd>
          </div>
          {displayUser?.householdLabel && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Household</dt>
              <dd className="font-medium text-slate-900">{displayUser.householdLabel}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Change email</h3>
        {editingEmail ? (
          <form onSubmit={handleEmailSubmit} className="mt-3 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              required
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail(displayUser?.email ?? "");
                  setEditingEmail(false);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEmail}
                className="flex-1 rounded-xl border border-brand-200 bg-brand-50 py-3 text-sm font-semibold text-brand-800 disabled:opacity-60"
              >
                {savingEmail ? "Saving…" : "Update email"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-slate-900">
              {displayUser?.email ?? "—"}
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail(displayUser?.email ?? "");
                setEditingEmail(true);
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-brand-700"
              aria-label="Edit email"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            </button>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Diary updates</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          When teachers add new diary entries, we briefly highlight what&apos;s new. Fun celebration
          animations may play for drink, meal, sleep, medicine, potty, and activity updates.
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Celebration animations</dt>
            <dd className="font-medium text-slate-900">
              {displayUser?.parentDiaryAnimations === false ? "Off (set by school)" : "On"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          &quot;Seen&quot; tracking is saved on this device only. Another phone or tablet may show
          highlights again until you open the diary there. Contact the school to turn animations off.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Change password</h3>
        <form onSubmit={handlePasswordSubmit} className="mt-3 space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            required
          />
          <button
            type="submit"
            disabled={savingPassword}
            className="w-full rounded-xl border border-brand-200 bg-brand-50 py-3 text-sm font-semibold text-brand-800 disabled:opacity-60"
          >
            {savingPassword ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      <button
        type="button"
        onClick={logout}
        className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white"
      >
        Log out
      </button>
    </div>
  );
}
