"use client";

import { useEffect, useState } from "react";

type DayResult = {
  date: string;
  workPlanId: string | null;
  versionNumber: number | null;
  status: string | null;
  resources: Array<{ resourceId: string; label: string; taskCount: number }>;
};

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const STATUS_LABEL: Record<string, string> = { DRAFT: "טיוטה", CONFIRMED: "מאושרת", ARCHIVED: "בארכיון" };

function sundayOf(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeeklyBoard() {
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()));
  const [days, setDays] = useState<DayResult[] | null>(null);

  useEffect(() => {
    setDays(null);
    fetch(`/api/plans/week?start=${toDateStr(weekStart)}`)
      .then((r) => r.json())
      .then(setDays);
  }, [weekStart]);

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => shiftWeek(-1)} className="rounded-md border border-panel-border px-3 py-1.5 text-sm">
          → שבוע קודם
        </button>
        <button onClick={() => setWeekStart(sundayOf(new Date()))} className="rounded-md border border-panel-border px-3 py-1.5 text-sm">
          השבוע
        </button>
        <button onClick={() => shiftWeek(1)} className="rounded-md border border-panel-border px-3 py-1.5 text-sm">
          שבוע הבא ←
        </button>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {(days ?? Array.from({ length: 7 })).map((day, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return (
            <div key={i} className="min-h-[220px] rounded-xl border border-panel-border bg-panel p-3">
              <div className="mb-2 border-b border-panel-border pb-2">
                <div className="text-sm font-semibold">{DAY_NAMES[i]}</div>
                <div className="text-xs text-muted" dir="ltr">{toDateStr(d)}</div>
              </div>

              {!day && <div className="text-xs text-muted">טוען...</div>}

              {day && !(day as DayResult).workPlanId && (
                <a href={`/plans?date=${toDateStr(d)}`} className="text-xs text-accent hover:underline">
                  אין תוכנית — צור אחת
                </a>
              )}

              {day && (day as DayResult).workPlanId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full border border-panel-border px-2 py-0.5 text-[10px] text-muted">
                      גרסה {(day as DayResult).versionNumber} · {STATUS_LABEL[(day as DayResult).status!] ?? (day as DayResult).status}
                    </span>
                  </div>
                  {(day as DayResult).resources.map((r) => (
                    <div key={r.resourceId} className="flex items-center justify-between text-xs">
                      <span>{r.label}</span>
                      <span className="text-muted">{r.taskCount}</span>
                    </div>
                  ))}
                  <a href={`/plans/${(day as DayResult).workPlanId}`} className="block pt-1 text-xs text-accent hover:underline">
                    צפייה ←
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
