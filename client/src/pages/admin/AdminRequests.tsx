import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { RequestTable } from "../../components/RequestTable";
import { StatusFilter } from "../../components/StatusFilter";
import { QueryType, ServiceRequest } from "../../types";

export function AdminRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [status, setStatus] = useState("");
  const [queryTypeId, setQueryTypeId] = useState("");
  const [search, setSearch] = useState("");
  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<QueryType[]>("/query-types?all=1").then(setQueryTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (queryTypeId) params.set("queryTypeId", queryTypeId);
    if (search) params.set("search", search);
    const qs = params.toString();
    api.get<ServiceRequest[]>(`/requests${qs ? `?${qs}` : ""}`).then(setRequests).finally(() => setLoading(false));
  }, [status, queryTypeId, search]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">All Requests</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search ticket # or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <StatusFilter value={status} onChange={setStatus} />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={queryTypeId}
          onChange={(e) => setQueryTypeId(e.target.value)}
        >
          <option value="">All query types</option>
          {queryTypes.map((qt) => (
            <option key={qt.id} value={qt.id}>{qt.name}</option>
          ))}
        </select>
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <RequestTable requests={requests} showRequester />}
    </div>
  );
}
