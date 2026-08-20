"use client";

import { useEffect, useState } from "react";

type Version = {
  id: string;
  versionNumber: number;
  status: string;
  createdByName: string;
  createdAt: string;
  taskCount: number;
  parentVersionId: string | null;
  changes: Array<{ description: string | null; changedByName: string; changedAt: string; changeType: string }>;
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "טיוטה", CONFIRMED: "מאושרת", ARCHIVED: "בארכיון" };

export function HistoryBrowser({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [versions, setVersions] = useState<Version[] | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/plans/history?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ignore) setVersions(data);
      });
    return () => {
      ignore = true;
    };
  }, [date]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm text-muted">תאריך</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          dir="ltr"
          className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      {versions === null && <div className="text-sm text-muted">טוען...</div>}
      {versions?.length === 0 && (
        <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
          לא נמצאו תוכניות עבודה לתאריך זה.
        </div>
      )}

      <div className="space-y-3">
        {versions?.map((v) => (
          <div key={v.id} className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">גרסה {v.versionNumber}</span>
                <span className="rounded-full border border-panel-border px-2 py-0.5 text-xs text-muted">
                  {STATUS_LABEL[v.status] ?? v.status}
                </span>
                {v.parentVersionId && <span className="text-xs text-muted">נוצרה מתוך גרסה קודמת</span>}
              </div>
              <a href={`/plans/${v.id}`} className="text-sm text-accent hover:underline">
                צפייה ←
              </a>
            </div>
            <div className="text-xs text-muted">
              נוצרה ע״י {v.createdByName} · {new Date(v.createdAt).toLocaleString("he-IL")} · {v.taskCount} משימות
            </div>
            {v.changes.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-panel-border pt-2">
                {v.changes.map((c, i) => (
                  <div key={i} className="text-xs text-muted">
                    <span className="font-medium text-foreground">{c.changeType}</span> · {c.description} ·{" "}
                    {c.changedByName} · {new Date(c.changedAt).toLocaleString("he-IL")}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
