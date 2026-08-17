"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  formatDateTime,
  INSPECTION_ROUND_LABEL,
  INSPECTION_STATUS_LABEL,
} from "../defects/defect-labels";

type Row = {
  id: string;
  date: string;
  round: string;
  zoneName: string | null;
  zoneColor: string | null;
  inspectorName: string;
  contractorRepName: string | null;
  status: string;
  meetingPoint: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  defectCount: number;
};

type Zone = { id: string; name: string; code: string; color: string };

const STATUS_CLASS: Record<string, string> = {
  PLANNED: "bg-accent/10 text-accent",
  IN_PROGRESS: "bg-warning/15 text-warning",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-muted/15 text-muted",
};

const ROUNDS: { key: string; label: string }[] = [
  { key: "MORNING_10", label: "פעימה ראשונה — 10:00" },
  { key: "MIDDAY_12", label: "פעימה שנייה — 12:00" },
  { key: "AD_HOC", label: "סיורים מיוחדים" },
];

export function InspectionsManager({
  rows,
  zones,
  contractorReps,
  canManage,
}: {
  rows: Row[];
  zones: Zone[];
  contractorReps: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "העדכון נכשל");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canManage && (
        <div className="flex items-center gap-2 border-b border-panel-border px-6 py-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
          >
            {showForm ? "ביטול" : "תכנון סיור חדש"}
          </button>
        </div>
      )}

      {showForm && (
        <NewInspectionForm
          zones={zones}
          contractorReps={contractorReps}
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
            לא תוכננו סיורים להיום.
          </div>
        ) : (
          <div className="space-y-6">
            {ROUNDS.map(({ key, label }) => {
              const roundRows = rows.filter((r) => r.round === key);
              if (roundRows.length === 0) return null;
              return (
                <div key={key}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">{label}</h3>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {roundRows.map((r) => (
                      <div key={r.id} className="rounded-xl border border-panel-border bg-panel p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            {r.zoneName ? (
                              <>
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ background: r.zoneColor ?? "#94a3b8" }}
                                />
                                {r.zoneName}
                              </>
                            ) : (
                              "כלל האזורים"
                            )}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? ""}`}
                          >
                            {INSPECTION_STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-muted">
                          <div>מפקח: {r.inspectorName}</div>
                          <div>
                            נציג הקבלן: {r.contractorRepName ?? (
                              <span className="text-warning">טרם שויך</span>
                            )}
                          </div>
                          {r.meetingPoint && <div>נקודת מפגש: {r.meetingPoint}</div>}
                          {r.defectCount > 0 && <div>{r.defectCount} ליקויים נפתחו בסיור</div>}
                          {r.notes && <div className="text-xs">{r.notes}</div>}
                        </div>

                        {canManage && r.status !== "COMPLETED" && r.status !== "CANCELLED" && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-panel-border pt-3">
                            {r.status === "PLANNED" && (
                              <button
                                disabled={busy === r.id}
                                onClick={() => setStatus(r.id, "IN_PROGRESS")}
                                className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                              >
                                תחילת סיור
                              </button>
                            )}
                            {r.status === "IN_PROGRESS" && (
                              <button
                                disabled={busy === r.id}
                                onClick={() => setStatus(r.id, "COMPLETED")}
                                className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-success hover:text-success disabled:opacity-50"
                              >
                                סיום סיור
                              </button>
                            )}
                            <button
                              disabled={busy === r.id}
                              onClick={() => setStatus(r.id, "CANCELLED")}
                              className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-danger hover:text-danger disabled:opacity-50"
                            >
                              ביטול
                            </button>
                            <a
                              href={`/defects?zone=${encodeURIComponent(r.zoneName ?? "")}`}
                              className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-accent hover:text-accent"
                            >
                              פתח ליקוי
                            </a>
                          </div>
                        )}
                        {(r.startedAt || r.completedAt) && (
                          <div className="mt-2 text-xs text-muted">
                            {r.startedAt && <>התחיל {formatDateTime(r.startedAt)}</>}
                            {r.completedAt && <> · הסתיים {formatDateTime(r.completedAt)}</>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NewInspectionForm({
  zones,
  contractorReps,
  onDone,
}: {
  zones: Zone[];
  contractorReps: { id: string; name: string }[];
  onDone: () => void;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [round, setRound] = useState("MORNING_10");
  const [zoneId, setZoneId] = useState("");
  const [contractorRepId, setContractorRepId] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          round,
          zoneId: zoneId || null,
          contractorRepId: contractorRepId || null,
          meetingPoint: meetingPoint || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "התכנון נכשל");
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
        <label>
          <span className="mb-1 block text-xs text-muted">תאריך</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">פעימה</span>
          <select
            value={round}
            onChange={(e) => setRound(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            {Object.entries(INSPECTION_ROUND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">אזור</span>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— כלל האזורים —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">נציג הקבלן (§561)</span>
          <select
            value={contractorRepId}
            onChange={(e) => setContractorRepId(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— טרם שויך —</option>
            {contractorReps.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs text-muted">נקודת מפגש</span>
          <input
            value={meetingPoint}
            onChange={(e) => setMeetingPoint(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>
      {error && <div className="mt-3 text-sm text-danger">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {saving ? "מתכנן…" : "תכנן סיור"}
      </button>
    </form>
  );
}
