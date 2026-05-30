import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLoginMutation } from "../services/api";
import { useAppDispatch } from "../app/hooks";
import { setUser } from "../app/authSlice";

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
      dispatch(setUser(res.user));
      navigate("/");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined;
      setError(msg || "Login failed. Please check your credentials.");
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-800 to-brand-700 px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-sm flex-1">
        <div className="mb-10 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold backdrop-blur">
            SV
          </div>
          <h1 className="text-2xl font-bold">Sprouts Valley</h1>
          <p className="mt-1 text-brand-100">Parent portal sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-brand-700 py-3.5 text-base font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Accounts are created by the school. Contact the office if you need access.
          </p>
        </form>
      </div>
    </div>
  );
}
