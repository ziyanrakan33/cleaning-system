"use client";

import { useEffect, useState } from "react";
import { RouteMap, type RouteStop } from "@/components/map/route-map";

type Task = {
  id: string;
  sequenceOrder: number;
  streetId: string;
  streetName: string;
  streetType: string;
  priority: string;
  plannedStart: string;
  plannedEnd: string;
  distanceM: number | null;
  travelTimeMin: number | null;
  cleanTimeMin: number | null;
  status: string;
  geometry: [number, number][] | null;
};

type ResourcePlan = {
  resourceId: string;
  identifier: string;
  name: string | null;
  typeName: string;
  tasks: Task[];
};

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function fmtTime(iso: string) {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function PlanDetail({ workPlanId }: { workPlanId: string }) {
  const [resources, setResources] = useState<ResourcePlan[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plans/${workPlanId}`)
      .then((r) => r.json())
      .then((data) => {
        setResources(data.resources);
        setSelectedId(data.resources[0]?.resourceId ?? null);
      });
  }, [workPlanId]);

  if (!resources) {
    return <div className="p-6 text-sm text-muted">טוען תוכנית...</div>;
  }

  if (resources.length === 0) {
    return <div className="p-6 text-sm text-muted">לא נמצאו משימות בתוכנית זו.</div>;
  }

  const selected = resources.find((r) => r.resourceId === selectedId) ?? resources[0];
  const colorIndex = resources.findIndex((r) => r.resourceId === selected.resourceId);
  const color = COLORS[colorIndex % COLORS.length];

  const stops: RouteStop[] = selected.tasks.map((t) => ({
    sequenceOrder: t.sequenceOrder,
    streetName: t.streetName,
    geometry: t.geometry,
  }));

  const totalKm = selected.tasks.reduce((sum, t) => sum + (t.distanceM ?? 0), 0) / 1000;
  const totalCleanMin = selected.tasks.reduce((sum, t) => sum + (t.cleanTimeMin ?? 0), 0);
  const totalTravelMin = selected.tasks.reduce((sum, t) => sum + (t.travelTimeMin ?? 0), 0);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-[420px] shrink-0 flex-col border-l border-panel-border">
        <div className="border-b border-panel-border p-2">
          {resources.map((r, i) => (
            <button
              key={r.resourceId}
              onClick={() => setSelectedId(r.resourceId)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm ${
                r.resourceId === selectedId ? "bg-accent/10" : "hover:bg-accent/5"
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="font-medium">{r.typeName} {r.identifier}</span>
              {r.name && <span className="text-muted">· {r.name}</span>}
              <span className="ms-auto text-xs text-muted">{r.tasks.length} רחובות</span>
            </button>
          ))}
        </div>

        <div className="border-b border-panel-border p-3 text-sm">
          <div className="flex gap-4 text-muted">
            <span>{selected.tasks.length} רחובות</span>
            <span>{totalKm.toFixed(1)} ק״מ</span>
            <span>ניקיון {Math.round(totalCleanMin)} דק׳</span>
            <span>נסיעה {Math.round(totalTravelMin)} דק׳</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {selected.tasks.map((t, i) => (
            <div key={t.id} className="flex items-start gap-3 border-b border-panel-border/60 px-3 py-2 text-sm">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: color }}
              >
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="font-medium">{t.streetName}</div>
                <div className="text-xs text-muted" dir="ltr">
                  {fmtTime(t.plannedStart)}–{fmtTime(t.plannedEnd)}
                  {t.distanceM ? ` · ${Math.round(t.distanceM)}מ' נסיעה` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <RouteMap stops={stops} color={color} />
      </div>
    </div>
  );
}
