import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { QueryType } from "../../types";

export function QueryTypes() {
  const [items, setItems] = useState<QueryType[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<QueryType[]>("/query-types?all=1").then(setItems);
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/query-types", { name, description: description || undefined });
      setName("");
      setDescription("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add query type");
    }
  }

  async function toggleActive(qt: QueryType) {
    await api.patch(`/query-types/${qt.id}`, { active: !qt.active });
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Query Types</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
