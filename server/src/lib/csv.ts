import { parse } from "csv-parse/sync";
import multer from "multer";

/** In-memory upload for small CSV files (never written to disk). */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB is generous for a CSV of a few thousand rows
  fileFilter: (_req, file, cb) => {
    const looksLikeCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (looksLikeCsv) {
      cb(null, true);
    } else {
      cb(new Error("Please upload a .csv file"));
    }
  },
});

export const MAX_BULK_ROWS = 1000;

/**
 * Parses a CSV buffer into row objects keyed by lower-cased, trimmed
 * header names, so "Name", " name ", "NAME" all map to the same key —
 * admins exporting from Excel shouldn't have to match casing exactly.
 */
export function parseCsv(buffer: Buffer): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(buffer, {
    columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return rows;
}

export interface BulkResultRow {
  row: number;
  status: "created" | "skipped" | "error";
  message?: string;
  [key: string]: unknown;
}

export function bulkSummary(results: BulkResultRow[]) {
  return {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };
}
