import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { CsvUploader } from "../../components/CsvUploader";
import { BulkUploadResponse, Plant, Role, User } from "../../types";

const ROLES: Role[] = ["PLANT_STAFF", "MEMBER", "ADMIN"];

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [otpBanner, setOtpBanner] = useState<{ username: string; otp: string } | null>(null);

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
      await api.post("/users", {
        name,
        email,
        username,
        password: role === "PLANT_STAFF" ? undefined : password,
        role,
        plantId: plantId || null,
      });
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

  async function regenerateOtp(u: User) {
    const result = await api.post<{ user: User; otp: string }>(`/users/${u.id}/regenerate-otp`);
    setOtpBanner({ username: u.username, otp: result.otp });
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Users</h1>
      <p className="mb-4 text-sm text-slate-500">
        Plant Staff no longer log in to the Hub — they raise and follow up on requests entirely by email.
        Plant Staff records here are just a directory (name/email/plant) used to route their emails correctly
        from first contact; new ones are also created automatically the first time someone emails in.
      </p>

      {otpBanner && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
          <span>
            New OTP for <span className="font-semibold">{otpBanner.username}</span>:{" "}
            <span className="font-mono font-bold tracking-wider">{otpBanner.otp}</span>{" "}
            <span className="text-slate-500">(valid 7 days — relay this to them, they enter it on the Activate Account page)</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(otpBanner.otp)}
              className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              Copy
            </button>
            <button onClick={() => setOtpBanner(null)} className="text-xs text-slate-500 hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <CsvUploader
          title="Bulk Upload Users"
          description='CSV columns: "name", "email", "username", "role" (ADMIN/MEMBER/PLANT_STAFF), "plantcode" (optional). New Admin/Member users get no password — each gets a one-time OTP shown below to activate their own account. Plant Staff rows are directory-only (no login, no OTP).'
          templateFilename="rdc-hub-users-template.csv"
          templateHeaders={["name", "email", "username", "role", "plantcode"]}
          templateSampleRow={["Jane Doe", "jane.doe@rdc.in", "jdoe", "PLANT_STAFF", "PLT1"]}
          extraColumnLabel="OTP"
          renderExtra={(r) =>
            r.status === "created" && typeof r.otp === "string" ? (
              <span className="font-mono font-semibold">{r.otp}</span>
            ) : (
              <span className="text-slate-400">—</span>
            )
          }
          onUpload={(file) => {
            const form = new FormData();
            form.append("file", file);
            return api.post<BulkUploadResponse>("/users/bulk", form).then((res) => {
              load();
              return res;
            });
          }}
        />
      </div>

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
                <th className="px-4 py-3"></th>
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
                    <div className="flex flex-col items-start gap-1">
                      <button
                        onClick={() => updateUser(u.id, { active: !u.active })}
                        className={`text-xs ${u.active ? "text-emerald-700" : "text-slate-400"} hover:underline`}
                      >
                        {u.active ? "Active" : "Disabled"}
                      </button>
                      {u.role !== "PLANT_STAFF" && !u.activated && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Pending activation
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === "PLANT_STAFF" ? (
                      <span className="text-xs text-slate-400">Directory only</span>
                    ) : (
                      <button onClick={() => regenerateOtp(u)} className="text-xs text-brand-700 hover:underline">
                        {u.activated ? "Reset via OTP" : "Resend OTP"}
                      </button>
                    )}
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
          {role !== "PLANT_STAFF" && (
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Temporary password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          )}
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </select>
          {role === "PLANT_STAFF" && (
            <p className="text-xs text-slate-500">Plant Staff don't log in — this just registers them as a directory entry for email routing.</p>
          )}
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
