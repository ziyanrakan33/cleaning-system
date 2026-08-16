"use client";

import { useEffect, useState } from "react";

type AvailabilityRow = { date: string; status: string; reason: string | null };

const STATUS_CYCLE = ["AVAILABLE", "UNAVAILABLE", "BROKEN", "MAINTENANCE"] as const;
const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-success/20 text-success border-success/40",
  UNAVAILABLE: "bg-muted/20 text-muted border-panel-border",
  BROKEN: "bg-danger/20 text-danger border-danger/40",
  MAINTENANCE: "bg-warning/20 text-warning border-warning/40",
};
const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "זמין",
  UNAVAILABLE: "לא זמין",
  BROKEN: "תקול",
  MAINTENANCE: "תחזוקה",
};
const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AvailabilityStrip({ resourceId }: { resourceId: string }) {
  const [rows, setRows] = useState<Map<string, AvailabilityRow>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/resources/${resourceId}/availability`)
      .then((r) => r.json())
      .then((data: AvailabilityRow[]) => {
        const map = new Map<string, AvailabilityRow>();
        for (const row of data) map.set(row.date.slice(0, 10), row);
        setRows(map);
        setLoading(false);
      });
  }, [resourceId]);

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  async function cycleStatus(d: Date) {
    const key = dateStr(d);
    const current = rows.get(key)?.status ?? "AVAILABLE";
    const nextIdx = (STATUS_CYCLE.indexOf(current as (typeof STATUS_CYCLE)[number]) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIdx];

    const res = await fetch(`/api/resources/${resourceId}/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: key, status: nextStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows((prev) => new Map(prev).set(key, { date: updated.date, status: updated.status, reason: updated.reason }));
    }
  }

  if (loading) return <div className="p-3 text-xs text-muted">טוען זמינות...</div>;

  return (
    <div className="flex flex-wrap gap-1.5 p-3">
      {days.map((d) => {
        const key = dateStr(d);
        const status = rows.get(key)?.status ?? "AVAILABLE";
        return (
          <button
            key={key}
            onClick={() => cycleStatus(d)}
            title={`${key} — ${STATUS_LABEL[status]} (לחץ להחלפה)`}
            className={`flex w-16 flex-col items-center rounded-md border px-1.5 py-1 text-[11px] ${STATUS_STYLE[status]}`}
          >
            <span className="font-semibold">{DAY_LABELS[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}</span>
            <span>{STATUS_LABEL[status]}</span>
          </button>
        );
      })}
    </div>
  );
}
