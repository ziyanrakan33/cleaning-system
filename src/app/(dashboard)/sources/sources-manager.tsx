"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Summary = {
  evidenceTotal: number;
  evidenceVerified: number;
  evidencePending: number;
  evidenceRejected: number;
  conflictsOpen: number;
  conflictsTotal: number;
  zonesTotal: number;
  zonesWithoutBoundary: number;
  zonesWithoutContractArea: number;
  segmentsNeedingReview: number;
  unassignedStreets: number;
  crossingStreets: number;
  assignedKm: number;
  tenderKm: number | null;
  jurisdictionKm: number | null;
};

type Evidence = {
  id: string;
  entityType: string;
  entityLabel: string;
  fieldName: string | null;
  sourceFile: string;
  sourceType: string;
  sourceSection: string | null;
  sourceImageRegion: string | null;
  extractedValue: string | null;
  confidence: string;
  verificationStatus: string;
  verifiedByName: string | null;
  verifiedAt: string | null;
  notes: string | null;
};

type Conflict = {
  id: string;
  topic: string;
  valueA: string;
  sourceA: string;
  valueB: string;
  sourceB: string;
  valueC: string | null;
  sourceC: string | null;
  status: string;
  resolvedValue: string | null;
  resolvedByName: string | null;
  notes: string | null;
};

type ZoneRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  zoneNumber: number | null;
  hasBoundary: boolean;
  boundaryStatus: string;
  contractAreaId: string | null;
  contractAreaLabel: string | null;
  contractAreaStatus: string;
  streetCount: number;
  segmentCount: number;
};

type ContractAreaRow = {
  id: string;
  areaNumber: number;
  name: string;
  contractorName: string | null;
  quotaCount: number;
  dailyTotal: number | null;
};

type SegmentRow = {
  id: string;
  streetName: string;
  streetType: string;
  zoneName: string | null;
  zoneCode: string | null;
  zoneColor: string | null;
  lengthM: number | null;
  crossesZones: boolean;
  manuallyOverridden: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  EXTRACTED: "חולץ",
  REQUIRES_REVIEW: "דורש בדיקה",
  VERIFIED: "אומת",
  REJECTED: "נדחה",
  CONFLICTED: "בסתירה",
};

const STATUS_CLASS: Record<string, string> = {
  EXTRACTED: "bg-accent/10 text-accent",
  REQUIRES_REVIEW: "bg-warning/15 text-warning",
  VERIFIED: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
  CONFLICTED: "bg-critical/15 text-critical",
};

const CONFIDENCE_LABEL: Record<string, string> = { HIGH: "גבוה", MEDIUM: "בינוני", LOW: "נמוך" };

const SOURCE_TYPE_LABEL: Record<string, string> = {
  TENDER_DOCUMENT: "מסמך המכרז",
  BID_TABLE_IMAGE: "צילום טבלת הצעת מחיר",
  ZONE_MAP_IMAGE: "צילום מפת האזורים",
  GIS_IMPORT: "ייבוא GIS",
  OSM_IMPORT: "ייבוא OSM",
  MANUAL_ENTRY: "הזנה ידנית",
};

const ENTITY_LABEL: Record<string, string> = {
  Tender: "מכרז",
  ContractArea: "אזור מכרז",
  ContractAreaResourceQuota: "הקצאת משאב",
  OperationalZone: "אזור תפעולי",
  ResourceType: "סוג משאב",
};

const STREET_TYPE_LABEL: Record<string, string> = {
  STREET: "רחוב",
  PATH: "שביל",
  PEDESTRIAN_MALL: "מדרחוב",
  PUBLIC_AREA: "שטח ציבורי",
  OTHER: "אחר",
};

type Tab = "overview" | "evidence" | "conflicts" | "zones" | "segments";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "סקירה" },
  { key: "zones", label: "שיוך אזורים לקבלנים" },
  { key: "conflicts", label: "סתירות" },
  { key: "evidence", label: "נתונים שחולצו" },
  { key: "segments", label: "מקטעים לבדיקה" },
];

