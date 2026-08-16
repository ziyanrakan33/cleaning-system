import { prisma } from "@/lib/prisma";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/server/dateUtils";
import { PrintButton } from "../../print-button";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };
const STATUS_LABEL: Record<string, string> = { PENDING: "ממתין", IN_PROGRESS: "בביצוע", DONE: "בוצע", NOT_DONE: "לא בוצע", PROBLEM: "בעיה" };

export default async function DailyPrintPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date ? parseDateOnly(params.date) : todayDateOnly();

  const plan = await prisma.workPlan.findFirst({
    where: { date },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { name: true, priority: true, zone: { select: { name: true } } } },
          resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl p-8 print:p-0">
      <PrintButton />
      <h1 className="mb-1 text-xl font-bold">תוכנית עבודה יומית — {formatDateOnly(date)}</h1>
      <p className="mb-6 text-sm text-muted">
        {plan ? `גרסה ${plan.versionNumber} · ${plan.tasks.length} משימות` : "אין תוכנית עבודה לתאריך זה"}
      </p>

      {plan && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="p-2 text-start">כלי</th>
              <th className="p-2 text-start">#</th>
              <th className="p-2 text-start">רחוב</th>
              <th className="p-2 text-start">אזור</th>
              <th className="p-2 text-start">עדיפות</th>
              <th className="p-2 text-start">התחלה</th>
              <th className="p-2 text-start">סיום</th>
              <th className="p-2 text-start">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {plan.tasks.map((t) => (
              <tr key={t.id} className="border-b border-panel-border">
                <td className="p-2">{t.resource.resourceType.name} {t.resource.identifier}</td>
                <td className="p-2">{t.sequenceOrder + 1}</td>
                <td className="p-2">{t.street.name}</td>
                <td className="p-2">{t.street.zone?.name ?? "—"}</td>
                <td className="p-2">{PRIORITY_LABEL[t.street.priority] ?? t.street.priority}</td>
                <td className="p-2" dir="ltr">{t.plannedStart.toTimeString().slice(0, 5)}</td>
                <td className="p-2" dir="ltr">{t.plannedEnd.toTimeString().slice(0, 5)}</td>
                <td className="p-2">{STATUS_LABEL[t.status] ?? t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
