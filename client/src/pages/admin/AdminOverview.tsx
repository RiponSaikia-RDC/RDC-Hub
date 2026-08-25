import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { RequestStatus, ServiceRequest } from "../../types";

const TILES: { status: RequestStatus | "UNASSIGNED"; label: string; color: string }[] = [
  { status: "OPEN", label: "Open", color: "bg-amber-50 text-amber-800" },
  { status: "IN_PROGRESS", label: "In Progress", color: "bg-blue-50 text-blue-800" },
  { status: "RESOLVED", label: "Resolved", color: "bg-emerald-50 text-emerald-800" },
  { status: "CLOSED", label: "Closed", color: "bg-slate-100 text-slate-700" },
  { status: "UNASSIGNED", label: "Unassigned", color: "bg-red-50 text-red-800" },
];

interface EmailStatus {
  configured: boolean;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export function AdminOverview() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);

  useEffect(() => {
    api.get<ServiceRequest[]>("/requests").then(setRequests).finally(() => setLoading(false));
    api.get<EmailStatus>("/admin/email-status").then(setEmailStatus).catch(() => {});
  }, []);

  const counts = {
    OPEN: requests.filter((r) => r.status === "OPEN").length,
    IN_PROGRESS: requests.filter((r) => r.status === "IN_PROGRESS").length,
    RESOLVED: requests.filter((r) => r.status === "RESOLVED").length,
    CLOSED: requests.filter((r) => r.status === "CLOSED").length,
    UNASSIGNED: requests.filter((r) => !r.assignedTo).length,
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Overview</h1>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {TILES.map((t) => (
            <Link
              key={t.status}
              to="/admin/requests"
              className={`rounded-xl p-5 shadow-sm transition-transform hover:-translate-y-0.5 ${t.color}`}
            >
              <div className="text-3xl font-bold">{counts[t.status as keyof typeof counts]}</div>
              <div className="mt-1 text-sm font-medium">{t.label}</div>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-slate-500">
        Manage members, query types, and routing rights from the tabs above. New service requests route automatically
        to the least-loaded member with rights to the chosen query type.
      </p>

      {emailStatus && (
        <div className="mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Email Intake</h2>
          {!emailStatus.configured ? (
            <p className="text-sm text-slate-500">
              Not configured yet — set the <code className="rounded bg-slate-100 px-1">GMAIL_*</code> variables in
              the server's <code className="rounded bg-slate-100 px-1">.env</code> (see README) to let plant staff
              raise requests by email.
            </p>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-700">Configured and polling.</p>
              <p className="text-slate-500">
                Last checked: {emailStatus.lastPollAt ? new Date(emailStatus.lastPollAt).toLocaleString() : "never yet"}
              </p>
              {emailStatus.lastError ? (
                <p className="text-red-600">Last error: {emailStatus.lastError}</p>
              ) : (
                <p className="text-slate-500">
                  Last success: {emailStatus.lastSuccessAt ? new Date(emailStatus.lastSuccessAt).toLocaleString() : "—"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
