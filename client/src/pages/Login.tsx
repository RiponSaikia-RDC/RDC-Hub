import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notActivated, setNotActivated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotActivated(false);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setNotActivated(err.code === "NOT_ACTIVATED");
      } else {
        setError("Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {logoOk && (
          <img
            src="/rdc-truck.png"
            alt="RDC Concrete India Ltd."
            className="mx-auto mb-3 h-14 w-auto"
            onError={() => setLogoOk(false)}
          />
        )}
        <div className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          RDC Concrete India Ltd.
        </div>
        <h1 className="mb-1 text-center text-2xl font-bold text-brand-700">RDC Hub</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Logistics Service Request Platform</p>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">
              {error}
              {notActivated && (
                <>
                  {" "}
                  <Link to="/activate" className="font-medium underline">
                    Activate your account
                  </Link>
                </>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          New here? <Link to="/activate" className="text-brand-700 hover:underline">Activate your account</Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Plant staff: raise or follow up on a request by emailing your RDC Hub contact instead of logging in here.
        </p>
      </div>
    </div>
  );
}
