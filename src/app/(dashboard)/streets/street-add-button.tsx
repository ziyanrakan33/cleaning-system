"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Zone = { id: string; name: string };

const TYPE_OPTIONS = [
  { value: "STREET", label: "רחוב" },
  { value: "PATH", label: "שביל" },
  { value: "PEDESTRIAN_MALL", label: "מדרחוב" },
  { value: "PUBLIC_AREA", label: "שטח ציבורי" },
  { value: "OTHER", label: "אחר" },
];
const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "קריטי" },
  { value: "HIGH", label: "גבוה" },
  { value: "NORMAL", label: "רגיל" },
  { value: "LOW", label: "נמוך" },
];
const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "כל יום" },
  { value: "WEEKLY", label: "פעם בשבוע" },
  { value: "AS_NEEDED", label: "לפי צורך" },
];

export function StreetAddButton({ zones }: { zones: Zone[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "STREET",
    zoneId: "",
    priority: "NORMAL",
    frequency: "WEEKLY",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/streets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          zoneId: form.zoneId || null,
          priority: form.priority,
          cleaningFrequency: { type: form.frequency },
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(JSON.stringify(body.error));
      }
      setOpen(false);
      setForm({ name: "", type: "STREET", zoneId: "", priority: "NORMAL", frequency: "WEEKLY", notes: "" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
        + הוסף רחוב/שביל ידנית
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <form onSubmit={submit} className="w-[420px] rounded-xl border border-panel-border bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">הוספת רחוב/שביל</div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted">שם</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">סוג</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none">
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">אזור</label>
                  <select value={form.zoneId} onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))} className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none">
                    <option value="">ללא</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">עדיפות</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none">
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">תדירות</label>
                  <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none">
                    {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">הערות</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <p className="text-xs text-muted">
                נוצר ללא גיאומטריה על המפה (ניתן להוסיף קואורדינטות דרך ייבוא Excel/CSV).
              </p>
            </div>

            {error && <div className="mt-2 text-xs text-danger">{error}</div>}

            <button type="submit" disabled={saving} className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">
              {saving ? "שומר..." : "הוסף"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
