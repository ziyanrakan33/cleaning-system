"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteMap, type RouteStop } from "@/components/map/route-map";
import { PlanEditorBoard } from "./plan-editor-board";

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
  projectedWaterAfterL: number | null;
  waterBasis: string | null;
};

type ServiceStop = {
  id: string;
  sequenceOrder: number;
  kind: "WATER_REFILL" | "WASTE_DISPOSAL" | "BREAK";
  pointName: string;
  plannedArrival: string;
  plannedDeparture: string;
  reason: string | null;
  litersLoaded: number | null;
  basis: string;
};

type ResourcePlan = {
  resourceId: string;
  identifier: string;
  name: string | null;
  typeName: string;
  tasks: Task[];
  serviceStops: ServiceStop[];
};

type FeasibilityCheck = { id: string; label: string; passed: boolean; severity: string; detail: string };
type Feasibility = { ok: boolean; checks: FeasibilityCheck[] } | null;

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function fmtTime(iso: string) {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function PlanDetail({ workPlanId }: { workPlanId: string }) {
  const router = useRouter();
  const [resources, setResources] = useState<ResourcePlan[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "edit">("map");
  const [feasibility, setFeasibility] = useState<Feasibility>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/plans/${workPlanId}`)
      .then((r) => r.json())
      .then((data) => {
        setResources(data.resources);
        setSelectedId((prev) => prev ?? data.resources[0]?.resourceId ?? null);
        setStatus(data.status);
        setFeasibility(data.feasibility ?? null);
      });
  }, [workPlanId]);

  useEffect(() => {
    load();
  }, [load]);

  async function recompute() {
    setRecomputing(true);
    setRecomputeMsg(null);
    try {
      const res = await fetch(`/api/plans/${workPlanId}/recompute`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "החישוב מחדש נכשל");
      if (body.unchanged) {
        setRecomputeMsg("כל המשאבים בתוכנית עדיין זמינים — אין צורך בחישוב מחדש.");
      } else {
        router.push(`/plans/${body.newWorkPlanId}`);
        router.refresh();
      }
    } catch (e) {
      setRecomputeMsg((e as Error).message);
    } finally {
      setRecomputing(false);
    }
  }

  async function confirmPlan(withOverride?: string) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/plans/${workPlanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED", ...(withOverride ? { overrideReason: withOverride } : {}) }),
      });
      const body = await res.json();
      if (res.ok) {
        setStatus("CONFIRMED");
        setShowOverride(false);
        setFeasibility(null);
        return;
      }
      if (res.status === 409 && body.feasibility) {
        setFeasibility(body.feasibility);
        setShowOverride(true);
        setConfirmError(body.message ?? "בדיקת ההיתכנות נכשלה");
        return;
      }
      setConfirmError(body.message ?? "אישור התוכנית נכשל");
    } finally {
      setConfirming(false);
    }
  }

  async function cancelPlan() {
    if (cancelReason.trim().length < 3) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/plans/${workPlanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED", cancelReason: cancelReason.trim() }),
      });
      if (res.ok) {
        setStatus("ARCHIVED");
        setShowCancel(false);
      }
    } finally {
      setCancelling(false);
    }
  }

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
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-panel-border px-4 py-2">
        <button
          onClick={() => setView("map")}
          className={`rounded-md px-3 py-1 text-sm ${view === "map" ? "bg-accent/10 text-accent" : "text-muted"}`}
        >
          מפה ומסלולים
        </button>
        <button
          onClick={() => setView("edit")}
          className={`rounded-md px-3 py-1 text-sm ${view === "edit" ? "bg-accent/10 text-accent" : "text-muted"}`}
        >
          עריכה ידנית (גרירה)
        </button>
        <div className="ms-auto flex items-center gap-3">
          {status === "CONFIRMED" ? (
            <span className="rounded-md bg-success/10 px-3 py-1 text-xs font-semibold text-success">✓ תוכנית מאושרת</span>
          ) : status === "ARCHIVED" ? (
            <span className="rounded-md bg-panel-border/40 px-3 py-1 text-xs font-semibold text-muted">תוכנית בוטלה/הוחלפה</span>
          ) : (
            <button
              onClick={() => confirmPlan()}
              disabled={confirming}
              className="rounded-md border border-success/40 bg-success/10 px-3 py-1 text-xs font-semibold text-success disabled:opacity-50"
            >
              {confirming ? "בודק היתכנות..." : "אשר תוכנית"}
            </button>
          )}
          <button
            onClick={recompute}
            disabled={recomputing}
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning disabled:opacity-50"
          >
            {recomputing ? "מחשב מחדש..." : "חשב תוכנית מחדש"}
          </button>
          {status !== "ARCHIVED" && (
            <button
              onClick={() => setShowCancel((v) => !v)}
              className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"
            >
              בטל תוכנית
            </button>
          )}
          <a href="/plans/history" className="text-xs text-accent hover:underline">
            היסטוריה
          </a>
        </div>
      </div>
      {recomputeMsg && <div className="border-b border-panel-border px-4 py-2 text-xs text-muted">{recomputeMsg}</div>}

      {showCancel && (
        <div className="flex items-center gap-2 border-b border-panel-border bg-danger/5 px-4 py-2">
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="סיבת ביטול התוכנית (חובה)"
            className="flex-1 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={cancelPlan}
            disabled={cancelling || cancelReason.trim().length < 3}
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {cancelling ? "מבטל..." : "אשר ביטול"}
          </button>
        </div>
      )}

      {confirmError && !showOverride && (
        <div className="border-b border-panel-border bg-danger/5 px-4 py-2 text-xs text-danger">{confirmError}</div>
      )}

      {feasibility && (feasibility.checks.some((c) => !c.passed) || showOverride) && (
        <div className="border-b border-panel-border bg-warning/5 p-3">
          <div className="mb-2 text-sm font-semibold text-warning">בדיקת היתכנות (§13)</div>
          <div className="mb-2 space-y-1">
            {feasibility.checks
              .filter((c) => !c.passed)
              .map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
                  <span className={c.severity === "BLOCKING" ? "text-danger" : "text-warning"}>
                    {c.severity === "BLOCKING" ? "⛔" : "⚠️"}
                  </span>
                  <span>
                    <b>{c.label}:</b> {c.detail}
                  </span>
                </div>
              ))}
          </div>
          {showOverride && (
            <div className="flex items-center gap-2">
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="סיבת הפרסום חרף האזהרות (חובה)"
                className="flex-1 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={() => overrideReason.trim().length >= 3 && confirmPlan(overrideReason)}
                disabled={confirming || overrideReason.trim().length < 3}
                className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                אשר בכל זאת עם נימוק
              </button>
            </div>
          )}
        </div>
      )}

      {view === "edit" ? (
        <PlanEditorBoard resources={resources} onChanged={load} />
      ) : (
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
              {[
                ...selected.tasks.map((t) => ({ sort: t.sequenceOrder, kind: "TASK" as const, t })),
                ...selected.serviceStops.map((s) => ({ sort: s.sequenceOrder, kind: "STOP" as const, s })),
              ]
                .sort((a, b) => a.sort - b.sort)
                .map((entry, i) =>
                  entry.kind === "TASK" ? (
                    <div key={entry.t.id} className="flex items-start gap-3 border-b border-panel-border/60 px-3 py-2 text-sm">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium">{entry.t.streetName}</div>
                        <div className="text-xs text-muted" dir="ltr">
                          {fmtTime(entry.t.plannedStart)}–{fmtTime(entry.t.plannedEnd)}
                          {entry.t.distanceM ? ` · ${Math.round(entry.t.distanceM)}מ' נסיעה` : ""}
                        </div>
                        {entry.t.projectedWaterAfterL !== null && (
                          <div className="text-xs text-muted">
                            מים לאחר המקטע: {entry.t.projectedWaterAfterL.toFixed(0)} ליטר
                            {entry.t.waterBasis === "ESTIMATED" && " (הערכה)"}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={entry.s.id}
                      className="flex items-start gap-3 border-b border-panel-border/60 bg-accent/5 px-3 py-2 text-sm"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px]">
                        {entry.s.kind === "WATER_REFILL" ? "💧" : entry.s.kind === "WASTE_DISPOSAL" ? "🗑️" : "☕"}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium">{entry.s.pointName}</div>
                        <div className="text-xs text-muted" dir="ltr">
                          {fmtTime(entry.s.plannedArrival)}–{fmtTime(entry.s.plannedDeparture)}
                        </div>
                        {entry.s.reason && <div className="text-xs text-muted">{entry.s.reason}</div>}
                      </div>
                    </div>
                  )
                )}
            </div>
          </div>

          <div className="relative flex-1">
            <RouteMap stops={stops} color={color} />
          </div>
        </div>
      )}
    </div>
  );
}
