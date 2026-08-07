import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { RequestStatus, ServiceRequest, User } from "../types";

const STATUS_FLOW: RequestStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [sr, setSr] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const [faqMessage, setFaqMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ServiceRequest>(`/requests/${id}`);
      setSr(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this request");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      api.get<User[]>("/users").then((u) => setMembers(u.filter((m) => m.role === "MEMBER"))).catch(() => {});
    }
  }, [user]);

  const canUpdate = sr && user && (user.role === "ADMIN" || sr.assignedTo?.id === user.id);
  const canReassign = user?.role === "ADMIN";
  const canPromoteToFaq = sr && user && (user.role === "ADMIN" || sr.assignedTo?.id === user.id);

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim() || !sr) return;
    setPosting(true);
    try {
      await api.post(`/requests/${sr.id}/comments`, { body: commentBody });
      setCommentBody("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post the reply");
    } finally {
      setPosting(false);
    }
  }

  async function handleStatusChange(status: RequestStatus) {
    if (!sr) return;
    try {
      const updated = await api.patch<ServiceRequest>(`/requests/${sr.id}`, { status });
      setSr(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status");
    }
  }

  async function handleReassign(assignedToId: number) {
    if (!sr) return;
    try {
      const updated = await api.patch<ServiceRequest>(`/requests/${sr.id}`, { assignedToId });
      setSr(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reassign");
    }
  }

  async function handlePromoteToFaq() {
    if (!sr) return;
    setFaqMessage(null);
    try {
      await api.post("/faq", {
        question: sr.subject,
        answer: sr.comments?.filter((c) => c.author.role !== "PLANT_STAFF").slice(-1)[0]?.body ?? sr.body,
        queryTypeId: sr.queryType.id,
        sourceSrId: sr.id,
      });
      setFaqMessage("Added to Common Questions.");
    } catch (err) {
      setFaqMessage(err instanceof ApiError ? err.message : "Could not add to FAQ");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error && !sr) return <p className="text-sm text-red-600">{error}</p>;
  if (!sr) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{sr.ticketNumber}</span>
            <StatusBadge status={sr.status} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{sr.subject}</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{sr.body}</p>

          {sr.attachments && sr.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sr.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/attachments/${a.id}/download`}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  📎 {a.filename}
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-4">
            <div><div className="font-medium text-slate-700">Query Type</div>{sr.queryType.name}</div>
            <div><div className="font-medium text-slate-700">Plant</div>{sr.plant.name}</div>
            <div><div className="font-medium text-slate-700">Requester</div>{sr.requester.name}</div>
            <div><div className="font-medium text-slate-700">Assigned To</div>{sr.assignedTo?.name ?? "Unassigned"}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Conversation</h2>
          <div className="space-y-3">
            {sr.comments?.length ? (
              sr.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{c.author.name}</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No replies yet.</p>
            )}
          </div>

          <form onSubmit={handleComment} className="mt-4 space-y-2">
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              rows={3}
              placeholder="Write a reply…"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
            />
            <button
              type="submit"
              disabled={posting || !commentBody.trim()}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {posting ? "Posting…" : "Post Reply"}
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
        {canUpdate && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_FLOW.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={s === sr.status}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    s === sr.status ? "bg-slate-100 text-slate-400" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                  }`}
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {canReassign && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Reassign</h2>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={sr.assignedTo?.id ?? ""}
              onChange={(e) => e.target.value && handleReassign(Number(e.target.value))}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {canPromoteToFaq && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Common Questions</h2>
            <p className="mb-3 text-xs text-slate-500">
              Add this question and its latest answer to the Common Questions tab so plant staff can self-serve next time.
            </p>
            <button
              onClick={handlePromoteToFaq}
              className="rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              Add to Common Questions
            </button>
            {faqMessage && <p className="mt-2 text-xs text-slate-600">{faqMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
