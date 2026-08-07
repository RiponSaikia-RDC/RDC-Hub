import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export function Activate() {
  const { user, activate } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await activate(username, otp, newPassword);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-brand-700">Activate Account</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Enter the username and one-time code (OTP) your admin gave you, then set your own password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">One-time code (OTP)</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Activating…" : "Activate & Sign In"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already activated? <Link to="/login" className="text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
