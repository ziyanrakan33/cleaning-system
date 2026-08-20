"use client";

import { useMemo, useState } from "react";
import { StreetsMap } from "@/components/map/streets-map";
import { StreetCleaningProfilePanel } from "@/components/street-cleaning-profile-panel";

type Row = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  zoneId: string | null;
  zoneName: string | null;
  lengthM: number | null;
  priority: string;
  priorityLabel: string;
  frequency: { type: string; timesPerWeek?: number; days?: string[] };
  source: string;
};

type Zone = { id: string; name: string; color: string };

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "קריטי" },
  { value: "HIGH", label: "גבוה" },
  { value: "NORMAL", label: "רגיל" },
  { value: "LOW", label: "נמוך" },
];

const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "כל יום",
  TIMES_PER_WEEK: "X פעמים בשבוע",
  WEEKLY: "פעם בשבוע",
  SPECIFIC_DAYS: "ימים מסוימים",
  AS_NEEDED: "לפי צורך",
};

export function StreetsExplorer({ rows: initialRows, zones }: { rows: Row[]; zones: Zone[] }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (zoneFilter === "UNASSIGNED" && r.zoneId) return false;
      if (zoneFilter !== "ALL" && zoneFilter !== "UNASSIGNED" && r.zoneId !== zoneFilter) return false;
      if (search && !r.name.includes(search)) return false;
      return true;
    });
  }, [rows, search, zoneFilter]);

  async function updateStreet(id: string, patch: Record<string, unknown>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/streets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("update failed");
      const updated = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                zoneId: updated.zoneId,
                zoneName: zones.find((z) => z.id === updated.zoneId)?.name ?? null,
                priority: updated.priority,
                priorityLabel: PRIORITY_OPTIONS.find((p) => p.value === updated.priority)?.label ?? updated.priority,
              }
            : r
        )
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-[520px] shrink-0 flex-col border-l border-panel-border">
        <div className="flex gap-2 border-b border-panel-border p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם רחוב..."
            className="flex-1 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none"
          >
            <option value="ALL">כל האזורים</option>
            <option value="UNASSIGNED">ללא שיוך</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-muted">
              <tr className="border-b border-panel-border">
                <th className="px-3 py-2 text-start font-medium">שם</th>
                <th className="px-3 py-2 text-start font-medium">סוג</th>
                <th className="px-3 py-2 text-start font-medium">אורך</th>
                <th className="px-3 py-2 text-start font-medium">אזור</th>
                <th className="px-3 py-2 text-start font-medium">עדיפות</th>
                <th className="px-3 py-2 text-start font-medium">תדירות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`cursor-pointer border-b border-panel-border/60 hover:bg-accent/5 ${
                    selectedId === r.id ? "bg-accent/10" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 font-medium">{r.name}</td>
                  <td className="px-3 py-1.5 text-muted">{r.typeLabel}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted">
                    {r.lengthM ? `${Math.round(r.lengthM)} מ׳` : "—"}
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={r.zoneId ?? ""}
                      disabled={saving === r.id}
                      onChange={(e) => updateStreet(r.id, { zoneId: e.target.value || null })}
                      className="rounded border border-panel-border bg-transparent px-1 py-0.5 text-xs outline-none"
                    >
                      <option value="">ללא</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={r.priority}
                      disabled={saving === r.id}
                      onChange={(e) => updateStreet(r.id, { priority: e.target.value })}
                      className="rounded border border-panel-border bg-transparent px-1 py-0.5 text-xs outline-none"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">{FREQUENCY_LABEL[r.frequency?.type] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedId && (
          <div className="max-h-72 overflow-y-auto border-t border-panel-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">פרופיל ניקיון וציון עדיפות</span>
              <a href="/survey" className="text-xs text-accent hover:underline">סקר שטח ←</a>
            </div>
            <StreetCleaningProfilePanel streetId={selectedId} />
          </div>
        )}
      </div>

      <div className="relative flex-1">
        <StreetsMap
          selectedStreetId={selectedId}
          onSelectStreet={(id) => setSelectedId(id)}
        />
      </div>
    </div>
  );
}
