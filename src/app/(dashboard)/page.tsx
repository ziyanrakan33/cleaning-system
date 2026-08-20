import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDashboardStats } from "@/server/dashboard";
import { getOrganizationSettings } from "@/server/settings/service";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };
const DATA_MODE_LABEL: Record<string, string> = {
  REQUIRES_REVIEW: "דורש סקר",
  MANUAL_BASELINE: "הערכת מנהל עבודה",
  RULE_BASED: "מבוסס כללים",
  DATA_INFORMED: "מבוסס נתוני ביצוע",
};

function StatCard({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "danger" | "warning" | "success" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "";
  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const [s, org] = await Promise.all([getDashboardStats(), getOrganizationSettings()]);

  return (
    <div>
      <PageHeader title="בקרה" subtitle={`תמונת מצב כללית — ${org.name}`} />

      <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4 lg:grid-cols-4">
        <StatCard
          label="כיסוי תוכנית היום"
          value={`${s.coveragePct}%`}
          hint={`${s.plannedTodayCount} מתוך ${s.dueTodayCount} רחובות חייבי ניקיון`}
          tone={s.coveragePct >= 90 ? "success" : s.coveragePct >= 50 ? "warning" : "danger"}
        />
        <StatCard label="רחובות חייבי ניקיון היום" value={s.dueTodayCount} />
        <StatCard label="לא שובצו היום" value={s.unplannedTodayCount} tone={s.unplannedTodayCount > 0 ? "danger" : "success"} />
        <StatCard label="שעות עבודה מתוכננות היום" value={s.plannedWorkHours} />
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 pb-6 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="רחובות ושבילים" value={s.totalStreets} />
        <StatCard label="ללא שיוך לאזור" value={s.unassignedZoneStreets} hint={s.unassignedZoneStreets > 0 ? "דורש חלוקה לאזורים" : "כל הרחובות משויכים"} />
        <StatCard label="אזורים" value={s.totalZones} hint={`מתוך ${org.targetZoneCount} מתוכננים`} />
        <StatCard label="משאבים" value={s.totalResources} />
        <StatCard label="משאבים פעילים" value={s.activeResources} tone="success" />
        <StatCard label="משאבים תקולים" value={s.brokenResources} tone={s.brokenResources > 0 ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 pb-6 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="נקודות מים תקולות" value={s.brokenWaterPointsCount} tone={s.brokenWaterPointsCount > 0 ? "danger" : "success"} />
        <StatCard label="נקודות שירות לאימות" value={s.servicePointsRequiringVerification} tone={s.servicePointsRequiringVerification > 0 ? "warning" : undefined} />
        <StatCard label="פניות פתוחות" value={s.openComplaintsCount} tone={s.openComplaintsCount > 0 ? "warning" : undefined} />
        <StatCard label="רחובות ללא סקר שטח" value={s.pendingSurveyCount} hint={s.pendingSurveyCount > 0 ? "אין ציון עדיפות למקטעים אלו" : undefined} tone={s.pendingSurveyCount > 0 ? "warning" : "success"} />
        <StatCard label="כלים ללא פרופיל תפעולי" value={s.resourcesRequiringProfileReview} tone={s.resourcesRequiringProfileReview > 0 ? "warning" : "success"} />
        <StatCard label="בדיקות היתכנות שנכשלו (היום)" value={s.planFeasibilityFailedChecks} tone={s.planFeasibilityFailedChecks > 0 ? "danger" : "success"} />
        <StatCard
          label="סתירות מקור פתוחות"
          value={s.openSourceConflicts}
          hint={s.openSourceConflicts > 0 ? "לבדיקה במסך מקורות ואימות" : undefined}
          tone={s.openSourceConflicts > 0 ? "warning" : "success"}
        />
        <StatCard
          label="אזורים ללא שיוך למכרז"
          value={s.unassignedContractAreaZones}
          hint={s.unassignedContractAreaZones > 0 ? "סטטוס REQUIRES_REVIEW" : undefined}
          tone={s.unassignedContractAreaZones > 0 ? "warning" : "success"}
        />
      </div>

      <div className="mx-6 mb-6 rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-2 text-sm font-semibold">בגרות נתוני העדיפות ברמת העיר</div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["REQUIRES_REVIEW", "MANUAL_BASELINE", "RULE_BASED", "DATA_INFORMED"] as const).map((mode) => (
            <div key={mode} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  mode === "REQUIRES_REVIEW"
                    ? "bg-danger"
                    : mode === "MANUAL_BASELINE"
                      ? "bg-warning"
                      : mode === "RULE_BASED"
                        ? "bg-accent"
                        : "bg-success"
                }`}
              />
              <span className="text-muted">{DATA_MODE_LABEL[mode]}:</span>
              <span className="font-bold tabular-nums">{s.dataMaturityBreakdown.find((d) => d.dataMode === mode)?.count ?? 0}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Override פעילים ידנית:</span>
            <span className="font-bold tabular-nums">{s.activeManualOverridesCount}</span>
          </div>
        </div>
      </div>

      {(s.dirtyHighPriorityStreets.length > 0 || s.resourcesLowOnWater.length > 0) && (
        <div className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-2">
          {s.dirtyHighPriorityStreets.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="mb-3 text-sm font-semibold text-danger">מקטעים מלוכלכים בעדיפות גבוהה</div>
              <div className="space-y-1.5">
                {s.dirtyHighPriorityStreets.map((d) => (
                  <div key={d.streetId} className="flex items-center justify-between text-sm">
                    <span>{d.streetName}</span>
                    <span className="font-bold tabular-nums text-danger">{d.dirtScore !== null ? Math.round(d.dirtScore) : "—"}</span>
                  </div>
                ))}
              </div>
              <a href="/map" className="mt-2 inline-block text-xs text-accent hover:underline">הצגה במפה ←</a>
            </div>
          )}
          {s.resourcesLowOnWater.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div className="mb-3 text-sm font-semibold text-warning">כלים שצפויים להזדקק למילוי מים (תוכנית היום)</div>
              <div className="space-y-1.5">
                {s.resourcesLowOnWater.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{r.resourceLabel}</span>
                    <span className="tabular-nums text-muted">{r.projectedWaterAfterL?.toFixed(0)} ליטר</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-2">
        <div className="rounded-xl border border-panel-border bg-panel p-4">
          <div className="mb-3 text-sm font-semibold">עומס לפי כלי (תוכנית היום)</div>
          {s.loadByResource.length === 0 && <div className="text-sm text-muted">אין תוכנית עבודה להיום עדיין.</div>}
          <div className="space-y-2">
            {s.loadByResource.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span>{r.label}</span>
                <span className="text-muted">{r.taskCount} משימות · {Math.round(r.minutes)} דק׳</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-panel-border bg-panel p-4">
          <div className="mb-3 text-sm font-semibold">עומס לפי אזור (תוכנית היום)</div>
          {s.loadByZone.length === 0 && <div className="text-sm text-muted">טרם הוגדרו אזורים.</div>}
          <div className="space-y-2">
            {s.loadByZone.map((z) => (
              <div key={z.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} />
                  {z.name}
                </span>
                <span className="text-muted">{z.taskCount} משימות</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="rounded-xl border border-panel-border bg-panel p-4">
          <div className="mb-3 text-sm font-semibold">רחובות לפי עדיפות</div>
          <div className="flex gap-6 text-sm">
            {s.streetsByPriority.map((row) => (
              <div key={row.priority} className="flex items-center gap-2">
                <span className="text-muted">{PRIORITY_LABEL[row.priority] ?? row.priority}</span>
                <span className="font-bold tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {s.unplannedTodayCount > 0 && (
        <div className="mx-6 mb-6 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="mb-2 text-sm font-semibold text-danger">
            {s.unplannedTodayCount} רחובות חייבי ניקיון היום אך לא שובצו בתוכנית
          </div>
          <div className="flex flex-wrap gap-2">
            {s.unplannedToday.map((st) => (
              <span key={st.id} className="rounded-full border border-danger/30 px-2 py-0.5 text-xs">
                {st.name}
              </span>
            ))}
          </div>
          <Link href="/plans" className="mt-2 inline-block text-xs text-accent hover:underline">
            עבור לתוכניות עבודה ←
          </Link>
        </div>
      )}

      {s.totalZones === 0 && (
        <div className="mx-6 mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          טרם הוגדרו אזורי עבודה. יש לעבור למסך <strong>אזורים</strong> וליצור את {org.targetZoneCount} אזורי הניקיון,
          ולאחר מכן לשייך אליהם את הרחובות שיובאו.
        </div>
      )}
    </div>
  );
}
