"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResourceType = { id: string; name: string; code: string };
type ResourceRow = {
  id: string;
  identifier: string;
  name: string | null;
  typeName: string;
  status: string;
  assignedEmployeeName: string | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
};
type Zone = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "פעיל", className: "text-success" },
  { value: "BROKEN", label: "תקול", className: "text-danger" },
  { value: "MAINTENANCE", label: "בתחזוקה", className: "text-warning" },
  { value: "INACTIVE", label: "לא פעיל", className: "text-muted" },
];

export function ResourcesManager({
  resourceTypes,
  resources,
  zones,
}: {
  resourceTypes: ResourceType[];
  resources: ResourceRow[];
  zones: Zone[];
}) {
  const router = useRouter();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeCode, setTypeCode] = useState("");

  const [resourceTypeId, setResourceTypeId] = useState(resourceTypes[0]?.id ?? "");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [workHoursStart, setWorkHoursStart] = useState("07:00");
  const [workHoursEnd, setWorkHoursEnd] = useState("14:30");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function createType(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/resource-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: typeName, code: typeCode }),
    });
    setTypeName("");
    setTypeCode("");
    setShowTypeForm(false);
    router.refresh();
  }

  async function createResource(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceTypeId,
          identifier,
          name: name || undefined,
          workHoursStart,
          workHoursEnd,
          allowedZoneIds: selectedZones,
        }),
      });
      if (res.ok) {
        setIdentifier("");
        setName("");
        setSelectedZones([]);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/resources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-panel-border bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">סוגי משאב:</span>
          {resourceTypes.map((t) => (
            <span key={t.id} className="rounded-full border border-panel-border px-3 py-1">
              {t.name}
            </span>
          ))}
          {resourceTypes.length === 0 && <span className="text-muted">אין עדיין סוגי משאב</span>}
        </div>
        <button onClick={() => setShowTypeForm((s) => !s)} className="text-sm text-accent hover:underline">
          + סוג משאב חדש
        </button>
      </div>

      {showTypeForm && (
        <form onSubmit={createType} className="mb-4 flex items-end gap-3 rounded-xl border border-panel-border bg-panel p-4">
          <div>
            <label className="mb-1 block text-xs text-muted">שם הסוג</label>
            <input
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              required
              placeholder='למשל: "מכונת טיאוט"'
              className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">קוד</label>
            <input
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
              required
              dir="ltr"
              placeholder="SWEEPER"
              className="w-32 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
            שמור
          </button>
        </form>
      )}

      <form onSubmit={createResource} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-panel-border bg-panel p-4">
        <div>
          <label className="mb-1 block text-xs text-muted">סוג</label>
          <select
            value={resourceTypeId}
            onChange={(e) => setResourceTypeId(e.target.value)}
            required
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none"
          >
            <option value="">בחר סוג</option>
            {resourceTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">מספר רכב/כלי</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            dir="ltr"
            className="w-28 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">שם/כינוי</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">שעות עבודה</label>
          <div className="flex items-center gap-1" dir="ltr">
            <input
              type="time"
              value={workHoursStart}
              onChange={(e) => setWorkHoursStart(e.target.value)}
              className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            <span className="text-muted">–</span>
            <input
              type="time"
              value={workHoursEnd}
              onChange={(e) => setWorkHoursEnd(e.target.value)}
              className="rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">אזורים מותרים</label>
          <select
            multiple
            value={selectedZones}
            onChange={(e) => setSelectedZones(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="h-9 min-w-32 rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving || !resourceTypeId}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          הוסף משאב
        </button>
      </form>

      <table className="w-full overflow-hidden rounded-xl border border-panel-border bg-panel text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-panel-border">
            <th className="px-4 py-2 text-start font-medium">מספר</th>
            <th className="px-4 py-2 text-start font-medium">שם</th>
            <th className="px-4 py-2 text-start font-medium">סוג</th>
            <th className="px-4 py-2 text-start font-medium">עובד</th>
            <th className="px-4 py-2 text-start font-medium">שעות עבודה</th>
            <th className="px-4 py-2 text-start font-medium">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} className="border-b border-panel-border/60">
              <td className="px-4 py-2 font-mono text-xs">{r.identifier}</td>
              <td className="px-4 py-2">{r.name ?? "—"}</td>
              <td className="px-4 py-2 text-muted">{r.typeName}</td>
              <td className="px-4 py-2 text-muted">{r.assignedEmployeeName ?? "—"}</td>
              <td className="px-4 py-2 text-muted" dir="ltr">
                {r.workHoursStart && r.workHoursEnd ? `${r.workHoursStart}–${r.workHoursEnd}` : "—"}
              </td>
              <td className="px-4 py-2">
                <select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className={`rounded border border-panel-border bg-transparent px-2 py-1 text-xs outline-none ${
                    STATUS_OPTIONS.find((s) => s.value === r.status)?.className ?? ""
                  }`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {resources.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-muted">
                אין עדיין משאבים. הוסיפו סוג משאב ומשאב באמצעות הטפסים למעלה.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
