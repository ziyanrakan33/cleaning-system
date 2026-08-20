"use client";

/**
 * §12 — the plan-creation wizard: pick a date, ask the engine for up to three
 * alternatives, compare them side by side with their cost breakdown, then
 * publish the chosen one as a draft plan.
 */
import { useState } from "react";

type CostLine = { key: string; label: string; quantity: number; unitCost: number; subtotal: number };
type Cost = { total: number; lines: CostLine[] };

type AlternativeResource = {
  resourceId: string;
  identifier: string;
  name: string | null;
  typeName: string;
  taskCount: number;
  totalCleanMinutes: number;
  totalTravelMinutes: number;
  totalWaterUsedL: number;
  refillCount: number;
  dumpCount: number;
  finishTime: string;
  overCapacity: boolean;
};

type Alternative = {
  variant: "FASTEST" | "DIRT_PRIORITY" | "WATER_SAVING";
  variantLabel: string;
  strategyExplanation: string;
  cost: Cost;
  unassignedCount: number;
  unassigned: { id: string; name: string; priority: string; reason: string }[];
  resources: AlternativeResource[];
};

type GenerateResult = {
  workPlanId: string;
  date: string;
  versionNumber: number;
  variantLabel: string;
  resources: AlternativeResource[];
  unassignedStreets: { id: string; name: string; priority: string; reason: string }[];
  totalDueStreets: number;
  totalAssignedStreets: number;
  cost: Cost;
  feasibility: { ok: boolean; checks: { label: string; passed: boolean; severity: string; detail: string }[] };
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AlternativeCard({
  alt,
  selected,
  onSelect,
}: {
  alt: Alternative;
  selected: boolean;
  onSelect: () => void;
}) {
  const totalTasks = alt.resources.reduce((s, r) => s + r.taskCount, 0);
  const totalWater = alt.resources.reduce((s, r) => s + r.totalWaterUsedL, 0);
  const totalRefills = alt.resources.reduce((s, r) => s + r.refillCount, 0);
  const anyOverCapacity = alt.resources.some((r) => r.overCapacity);

  return (
    <button
      onClick={onSelect}
      className={`flex flex-col rounded-xl border-2 p-4 text-start transition ${
        selected ? "border-accent bg-accent/5" : "border-panel-border hover:border-accent/50"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold">{alt.variantLabel}</span>
        {selected && <span className="text-accent">✓ נבחר</span>}
      </div>
      <p className="mb-3 text-xs text-muted">{alt.strategyExplanation}</p>

      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-muted">מקטעים שובצו</div>
          <div className="font-semibold">{totalTasks}</div>
        </div>
        <div>
          <div className="text-muted">לא שובצו</div>
          <div className={`font-semibold ${alt.unassignedCount > 0 ? "text-danger" : ""}`}>{alt.unassignedCount}</div>
        </div>
        <div>
          <div className="text-muted">צריכת מים</div>
          <div className="font-semibold">{totalWater.toFixed(0)} ליטר</div>
        </div>
        <div>
          <div className="text-muted">עצירות מילוי</div>
          <div className="font-semibold">{totalRefills}</div>
        </div>
      </div>

      {anyOverCapacity && (
        <div className="mb-2 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">חריגה משעות משמרת בכלי אחד או יותר</div>
      )}

      <div className="mt-auto border-t border-panel-border pt-2 text-xs">
        <div className="mb-1 flex justify-between font-semibold">
          <span>ציון עלות (נמוך יותר = טוב יותר)</span>
          <span>{alt.cost.total}</span>
        </div>
        <div className="space-y-0.5 text-muted">
          {alt.cost.lines.slice(0, 4).map((l) => (
            <div key={l.key} className="flex justify-between">
              <span>{l.label}</span>
              <span>{l.subtotal}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
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
  const [publishing, setPublishing] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Alternative["variant"] | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = resourceCount > 0 && streetCount > 0;

  async function propose() {
    setLoading(true);
    setError(null);
    setResult(null);
    setAlternatives(null);
    try {
      const res = await fetch("/api/plans/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "חישוב החלופות נכשל");
      setAlternatives(body.alternatives);
      setSelectedVariant(body.alternatives[0]?.variant ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!selectedVariant || !alternatives) return;
    setPublishing(true);
    setError(null);
    try {
      const rejected = alternatives
        .filter((a) => a.variant !== selectedVariant)
        .map((a) => ({ variantLabel: a.variantLabel, cost: a.cost }));
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, variant: selectedVariant, rejectedAlternatives: rejected }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "יצירת התוכנית נכשלה");
      setResult(body);
      setAlternatives(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
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
            onChange={(e) => {
              setDate(e.target.value);
              setAlternatives(null);
              setResult(null);
            }}
            dir="ltr"
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={propose}
          disabled={!canGenerate || loading}
          className="rounded-md bg-accent px-5 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          {loading ? "מחשב חלופות..." : "הצע חלופות מסלול"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {alternatives && (
        <div className="mb-6">
          <div className="mb-3 grid grid-cols-1 gap-4 md:grid-cols-3">
            {alternatives.map((alt) => (
              <AlternativeCard
                key={alt.variant}
                alt={alt}
                selected={selectedVariant === alt.variant}
                onSelect={() => setSelectedVariant(alt.variant)}
              />
            ))}
          </div>
          <button
            onClick={publish}
            disabled={publishing || !selectedVariant}
            className="rounded-md bg-success px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {publishing ? "יוצר תוכנית..." : "צור טיוטת תוכנית מהחלופה שנבחרה"}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">
                תוכנית ל-{result.date} · גרסה {result.versionNumber} · {result.variantLabel}
              </span>
              <a href={`/plans/${result.workPlanId}`} className="text-sm text-accent hover:underline">
                צפייה במפה ובמסלולים ←
              </a>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-muted">
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
            {!result.feasibility.ok && (
              <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
                בדיקת ההיתכנות מצאה חריגות — יש לפתוח את התוכנית ולטפל בהן לפני פרסום.
              </div>
            )}
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
              <div className="flex flex-wrap gap-6 text-sm text-muted">
                <span>{r.taskCount} רחובות</span>
                <span>ניקיון: {Math.round(r.totalCleanMinutes)} דק׳</span>
                <span>נסיעה: {Math.round(r.totalTravelMinutes)} דק׳</span>
                <span>מים: {r.totalWaterUsedL.toFixed(0)} ליטר · {r.refillCount} מילויים · {r.dumpCount} פריקות</span>
                <span dir="ltr">סיום משוער: {r.finishTime}</span>
              </div>
            </div>
          ))}

          {result.unassignedStreets.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="mb-2 text-sm font-semibold text-danger">
                רחובות שלא שובצו ({result.unassignedStreets.length})
              </div>
              <div className="space-y-1">
                {result.unassignedStreets.slice(0, 100).map((s) => (
                  <div key={s.id} className="flex justify-between text-xs">
                    <span>{s.name}</span>
                    <span className="text-muted">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
