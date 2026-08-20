"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ServicePointsMap, type ServicePointMarker } from "@/components/map/service-points-map";

type WaterPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  zoneId: string | null;
  zoneName: string | null;
  status: string;
  verificationStatus: string;
  availabilityHours: { day?: string; from: string; to: string }[] | null;
  connectionType: string | null;
  flowLitersPerMin: number | null;
  avgFillMinutes: number | null;
  avgWaitMinutes: number | null;
  parallelCapacity: number;
  maxVehicleWidthM: number | null;
  maxVehicleHeightM: number | null;
  contactName: string | null;
  contactPhone: string | null;
  lastCheckedAt: string | null;
  notes: string | null;
  isDemo: boolean;
  allowedResourceTypeIds: string[];
};

type WastePoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  zoneId: string | null;
  zoneName: string | null;
  status: string;
  verificationStatus: string;
  allowedWasteTypes: string[];
  availabilityHours: { day?: string; from: string; to: string }[] | null;
  avgDumpMinutes: number | null;
  avgWaitMinutes: number | null;
  maxVehicleWidthM: number | null;
  maxVehicleHeightM: number | null;
  accessNotes: string | null;
  notes: string | null;
  isDemo: boolean;
  allowedResourceTypeIds: string[];
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "פעילה",
  BROKEN: "תקולה",
  TEMPORARILY_CLOSED: "סגורה זמנית",
  REQUIRES_REVIEW: "דורשת אישור",
};
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "border-success/40 bg-success/10 text-success",
  BROKEN: "border-danger/40 bg-danger/10 text-danger",
  TEMPORARILY_CLOSED: "border-warning/40 bg-warning/10 text-warning",
  REQUIRES_REVIEW: "border-panel-border text-muted",
};

