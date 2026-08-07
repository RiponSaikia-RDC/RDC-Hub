import { ReactNode, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { BulkResultRow, BulkUploadResponse } from "../types";

function downloadTemplate(filename: string, headers: string[], sampleRow: string[]) {
  const csv = `${headers.join(",")}\n${sampleRow.join(",")}\n`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_STYLES: Record<BulkResultRow["status"], string> = {
  created: "bg-emerald-100 text-emerald-800",
  skipped: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

interface Props {
  title: string;
  description: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRow: string[];
  onUpload: (file: File) => Promise<BulkUploadResponse>;
  /** Optional extra column rendered per result row (e.g. an OTP for bulk users). */
  extraColumnLabel?: string;
  renderExtra?: (row: BulkResultRow) => ReactNode;
}

export function CsvUploader({
  title,
  description,
  templateFilename,
  templateHeaders,
  templateSampleRow,
  onUpload,
  extraColumnLabel,
  renderExtra,
}: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<BulkUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResponse(null);
    setUploading(true);
    try {
      const result = await onUpload(file);
      setResponse(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-brand-700">{open ? "Hide" : "Bulk upload"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <p className="text-xs text-slate-500">{description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadTemplate(templateFilename, templateHeaders, templateSampleRow)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Download CSV template
            </button>
            <label className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 cursor-pointer">
              {uploading ? "Uploading…" : "Choose CSV file…"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {response && (
            <div>
              <p className="mb-2 text-xs text-slate-600">
                <span className="font-medium text-emerald-700">{response.summary.created} created</span>
                {" · "}
                <span className="font-medium text-amber-700">{response.summary.skipped} skipped</span>
                {" · "}
                <span className="font-medium text-red-700">{response.summary.errors} errors</span>
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Details</th>
                      {extraColumnLabel && <th className="px-3 py-2">{extraColumnLabel}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {response.results.map((r) => (
                      <tr key={r.row}>
                        <td className="px-3 py-1.5 text-slate-500">{r.row}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">{r.message ?? "—"}</td>
                        {extraColumnLabel && <td className="px-3 py-1.5">{renderExtra?.(r)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
