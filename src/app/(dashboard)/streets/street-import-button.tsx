"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportRow = Record<string, unknown> & { rowNum: number; name?: string };
type PreviewEntry = { rowNum: number; name: string | null; action: "create" | "update" | "error"; message?: string };
type PreviewResult = { filename: string; rows: ImportRow[]; preview: PreviewEntry[] };
type ConfirmResult = { created: number; updated: number; total: number; errors: string[] };

const ACTION_LABEL: Record<PreviewEntry["action"], string> = {
  create: "חדש",
  update: "עדכון",
  error: "שגיאה",
};
const ACTION_COLOR: Record<PreviewEntry["action"], string> = {
  create: "text-success",
  update: "text-accent",
  error: "text-danger",
};

export function StreetImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setUploading(true);
    setResult(null);
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/streets/import/preview", { method: "POST", body: formData });
      const body = await res.json();
      if (res.ok) setPreview(body);
    } finally {
      setUploading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/streets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: preview.filename, rows: preview.rows }),
      });
      const body = await res.json();
      setResult(body);
      setPreview(null);
      router.refresh();
    } finally {
      setConfirming(false);
    }
  }

  const errorCount = preview?.preview.filter((p) => p.action === "error").length ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10"
      >
        ייבוא מ-Excel/CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            className="max-h-[85vh] w-[560px] overflow-y-auto rounded-xl border border-panel-border bg-panel p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">ייבוא רחובות ושבילים</div>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-muted"
              >
                ✕
              </button>
            </div>

            <a href="/api/streets/import/template" download className="mb-3 block text-sm text-accent hover:underline">
              הורדת קובץ תבנית לדוגמה ←
            </a>

            {!preview && !result && (
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="mb-3 block w-full text-sm"
              />
            )}

            {uploading && <div className="text-sm text-muted">קורא קובץ...</div>}

            {preview && (
              <div>
                <div className="mb-2 text-sm">
                  {preview.rows.length} שורות · {errorCount > 0 ? `${errorCount} שגיאות (לא ייובאו)` : "ללא שגיאות חוסמות"} — סקור לפני אישור:
                </div>
                <div className="mb-3 max-h-64 overflow-y-auto rounded-md border border-panel-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.preview.map((p) => (
                        <tr key={p.rowNum} className="border-b border-panel-border/60">
                          <td className="px-2 py-1 text-muted">{p.rowNum}</td>
                          <td className="px-2 py-1">{p.name ?? "—"}</td>
                          <td className={`px-2 py-1 font-medium ${ACTION_COLOR[p.action]}`}>{ACTION_LABEL[p.action]}</td>
                          <td className="px-2 py-1 text-muted">{p.message ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={confirmImport}
                    disabled={confirming}
                    className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    {confirming ? "מייבא..." : "אשר ייבוא"}
                  </button>
                  <button onClick={reset} disabled={confirming} className="rounded-md border border-panel-border px-4 py-1.5 text-sm">
                    ביטול
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div className="rounded-md border border-panel-border p-3 text-sm">
                <div>נוצרו: {result.created} · עודכנו: {result.updated} · סה״כ שורות: {result.total}</div>
                {result.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto text-xs text-warning">
                    {result.errors.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                <button onClick={reset} className="mt-3 rounded-md border border-panel-border px-3 py-1 text-xs">
                  ייבוא נוסף
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
