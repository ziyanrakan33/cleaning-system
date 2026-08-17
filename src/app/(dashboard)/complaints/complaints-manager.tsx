"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMPLAINT_STATUS_LABEL, formatDateTime } from "../defects/defect-labels";

type Row = {
  id: string;
  reference: string;
  subject: string;
  description: string | null;
  status: string;
  zoneName: string | null;
  zoneColor: string | null;
  streetName: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  receivedAt: string;
  dueAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  receivedByName: string;
  assignedToName: string | null;
  defectCount: number;
  overdue: boolean;
};

const STATUS_CLASS: Record<string, string> = {
  NEW: "bg-accent/15 text-accent",
  ASSIGNED: "bg-accent/10 text-accent",
  IN_PROGRESS: "bg-warning/15 text-warning",
  RESOLVED: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
  CLOSED: "bg-muted/15 text-muted",
};

export function ComplaintsManager({
  rows,
  zones,
}: {
  rows: Row[];
  zones: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution: resolution || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "העדכון נכשל");
      setResolution("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-panel-border px-6 py-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
        >
          {showForm ? "ביטול" : "רישום תלונה"}
        </button>
        <span className="text-xs text-muted">
          פניות מוקד מטופלות במשמרת הבוקר והצהריים לפי §553 ו-§556
        </span>
      </div>

      {showForm && (
        <NewComplaintForm
          zones={zones}
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
            לא נרשמו תלונות. תלונה נרשמת עם קבלת פנייה מהמוקד או מתושב.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border border-panel-border bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted" dir="ltr">
                        {c.reference}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[c.status] ?? ""}`}
                      >
                        {COMPLAINT_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      {c.overdue && (
                        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">
                          באיחור
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-semibold">{c.subject}</div>
                    {c.description && <p className="text-sm text-muted">{c.description}</p>}
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    {expanded === c.id ? "סגור" : "טיפול"}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                  <span>
                    {c.zoneName ? (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: c.zoneColor ?? "#94a3b8" }}
                        />
                        {c.zoneName}
                      </span>
                    ) : (
                      "ללא אזור"
                    )}
                  </span>
                  {c.streetName && <span>{c.streetName}</span>}
                  <span>התקבלה {formatDateTime(c.receivedAt)} · {c.receivedByName}</span>
                  {c.reporterName && <span>מתלונן: {c.reporterName}</span>}
                  {c.reporterPhone && <span dir="ltr">{c.reporterPhone}</span>}
                  {c.defectCount > 0 && <span>{c.defectCount} ליקויים קשורים</span>}
                </div>

                {c.resolution && (
                  <div className="mt-2 rounded-md bg-background p-2 text-sm">
                    <div className="text-xs font-semibold text-muted">אופן הטיפול</div>
                    {c.resolution}
                  </div>
                )}

                {expanded === c.id && (
                  <div className="mt-3 space-y-2 border-t border-panel-border pt-3">
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={2}
                      placeholder="תיאור אופן הטיפול — נדרש לפני סימון כטופלה"
                      className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    <div className="flex flex-wrap gap-2">
                      {["IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED"].map((s) => (
                        <button
                          key={s}
                          disabled={busy}
                          onClick={() => setStatus(c.id, s)}
                          className="rounded-md border border-panel-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {COMPLAINT_STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewComplaintForm({
  zones,
  onDone,
}: {
  zones: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description: description || null,
          zoneId: zoneId || null,
          reporterName: reporterName || null,
          reporterPhone: reporterPhone || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "הרישום נכשל");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-panel-border bg-panel/50 p-6">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs text-muted">נושא התלונה</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            minLength={2}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">אזור</span>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— ללא —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-3">
          <span className="mb-1 block text-xs text-muted">פירוט</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">שם המתלונן (לא חובה)</span>
          <input
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">טלפון לחזרה (לא חובה)</span>
          <input
            value={reporterPhone}
            onChange={(e) => setReporterPhone(e.target.value)}
            dir="ltr"
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">מועד יעד לטיפול</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        נשמרים רק שם וטלפון לחזרה — אין לאסוף פרטים אישיים שאינם נדרשים לתפעול.
      </p>
      {error && <div className="mt-3 text-sm text-danger">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {saving ? "רושם…" : "רשום תלונה"}
      </button>
    </form>
  );
}
