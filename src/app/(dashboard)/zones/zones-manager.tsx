"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ZoneRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  zoneNumber: number | null;
  description: string | null;
  hasBoundary: boolean;
  contractAreaLabel: string | null;
  streetCount: number;
  segmentCount: number;
  totalLengthM: number;
};

export function ZonesManager({
  zones,
  unassignedCount,
  withoutBoundary,
  canEdit,
}: {
  zones: ZoneRow[];
  unassignedCount: number;
  withoutBoundary: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busyZoneId, setBusyZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function importBoundary(zoneId: string, file: File) {
    setBusyZoneId(zoneId);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/zones/${zoneId}/boundary-import`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "הייבוא נכשל");

      const warn = (data.warnings ?? []).join(" ");
      setMessage(
        `הגבול יובא (${data.points} נקודות). ` +
          `שויכו ${data.join.streetsAssigned} רחובות ב-${data.join.segmentsCreated} מקטעים.` +
          (warn ? ` ${warn}` : "")
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyZoneId(null);
    }
  }

  async function rerunJoin() {
    setJoining(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/spatial-join", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "ההרצה נכשלה");
      setMessage(
        `השיוך הורץ מחדש: ${data.segmentsCreated} מקטעים · ${data.streetsAssigned} רחובות שויכו · ` +
          `${data.streetsUnassigned} ללא שיוך · ${data.protectedStreets} רחובות עם תיקון ידני נשמרו`
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="p-6">
      {withoutBoundary > 0 && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <div className="font-semibold text-warning">{withoutBoundary} אזורים עדיין ללא גבול גיאוגרפי</div>
          <p className="mt-1">
            מספרי האזורים וצבעיהם נקראו מצילום מפת החלוקה, אך לא ניתן להפיק ממנו פוליגונים מדויקים —
            זהו צילום של מפת נייר בזווית, ללא נקודות ציון ידועות. לכן <strong>לא נוצרו גבולות משוערים</strong>.
            יש לצייר כל גבול על המפה או לייבא קובץ GeoJSON/KML.
          </p>
        </div>
      )}

      {unassignedCount > 0 && (
        <div className="mb-4 rounded-lg border border-panel-border bg-panel px-4 py-2 text-sm">
          {unassignedCount} רחובות עדיין ללא שיוך לאזור. השיוך מחושב גיאוגרפית מגבולות האזורים —
          לאחר הגדרת גבול, הרחובות משויכים אוטומטית.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          {message}
        </div>
      )}

      {canEdit && (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={rerunJoin}
            disabled={joining}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {joining ? "מריץ שיוך גיאוגרפי..." : "הרץ שיוך גיאוגרפי מחדש"}
          </button>
          <span className="text-xs text-muted">
            מחשב מחדש את שיוך הרחובות מגבולות האזורים. תיקונים ידניים נשמרים ואינם נדרסים.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zones.map((z) => (
          <div key={z.id} className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: z.color }} />
              <span className="truncate font-semibold">{z.name}</span>
              <span className="text-xs text-muted">{z.code}</span>
              {!z.hasBoundary && (
                <span className="ms-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                  ללא גבול
                </span>
              )}
            </div>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">אזור מכרז</dt>
                <dd className={z.contractAreaLabel ? "" : "text-warning"}>
                  {z.contractAreaLabel ?? "טרם נקבע"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">רחובות ושבילים</dt>
                <dd className="tabular-nums">{z.streetCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">מקטעים</dt>
                <dd className="tabular-nums">{z.segmentCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">אורך</dt>
                <dd className="tabular-nums">
                  {z.totalLengthM > 0 ? `${(z.totalLengthM / 1000).toFixed(1)} ק״מ` : "—"}
                </dd>
              </div>
            </dl>

            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-panel-border pt-3">
                <a href={`/zones/${z.id}/boundary`} className="text-xs text-accent hover:underline">
                  {z.hasBoundary ? "ערוך גבול על המפה" : "צייר גבול על המפה"}
                </a>
                <button
                  onClick={() => fileInputs.current[z.id]?.click()}
                  disabled={busyZoneId === z.id}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {busyZoneId === z.id ? "מייבא..." : "ייבוא GeoJSON / KML"}
                </button>
                <input
                  ref={(el) => {
                    fileInputs.current[z.id] = el;
                  }}
                  type="file"
                  accept=".geojson,.json,.kml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importBoundary(z.id, file);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {zones.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
            עדיין לא הוגדרו אזורים. הריצו{" "}
            <code className="rounded bg-background px-1">scripts/seed-operational-zones.ts</code> כדי
            ליצור את 10 אזורי הניקיון.
          </div>
        )}
      </div>

      {canEdit && (
        <p className="mt-4 text-xs text-muted">
          קובץ SHP אינו נתמך ישירות — יש להמירו ל-GeoJSON. הקואורדינטות חייבות להיות ב-WGS84 (EPSG:4326);
          קובץ ברשת ישראל החדשה (EPSG:2039) יידחה עם הודעה מתאימה.
        </p>
      )}
    </div>
  );
}
