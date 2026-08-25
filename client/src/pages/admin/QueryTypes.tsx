import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { QueryType } from "../../types";

export function QueryTypes() {
  const [items, setItems] = useState<QueryType[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<number, string>>({});

  function load() {
    api.get<QueryType[]>("/query-types?all=1").then(setItems);
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/query-types", { name, description: description || undefined, keywords: keywords || undefined });
      setName("");
      setDescription("");
      setKeywords("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add query type");
    }
  }

  async function toggleActive(qt: QueryType) {
    await api.patch(`/query-types/${qt.id}`, { active: !qt.active });
    load();
  }

  async function saveKeywords(qt: QueryType) {
    const draft = keywordDrafts[qt.id];
    if (draft === undefined || draft === (qt.keywords ?? "")) return;
    await api.patch(`/query-types/${qt.id}`, { keywords: draft || null });
    load();
  }

  async function setAsEmailDefault(qt: QueryType) {
    await api.patch(`/query-types/${qt.id}`, { isEmailDefault: true });
    load();
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Query Types</h1>
      <p className="mb-4 text-sm text-slate-500">
        Keywords route inbound plant-staff emails to a query type automatically (comma-separated, matched
        case-insensitively against the subject and body). Exactly one query type should be the "email default" —
        it catches anything that matches no keywords.
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Email Keywords</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((qt) => (
                <tr key={qt.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{qt.name}</td>
                  <td className="px-4 py-3 text-slate-500">{qt.description}</td>
                  <td className="px-4 py-3">
                    <input
                      className="w-full min-w-[10rem] rounded-md border border-slate-300 px-2 py-1 text-xs"
                      placeholder="e.g. invoice, billing"
                      value={keywordDrafts[qt.id] ?? qt.keywords ?? ""}
                      onChange={(e) => setKeywordDrafts((d) => ({ ...d, [qt.id]: e.target.value }))}
                      onBlur={() => saveKeywords(qt)}
                    />
                    {qt.isEmailDefault ? (
                      <span className="mt-1 block text-[11px] font-medium text-brand-700">★ Email default</span>
                    ) : (
                      <button onClick={() => setAsEmailDefault(qt)} className="mt-1 text-[11px] text-slate-400 hover:text-brand-700 hover:underline">
                        Set as email default
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={qt.active ? "text-emerald-700" : "text-slate-400"}>
                      {qt.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(qt)} className="text-xs text-brand-700 hover:underline">
                      {qt.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Add Query Type</h2>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email keywords (optional, comma-separated)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
