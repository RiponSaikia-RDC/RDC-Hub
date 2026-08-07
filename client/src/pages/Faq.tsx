import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CsvUploader } from "../components/CsvUploader";
import { BulkUploadResponse, FaqEntry, QueryType, ServiceRequest } from "../types";

export function Faq() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<ServiceRequest[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [queryTypeId, setQueryTypeId] = useState<number | "">("");
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = user?.role === "ADMIN" || user?.role === "MEMBER";

  async function loadEntries() {
    setLoading(true);
    const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const data = await api.get<FaqEntry[]>(`/faq${qs}`);
    setEntries(data);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(loadEntries, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (user?.role === "PLANT_STAFF") {
      api.get<ServiceRequest[]>("/requests").then((r) => setRecent(r.slice(0, 5))).catch(() => {});
    }
    if (canManage) {
      api.get<QueryType[]>("/query-types").then(setQueryTypes).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleOpen(entry: FaqEntry) {
    setOpenId(openId === entry.id ? null : entry.id);
    if (openId !== entry.id) {
      try {
        await api.post(`/faq/${entry.id}/view`);
      } catch {
        // non-critical
      }
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.post("/faq", { question, answer, queryTypeId: queryTypeId || null });
      setQuestion("");
      setAnswer("");
      setQueryTypeId("");
      setShowForm(false);
      loadEntries();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add entry");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Common Questions</h1>
          {canManage && (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              {showForm ? "Cancel" : "+ Add Question"}
            </button>
          )}
        </div>

        {canManage && (
          <div className="mb-4">
            <CsvUploader
              title="Bulk Upload Common Questions"
              description='CSV columns: "question", "answer", "querytype" (optional, matched by name). Rows with a question that already exists are skipped.'
              templateFilename="rdc-hub-faq-template.csv"
              templateHeaders={["question", "answer", "querytype"]}
              templateSampleRow={["How do I report a delayed truck?", "Submit a request under Transport Delay with the PO number.", "Transport Delay"]}
              onUpload={(file) => {
                const form = new FormData();
                form.append("file", file);
                return api.post<BulkUploadResponse>("/faq/bulk", form).then((res) => {
                  loadEntries();
                  return res;
                });
              }}
            />
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              minLength={3}
            />
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Answer"
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={queryTypeId}
              onChange={(e) => setQueryTypeId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">No specific query type</option>
              {queryTypes.map((qt) => (
                <option key={qt.id} value={qt.id}>{qt.name}</option>
              ))}
            </select>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Save
            </button>
          </form>
        )}

        <input
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Search common questions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No matching questions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => handleOpen(entry)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium text-slate-800">{entry.question}</span>
                  {entry.queryType && (
                    <span className="ml-3 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {entry.queryType.name}
                    </span>
                  )}
                </button>
                {openId === entry.id && (
                  <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">{entry.answer}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {user?.role === "PLANT_STAFF" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Your Recently Asked Questions</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">You haven't submitted any requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`} className="block rounded-md px-2 py-1.5 text-sm text-brand-700 hover:bg-slate-50">
                    {r.subject}
                    <span className="ml-2 text-xs text-slate-400">{r.ticketNumber}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
