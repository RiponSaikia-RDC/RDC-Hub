export type Role = "ADMIN" | "MEMBER" | "PLANT_STAFF";
export type RequestStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Plant {
  id: number;
  name: string;
  code: string;
  type?: string | null;
  area?: string | null;
  businessHead?: string | null;
  segment?: string | null;
}

export interface QueryType {
  id: number;
  name: string;
  description?: string | null;
  active: boolean;
  // Comma-separated keywords matched against inbound email subject/body
  // to auto-route it to this query type.
  keywords?: string | null;
  // At most one QueryType has this true — the fallback for inbound email
  // that matches no keywords.
  isEmailDefault?: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  role: Role;
  active: boolean;
  // False for a bulk-imported user until they complete OTP activation.
  activated: boolean;
  plantId: number | null;
  plant?: Plant | null;
}

export interface Attachment {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface Comment {
  id: number;
  body: string;
  // Curated, server-sanitised rich-text version of an inbound email reply.
  // Present only for source="EMAIL" replies that carried HTML; render this
  // (through DOMPurify) in preference to `body` when set. See RichText.tsx.
  bodyHtml?: string | null;
  createdAt: string;
  author: { id: number; name: string; role: Role };
  attachments: Attachment[];
  // "WEB" (posted in the Hub) or "EMAIL" (an inbound reply from the plant
  // staff member's mailbox).
  source: "WEB" | "EMAIL";
}

export interface ServiceRequest {
  id: number;
  ticketNumber: string;
  subject: string;
  body: string;
  // Curated, server-sanitised rich-text version of an inbound email body
  // (source="EMAIL" only, when the email carried HTML). See RichText.tsx.
  bodyHtml?: string | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  queryType: { id: number; name: string };
  plant: { id: number; name: string };
  requester: { id: number; name: string; email?: string };
  assignedTo: { id: number; name: string; email?: string } | null;
  attachments?: Attachment[];
  comments?: Comment[];
  // "WEB" (created via the New Request form, historical) or "EMAIL"
  // (created by the email poller from an inbound message).
  source: "WEB" | "EMAIL";
  // False when an inbound email matched no QueryType keyword — it's
  // unassigned and broadcast to every member instead of auto-picked, and
  // the "teach routing" panel shows on the detail page.
  keywordMatched: boolean;
  // Raw comma-separated addresses from the original email's To/Cc, if any.
  originalToRaw?: string | null;
  originalCcRaw?: string | null;
}

export interface FaqEntry {
  id: number;
  question: string;
  answer: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  queryType?: { id: number; name: string } | null;
  createdBy?: { id: number; name: string };
}

export interface QueryTypeAssignment {
  id: number;
  user: { id: number; name: string };
  queryType: { id: number; name: string };
}

export interface BulkResultRow {
  row: number;
  status: "created" | "skipped" | "error";
  message?: string;
  [key: string]: unknown;
}

export interface BulkUploadResponse {
  summary: { created: number; skipped: number; errors: number };
  results: BulkResultRow[];
}
