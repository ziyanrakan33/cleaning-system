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

        {plan && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="p-2 text-start">כלי</th>
                <th className="p-2 text-start">רחוב</th>
                <th className="p-2 text-start">מתוכנן</th>
                <th className="p-2 text-start">בפועל</th>
                <th className="p-2 text-start">סטייה (דק')</th>
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
