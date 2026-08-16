"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportResult = { created: number; updated: number; total: number; errors: string[] };

export function StreetImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/streets/import", { method: "POST", body: formData });
      const body = await res.json();
      setResult(body);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10">
        ייבוא מ-Excel/CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-[440px] rounded-xl border border-panel-border bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">ייבוא רחובות ושבילים</div>
              <button onClick={() => setOpen(false)} className="text-muted">✕</button>
            </div>

            <a href="/api/streets/import/template" className="mb-3 block text-sm text-accent hover:underline">
              הורדת קובץ תבנית לדוגמה ←
            </a>

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

            {uploading && <div className="text-sm text-muted">מייבא...</div>}

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
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
