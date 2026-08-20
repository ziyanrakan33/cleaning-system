"use client";

/**
 * §6 — the operational profile of one vehicle: capacity, consumption,
 * dimensions, speeds and depot. Every field starts from whatever the resolved
 * profile already knows (type-catalog default or legacy `attributes`), but is
 * saved back only onto this vehicle's own row — editing one vehicle never
 * silently changes the whole type's catalog default.
 */
import { useEffect, useState } from "react";

type Resolved = {
  waterCapacityL: number | null;
  wasteCapacityKg: number | null;
  minWaterReserveL: number | null;
  waterLPerWorkHour: number | null;
  waterLPerCleanKm: number | null;
  wasteKgPerCleanKm: number | null;
  widthM: number | null;
  heightM: number | null;
  weightKg: number | null;
  canEnterPath: boolean;
  canMountSidewalk: boolean;
  avgWorkSpeedMPerMin: number | null;
  avgTravelSpeedKmh: number | null;
  avgFillMinutes: number | null;
  avgDumpMinutes: number | null;
  missingFields: { field: string; label: string }[];
  hasProfileRow: boolean;
};

const NUMBER_FIELDS: [keyof Resolved, string][] = [
  ["waterCapacityL", "קיבולת מיכל מים (ליטר)"],
  ["wasteCapacityKg", 'קיבולת פסולת (ק"ג)'],
  ["minWaterReserveL", "רזרבת מים מינימלית (ליטר)"],
  ["waterLPerWorkHour", "צריכת מים לשעת עבודה (ליטר)"],
  ["waterLPerCleanKm", 'צריכת מים לק"מ ניקיון (ליטר)'],
  ["wasteKgPerCleanKm", 'צבירת פסולת לק"מ (ק"ג)'],
  ["widthM", "רוחב הכלי (מ׳)"],
  ["heightM", "גובה הכלי (מ׳)"],
  ["weightKg", 'משקל (ק"ג)'],
  ["avgWorkSpeedMPerMin", "מהירות עבודה (מ׳/דקה)"],
  ["avgTravelSpeedKmh", 'מהירות נסיעה (קמ"ש)'],
  ["avgFillMinutes", "זמן מילוי ממוצע (דקות)"],
  ["avgDumpMinutes", "זמן פריקה ממוצע (דקות)"],
];

export function ResourceOperationalProfilePanel({ resourceId, canEdit }: { resourceId: string; canEdit: boolean }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [canEnterPath, setCanEnterPath] = useState(false);
  const [canMountSidewalk, setCanMountSidewalk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/resources/${resourceId}/profile`)
      .then((r) => r.json())
      .then((data: { resolved: Resolved }) => {
        setResolved(data.resolved);
        setCanEnterPath(data.resolved.canEnterPath);
        setCanMountSidewalk(data.resolved.canMountSidewalk);
        const f: Record<string, string> = {};
        for (const [key] of NUMBER_FIELDS) {
          const v = data.resolved[key];
          f[key] = typeof v === "number" ? String(v) : "";
        }
        setForm(f);
      });
  }, [resourceId]);

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const body: Record<string, unknown> = { canEnterPath, canMountSidewalk };
      for (const [key] of NUMBER_FIELDS) {
        body[key] = form[key] === "" ? null : Number(form[key]);
      }
      const res = await fetch(`/api/resources/${resourceId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setResolved(await res.json());
        setSavedMsg("נשמר");
      } else {
        setSavedMsg("שמירה נכשלה");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!resolved) return <div className="p-4 text-sm text-muted">טוען פרופיל תפעולי...</div>;

  return (
    <div className="p-4">
      {resolved.missingFields.length > 0 && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          דורש בדיקה — לא ידוע: {resolved.missingFields.map((f) => f.label).join(", ")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUMBER_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs text-muted">{label}</label>
            <input
              type="number"
              disabled={!canEdit}
              value={form[key] ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="דורש בדיקה"
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" disabled={!canEdit} checked={canEnterPath} onChange={(e) => setCanEnterPath(e.target.checked)} />
          יכול להיכנס לשבילים
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={canMountSidewalk}
            onChange={(e) => setCanMountSidewalk(e.target.checked)}
          />
          יכול לעלות על מדרכה
        </label>
      </div>
      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור פרופיל תפעולי"}
          </button>
          {savedMsg && <span className="text-xs text-muted">{savedMsg}</span>}
        </div>
      )}
    </div>
  );
}
