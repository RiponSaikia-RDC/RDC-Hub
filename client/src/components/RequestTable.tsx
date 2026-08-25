import { Link } from "react-router-dom";
import { ServiceRequest } from "../types";
import { StatusBadge } from "./StatusBadge";

export function RequestTable({ requests, showRequester = false }: { requests: ServiceRequest[]; showRequester?: boolean }) {
  if (requests.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No requests found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Ticket</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Query Type</th>
            <th className="px-4 py-3">Plant</th>
            {showRequester && <th className="px-4 py-3">Requester</th>}
            <th className="px-4 py-3">Assigned To</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3">
                <Link to={`/requests/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.ticketNumber}
                </Link>
                {r.source === "EMAIL" && (
                  <span title="Raised by email" className="ml-1.5 align-middle">📧</span>
                )}
              </td>
              <td className="max-w-xs truncate px-4 py-3">{r.subject}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.queryType.name}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.plant.name}</td>
              {showRequester && <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.requester.name}</td>}
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.assignedTo?.name ?? "Unassigned"}</td>
              <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={r.status} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(r.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