export function ServicePointsManager({
  water,
  waste,
  zones,
  resourceTypes,
  canEdit,
}: {
  water: WaterPoint[];
  waste: WastePoint[];
  zones: { id: string; name: string }[];
  resourceTypes: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"WATER" | "WASTE">("WATER");
  const [addMode, setAddMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [faultNote, setFaultNote] = useState("");

  const [form, setForm] = useState({
    name: "",
    zoneId: "",
    address: "",
    connectionType: "",
    flowLitersPerMin: "",
    avgFillMinutes: "",
    avgDumpMinutes: "",
    avgWaitMinutes: "",
    parallelCapacity: "1",
    notes: "",
  });
  const [allowedResourceTypeIds, setAllowedResourceTypeIds] = useState<string[]>([]);

  const markers: ServicePointMarker[] = useMemo(
    () => [
      ...water.map((w): ServicePointMarker => ({ id: w.id, kind: "WATER", name: w.name, lat: w.lat, lon: w.lon, status: w.status })),
      ...waste.map((w): ServicePointMarker => ({ id: w.id, kind: "WASTE", name: w.name, lat: w.lat, lon: w.lon, status: w.status })),
    ],
    [water, waste]
  );

  const selectedWater = water.find((w) => w.id === selectedId) ?? null;
  const selectedWaste = waste.find((w) => w.id === selectedId) ?? null;

  async function submitNewPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingCoords) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind: tab,
        name: form.name,
        lat: pendingCoords.lat,
        lon: pendingCoords.lon,
        address: form.address || null,
        zoneId: form.zoneId || null,
        notes: form.notes || null,
        allowedResourceTypeIds,
      };
      if (tab === "WATER") {
        body.connectionType = form.connectionType || null;
        body.flowLitersPerMin = form.flowLitersPerMin ? Number(form.flowLitersPerMin) : null;
        body.avgFillMinutes = form.avgFillMinutes ? Number(form.avgFillMinutes) : null;
        body.avgWaitMinutes = form.avgWaitMinutes ? Number(form.avgWaitMinutes) : null;
        body.parallelCapacity = Number(form.parallelCapacity || "1");
      } else {
        body.avgDumpMinutes = form.avgDumpMinutes ? Number(form.avgDumpMinutes) : null;
        body.avgWaitMinutes = form.avgWaitMinutes ? Number(form.avgWaitMinutes) : null;
      }
      const res = await fetch("/api/service-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setPendingCoords(null);
        setAddMode(false);
        setForm({ ...form, name: "", address: "", notes: "" });
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(kind: "WATER" | "WASTE", id: string, status: string) {
    setSaving(true);
    try {
      await fetch(`/api/service-points/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, status, faultNote: faultNote || undefined }),
      });
      setFaultNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function movePoint(id: string, lat: number, lon: number) {
    const kind = water.some((w) => w.id === id) ? "WATER" : "WASTE";
    await fetch(`/api/service-points/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, lat, lon }),
    });
    router.refresh();
  }

  async function disablePoint(kind: "WATER" | "WASTE", id: string) {
    await fetch(`/api/service-points/${id}?kind=${kind}`, { method: "DELETE" });
    setSelectedId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-[420px] shrink-0 flex-col overflow-y-auto border-l border-panel-border">
        <div className="flex gap-1 border-b border-panel-border p-2">
          <button
            onClick={() => {
              setTab("WATER");
              setSelectedId(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === "WATER" ? "bg-accent/10 text-accent" : "text-muted"}`}
          >
            💧 נקודות מים ({water.length})
          </button>
          <button
            onClick={() => {
              setTab("WASTE");
              setSelectedId(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === "WASTE" ? "bg-accent/10 text-accent" : "text-muted"}`}
          >
            🗑️ נקודות פריקה ({waste.length})
          </button>
        </div>

        {canEdit && (
          <div className="border-b border-panel-border p-3">
            <button
              onClick={() => {
                setAddMode((v) => !v);
                setPendingCoords(null);
              }}
              className={`w-full rounded-md border px-3 py-2 text-sm font-semibold ${
                addMode ? "border-accent bg-accent/10 text-accent" : "border-panel-border text-foreground/90"
              }`}
            >
              {addMode ? "לחצו על המפה למיקום — או בטלו" : `+ הוסף נקודת ${tab === "WATER" ? "מים" : "פריקה"} על המפה`}
            </button>
          </div>
        )}

        {pendingCoords && (
          <form onSubmit={submitNewPoint} className="space-y-2 border-b border-panel-border p-3 text-sm">
            <div className="text-xs text-muted" dir="ltr">
              {pendingCoords.lat.toFixed(5)}, {pendingCoords.lon.toFixed(5)}
            </div>
            <input
              required
              placeholder="שם הנקודה"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none focus:border-accent"
            />
            <input
              placeholder="כתובת"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
            />
            <select
              value={form.zoneId}
              onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
            >
              <option value="">ללא אזור</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            {tab === "WATER" ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="סוג חיבור"
                  value={form.connectionType}
                  onChange={(e) => setForm({ ...form, connectionType: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
                <input
                  type="number"
                  placeholder="ליטר/דקה"
                  value={form.flowLitersPerMin}
                  onChange={(e) => setForm({ ...form, flowLitersPerMin: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
                <input
                  type="number"
                  placeholder="דקות מילוי"
                  value={form.avgFillMinutes}
                  onChange={(e) => setForm({ ...form, avgFillMinutes: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="כלים במקביל"
                  value={form.parallelCapacity}
                  onChange={(e) => setForm({ ...form, parallelCapacity: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="דקות פריקה"
                  value={form.avgDumpMinutes}
                  onChange={(e) => setForm({ ...form, avgDumpMinutes: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
                <input
                  type="number"
                  placeholder="דקות המתנה"
                  value={form.avgWaitMinutes}
                  onChange={(e) => setForm({ ...form, avgWaitMinutes: e.target.value })}
                  className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
                />
              </div>
            )}
            {resourceTypes.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted">כלים מורשים (ריק = כל הכלים)</div>
                <div className="flex flex-wrap gap-1">
                  {resourceTypes.map((t) => {
                    const on = allowedResourceTypeIds.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() =>
                          setAllowedResourceTypeIds((prev) => (on ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-accent bg-accent/10 text-accent" : "border-panel-border"}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <textarea
              placeholder="הערות"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 outline-none"
              rows={2}
            />
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              שמור נקודה — תסומן &quot;דורשת אישור&quot; עד לאימות
            </button>
          </form>
        )}

        <div className="flex-1">
          {(tab === "WATER" ? water : waste).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
              className={`block w-full border-b border-panel-border/60 px-3 py-2 text-start text-sm hover:bg-accent/5 ${
                selectedId === p.id ? "bg-accent/10" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {p.name} {p.isDemo && <span className="text-warning">DEMO</span>}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="text-xs text-muted">{p.zoneName ?? "ללא אזור"} {p.address ? `· ${p.address}` : ""}</div>
            </button>
          ))}
          {(tab === "WATER" ? water : waste).length === 0 && (
            <div className="p-8 text-center text-sm text-muted">אין עדיין נקודות מסוג זה.</div>
          )}
        </div>

        {(selectedWater || selectedWaste) && canEdit && (
          <div className="space-y-2 border-t border-panel-border p-3 text-sm">
            <div className="font-semibold">{(selectedWater ?? selectedWaste)!.name}</div>
            <div className="flex flex-wrap gap-1">
              {(["ACTIVE", "BROKEN", "TEMPORARILY_CLOSED", "REQUIRES_REVIEW"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus(tab, (selectedWater ?? selectedWaste)!.id, s)}
                  disabled={saving}
                  className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${STATUS_CLASS[s]}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <input
              placeholder="הערת תקלה / שינוי סטטוס (אופציונלי)"
              value={faultNote}
              onChange={(e) => setFaultNote(e.target.value)}
              className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-xs outline-none"
            />
            {selectedWater && (
              <div className="space-y-1 text-xs text-muted">
                <div>קצב מילוי: {selectedWater.flowLitersPerMin ?? "—"} ליטר/דקה</div>
                <div>זמן מילוי ממוצע: {selectedWater.avgFillMinutes ?? "—"} דק׳</div>
                <div>המתנה ממוצעת: {selectedWater.avgWaitMinutes ?? "—"} דק׳</div>
                <div>כלים במקביל: {selectedWater.parallelCapacity}</div>
                <div>
                  נבדקה לאחרונה:{" "}
                  {selectedWater.lastCheckedAt ? new Date(selectedWater.lastCheckedAt).toLocaleDateString("he-IL") : "מעולם לא נבדקה"}
                </div>
              </div>
            )}
            {selectedWaste && (
              <div className="space-y-1 text-xs text-muted">
                <div>זמן פריקה ממוצע: {selectedWaste.avgDumpMinutes ?? "—"} דק׳</div>
                <div>המתנה ממוצעת: {selectedWaste.avgWaitMinutes ?? "—"} דק׳</div>
              </div>
            )}
            <button
              onClick={() => disablePoint(tab, (selectedWater ?? selectedWaste)!.id)}
              className="w-full rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger"
            >
              השבת נקודה
            </button>
          </div>
        )}
      </div>

      <div className="relative flex-1">
        <ServicePointsMap
          points={markers}
          addMode={addMode}
          onMapClick={(lat, lon) => setPendingCoords({ lat, lon })}
          onSelect={setSelectedId}
          onMove={canEdit ? movePoint : undefined}
          selectedId={selectedId}
        />
        {pendingCoords && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-4">
            <div className="rounded-md bg-panel/95 px-3 py-1.5 text-xs shadow">מיקום נבחר — מלאו את הטופס בצד</div>
          </div>
        )}
      </div>
    </div>
  );
}
