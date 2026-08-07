import { RequestStatus } from "../types";

const STYLES: Record<RequestStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800 ring-amber-600/20",
  IN_PROGRESS: "bg-blue-100 text-blue-800 ring-blue-600/20",
  RESOLVED: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  CLOSED: "bg-slate-200 text-slate-700 ring-slate-500/20",
};

const LABELS: Record<RequestStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
