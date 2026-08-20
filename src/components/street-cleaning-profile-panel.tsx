"use client";

/**
 * §1/§2 — a street's cleaning profile and its DirtPriorityScore, with the full
 * factor breakdown so the number is never shown without its explanation.
 */
import { useEffect, useState } from "react";

type Factor = {
  key: string;
  label: string;
  rawValue: string;
  normalized: number;
  effectiveWeight: number;
  contribution: number;
};

type Profile = {
  dirtScore: number | null;
  dirtScoreFactors: { factors: Factor[]; missingComponents: { key: string; label: string }[]; formulaVersion?: number } | null;
  dirtScoreAt: string | null;
  dataMode: string;
  confidence: string;
  sampleCount: number;
  manuallyOverriddenFields: string[];
  dirtBaseLevel: number | null;
  dirtDynamicLevel: number | null;
  plannedCleanMin: number | null;
  avgActualCleanMin: number | null;
  pedestrianTraffic: number | null;
  accessIssue: boolean;
  narrowRoad: boolean;
  requiresWater: boolean;
  estWaterLitersPer100m: number | null;
  supervisorNote: string | null;
} | null;

const MODE_LABEL: Record<string, string> = {
  REQUIRES_REVIEW: "דורש סקר",
  MANUAL_BASELINE: "הערכת מנהל עבודה",
  RULE_BASED: "מבוסס כללים",
  DATA_INFORMED: "מבוסס נתוני ביצוע",
};
const MODE_CLASS: Record<string, string> = {
  REQUIRES_REVIEW: "border-panel-border text-muted",
  MANUAL_BASELINE: "border-warning/40 bg-warning/10 text-warning",
  RULE_BASED: "border-accent/40 bg-accent/10 text-accent",
  DATA_INFORMED: "border-success/40 bg-success/10 text-success",
};
const CONFIDENCE_LABEL: Record<string, string> = { LOW: "נמוכה", MEDIUM: "בינונית", HIGH: "גבוהה" };

export function StreetCleaningProfilePanel({ streetId }: { streetId: string }) {
  const [data, setData] = useState<{ profile: Profile } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/streets/${streetId}/profile`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [streetId]);

  if (loading) return <div className="p-3 text-xs text-muted">טוען ציון...</div>;
  const profile = data?.profile ?? null;

  if (!profile) {
    return (
      <div className="rounded-md border border-dashed border-panel-border p-3 text-xs text-muted">
        טרם בוצע סקר שטח למקטע זה.{" "}
        <a href="/survey" className="text-accent hover:underline">
          מעבר לסקר ←
        </a>
      </div>
    );
  }

  const factors = profile.dirtScoreFactors?.factors ?? [];
  const missing = profile.dirtScoreFactors?.missingComponents ?? [];

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-accent text-lg font-bold">
          {profile.dirtScore !== null ? Math.round(profile.dirtScore) : "—"}
        </div>
        <div>
          <div className={`inline-block rounded-full border px-2 py-0.5 ${MODE_CLASS[profile.dataMode]}`}>
            {MODE_LABEL[profile.dataMode]}
          </div>
          <div className="mt-1 text-muted">
            ביטחון: {CONFIDENCE_LABEL[profile.confidence]} · {profile.sampleCount} דגימות
            {profile.dirtScoreAt && ` · חושב ${new Date(profile.dirtScoreAt).toLocaleDateString("he-IL")}`}
            {profile.dirtScoreFactors?.formulaVersion != null && ` · נוסחה גרסה ${profile.dirtScoreFactors.formulaVersion}`}
          </div>
        </div>
      </div>

      {factors.length > 0 && (
        <div>
          <div className="mb-1 font-semibold">גורמי הציון</div>
          <div className="space-y-1">
            {factors.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2">
                <span className="truncate" title={f.rawValue}>{f.label}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {f.rawValue} · משקל {f.effectiveWeight}% · {f.contribution} נק׳
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-warning">
          לא נכלל בחישוב (אין נתון): {missing.map((m) => m.label).join(", ")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 border-t border-panel-border pt-2">
        <div>לכלוך בסיסי: {profile.dirtBaseLevel ?? "—"}/5</div>
        <div>לכלוך מדוד: {profile.dirtDynamicLevel?.toFixed(1) ?? "—"}/5</div>
        <div>זמן ניקיון מתוכנן: {profile.plannedCleanMin ?? "—"} דק׳</div>
        <div>זמן ניקיון בפועל: {profile.avgActualCleanMin?.toFixed(0) ?? "—"} דק׳</div>
      </div>

      {(profile.accessIssue || profile.narrowRoad) && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-2 text-danger">
          {profile.accessIssue && "בעיית גישה"} {profile.accessIssue && profile.narrowRoad && "· "}
          {profile.narrowRoad && "דרך צרה"}
        </div>
      )}
      {profile.requiresWater && (
        <div>דורש מים: כ-{profile.estWaterLitersPer100m ?? "לא ידוע"} ליטר ל-100 מ׳</div>
      )}
      {profile.manuallyOverriddenFields.length > 0 && (
        <div className="text-muted">🔒 נדרס ידנית: {profile.manuallyOverriddenFields.join(", ")}</div>
      )}
      {profile.supervisorNote && <div className="italic text-muted">&quot;{profile.supervisorNote}&quot;</div>}
    </div>
  );
}
