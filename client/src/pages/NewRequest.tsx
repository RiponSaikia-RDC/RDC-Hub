import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { FaqEntry, Plant, QueryType, ServiceRequest } from "../types";

export function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [queryTypeId, setQueryTypeId] = useState<number | "">("");
  const [plantId, setPlantId] = useState<number | "">(user?.plantId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<FaqEntry[]>([]);
  const [openAnswerId, setOpenAnswerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.get<QueryType[]>("/query-types").then(setQueryTypes).catch(() => {});
    api.get<Plant[]>("/plants").then(setPlants).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (subject.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get<FaqEntry[]>(`/faq?q=${encodeURIComponent(subject.trim())}&limit=4`);
        setSuggestions(results);
      } catch {
        // best-effort suggestions; ignore failures
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [subject]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!queryTypeId || !plantId) {
      setError("Please choose a query type and plant.");
      return;
    }
    setSubmitting(true);
    try {
      const sr = await api.post<ServiceRequest>("/requests", { subject, body, queryTypeId, plantId });
      if (files.length > 0) {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        await api.post(`/requests/${sr.id}/attachments`, form);
      }
      navigate(`/requests/${sr.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit the request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">New Service Request</h1>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
              required
              minLength={3}
            />
          </div>

          {suggestions.length > 0 && (
            <div className="rounded-md border border-brand-200 bg-brand-50 p-3">
              <p className="mb-2 text-xs font-medium text-brand-800">
                Similar questions have already been answered — check before submitting:
              </p>
              <ul className="space-y-1">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpenAnswerId(openAnswerId === s.id ? null : s.id)}
                      className="text-left text-sm font-medium text-brand-700 underline decoration-dotted hover:text-brand-900"
                    >
                      {s.question}
                    </button>
                    {openAnswerId === s.id && (
                      <p className="mt-1 rounded bg-white p-2 text-sm text-slate-700">{s.answer}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Query type</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={queryTypeId}
                onChange={(e) => setQueryTypeId(Number(e.target.value))}
                required
              >
                <option value="">Select…</option>
                {queryTypes.map((qt) => (
                  <option key={qt.id} value={qt.id}>{qt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Plant</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={plantId}
                onChange={(e) => setPlantId(Number(e.target.value))}
                required
              >
                <option value="">Select…</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Details</label>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue in detail — dates, PO/shipment numbers, etc."
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Attachments (optional)</label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">How routing works</h2>
        <p className="text-sm text-slate-600">
          Your request is automatically routed to a team member responsible for the query type you select.
          You can track its status any time from <span className="font-medium">My Requests</span>.
        </p>
      </div>
    </div>
  );
}
