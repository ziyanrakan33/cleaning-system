"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

type ZoneAllocation = {
  zoneId: string;
  zoneName: string;
  zoneCode: string;
  hasBoundaryData: boolean;
  workloadSharePercent: number | null;
  streetKm: number;
  pathKm: number;
  estimatedCleanHours: number;
  suggestedQuantity: number;
  currentQuantity: number;
  variance: number;
  defectCount90d: number;
  complaintCount90d: number;
  explanation: string;
};

type ResourceTypeAllocation = {
  resourceTypeId: string;
  resourceTypeName: string;
  category: string;
  contractedQuantity: number;
  activePoolSize: number;
  unassignedPoolSize: number;
  poolShortfall: number;
  insufficientData: boolean;
  zones: ZoneAllocation[];
};

type ContractAreaAllocation = {
  contractAreaId: string;
  contractAreaName: string;
  contractorName: string | null;
  zonesWithoutBoundary: number;
  resourceTypes: ResourceTypeAllocation[];
};

export function AllocationManager({
  initialAreas,
  canApply,
}: {
  initialAreas: ContractAreaAllocation[];
  canApply: boolean;
}) {
  if (initialAreas.length === 0) {
    return (
      <div className="m-6 rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
        לא נמצאו אזורי מכרז עם קבלן משויך. הגדירו אזורי מכרז וקבלנים לפני שימוש בכלי זה.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {initialAreas.map((area) => (
        <ContractAreaSection key={area.contractAreaId} area={area} canApply={canApply} />
      ))}
    </div>
  );
}

function ContractAreaSection({ area, canApply }: { area: ContractAreaAllocation; canApply: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold">{area.contractAreaName}</h2>
        <span className="text-sm text-muted">{area.contractorName ?? "ללא קבלן"}</span>
        {area.zonesWithoutBoundary > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
            {area.zonesWithoutBoundary} אזורים ללא גבול
          </span>
        )}
      </div>

      {area.resourceTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted">
          לא הוגדרה הקצאה חוזית (ContractAreaResourceQuota) לאזור מכרז זה.
        </div>
      ) : (
        <div className="space-y-4">
          {area.resourceTypes.map((rt) => (
            <ResourceTypeCard key={rt.resourceTypeId} area={area} rt={rt} canApply={canApply} />
          ))}
        </div>
      )}
    </section>
  );
}

