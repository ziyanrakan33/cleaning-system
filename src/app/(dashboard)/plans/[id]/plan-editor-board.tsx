"use client";

import { useState } from "react";

type Task = {
  id: string;
  sequenceOrder: number;
  streetName: string;
  plannedStart: string;
  plannedEnd: string;
  cleanTimeMin: number | null;
  travelTimeMin: number | null;
};

type ResourcePlan = {
  resourceId: string;
  identifier: string;
  name: string | null;
  typeName: string;
  tasks: Task[];
};

function fmtTime(iso: string) {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function PlanEditorBoard({
  resources,
  onChanged,
}: {
  resources: ResourcePlan[];
  onChanged: () => void;
}) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleDrop(targetResourceId: string, targetIndex: number) {
    if (!dragTaskId) return;
    setDragOverKey(null);
    const res = await fetch(`/api/plans/tasks/${dragTaskId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetResourceId, targetIndex }),
    });
    const body = await res.json();
    setDragTaskId(null);
    if (res.ok) {
      if (body.overCapacity) setWarning("שימו לב: הכלי היעד חורג משעות העבודה שלו לאחר השינוי.");
      else setWarning(null);
      onChanged();
    } else {
      setWarning(body.message ?? "העברת המשימה נכשלה");
    }
  }

  return (
    <div className="flex-1 overflow-x-auto p-4">
      {warning && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {warning}
        </div>
      )}
      <div className="flex gap-4">
        {resources.map((r) => {
          const totalMin = r.tasks.reduce((s, t) => s + (t.cleanTimeMin ?? 0) + (t.travelTimeMin ?? 0), 0);
          return (
            <div key={r.resourceId} className="w-72 shrink-0 rounded-xl border border-panel-border bg-panel">
              <div className="border-b border-panel-border p-2">
                <div className="text-sm font-semibold">{r.typeName} {r.identifier}</div>
                <div className="text-xs text-muted">{r.tasks.length} משימות · {Math.round(totalMin)} דק׳</div>
              </div>
              <div
                className="min-h-[300px] space-y-1 p-2"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverKey(`${r.resourceId}-end`);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(r.resourceId, r.tasks.length);
                }}
              >
                {r.tasks.map((t, i) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragTaskId(t.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverKey(`${r.resourceId}-${i}`);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(r.resourceId, i);
                    }}
                    className={`cursor-move rounded-md border px-2 py-1.5 text-xs ${
                      dragOverKey === `${r.resourceId}-${i}` ? "border-accent bg-accent/10" : "border-panel-border bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                        {i + 1}
                      </span>
                      <span className="font-medium">{t.streetName}</span>
                    </div>
                    <div className="text-muted" dir="ltr">
                      {fmtTime(t.plannedStart)}–{fmtTime(t.plannedEnd)}
                    </div>
                  </div>
                ))}
                {r.tasks.length === 0 && (
                  <div className="rounded-md border border-dashed border-panel-border p-4 text-center text-xs text-muted">
                    גררו משימה לכאן
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">גררו משימה מכלי אחד לכלי אחר כדי לשנות שיוך. הזמנים והמרחקים יחושבו מחדש אוטומטית.</p>
    </div>
  );
}
