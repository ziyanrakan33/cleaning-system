"use client";

import { useEffect, useState } from "react";
import { DemoDataSection } from "./demo-data-section";

type WeightsGroup<T> = { current: T; defaults: T; customised: boolean; sum?: number };

type DirtScoreWeights = {
  historicalDirt: number;
  timeSinceLastClean: number;
  openComplaints: number;
  pedestrianTraffic: number;
  proximity: number;
  seasonalAndEvents: number;
  supervisorEstimate: number;
};
type Thresholds = { dataInformedMinSamples: number; staleAfterDays: number; complaintSaturation: number };
type Organization = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  timezone: string;
  language: string;
  dateFormat: string;
  targetZoneCount: number;
};
type CostWeights = {
  travelMinute: number;
  deadKilometre: number;
  cleanMinute: number;
  refillMinute: number;
  disposalMinute: number;
  overtimeMinute: number;
  unassignedSegment: number;
  skippedHighPriority: number;
  distantWaterPoint: number;
  unsuitableVehicle: number;
  belowWaterReserve: number;
  redundantRevisit: number;
};

const DIRT_LABELS: Record<keyof DirtScoreWeights, string> = {
  historicalDirt: "רמת לכלוך היסטורית",
  timeSinceLastClean: "זמן מאז ניקיון אחרון",
  openComplaints: "פניות תושבים פתוחות",
  pedestrianTraffic: "תנועת הולכי רגל",
  proximity: "קרבה למסחר/ביה״ס/תחנות",
  seasonalAndEvents: "אירועים ועונתיות",
  supervisorEstimate: "הערכת מנהל העבודה",
};
const THRESHOLD_LABELS: Record<keyof Thresholds, string> = {
  dataInformedMinSamples: "דגימות מינימום למעבר ל-DATA_INFORMED",
  staleAfterDays: "ימים עד שנתון נחשב מיושן",
  complaintSaturation: "פניות לרוויה מלאה של הרכיב",
};
const COST_LABELS: Record<keyof CostWeights, string> = {
  travelMinute: "דקת נסיעה",
  deadKilometre: 'ק"מ נסיעה ללא עבודה',
  cleanMinute: "דקת ניקיון",
  refillMinute: "דקת מילוי מים",
  disposalMinute: "דקת פריקת פסולת",
  overtimeMinute: "דקת חריגה משעת סיום",
  unassignedSegment: "מקטע שלא שובץ",
  skippedHighPriority: "דילוג על מקטע בעדיפות גבוהה (בנוסף)",
  distantWaterPoint: 'ק"מ מסלול לנקודת מים',
  unsuitableVehicle: "כלי לא מתאים למקטע",
  belowWaterReserve: "ליטר מתחת לרזרבת המים",
  redundantRevisit: "חזרה מיותרת על מקטע",
};

function WeightRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label className="text-sm">{label}</label>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-md border border-panel-border bg-transparent px-2 py-1 text-end text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

