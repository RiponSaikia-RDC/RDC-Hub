import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { QueryType, QueryTypeAssignment, User } from "../../types";

export function QueryTypes() {
  const [items, setItems] = useState<QueryType[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<QueryTypeAssignment[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<number, string>>({});

  function load() {
    api.get<QueryType[]>("/query-types?all=1").then(setItems);
    api.get<QueryTypeAssignment[]>("/assignments").then(setAssignments);
    api.get<User[]>("/users").then((users) => setMembers(users.filter((u) => u.role === "MEMBER")));
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

  async function handleDelete(qt: QueryType) {
    if (!confirm(`Delete "${qt.name}"? This can't be undone.`)) return;
    setError(null);
    try {
      await api.del(`/query-types/${qt.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete query type");
    }
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

  function assignedTo(queryTypeId: number) {
    return assignments.filter((a) => a.queryType.id === queryTypeId);
  }

  async function addMember(queryTypeId: number, userId: number) {
    setError(null);
    try {
      await api.post("/assignments", { userId, queryTypeId });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign member");
    }
  }

  async function removeMember(assignmentId: number) {
    setError(null);
    try {
      await api.del(`/assignments/${assignmentId}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove member");
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Query Types</h1>
      <p className="mb-4 text-sm text-slate-500">
        Keywords route inbound plant-staff emails to a query type automatically (comma-separated, matched
        case-insensitively against the subject and body). Exactly one query type should be the "email default" —
        it catches anything that matches no keywords. New requests auto-route to the least-loaded member assigned
        to the matched query type.
      </p>

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email Keywords</th>
                <th className="px-4 py-3">Assigned Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((qt) => {
                const rowAssignments = assignedTo(qt.id);
                const assignedIds = new Set(rowAssignments.map((a) => a.user.id));
                const available = members.filter((m) => !assignedIds.has(m.id));
                return (
                  <tr key={qt.id}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-800">{qt.name}</div>
                      {qt.description && <div className="text-xs text-slate-500">{qt.description}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
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
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {rowAssignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                          >
                            {a.user.name}
                            <button
                              onClick={() => removeMember(a.id)}
                              className="text-brand-400 hover:text-brand-700"
                              title="Remove"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        {rowAssignments.length === 0 && (
                          <span className="text-[11px] text-slate-400">None — lands in Unassigned</span>
                        )}
                      </div>
                      {available.length > 0 && (
                        <select
                          className="mt-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
                          value=""
                          onChange={(e) => e.target.value && addMember(qt.id, Number(e.target.value))}
                        >
                          <option value="">+ Add member…</option>
                          {available.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={qt.active ? "text-emerald-700" : "text-slate-400"}>
                        {qt.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="flex flex-col items-end gap-1">
                        <button onClick={() => toggleActive(qt)} className="text-xs text-brand-700 hover:underline">
                          {qt.active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => handleDelete(qt)} className="text-xs text-red-600 hover:underline">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
          <button type="submit" className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
