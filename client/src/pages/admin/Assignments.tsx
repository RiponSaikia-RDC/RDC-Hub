import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { QueryType, QueryTypeAssignment, User } from "../../types";

export function Assignments() {
  const [members, setMembers] = useState<User[]>([]);
  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [assignments, setAssignments] = useState<QueryTypeAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [users, qts, assigns] = await Promise.all([
      api.get<User[]>("/users"),
      api.get<QueryType[]>("/query-types?all=1"),
      api.get<QueryTypeAssignment[]>("/assignments"),
    ]);
    setMembers(users.filter((u) => u.role === "MEMBER"));
    setQueryTypes(qts);
    setAssignments(assigns);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function findAssignment(userId: number, queryTypeId: number) {
    return assignments.find((a) => a.user.id === userId && a.queryType.id === queryTypeId);
  }

  async function toggle(userId: number, queryTypeId: number) {
    const existing = findAssignment(userId, queryTypeId);
    if (existing) {
      await api.del(`/assignments/${existing.id}`);
    } else {
      await api.post("/assignments", { userId, queryTypeId });
    }
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Assignments</h1>
      <p className="mb-4 text-sm text-slate-500">
        Give members rights to handle specific query types. New requests auto-route to the least-loaded member with
        rights to the chosen query type.
      </p>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No members yet — create a user with the Member role first.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-3">Member</th>
                {queryTypes.map((qt) => (
                  <th key={qt.id} className="px-4 py-3 text-center">{qt.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-800">{m.name}</td>
                  {queryTypes.map((qt) => (
                    <td key={qt.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!findAssignment(m.id, qt.id)}
                        onChange={() => toggle(m.id, qt.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
