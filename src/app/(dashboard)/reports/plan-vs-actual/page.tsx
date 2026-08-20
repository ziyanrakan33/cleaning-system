import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/server/dateUtils";
import { PrintButton } from "../print-button";

const STATUS_LABEL: Record<string, string> = { PENDING: "ממתין", IN_PROGRESS: "בביצוע", DONE: "בוצע", NOT_DONE: "לא בוצע", PROBLEM: "בעיה" };

function fmtTime(d: Date | null) {
  return d ? d.toTimeString().slice(0, 5) : "—";
}

function diffMinutes(planned: Date, actual: Date | null): number | null {
  if (!actual) return null;
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
}

export default async function PlanVsActualPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date ? parseDateOnly(params.date) : todayDateOnly();

  const plan = await prisma.workPlan.findFirst({
    where: { date },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { name: true } },
          resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="תוכנית מול ביצוע" subtitle={`תאריך: ${formatDateOnly(date)}`} />
      <div className="p-6">
        <PrintButton />
        <form className="no-print mb-4 flex items-center gap-2" method="get">
          <input type="date" name="date" defaultValue={formatDateOnly(date)} dir="ltr" className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none" />
          <button type="submit" className="rounded-md border border-panel-border px-3 py-1.5 text-sm">הצג</button>
        </form>

        {!plan && <div className="text-sm text-muted">אין תוכנית עבודה לתאריך זה.</div>}

        {plan && (() => {
          const completedDiffs = plan.tasks
            .map((t) => diffMinutes(t.plannedEnd, t.actualEnd))
            .filter((d): d is number => d !== null);
          const avgDeviation = completedDiffs.length > 0 ? Math.round(completedDiffs.reduce((a, b) => a + b, 0) / completedDiffs.length) : null;
          const onTimeCount = completedDiffs.filter((d) => Math.abs(d) <= 15).length;
          const onTimePct = completedDiffs.length > 0 ? Math.round((onTimeCount / completedDiffs.length) * 100) : null;
          const statusCounts = plan.tasks.reduce<Record<string, number>>((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-panel-border bg-panel p-3">
                <div className="text-xs text-muted">סטייה ממוצעת (סיום)</div>
                <div className="text-xl font-bold tabular-nums">{avgDeviation !== null ? `${avgDeviation > 0 ? "+" : ""}${avgDeviation} דק'` : "—"}</div>
              </div>
              <div className="rounded-xl border border-panel-border bg-panel p-3">
                <div className="text-xs text-muted">אחוז בזמן (±15 דק&apos;)</div>
                <div className="text-xl font-bold tabular-nums">{onTimePct !== null ? `${onTimePct}%` : "—"}</div>
              </div>
              <div className="rounded-xl border border-panel-border bg-panel p-3">
                <div className="text-xs text-muted">בוצע / לא בוצע / בעיה</div>
                <div className="text-xl font-bold tabular-nums">
                  {statusCounts.DONE ?? 0} / {statusCounts.NOT_DONE ?? 0} / {statusCounts.PROBLEM ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-panel-border bg-panel p-3">
                <div className="text-xs text-muted">סה״כ משימות</div>
                <div className="text-xl font-bold tabular-nums">{plan.tasks.length}</div>
              </div>
            </div>
          );
        })()}

        {plan && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="p-2 text-start">כלי</th>
                <th className="p-2 text-start">רחוב</th>
                <th className="p-2 text-start">מתוכנן</th>
                <th className="p-2 text-start">בפועל</th>
                <th className="p-2 text-start">סטייה (דק&apos;)</th>
                <th className="p-2 text-start">סטטוס</th>
                <th className="p-2 text-start">הערת עובד</th>
              </tr>
            </thead>
            <tbody>
              {plan.tasks.map((t) => {
                const startDiff = diffMinutes(t.plannedStart, t.actualStart);
                const endDiff = diffMinutes(t.plannedEnd, t.actualEnd);
                return (
                  <tr key={t.id} className="border-b border-panel-border">
                    <td className="p-2">{t.resource.resourceType.name} {t.resource.identifier}</td>
                    <td className="p-2">{t.street.name}</td>
                    <td className="p-2" dir="ltr">{fmtTime(t.plannedStart)}–{fmtTime(t.plannedEnd)}</td>
                    <td className="p-2" dir="ltr">{fmtTime(t.actualStart)}–{fmtTime(t.actualEnd)}</td>
                    <td className="p-2" dir="ltr">
                      {endDiff !== null ? (
                        <span className={endDiff > 15 ? "text-danger" : endDiff < -15 ? "text-success" : ""}>
                          {endDiff > 0 ? "+" : ""}{endDiff}
                        </span>
                      ) : startDiff !== null ? (
                        <span>{startDiff > 0 ? "+" : ""}{startDiff}</span>
                      ) : "—"}
                    </td>
                    <td className="p-2">{STATUS_LABEL[t.status] ?? t.status}</td>
                    <td className="p-2 text-xs text-muted">{t.employeeComment ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