export function SettingsClient() {
  const [dirtWeights, setDirtWeights] = useState<WeightsGroup<DirtScoreWeights> | null>(null);
  const [thresholds, setThresholds] = useState<WeightsGroup<Thresholds> | null>(null);
  const [costWeights, setCostWeights] = useState<WeightsGroup<CostWeights> | null>(null);
  const [organization, setOrganization] = useState<WeightsGroup<Organization> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setDirtWeights(d.dirtScoreWeights);
        setThresholds(d.dirtScoreThresholds);
        setCostWeights(d.routeCostWeights);
        setOrganization(d.organization);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(group: string, value: unknown) {
    setSaving(group);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, value }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg(body.error?.formErrors?.[0] ?? body.error ?? "שמירה נכשלה");
        return;
      }
      setMsg(body.rescored !== undefined ? `נשמר — ${body.rescored} מקטעים חושבו מחדש` : "נשמר");
      load();
    } finally {
      setSaving(null);
    }
  }

  if (!dirtWeights || !thresholds || !costWeights || !organization) return <div className="p-6 text-sm text-muted">טוען...</div>;

  const dirtSum = Object.values(dirtWeights.current).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-3xl space-y-6 p-6">
      {msg && <div className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{msg}</div>}

      <section className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">משקלי ציון הלכלוך (§2)</h2>
          {dirtWeights.customised && <span className="text-xs text-warning">שונה מברירת המחדל</span>}
        </div>
        <p className="mb-3 text-xs text-muted">
          סכום נוכחי: {dirtSum.toFixed(1)}%. אם הסכום שונה מ-100, הציון מנורמל אוטומטית — אין צורך שיהיה בדיוק 100.
        </p>
        {(Object.keys(DIRT_LABELS) as (keyof DirtScoreWeights)[]).map((key) => (
          <WeightRow
            key={key}
            label={DIRT_LABELS[key]}
            value={dirtWeights.current[key]}
            onChange={(v) => setDirtWeights({ ...dirtWeights, current: { ...dirtWeights.current, [key]: v } })}
          />
        ))}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save("dirtScoreWeights", dirtWeights.current)}
            disabled={saving === "dirtScoreWeights"}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            שמור וחשב מחדש את כל הציונים
          </button>
          <button
            onClick={() => setDirtWeights({ ...dirtWeights, current: dirtWeights.defaults })}
            className="text-xs text-muted hover:underline"
          >
            אפס לברירת מחדל
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-panel-border bg-panel p-4">
        <h2 className="mb-3 font-bold">ספי מעבר (§2)</h2>
        {(Object.keys(THRESHOLD_LABELS) as (keyof Thresholds)[]).map((key) => (
          <WeightRow
            key={key}
            label={THRESHOLD_LABELS[key]}
            value={thresholds.current[key]}
            onChange={(v) => setThresholds({ ...thresholds, current: { ...thresholds.current, [key]: v } })}
          />
        ))}
        <button
          onClick={() => save("dirtScoreThresholds", thresholds.current)}
          disabled={saving === "dirtScoreThresholds"}
          className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          שמור
        </button>
      </section>

      <section className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">משקלי פונקציית עלות המסלול (§11)</h2>
          {costWeights.customised && <span className="text-xs text-warning">שונה מברירת המחדל</span>}
        </div>
        <p className="mb-3 text-xs text-muted">משפיע על מסלולים חדשים בלבד — תוכניות קיימות שומרות את ההסבר שלהן.</p>
        {(Object.keys(COST_LABELS) as (keyof CostWeights)[]).map((key) => (
          <WeightRow
            key={key}
            label={COST_LABELS[key]}
            value={costWeights.current[key]}
            onChange={(v) => setCostWeights({ ...costWeights, current: { ...costWeights.current, [key]: v } })}
          />
        ))}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save("routeCostWeights", costWeights.current)}
            disabled={saving === "routeCostWeights"}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            שמור
          </button>
          <button
            onClick={() => setCostWeights({ ...costWeights, current: costWeights.defaults })}
            className="text-xs text-muted hover:underline"
          >
            אפס לברירת מחדל
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">מיתוג הארגון</h2>
          {organization.customised && <span className="text-xs text-warning">שונה מברירת המחדל</span>}
        </div>
        <p className="mb-3 text-xs text-muted">שם ומאפייני הארגון המוצגים במערכת — אינם מקודדים בקוד.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">שם הארגון</label>
            <input
              value={organization.current.name}
              onChange={(e) => setOrganization({ ...organization, current: { ...organization.current, name: e.target.value } })}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">מספר אזורי ניקיון מתוכננים</label>
            <input
              type="number"
              value={organization.current.targetZoneCount}
              onChange={(e) =>
                setOrganization({ ...organization, current: { ...organization.current, targetZoneCount: Number(e.target.value) } })
              }
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">אזור זמן</label>
            <input
              value={organization.current.timezone}
              onChange={(e) => setOrganization({ ...organization, current: { ...organization.current, timezone: e.target.value } })}
              dir="ltr"
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">שפה</label>
            <input
              value={organization.current.language}
              onChange={(e) => setOrganization({ ...organization, current: { ...organization.current, language: e.target.value } })}
              dir="ltr"
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        <button
          onClick={() => save("organization", organization.current)}
          disabled={saving === "organization"}
          className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          שמור
        </button>
      </section>

      <DemoDataSection />
    </div>
  );
}
