"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ZoneRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string | null;
  streetCount: number;
  totalLengthM: number;
};

const DEFAULT_COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4338ca",
];

export function ZonesManager({ zones, unassignedCount }: { zones: ZoneRow[]; unassignedCount: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedColor = DEFAULT_COLORS[zones.length % DEFAULT_COLORS.length];

  async function createZone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, color: suggestedColor }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(JSON.stringify(body.error ?? body));
      }
      setName("");
      setCode("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: string) {
    if (!confirm("למחוק את האזור? הרחובות המשויכים אליו יעברו למצב ללא שיוך.")) return;
    await fetch(`/api/zones/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="p-6">
      {unassignedCount > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm">
          {unassignedCount} רחובות עדיין לא שויכו לאזור — ניתן לשייך אותם במסך{" "}
          <a href="/streets" className="font-semibold text-accent hover:underline">רחובות ושבילים</a>.
        </div>
      )}

      <form onSubmit={createZone} className="mb-6 flex items-end gap-3 rounded-xl border border-panel-border bg-panel p-4">
        <div>
          <label className="mb-1 block text-xs text-muted">שם האזור</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder='למשל: "מרכז העיר"'
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">קוד</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            placeholder="Z01"
            dir="ltr"
            className="w-24 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <span className="h-5 w-5 rounded-full border border-panel-border" style={{ background: suggestedColor }} />
          <span className="text-xs text-muted">צבע יוקצה אוטומטית</span>
        </div>
        <button
          type="submit"
          disabled={saving || zones.length >= 10}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {zones.length >= 10 ? "הגעת ל-10 אזורים" : "הוסף אזור"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {zones.map((z) => (
          <div key={z.id} className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color }} />
              <span className="truncate font-semibold">{z.name}</span>
              <span className="text-xs text-muted">{z.code}</span>
            </div>
            <div className="text-sm text-muted">{z.streetCount} רחובות</div>
            <div className="text-sm text-muted">{(z.totalLengthM / 1000).toFixed(1)} ק״מ</div>
            <div className="mt-3 flex items-center gap-3">
              <a href={`/zones/${z.id}/boundary`} className="text-xs text-accent hover:underline">
                ציור גבול על המפה
              </a>
              <button onClick={() => deleteZone(z.id)} className="text-xs text-danger hover:underline">
                מחיקה
              </button>
            </div>
          </div>
        ))}
        {zones.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
            עדיין לא הוגדרו אזורים. הוסיפו את 10 אזורי הניקיון של כפר סבא באמצעות הטופס למעלה.
          </div>
        )}
      </div>
    </div>
  );
}
