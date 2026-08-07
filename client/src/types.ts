export type Role = "ADMIN" | "MEMBER" | "PLANT_STAFF";
export type RequestStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Plant {
  id: number;
  name: string;
  code: string;
}

export interface QueryType {
  id: number;
  name: string;
  description?: string | null;
  active: boolean;
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
  createdAt: string;
  author: { id: number; name: string; role: Role };
  attachments: Attachment[];
}

export interface ServiceRequest {
  id: number;
  ticketNumber: string;
  subject: string;
  body: string;
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
