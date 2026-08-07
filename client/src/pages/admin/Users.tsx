import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { Plant, Role, User } from "../../types";

const ROLES: Role[] = ["PLANT_STAFF", "MEMBER", "ADMIN"];

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("PLANT_STAFF");
  const [plantId, setPlantId] = useState<number | "">("");

  function load() {
    api.get<User[]>("/users").then(setUsers);
  }

  useEffect(() => {
    load();
    api.get<Plant[]>("/plants").then(setPlants);
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", { name, email, username, password, role, plantId: plantId || null });
      setName("");
      setEmail("");
      setUsername("");
      setPassword("");
      setRole("PLANT_STAFF");
      setPlantId("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add user");
    }
  }

  async function updateUser(id: number, patch: Partial<{ role: Role; plantId: number | null; active: boolean }>) {
    await api.patch(`/users/${id}`, patch);
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Users</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Plant</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.username}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={u.role}
                      onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={u.plantId ?? ""}
                      onChange={(e) => updateUser(u.id, { plantId: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {plants.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateUser(u.id, { active: !u.active })}
                      className={`text-xs ${u.active ? "text-emerald-700" : "text-slate-400"} hover:underline`}
                    >
                      {u.active ? "Active" : "Disabled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Add User</h2>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Temporary password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </select>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={plantId} onChange={(e) => setPlantId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">No home plant</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add User
          </button>
        </form>
      </div>
    </div>
  );
}
