import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { CsvUploader } from "../../components/CsvUploader";
import { BulkUploadResponse, Plant } from "../../types";

export function Plants() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [area, setArea] = useState("");
  const [businessHead, setBusinessHead] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Plant[]>("/plants").then(setPlants);
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/plants", { name, code, area: area || undefined, businessHead: businessHead || undefined });
      setName("");
      setCode("");
      setArea("");
      setBusinessHead("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add plant");
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.del(`/plants/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove plant");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Plants</h1>

      <div className="mb-6">
        <CsvUploader
          title="Bulk Upload Plants"
          description='CSV columns: "name", "code" (required); "type", "area", "businessHead", "segment" (optional). Rows matching an existing plant name or code are skipped.'
          templateFilename="rdc-hub-plants-template.csv"
          templateHeaders={["name", "code", "type", "area", "businessHead", "segment"]}
          templateSampleRow={["Plant 4", "PLT4", "Commercial", "Gujarat", "Jane Doe", "Major"]}
          onUpload={(file) => {
            const form = new FormData();
            form.append("file", file);
            return api.post<BulkUploadResponse>("/plants/bulk", form).then((res) => {
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
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Business Head</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plants.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.code}</td>
                  <td className="px-4 py-3 text-slate-500">{p.area || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{p.businessHead || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Add Plant</h2>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Plant name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Short code (e.g. PLT4)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Area (optional)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Business Head (optional)"
            value={businessHead}
            onChange={(e) => setBusinessHead(e.target.value)}
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
