"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DEDUCTION_STATUS_CLASS,
  DEDUCTION_STATUS_LABEL,
  DEFECT_STATUS_CLASS,
  DEFECT_STATUS_LABEL,
  formatDateTime,
  relativeDeadline,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
} from "./defect-labels";

type Row = {
  id: string;
  reference: string;
  title: string;
  status: string;
  severity: string;
  typeName: string | null;
  category: string | null;
  zoneName: string | null;
  zoneColor: string | null;
  streetName: string | null;
  contractorName: string | null;
  assignedToName: string | null;
  reportedAt: string;
  dueAt: string | null;
  overdue: boolean;
  photoCount: number;
  deductionStatus: string;
  deductionAmount: number | null;
};

type DefectType = {
  id: string;
  code: string;
  name: string;
  category: string;
  unitBasis: string;
  deductionAmount: number | null;
  defaultFixHours: number | null;
};

type Zone = { id: string; name: string; code: string; color: string };

export function DefectsManager({
  rows,
  defectTypes,
  zones,
  assignees,
  canCreate,
  canSeeFinance,
}: {
  rows: Row[];
  defectTypes: DefectType[];
  zones: Zone[];
  assignees: { id: string; name: string }[];
  canCreate: boolean;
  canSeeFinance: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"OPEN" | "OVERDUE" | "DEDUCTION" | "ALL">("OPEN");
  const [zoneFilter, setZoneFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "OPEN" && ["CLOSED", "FIXED"].includes(r.status)) return false;
      if (filter === "OVERDUE" && !r.overdue) return false;
      if (filter === "DEDUCTION" && r.deductionStatus !== "PROPOSED") return false;
      if (zoneFilter && r.zoneName !== zoneFilter) return false;
      const q = search.trim();
      if (q && !`${r.reference} ${r.title} ${r.streetName ?? ""} ${r.typeName ?? ""}`.includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, filter, zoneFilter, search]);

  const FILTERS: [typeof filter, string, number][] = [
    ["OPEN", "פתוחים", rows.filter((r) => !["CLOSED", "FIXED"].includes(r.status)).length],
    ["OVERDUE", "באיחור", rows.filter((r) => r.overdue).length],
    ["DEDUCTION", "קיזוז ממתין לאישור", rows.filter((r) => r.deductionStatus === "PROPOSED").length],
    ["ALL", "הכל", rows.length],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-panel-border px-6 py-3">
        {FILTERS.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === key ? "bg-accent text-accent-foreground" : "border border-panel-border text-muted"
            }`}
          >
            {label}
            <span className="ms-1.5 tabular-nums opacity-80">{count}</span>
          </button>
        ))}

        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="rounded-md border border-panel-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
        >
          <option value="">כל האזורים</option>
          {zones.map((z) => (
            <option key={z.id} value={z.name}>
              {z.name}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי מספר, רחוב או תיאור…"
          className="min-w-56 flex-1 rounded-md border border-panel-border bg-transparent px-3 py-1 text-sm outline-none focus:border-accent"
        />

        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
          >
            {showForm ? "ביטול" : "ליקוי חדש"}
          </button>
        )}
      </div>

      {showForm && (
        <NewDefectForm
          defectTypes={defectTypes}
          zones={zones}
          assignees={assignees}
          canSeeFinance={canSeeFinance}
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="m-6 rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
            {rows.length === 0
              ? "לא נפתחו ליקויים עדיין. ליקוי נפתח מסיור פיקוח, מפניית מוקד או ידנית."
              : "אין ליקויים התואמים לסינון."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start">מס׳</th>
                <th className="px-4 py-2 text-start">הליקוי</th>
                <th className="px-4 py-2 text-start">אזור / רחוב</th>
                <th className="px-4 py-2 text-start">קבלן</th>
                <th className="px-4 py-2 text-start">חומרה</th>
                <th className="px-4 py-2 text-start">מועד יעד</th>
                <th className="px-4 py-2 text-start">סטטוס</th>
                <th className="px-4 py-2 text-start">קיזוז</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/defects/${r.id}`)}
                  className="cursor-pointer border-t border-panel-border hover:bg-accent/5"
                >
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                    {r.reference}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.title}</div>
                    {r.typeName && <div className="text-xs text-muted">{r.typeName}</div>}
                    {r.photoCount > 0 && (
                      <div className="text-xs text-muted">{r.photoCount} תמונות</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.zoneName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: r.zoneColor ?? "#94a3b8" }}
                        />
                        {r.zoneName}
                      </span>
                    ) : (
                      <span className="text-muted">ללא אזור</span>
                    )}
                    {r.streetName && <div className="text-xs text-muted">{r.streetName}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs">{r.contractorName ?? "—"}</td>
                  <td className={`px-4 py-2 ${SEVERITY_CLASS[r.severity] ?? ""}`}>
                    {SEVERITY_LABEL[r.severity] ?? r.severity}
                  </td>
                  <td className={`px-4 py-2 ${r.overdue ? "text-danger" : ""}`}>
                    <div>{formatDateTime(r.dueAt)}</div>
                    <div className="text-xs opacity-80">{relativeDeadline(r.dueAt)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        DEFECT_STATUS_CLASS[r.status] ?? ""
                      }`}
                    >
                      {DEFECT_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.assignedToName && (
                      <div className="mt-0.5 text-xs text-muted">{r.assignedToName}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs ${DEDUCTION_STATUS_CLASS[r.deductionStatus] ?? ""}`}>
                      {DEDUCTION_STATUS_LABEL[r.deductionStatus] ?? r.deductionStatus}
                    </span>
                    {canSeeFinance && r.deductionAmount ? (
                      <div className="tabular-nums">{r.deductionAmount.toLocaleString("he-IL")} ₪</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewDefectForm({
  defectTypes,
  zones,
  assignees,
  canSeeFinance,
  onDone,
}: {
  defectTypes: DefectType[];
  zones: Zone[];
  assignees: { id: string; name: string }[];
  canSeeFinance: boolean;
  onDone: () => void;
}) {
  const [typeId, setTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [origin, setOrigin] = useState("INSPECTION");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = defectTypes.find((t) => t.id === typeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defectTypeId: typeId || null,
          title,
          description: description || null,
          zoneId: zoneId || null,
          severity,
          origin,
          assignedToId: assignedToId || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "פתיחת הליקוי נכשלה");
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-panel-border bg-panel/50 p-6">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs text-muted">סוג ליקוי (מטבלת הקיזוזים במכרז)</span>
          <select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              const t = defectTypes.find((x) => x.id === e.target.value);
              if (t && !title) setTitle(t.name);
            }}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— ללא סוג מוגדר (לא ייווצר קיזוז) —</option>
            {defectTypes.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.category}] {t.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">חומרה</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-3">
          <span className="mb-1 block text-xs text-muted">תיאור קצר</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={2}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="md:col-span-3">
          <span className="mb-1 block text-xs text-muted">פירוט</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">אזור</span>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— ללא —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">מקור</span>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="INSPECTION">סיור פיקוח</option>
            <option value="CALL_CENTER">פניית מוקד</option>
            <option value="MANAGER">הנחיית מנהל</option>
            <option value="CONTRACTOR">דיווח הקבלן</option>
            <option value="OTHER">אחר</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">אחראי מטעם הקבלן</span>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">— טרם שויך —</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="mb-1 block text-xs text-muted">
            מועד יעד לתיקון
            {selectedType?.defaultFixHours
              ? ` — המכרז קוצב ${selectedType.defaultFixHours} שעות לסוג זה`
              : " — המכרז אינו קוצב מועד לסוג זה, קבעו לפי §821"}
          </span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {selectedType && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <strong>{selectedType.name}</strong> — בסיס החיוב: {selectedType.unitBasis}.
          {canSeeFinance && selectedType.deductionAmount !== null && (
            <> קיזוז מוצע: {selectedType.deductionAmount.toLocaleString("he-IL")} ₪.</>
          )}{" "}
          הקיזוז נרשם כ«מוצע» בלבד ואינו חל עד לאישור מנהל.
        </div>
      )}

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {saving ? "פותח…" : "פתח ליקוי"}
        </button>
      </div>
    </form>
  );
}
