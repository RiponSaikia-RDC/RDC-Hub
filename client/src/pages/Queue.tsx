import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { RequestTable } from "../components/RequestTable";
import { StatusFilter } from "../components/StatusFilter";
import { ServiceRequest } from "../types";

export function Queue() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = status ? `?status=${status}` : "";
    api.get<ServiceRequest[]>(`/requests${qs}`).then(setRequests).finally(() => setLoading(false));
  }, [status]);

  // The API already scopes MEMBER requests to "assigned to me" + "unclaimed"
  // (see requests.ts) — split them into two sections here so it's obvious
  // which ones are unrouted email tickets waiting for anyone to claim.
  const mine = requests.filter((r) => r.assignedTo?.id === user?.id);
  const unclaimed = requests.filter((r) => !r.assignedTo);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">My Queue</h1>
          <StatusFilter value={status} onChange={setStatus} />
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : <RequestTable requests={mine} showRequester />}
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Unclaimed</h2>
        <p className="mb-4 text-sm text-slate-500">
          Emails that matched no routing keyword — visible to every member. Open one to claim it and, optionally,
          teach the router a keyword for next time.
        </p>
        {!loading && <RequestTable requests={unclaimed} showRequester />}
      </div>
    </div>
  );
}
