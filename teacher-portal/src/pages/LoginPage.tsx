import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLoginMutation } from "../services/api";
import { useAppDispatch } from "../app/hooks";
import { setUser } from "../app/authSlice";
import { clearAdminPreview } from "../utils/adminPreview";

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await login({ email, password }).unwrap();
      clearAdminPreview();
      dispatch(setUser(res.user));
      navigate("/");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setError(msg || "Login failed.");
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-800 to-brand-600 px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-sm flex-1">
        <div className="mb-10 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold">SV</div>
          <h1 className="text-2xl font-bold">Teacher Portal</h1>
          <p className="mt-1 text-brand-100">Sprouts Valley daycare</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3" required />
          </div>
          <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white disabled:opacity-60">
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
