import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API_BASE, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { QueryType, RequestStatus, ServiceRequest, User } from "../types";

const STATUS_FLOW: RequestStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [sr, setSr] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [faqMessage, setFaqMessage] = useState<string | null>(null);

  // "Teach routing" panel state (shown for source=EMAIL tickets that
  // matched no keyword — see requests.ts's keywordMatched).
  const [teachKeywords, setTeachKeywords] = useState("");
  const [teachQueryTypeId, setTeachQueryTypeId] = useState("");
  const [teachAssigneeId, setTeachAssigneeId] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [teachMessage, setTeachMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ServiceRequest>(`/requests/${id}`);
      setSr(data);
      setTeachQueryTypeId(String(data.queryType.id));
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
    // GET /users returns the full list for Admin, a lightweight
    // id/name-only member list for everyone else — safe for any logged-in
    // user to call (needed here for reassign/claim/teach dropdowns).
    if (user?.role === "ADMIN" || user?.role === "MEMBER") {
      api.get<User[]>("/users").then((u) => setMembers(u.filter((m) => m.role === "MEMBER"))).catch(() => {});
      api.get<QueryType[]>("/query-types").then(setQueryTypes).catch(() => {});
    }
  }, [user]);

  const isUnclaimed = !!sr && !sr.assignedTo;
  const canUpdate = sr && user && (user.role === "ADMIN" || sr.assignedTo?.id === user.id || (user.role === "MEMBER" && isUnclaimed));
  const canClaim = user?.role === "MEMBER" && isUnclaimed;
  const canReassign = user?.role === "ADMIN" || canClaim;
  const canPromoteToFaq = sr && user && (user.role === "ADMIN" || sr.assignedTo?.id === user.id);
  const showTeachPanel = sr && sr.source === "EMAIL" && !sr.keywordMatched && (user?.role === "ADMIN" || user?.role === "MEMBER");

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim() || !sr) return;
    setPosting(true);
    try {
      // Plain JSON when there's nothing to attach; multipart/form-data (so
      // the files ride along with the same request, and get emailed out
      // together with the reply — see requests.ts's POST /:id/comments)
      // as soon as at least one file is picked.
      if (commentFiles.length > 0) {
        const form = new FormData();
        form.append("body", commentBody);
        if (ccInput) form.append("cc", ccInput);
        commentFiles.forEach((f) => form.append("files", f));
        await api.post(`/requests/${sr.id}/comments`, form);
      } else {
        await api.post(`/requests/${sr.id}/comments`, { body: commentBody, cc: ccInput || undefined });
      }
      setCommentBody("");
      setCcInput("");
      setCommentFiles([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post the reply");
    } finally {
      setPosting(false);
    }
  }

  function addCommentFiles(fileList: FileList | null) {
    if (!fileList) return;
    setCommentFiles((prev) => [...prev, ...Array.from(fileList)].slice(0, 5));
  }

  function removeCommentFile(index: number) {
    setCommentFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  async function handleTeach(e: FormEvent) {
    e.preventDefault();
    if (!sr || !teachKeywords.trim() || !teachQueryTypeId) return;
    setTeaching(true);
    setTeachMessage(null);
    try {
      await api.post(`/query-types/${teachQueryTypeId}/learn`, {
        keywords: teachKeywords,
        assigneeId: teachAssigneeId ? Number(teachAssigneeId) : undefined,
      });
      await api.patch(`/requests/${sr.id}`, {
        queryTypeId: Number(teachQueryTypeId),
        assignedToId: teachAssigneeId ? Number(teachAssigneeId) : undefined,
      });
      setTeachMessage("Saved — future emails matching these keywords will route automatically.");
      setTeachKeywords("");
      await load();
    } catch (err) {
      setTeachMessage(err instanceof ApiError ? err.message : "Could not save this routing rule");
    } finally {
      setTeaching(false);
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
            <span className="text-xs font-medium text-slate-500">
              {sr.ticketNumber}
              {sr.source === "EMAIL" && (
                <span title="Raised by email" className="ml-1.5">📧</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {isUnclaimed && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  Unclaimed — visible to all members
                </span>
              )}
              <StatusBadge status={sr.status} />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{sr.subject}</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{sr.body}</p>

          {sr.attachments && sr.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sr.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`${API_BASE}/api/attachments/${a.id}/download`}
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

        {showTeachPanel && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-amber-900">Teach Routing</h2>
            <p className="mb-3 text-xs text-amber-800">
              This email matched no keyword, so it wasn't auto-assigned — every member can see it until someone
              claims it. Add a keyword and a responsible person below so similar emails route automatically next time.
            </p>
            <form onSubmit={handleTeach} className="space-y-2">
              <input
                className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                placeholder="Keyword(s), comma-separated — e.g. invoice, billing"
                value={teachKeywords}
                onChange={(e) => setTeachKeywords(e.target.value)}
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                  value={teachQueryTypeId}
                  onChange={(e) => setTeachQueryTypeId(e.target.value)}
                >
                  {queryTypes.map((qt) => (
                    <option key={qt.id} value={qt.id}>{qt.name}</option>
                  ))}
                </select>
                <select
                  className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                  value={teachAssigneeId}
                  onChange={(e) => setTeachAssigneeId(e.target.value)}
                >
                  <option value="">No specific person (keyword only)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>Route to {m.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={teaching || !teachKeywords.trim()}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {teaching ? "Saving…" : "Save routing rule"}
              </button>
              {teachMessage && <p className="text-xs text-amber-900">{teachMessage}</p>}
            </form>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Conversation</h2>
          <div className="space-y-3">
            {sr.comments?.length ? (
              sr.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {c.author.name}
                      {c.source === "EMAIL" && <span className="ml-1 font-normal text-slate-400">(via email)</span>}
                    </span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={`${API_BASE}/api/attachments/${a.id}/download`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          📎 {a.filename}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No replies yet.</p>
            )}
          </div>

          <form onSubmit={handleComment} className="mt-4 space-y-2">
            {sr.source === "EMAIL" && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">
                  This request came in by email — your reply will also be emailed to {sr.requester.email ?? "the sender"}
                  {(sr.originalToRaw || sr.originalCcRaw) && " and everyone who was on the original email"}, with the
                  original message quoted below it.
                </p>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                  placeholder="Add more Cc recipients (comma-separated, optional)"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                />
              </div>
            )}
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              rows={3}
              placeholder="Write a reply…"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
            />

            {commentFiles.length > 0 && (
              <ul className="space-y-1">
                {commentFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                  >
                    <span>
                      📎 {f.name} <span className="text-slate-400">({formatFileSize(f.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCommentFile(i)}
                      className="ml-2 text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${f.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between">
              <label className="cursor-pointer text-xs font-medium text-brand-700 hover:text-brand-800">
                📎 Attach files (Excel, PDF, images, …)
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={commentFiles.length >= 5}
                  onChange={(e) => {
                    addCommentFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {commentFiles.length >= 5 && <span className="text-xs text-slate-400">Max 5 files per reply</span>}
            </div>

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
            <h2 className="mb-2 text-sm font-semibold text-slate-800">{canClaim ? "Claim / Assign" : "Reassign"}</h2>
            {canClaim && user && (
              <button
                onClick={() => handleReassign(user.id)}
                className="mb-2 w-full rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                Claim for myself
              </button>
            )}
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
