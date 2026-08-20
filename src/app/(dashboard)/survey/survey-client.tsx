"use client";

/**
 * §3 — the initial field survey. Built for a tablet in one hand: big tap
 * targets, sane defaults already selected, minimal free text. A photo is
 * optional and attaches after the survey itself is saved, so a slow upload
 * never blocks the answer from being recorded.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StreetRow = {
  id: string;
  name: string;
  type: string;
  zoneName: string | null;
  lastSurveyProgress: "COMPLETED" | "NEEDS_RECHECK" | null;
  lastSurveyAt: string | null;
};

type Progress = {
  totalStreets: number;
  surveyed: number;
  missing: number;
  needsRecheck: number;
  percentComplete: number;
  byZone: { zoneId: string | null; zoneName: string; total: number; surveyed: number; needsRecheck: number }[];
};

const TYPE_LABEL: Record<string, string> = {
  STREET: "רחוב",
  PATH: "שביל",
  PEDESTRIAN_MALL: "מדרחוב",
  PUBLIC_AREA: "שטח ציבורי",
  OTHER: "אחר",
};

function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-12 w-12 rounded-full border text-lg font-bold ${
            value === n ? "border-accent bg-accent text-accent-foreground" : "border-panel-border text-foreground/80"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function BigToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-base font-medium ${
        value ? "border-accent bg-accent/10 text-accent" : "border-panel-border text-foreground/80"
      }`}
    >
      <span>{label}</span>
      <span className="text-2xl">{value ? "✅" : "⬜"}</span>
    </button>
  );
}

export function SurveyClient({
  progress,
  streets,
  resourceTypes,
  waterPoints,
  wastePoints,
}: {
  progress: Progress;
  streets: StreetRow[];
  resourceTypes: { id: string; name: string }[];
  waterPoints: { id: string; name: string }[];
  wastePoints: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selectedStreetId, setSelectedStreetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "MISSING" | "RECHECK">("MISSING");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [dirtLevel, setDirtLevel] = useState(3);
  const [timesPerWeek, setTimesPerWeek] = useState(2);
  const [estimatedCleanMinutes, setEstimatedCleanMinutes] = useState(20);
  const [suitableResourceTypeIds, setSuitableResourceTypeIds] = useState<string[]>([]);
  const [hasAccessProblem, setHasAccessProblem] = useState(false);
  const [isNarrowRoad, setIsNarrowRoad] = useState(false);
  const [requiresWater, setRequiresWater] = useState(false);
  const [estimatedWaterLitersPer100m, setEstimatedWaterLitersPer100m] = useState(30);
  const [preferredWaterPointId, setPreferredWaterPointId] = useState("");
  const [preferredWastePointId, setPreferredWastePointId] = useState("");
  const [permanentHazards, setPermanentHazards] = useState("");
  const [notes, setNotes] = useState("");
  const [needsRecheck, setNeedsRecheck] = useState(false);

  const filtered = useMemo(() => {
    return streets.filter((s) => {
      if (search && !s.name.includes(search)) return false;
      if (filter === "MISSING") return s.lastSurveyProgress === null;
      if (filter === "RECHECK") return s.lastSurveyProgress === "NEEDS_RECHECK";
      return true;
    });
  }, [streets, search, filter]);

  const selected = streets.find((s) => s.id === selectedStreetId) ?? null;

  function resetForm() {
    setDirtLevel(3);
    setTimesPerWeek(2);
    setEstimatedCleanMinutes(20);
    setSuitableResourceTypeIds([]);
    setHasAccessProblem(false);
    setIsNarrowRoad(false);
    setRequiresWater(false);
    setEstimatedWaterLitersPer100m(30);
    setPreferredWaterPointId("");
    setPreferredWastePointId("");
    setPermanentHazards("");
    setNotes("");
    setNeedsRecheck(false);
    setPhotoFile(null);
  }

  async function submit() {
    if (!selectedStreetId) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streetId: selectedStreetId,
          progress: needsRecheck ? "NEEDS_RECHECK" : "COMPLETED",
          answers: {
            dirtLevel,
            timesPerWeek,
            estimatedCleanMinutes,
            suitableResourceTypeIds,
            hasAccessProblem,
            isNarrowRoad,
            blockedHours: [],
            requiresWater,
            estimatedWaterLitersPer100m: requiresWater ? estimatedWaterLitersPer100m : null,
            preferredWaterPointId: preferredWaterPointId || null,
            preferredWastePointId: preferredWastePointId || null,
            permanentHazards: permanentHazards || null,
            notes: notes || null,
          },
        }),
      });
      if (!res.ok) throw new Error("שמירה נכשלה");
      const body = await res.json();

      if (photoFile && body.surveyId) {
        const form = new FormData();
        form.append("file", photoFile);
        form.append("entityType", "StreetSurvey");
        form.append("entityId", body.surveyId);
        form.append("kind", "GENERAL");
        await fetch("/api/field-photos", { method: "POST", body: form });
      }

      setSavedMsg(`נשמר עבור "${selected?.name}"`);
      resetForm();
      setSelectedStreetId(null);
      router.refresh();
    } catch (e) {
      setSavedMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (selectedStreetId && selected) {
    return (
      <div dir="rtl" className="mx-auto max-w-xl p-4 pb-24">
        <button onClick={() => setSelectedStreetId(null)} className="mb-3 text-sm text-accent">
          ← חזרה לרשימה
        </button>
        <div className="mb-4 rounded-xl border border-panel-border bg-panel p-4">
          <div className="text-lg font-bold">{selected.name}</div>
          <div className="text-sm text-muted">{TYPE_LABEL[selected.type] ?? selected.type} · {selected.zoneName ?? "ללא אזור"}</div>
        </div>

        <div className="space-y-5">
          <section>
            <label className="mb-2 block text-base font-semibold">כמה המקום מתלכלך?</label>
            <RatingPicker value={dirtLevel} onChange={setDirtLevel} />
          </section>

          <section>
            <label className="mb-2 block text-base font-semibold">כמה פעמים בשבוע צריך לנקות?</label>
            <div className="flex flex-wrap gap-2" dir="ltr">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setTimesPerWeek(n)}
                  className={`h-11 min-w-11 rounded-md border px-3 text-sm font-semibold ${
                    timesPerWeek === n ? "border-accent bg-accent text-accent-foreground" : "border-panel-border"
                  }`}
                >
                  {n === 0 ? "לפי צורך" : n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="mb-2 block text-base font-semibold">זמן ניקיון משוער (דקות)</label>
            <input
              type="number"
              inputMode="numeric"
              value={estimatedCleanMinutes}
              onChange={(e) => setEstimatedCleanMinutes(Number(e.target.value))}
              className="w-full rounded-xl border-2 border-panel-border bg-transparent px-4 py-3 text-lg outline-none focus:border-accent"
            />
          </section>

          <section>
            <label className="mb-2 block text-base font-semibold">סוג הכלי המתאים</label>
            <div className="flex flex-wrap gap-2">
              {resourceTypes.map((t) => {
                const on = suitableResourceTypeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setSuitableResourceTypeIds((prev) => (on ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
                    }
                    className={`rounded-full border-2 px-4 py-2 text-sm font-medium ${
                      on ? "border-accent bg-accent/10 text-accent" : "border-panel-border"
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <BigToggle label="יש בעיית גישה" value={hasAccessProblem} onChange={setHasAccessProblem} />
            <BigToggle label="הדרך צרה" value={isNarrowRoad} onChange={setIsNarrowRoad} />
            <BigToggle label="נדרש שימוש במים" value={requiresWater} onChange={setRequiresWater} />
          </section>

          {requiresWater && (
            <section className="space-y-3 rounded-xl border border-panel-border p-3">
              <div>
                <label className="mb-1 block text-sm font-medium">צריכת מים משוערת (ליטר ל-100 מ׳)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={estimatedWaterLitersPer100m}
                  onChange={(e) => setEstimatedWaterLitersPer100m(Number(e.target.value))}
                  className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">נקודת מים מועדפת</label>
                <select
                  value={preferredWaterPointId}
                  onChange={(e) => setPreferredWaterPointId(e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 outline-none"
                >
                  <option value="">ללא העדפה</option>
                  {waterPoints.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </section>
          )}

          <section>
            <label className="mb-1 block text-sm font-medium">נקודת פריקה מועדפת</label>
            <select
              value={preferredWastePointId}
              onChange={(e) => setPreferredWastePointId(e.target.value)}
              className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 outline-none"
            >
              <option value="">ללא העדפה</option>
              {wastePoints.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </section>

          <section>
            <label className="mb-1 block text-sm font-medium">מפגעים קבועים</label>
            <input
              value={permanentHazards}
              onChange={(e) => setPermanentHazards(e.target.value)}
              placeholder="לדוגמה: בור קבוע, עמוד תאורה פגום..."
              className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 outline-none"
            />
          </section>

          <section>
            <label className="mb-1 block text-sm font-medium">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 outline-none"
            />
          </section>

          <section>
            <label className="mb-1 block text-sm font-medium">תמונה (אופציונלי)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </section>

          <BigToggle label="דורש בדיקה חוזרת (לא בטוח בתשובה)" value={needsRecheck} onChange={setNeedsRecheck} />
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-panel-border bg-panel p-3">
          <button
            onClick={submit}
            disabled={saving}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור סקר"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4">
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
        <button
          onClick={() => setFilter("MISSING")}
          className={`rounded-xl border-2 p-3 ${filter === "MISSING" ? "border-accent bg-accent/10" : "border-panel-border"}`}
        >
          <div className="text-2xl font-bold">{progress.missing}</div>
          <div className="text-muted">חסרים</div>
        </button>
        <button
          onClick={() => setFilter("RECHECK")}
          className={`rounded-xl border-2 p-3 ${filter === "RECHECK" ? "border-warning bg-warning/10" : "border-panel-border"}`}
        >
          <div className="text-2xl font-bold text-warning">{progress.needsRecheck}</div>
          <div className="text-muted">בדיקה חוזרת</div>
        </button>
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-xl border-2 p-3 ${filter === "ALL" ? "border-accent bg-accent/10" : "border-panel-border"}`}
        >
          <div className="text-2xl font-bold">{progress.surveyed}/{progress.totalStreets}</div>
          <div className="text-muted">מולאו ({progress.percentComplete}%)</div>
        </button>
      </div>

      {savedMsg && <div className="mb-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{savedMsg}</div>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש רחוב..."
        className="mb-3 w-full rounded-xl border-2 border-panel-border bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
      />

      <div className="space-y-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedStreetId(s.id)}
            className="flex w-full items-center justify-between rounded-xl border border-panel-border bg-panel px-4 py-3 text-start"
          >
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-xs text-muted">{TYPE_LABEL[s.type] ?? s.type} · {s.zoneName ?? "ללא אזור"}</div>
            </div>
            {s.lastSurveyProgress === "NEEDS_RECHECK" && (
              <span className="rounded-full bg-warning/20 px-2 py-1 text-xs text-warning">בדיקה חוזרת</span>
            )}
            {s.lastSurveyProgress === "COMPLETED" && <span className="text-success">✓</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="p-8 text-center text-muted">אין תוצאות.</div>}
      </div>
    </div>
  );
}
