"use client";

import { useEffect, useState } from "react";

type LearningEvent = {
  id: string;
  entityLabel: string;
  fieldLabel: string;
  oldValue: number | null;
  newValue: number | null;
  sampleValue: number | null;
  sampleCount: number;
  reason: string | null;
  excluded: boolean;
  excludedByName: string | null;
  excludedAt: string | null;
  createdAt: string;
};

export function LearningClient() {
  const [events, setEvents] = useState<LearningEvent[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/learning/events")
      .then((r) => r.json())
      .then(setEvents);
  }

  useEffect(() => {
    load();
  }, []);

  async function exclude(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/learning/events/${id}/exclude`, { method: "POST" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (events === null) return <div className="p-6 text-sm text-muted">טוען...</div>;

  if (events.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
          עדיין אין דגימות ביצוע. ברגע שעובדים ידווחו על עבודה שהושלמה (§8), עדכוני הממוצעים יופיעו כאן.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-xl border border-panel-border bg-panel">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-panel-border">
              <th className="px-3 py-2 text-start font-medium">מתי</th>
              <th className="px-3 py-2 text-start font-medium">רחוב / ישות</th>
              <th className="px-3 py-2 text-start font-medium">שדה</th>
              <th className="px-3 py-2 text-start font-medium">ישן</th>
              <th className="px-3 py-2 text-start font-medium">חדש</th>
              <th className="px-3 py-2 text-start font-medium">דגימה</th>
              <th className="px-3 py-2 text-start font-medium">דגימות</th>
              <th className="px-3 py-2 text-start font-medium">מדוע</th>
              <th className="px-3 py-2 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={`border-b border-panel-border/60 ${e.excluded ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 text-xs text-muted" dir="ltr">
                  {new Date(e.createdAt).toLocaleString("he-IL")}
                </td>
                <td className="px-3 py-2">{e.entityLabel}</td>
                <td className="px-3 py-2 text-muted">{e.fieldLabel}</td>
                <td className="px-3 py-2 tabular-nums text-muted">{e.oldValue?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{e.newValue?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-muted">{e.sampleValue?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-muted">{e.sampleCount}</td>
                <td className="max-w-xs px-3 py-2 text-xs text-muted">
                  {e.reason}
                  {e.excluded && <span className="mt-0.5 block text-warning">בוטלה{e.excludedByName ? ` על ידי ${e.excludedByName}` : ""}</span>}
                </td>
                <td className="px-3 py-2">
                  {!e.excluded && (
                    <button
                      onClick={() => exclude(e.id)}
                      disabled={busyId === e.id}
                      className="text-xs text-danger hover:underline disabled:opacity-50"
                    >
                      בטל דגימה
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