function ResourceTypeCard({
  area,
  rt,
  canApply,
}: {
  area: ContractAreaAllocation;
  rt: ResourceTypeAllocation;
  canApply: boolean;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(rt.zones.map((z) => [z.zoneId, z.suggestedQuantity]))
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsReason, setNeedsReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const totalRequested = Object.values(quantities).reduce((a, b) => a + b, 0);
  const overQuota = totalRequested > rt.contractedQuantity;

  async function apply(withReason?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/resources/allocation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAreaId: area.contractAreaId,
          resourceTypeId: rt.resourceTypeId,
          quantities,
          reason: withReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setNeedsReason(data.message ?? "ההקצאה חורגת מהכמות החוזית — נדרש נימוק");
        return;
      }
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "ההחלה נכשלה");

      let msg = `ההקצאה יושמה על ${data.applied.length} אזורים, ${data.freedCount} משאבים שוחררו`;
      if (data.poolTooSmall) msg += " — אזהרה: אין מספיק משאבים פעילים כדי למלא את הכמות המבוקשת";
      setMessage(msg);
      setNeedsReason(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{rt.resourceTypeName}</div>
          <div className="text-xs text-muted">
            כמות חוזית: {rt.contractedQuantity} · בפועל במערכת: {rt.activePoolSize}
            {rt.poolShortfall > 0 && (
              <span className="text-danger"> · חסרים {rt.poolShortfall} כלים מהחוזה</span>
            )}
          </div>
        </div>
        {canApply && (
          <button
            disabled={busy || rt.insufficientData}
            onClick={() => apply()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            title={rt.insufficientData ? "אין נתוני גבול לחישוב המלצה" : undefined}
          >
            {busy ? "מחיל..." : "החל הקצאה"}
          </button>
        )}
      </div>

      {rt.insufficientData && rt.zones.length === 0 && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          לא ניתן לחשב המלצה — אף אזור תפעולי אינו משויך לאזור מכרז זה. קבעו שיוך במסך{" "}
          <a href="/sources" className="underline">
            מקורות ואימות
          </a>{" "}
          (לשונית &quot;שיוך אזורים לקבלנים&quot;).
        </div>
      )}
      {rt.insufficientData && rt.zones.length > 0 && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          לא ניתן לחשב המלצה — אף אחד מהאזורים המשויכים לאזור מכרז זה אינו בעל גבול גיאוגרפי מוגדר. הגדירו גבולות ב-
          <a href="/zones" className="underline">
            /zones
          </a>
          .
        </div>
      )}

      {error && <div className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</div>}
      {message && <div className="mb-3 rounded-lg bg-success/10 p-2 text-xs text-success">{message}</div>}
      {needsReason && (
        <div className="mb-3 space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs">
          <div className="text-danger">{needsReason}</div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="נימוק לחריגה מהכמות החוזית"
            className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none"
          />
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() => apply(reason)}
            className="rounded-md border border-danger/40 px-3 py-1 text-xs text-danger disabled:opacity-50"
          >
            אשר בכל זאת ({totalRequested} מתוך {rt.contractedQuantity})
          </button>
        </div>
      )}
      {overQuota && !needsReason && (
        <div className="mb-3 rounded-lg bg-warning/10 p-2 text-xs text-warning">
          הכמות שערכתם ({totalRequested}) חורגת מהכמות החוזית ({rt.contractedQuantity}) — ההחלה תבקש נימוק.
        </div>
      )}

      {rt.zones.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-2 py-1 text-start">אזור</th>
              <th className="px-2 py-1 text-start">חלק מהעומס</th>
              <th className="px-2 py-1 text-start">ק&quot;מ רחוב/שביל</th>
              <th className="px-2 py-1 text-start">זמן משוער</th>
              <th className="px-2 py-1 text-start">כיום</th>
              <th className="px-2 py-1 text-start">מוצע</th>
              <th className="px-2 py-1 text-start">פער</th>
              <th className="px-2 py-1 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {rt.zones.map((z) => (
              <Fragment key={z.zoneId}>
                <tr className={`border-t border-panel-border ${!z.hasBoundaryData ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5 font-medium">{z.zoneName}</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {z.workloadSharePercent !== null ? `${z.workloadSharePercent}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-xs">
                    {z.streetKm} / {z.pathKm}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-xs">{z.estimatedCleanHours} שעות</td>
                  <td className="px-2 py-1.5 tabular-nums">{z.currentQuantity}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      value={quantities[z.zoneId] ?? 0}
                      onChange={(e) =>
                        setQuantities((q) => ({ ...q, [z.zoneId]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      disabled={!canApply}
                      className="w-14 rounded-md border border-panel-border bg-transparent px-1.5 py-0.5 text-sm outline-none focus:border-accent disabled:opacity-60"
                    />
                  </td>
                  <td
                    className={`px-2 py-1.5 tabular-nums ${
                      quantities[z.zoneId] - z.currentQuantity > 0
                        ? "text-success"
                        : quantities[z.zoneId] - z.currentQuantity < 0
                          ? "text-danger"
                          : "text-muted"
                    }`}
                  >
                    {quantities[z.zoneId] - z.currentQuantity > 0 ? "+" : ""}
                    {quantities[z.zoneId] - z.currentQuantity}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setExpanded(expanded === z.zoneId ? null : z.zoneId)}
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === z.zoneId ? "סגור" : "מדוע?"}
                    </button>
                  </td>
                </tr>
                {expanded === z.zoneId && (
                  <tr className="border-t border-panel-border/60 bg-background/40">
                    <td colSpan={8} className="px-2 py-2 text-xs text-muted">
                      {z.explanation}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
