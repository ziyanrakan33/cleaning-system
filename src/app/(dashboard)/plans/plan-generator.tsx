"use client";

import { useState } from "react";

type PlanResult = {
  workPlanId: string;
  date: string;
  versionNumber: number;
  resources: Array<{
    resourceId: string;
    identifier: string;
    name: string | null;
    typeName: string;
    taskCount: number;
    totalStreetKm: number;
    totalCleanMinutes: number;
    totalTravelMinutes: number;
    finishTime: string;
    overCapacity: boolean;
  }>;
  unassignedStreets: Array<{ id: string; name: string; priority: string }>;
  totalDueStreets: number;
  totalAssignedStreets: number;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlanGenerator({
  zoneCount,
  resourceCount,
  streetCount,
  initialDate,
}: {
  zoneCount: number;
  resourceCount: number;
  streetCount: number;
  initialDate?: string;
}) {
  const [date, setDate] = useState(initialDate ?? todayStr());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = resourceCount > 0 && streetCount > 0;

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "יצירת התוכנית נכשלה");
      setResult(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      {!canGenerate && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm">
          {resourceCount === 0 && "אין עדיין משאבים פעילים. "}
          {streetCount === 0 && "אין עדיין רחובות. "}
          יש להוסיף אותם לפני יצירת תוכנית עבודה. ({zoneCount} אזורים, {resourceCount} משאבים פעילים, {streetCount} רחובות)
        </div>
      )}

      <div className="mb-6 flex items-end gap-3 rounded-xl border border-panel-border bg-panel p-4">
        <div>
          <label className="mb-1 block text-xs text-muted">תאריך</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            dir="ltr"
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={generate}
          disabled={!canGenerate || loading}
          className="rounded-md bg-accent px-5 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          {loading ? "מחשב מסלולים..." : "צור תוכנית עבודה"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">
                תוכנית ל-{result.date} · גרסה {result.versionNumber}
              </span>
              {result.resources.length > 0 && (
                <a href={`/plans/${result.workPlanId}`} className="text-sm text-accent hover:underline">
                  צפייה במפה ובמסלולים ←
                </a>
              )}
            </div>
            <div className="flex gap-6 text-sm text-muted">
              <span>
                רחובות חייבי ניקיון היום: <b className="text-foreground">{result.totalDueStreets}</b>
              </span>
              <span>
                שובצו: <b className="text-success">{result.totalAssignedStreets}</b>
              </span>
              <span>
                לא שובצו: <b className={result.unassignedStreets.length > 0 ? "text-danger" : "text-foreground"}>{result.unassignedStreets.length}</b>
              </span>
            </div>
          </div>

          {result.resources.length === 0 && (
            <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
              לא שובצו משימות לאף משאב. ודאו שיש רחובות חייבי ניקיון, ושהמשאבים משויכים לאזורים הנכונים עם שעות עבודה מוגדרות.
            </div>
          )}

          {result.resources.map((r) => (
            <div key={r.resourceId} className="rounded-xl border border-panel-border bg-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">
                  {r.typeName} {r.identifier} {r.name && <span className="text-muted">· {r.name}</span>}
                </div>
                {r.overCapacity && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">חריגה משעות עבודה</span>
                )}
              </div>
              <div className="flex gap-6 text-sm text-muted">
                <span>{r.taskCount} רחובות</span>
                <span>{r.totalStreetKm} ק״מ</span>
                <span>ניקיון: {Math.round(r.totalCleanMinutes)} דק׳</span>
                <span>נסיעה: {Math.round(r.totalTravelMinutes)} דק׳</span>
                <span dir="ltr">סיום משוער: {r.finishTime}</span>
              </div>
            </div>
          ))}

          {result.unassignedStreets.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="mb-2 text-sm font-semibold text-danger">
                רחובות שלא שובצו ({result.unassignedStreets.length})
              </div>
              {result.unassignedStreets.length > 300 ? (
                <p className="text-sm text-muted">
                  רוב הרחובות עדיין לא משויכים לאזור עבודה ({zoneCount} מתוך 10 אזורים הוגדרו עד כה) — לכן הרשימה ארוכה
                  מכדי להציג. שייכו רחובות נוספים לאזורים במסך{" "}
                  <a href="/streets" className="text-accent hover:underline">רחובות ושבילים</a> כדי שהתוכנית תכסה אותם.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {result.unassignedStreets.slice(0, 300).map((s) => (
                    <span key={s.id} className="rounded-full border border-danger/30 px-2 py-0.5 text-xs">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
