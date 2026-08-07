import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { RequestTable } from "../components/RequestTable";
import { StatusFilter } from "../components/StatusFilter";
import { ServiceRequest } from "../types";

export function MyRequests() {
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
        <h1 className="text-xl font-semibold text-slate-900">My Requests</h1>
        <div className="flex items-center gap-3">
          <StatusFilter value={status} onChange={setStatus} />
          <Link to="/new-request" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            + New Request
          </Link>
        </div>
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <RequestTable requests={requests} />}
    </div>
  );
}
