import { useEffect, useState } from "react";
import { api } from "../api/client";
import { RequestTable } from "../components/RequestTable";
import { StatusFilter } from "../components/StatusFilter";
import { ServiceRequest } from "../types";

export function Queue() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = status ? `?status=${status}` : "";
    api.get<ServiceRequest[]>(`/requests${qs}`).then(setRequests).finally(() => setLoading(false));
  }, [status]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">My Queue</h1>
        <StatusFilter value={status} onChange={setStatus} />
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <RequestTable requests={requests} showRequester />}
    </div>
  );
}