function Badge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-muted/15 text-muted"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "normal",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "normal" | "warn" | "good" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "";
  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function SourcesManager({
  summary,
  evidence,
  conflicts,
  zones,
  contractAreas,
  segments,
  canVerify,
  canAssign,
  canSeeFinance,
}: {
  summary: Summary;
  evidence: Evidence[];
  conflicts: Conflict[];
  zones: ZoneRow[];
  contractAreas: ContractAreaRow[];
  segments: SegmentRow[];
  canVerify: boolean;
  canAssign: boolean;
  canSeeFinance: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  async function send(url: string, body: unknown, id: string, successMessage: string) {
    setBusy(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: url.includes("/contract-area") ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "הפעולה נכשלה");
      setMessage(successMessage);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const filteredEvidence = evidence.filter((e) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "PENDING") {
      return e.verificationStatus === "EXTRACTED" || e.verificationStatus === "REQUIRES_REVIEW";
    }
    return e.verificationStatus === statusFilter;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-panel-border px-6">
        {TABS.map((t) => {
          const count =
            t.key === "conflicts"
              ? summary.conflictsOpen
              : t.key === "zones"
                ? summary.zonesWithoutContractArea
                : t.key === "evidence"
                  ? summary.evidencePending
                  : t.key === "segments"
                    ? summary.segmentsNeedingReview
                    : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                tab === t.key
                  ? "border-accent font-semibold text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="ms-1.5 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-semibold text-warning tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(error || message) && (
        <div className="px-6 pt-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
          )}
          {message && (
            <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
              {message}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {tab === "overview" && (
          <OverviewTab summary={summary} contractAreas={contractAreas} canSeeFinance={canSeeFinance} />
        )}

        {tab === "zones" && (
          <ZonesTab
            zones={zones}
            contractAreas={contractAreas}
            canAssign={canAssign}
            busy={busy}
            onAssign={(zoneId, contractAreaId) =>
              send(
                `/api/zones/${zoneId}/contract-area`,
                { contractAreaId },
                zoneId,
                contractAreaId ? "השיוך נשמר ונרשם ביומן" : "השיוך בוטל"
              )
            }
          />
        )}

        {tab === "conflicts" && (
          <ConflictsTab
            conflicts={conflicts}
            canVerify={canVerify}
            busy={busy}
            onResolve={(id, status, resolvedValue) =>
              send(
                `/api/sources/conflicts/${id}`,
                { status, resolvedValue },
                id,
                status === "RESOLVED" ? "הסתירה הוכרעה" : "שני הערכים סומנו כתקפים"
              )
            }
          />
        )}

        {tab === "evidence" && (
          <EvidenceTab
            evidence={filteredEvidence}
            total={evidence.length}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            canVerify={canVerify}
            busy={busy}
            onSet={(id, verificationStatus) =>
              send(
                `/api/sources/evidence/${id}`,
                { verificationStatus },
                id,
                verificationStatus === "VERIFIED" ? "הנתון אושר" : "הסטטוס עודכן"
              )
            }
          />
        )}

        {tab === "segments" && <SegmentsTab segments={segments} summary={summary} />}
      </div>
    </div>
  );
}

function OverviewTab({
  summary,
  contractAreas,
  canSeeFinance,
}: {
  summary: Summary;
  contractAreas: ContractAreaRow[];
  canSeeFinance: boolean;
}) {
  const kmGap = summary.tenderKm !== null ? summary.tenderKm - summary.assignedKm : null;

  return (
    <div className="space-y-6">
      {summary.zonesWithoutContractArea > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="font-semibold text-warning">
            {summary.zonesWithoutContractArea} מתוך {summary.zonesTotal} אזורים תפעוליים טרם שויכו לאזור מכרז
          </div>
          <p className="mt-1 text-sm">
            מסמכי המכרז אינם מגדירים את השיוך: בסעיף שאמור לפרט אילו אזורים שייכים לכל קבלן, השורות
            «קבלן מס׳ 1:» ו«קבלן מס׳ 2:» ריקות, ונספח ו׳ (המפה האזורית) אינו בין קובצי המקור. לכן השיוך
            נקבע ידנית בלשונית «שיוך אזורים לקבלנים» ואינו מנוחש על ידי המערכת.
          </p>
        </div>
      )}

      {summary.zonesWithoutBoundary > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="font-semibold text-warning">
            {summary.zonesWithoutBoundary} אזורים ללא גבול גיאוגרפי מוגדר
          </div>
          <p className="mt-1 text-sm">
            צילום מפת החלוקה מאפשר לקרוא את מספרי האזורים ואת צבעיהם, אך לא להפיק ממנו פוליגונים מדויקים.
            הגבולות מוזנים במסך{" "}
            <a href="/zones" className="font-semibold text-accent hover:underline">
              אזורי עבודה
            </a>{" "}
            — ציור על המפה או ייבוא GeoJSON/KML. עד אז לא מוצג גבול משוער.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="נתונים שחולצו" value={summary.evidenceTotal} hint={`${summary.evidenceVerified} אומתו`} />
        <Stat
          label="ממתינים לאישור"
          value={summary.evidencePending}
          tone={summary.evidencePending > 0 ? "warn" : "good"}
        />
        <Stat
          label="סתירות פתוחות"
          value={summary.conflictsOpen}
          tone={summary.conflictsOpen > 0 ? "warn" : "good"}
          hint={`מתוך ${summary.conflictsTotal}`}
        />
        <Stat
          label="מקטעים לבדיקה"
          value={summary.segmentsNeedingReview}
          tone={summary.segmentsNeedingReview > 0 ? "warn" : "good"}
        />
        <Stat
          label="רחובות ללא שיוך"
          value={summary.unassignedStreets}
          tone={summary.unassignedStreets > 0 ? "warn" : "good"}
        />
        <Stat label="רחובות שחוצים אזורים" value={summary.crossingStreets} hint="מפוצלים למקטעים" />
        <Stat label='ק"מ משויכים' value={summary.assignedKm.toFixed(1)} />
        <Stat
          label='אומדן המכרז (ק"מ)'
          value={summary.tenderKm ?? "—"}
          hint={kmGap !== null ? `פער ${kmGap.toFixed(1)} ק"מ` : undefined}
          tone={kmGap !== null && Math.abs(kmGap) > 5 ? "warn" : "normal"}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">אזורי המכרז והקבלנים הזוכים</h2>
        <div className="overflow-hidden rounded-xl border border-panel-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start">אזור מכרז</th>
                <th className="px-4 py-2 text-start">קבלן זוכה</th>
                <th className="px-4 py-2 text-start">שורות משאבים</th>
                {canSeeFinance && <th className="px-4 py-2 text-start">סה״כ יומי</th>}
                <th className="px-4 py-2 text-start">אזורים תפעוליים משויכים</th>
              </tr>
            </thead>
            <tbody>
              {contractAreas.map((a) => (
                <tr key={a.id} className="border-t border-panel-border">
                  <td className="px-4 py-2 font-semibold">{a.name}</td>
                  <td className="px-4 py-2">{a.contractorName ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{a.quotaCount}</td>
                  {canSeeFinance && (
                    <td className="px-4 py-2 tabular-nums">
                      {a.dailyTotal ? `${a.dailyTotal.toLocaleString("he-IL")} ₪` : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-muted">ראה לשונית השיוך</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          השיוך בין הקבלנים לאזורי המכרז נקרא מתוך הכותרות המודפסות בשתי טבלאות הצעת המחיר, ומאומת גם
          מכותרות עמודות המחיר בכל טבלה.
        </p>
      </div>
    </div>
  );
}

function ZonesTab({
  zones,
  contractAreas,
  canAssign,
  busy,
  onAssign,
}: {
  zones: ZoneRow[];
  contractAreas: ContractAreaRow[];
  canAssign: boolean;
  busy: string | null;
  onAssign: (zoneId: string, contractAreaId: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      {!canAssign && (
        <div className="rounded-lg border border-panel-border bg-panel px-4 py-2 text-sm text-muted">
          לתפקיד שלך יש הרשאת צפייה בלבד. שיוך אזור לקבלן שמור למנהל מערכת ולמנהל עירוני.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-panel-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-xs text-muted">
            <tr>
              <th className="px-4 py-2 text-start">אזור תפעולי</th>
              <th className="px-4 py-2 text-start">גבול</th>
              <th className="px-4 py-2 text-start">רחובות</th>
              <th className="px-4 py-2 text-start">מקטעים</th>
              <th className="px-4 py-2 text-start">אזור מכרז / קבלן</th>
              <th className="px-4 py-2 text-start">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id} className="border-t border-panel-border">
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="font-semibold">{z.name}</span>
                    <span className="text-xs text-muted">{z.code}</span>
                  </span>
                </td>
                <td className="px-4 py-2">
                  {z.hasBoundary ? (
                    <span className="text-success">מוגדר</span>
                  ) : (
                    <a href={`/zones/${z.id}/boundary`} className="text-warning hover:underline">
                      טרם הוגדר ←
                    </a>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">{z.streetCount}</td>
                <td className="px-4 py-2 tabular-nums">{z.segmentCount}</td>
                <td className="px-4 py-2">
                  <select
                    disabled={!canAssign || busy === z.id}
                    value={z.contractAreaId ?? ""}
                    onChange={(e) => onAssign(z.id, e.target.value || null)}
                    className="rounded-md border border-panel-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-50"
                  >
                    <option value="">— טרם נקבע —</option>
                    {contractAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.contractorName ?? "ללא קבלן"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <Badge status={z.contractAreaStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        כל שינוי בשיוך נשמר ביומן הביקורת יחד עם מי ביצע אותו ומתי, וניתן לשחזור.
      </p>
    </div>
  );
}

function ConflictsTab({
  conflicts,
  canVerify,
  busy,
  onResolve,
}: {
  conflicts: Conflict[];
  canVerify: boolean;
  busy: string | null;
  onResolve: (id: string, status: string, resolvedValue: string | null) => void;
}) {
  if (conflicts.length === 0) {
    return <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
      לא נמצאו סתירות בין המקורות.
    </div>;
  }

  return (
    <div className="space-y-3">
      {conflicts.map((c) => {
        const options = [
          { value: c.valueA, source: c.sourceA },
          { value: c.valueB, source: c.sourceB },
          ...(c.valueC ? [{ value: c.valueC, source: c.sourceC ?? "" }] : []),
        ];
        return (
          <div key={c.id} className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="font-semibold">{c.topic}</div>
              <Badge status={c.status === "OPEN" ? "REQUIRES_REVIEW" : "VERIFIED"} />
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {options.map((o, i) => {
                const chosen = c.resolvedValue === o.value;
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      chosen ? "border-success bg-success/10" : "border-panel-border"
                    }`}
                  >
                    <div className="text-lg font-bold tabular-nums">{o.value}</div>
                    <div className="mt-1 text-xs text-muted">{o.source}</div>
                    {canVerify && c.status === "OPEN" && (
                      <button
                        disabled={busy === c.id}
                        onClick={() => onResolve(c.id, "RESOLVED", o.value)}
                        className="mt-2 rounded-md border border-panel-border px-2 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        בחר ערך זה
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {c.notes && <p className="mt-3 text-sm text-muted">{c.notes}</p>}

            {c.status !== "OPEN" && (
              <p className="mt-3 text-xs text-success">
                {c.status === "ACCEPTED_BOTH"
                  ? "סומן: שני הערכים תקפים ומודדים דברים שונים"
                  : `הוכרע: ${c.resolvedValue}`}
                {c.resolvedByName && ` · ${c.resolvedByName}`}
              </p>
            )}

            {canVerify && c.status === "OPEN" && (
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy === c.id}
                  onClick={() => onResolve(c.id, "ACCEPTED_BOTH", null)}
                  className="rounded-md border border-panel-border px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  שני הערכים תקפים — מודדים דברים שונים
                </button>
              </div>
            )}
            {canVerify && c.status !== "OPEN" && (
              <button
                disabled={busy === c.id}
                onClick={() => onResolve(c.id, "OPEN", null)}
                className="mt-3 text-xs text-muted hover:text-accent disabled:opacity-50"
              >
                פתח מחדש
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EvidenceTab({
  evidence,
  total,
  statusFilter,
  setStatusFilter,
  canVerify,
  busy,
  onSet,
}: {
  evidence: Evidence[];
  total: number;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  canVerify: boolean;
  busy: string | null;
  onSet: (id: string, status: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["PENDING", "ממתינים"],
          ["VERIFIED", "אומתו"],
          ["REJECTED", "נדחו"],
          ["ALL", "הכל"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full px-3 py-1 text-xs ${
              statusFilter === key ? "bg-accent text-accent-foreground" : "border border-panel-border text-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-muted">
          מוצגים {evidence.length} מתוך {total}
        </span>
      </div>

      {evidence.length === 0 ? (
        <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
          אין נתונים בסינון הזה.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-panel-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start">רשומה</th>
                <th className="px-3 py-2 text-start">שדה</th>
                <th className="px-3 py-2 text-start">ערך שחולץ</th>
                <th className="px-3 py-2 text-start">מקור</th>
                <th className="px-3 py-2 text-start">ביטחון</th>
                <th className="px-3 py-2 text-start">סטטוס</th>
                {canVerify && <th className="px-3 py-2 text-start">פעולות</th>}
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id} className="border-t border-panel-border align-top">
                  <td className="px-3 py-2">
                    <div className="text-xs text-muted">{ENTITY_LABEL[e.entityType] ?? e.entityType}</div>
                    <div className="font-medium">{e.entityLabel}</div>
                  </td>
                  <td className="px-3 py-2 text-muted">{e.fieldName ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">
                    {e.extractedValue ?? <span className="text-warning">לא נטען</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs">{SOURCE_TYPE_LABEL[e.sourceType] ?? e.sourceType}</div>
                    <div className="max-w-xs truncate text-xs text-muted" title={e.sourceFile}>
                      {e.sourceFile}
                    </div>
                    {(e.sourceSection || e.sourceImageRegion) && (
                      <div className="max-w-xs text-xs text-muted">
                        {e.sourceSection ?? e.sourceImageRegion}
                      </div>
                    )}
                    {e.notes && <div className="mt-1 max-w-xs text-xs text-muted">{e.notes}</div>}
                  </td>
                  <td className="px-3 py-2">{CONFIDENCE_LABEL[e.confidence] ?? e.confidence}</td>
                  <td className="px-3 py-2">
                    <Badge status={e.verificationStatus} />
                    {e.verifiedByName && (
                      <div className="mt-1 text-xs text-muted">{e.verifiedByName}</div>
                    )}
                  </td>
                  {canVerify && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          disabled={busy === e.id || e.verificationStatus === "VERIFIED"}
                          onClick={() => onSet(e.id, "VERIFIED")}
                          className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-success hover:text-success disabled:opacity-40"
                        >
                          אשר
                        </button>
                        <button
                          disabled={busy === e.id || e.verificationStatus === "REJECTED"}
                          onClick={() => onSet(e.id, "REJECTED")}
                          className="rounded-md border border-panel-border px-2 py-1 text-xs hover:border-danger hover:text-danger disabled:opacity-40"
                        >
                          דחה
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SegmentsTab({ segments, summary }: { segments: SegmentRow[]; summary: Summary }) {
  if (summary.segmentsNeedingReview === 0) {
    return (
      <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
        {summary.unassignedStreets > 0
          ? `אין מקטעים לבדיקה, אך ${summary.unassignedStreets} רחובות עדיין ללא שיוך — כנראה משום שטרם הוגדרו גבולות לאזורים.`
          : "כל המקטעים שויכו בביטחון."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        מקטעים קצרים מ-15 מ׳ הם בדרך כלל חיתוך שולי של רחוב בפינת פוליגון שכן ולא עבודה אמיתית. הם
        נשמרים ומסומנים לבדיקה במקום להיספר בשקט.
      </p>
      <div className="overflow-hidden rounded-xl border border-panel-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-start">רחוב / שביל</th>
              <th className="px-3 py-2 text-start">סוג</th>
              <th className="px-3 py-2 text-start">אזור</th>
              <th className="px-3 py-2 text-start">אורך</th>
              <th className="px-3 py-2 text-start">הערה</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.id} className="border-t border-panel-border">
                <td className="px-3 py-2 font-medium">{s.streetName}</td>
                <td className="px-3 py-2 text-muted">{STREET_TYPE_LABEL[s.streetType] ?? s.streetType}</td>
                <td className="px-3 py-2">
                  {s.zoneName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: s.zoneColor ?? "#94a3b8" }}
                      />
                      {s.zoneName}
                    </span>
                  ) : (
                    <span className="text-warning">ללא</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {s.lengthM !== null ? `${s.lengthM.toFixed(1)} מ׳` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {s.manuallyOverridden
                    ? "תוקן ידנית — מוגן מהרצה חוזרת"
                    : s.crossesZones
                      ? "הרחוב חוצה יותר מאזור אחד"
                      : "מקטע קצר על גבול"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.segmentsNeedingReview > segments.length && (
        <p className="text-xs text-muted">
          מוצגים {segments.length} מתוך {summary.segmentsNeedingReview} — הקצרים ביותר תחילה.
        </p>
      )}
    </div>
  );
}
