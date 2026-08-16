import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const [totalStreets, unassignedZoneStreets, totalZones, totalResources, activeResources, brokenResources] =
    await Promise.all([
      prisma.street.count({ where: { active: true } }),
      prisma.street.count({ where: { active: true, zoneId: null } }),
      prisma.zone.count({ where: { active: true } }),
      prisma.resource.count({ where: { active: true } }),
      prisma.resource.count({ where: { active: true, status: "ACTIVE" } }),
      prisma.resource.count({ where: { active: true, status: "BROKEN" } }),
    ]);

  const streetsByPriority = await prisma.street.groupBy({
    by: ["priority"],
    where: { active: true },
    _count: true,
  });

  return (
    <div>
      <PageHeader title="בקרה" subtitle="תמונת מצב כללית — כפר סבא" />
      <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="רחובות ושבילים" value={totalStreets} />
        <StatCard label="ללא שיוך לאזור" value={unassignedZoneStreets} hint={unassignedZoneStreets > 0 ? "דורש חלוקה לאזורים" : "כל הרחובות משויכים"} />
        <StatCard label="אזורים" value={totalZones} hint="מתוך 10 מתוכננים" />
        <StatCard label="משאבים" value={totalResources} />
        <StatCard label="משאבים פעילים" value={activeResources} />
        <StatCard label="משאבים תקולים" value={brokenResources} />
      </div>

      <div className="px-6 pb-6">
        <div className="rounded-xl border border-panel-border bg-panel p-4">
          <div className="mb-3 text-sm font-semibold">רחובות לפי עדיפות</div>
          <div className="flex gap-6 text-sm">
            {streetsByPriority.map((row) => (
              <div key={row.priority} className="flex items-center gap-2">
                <span className="text-muted">{row.priority}</span>
                <span className="font-bold tabular-nums">{row._count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {unassignedZoneStreets > 0 && totalZones === 0 && (
        <div className="mx-6 mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          טרם הוגדרו אזורי עבודה. יש לעבור למסך <strong>אזורים</strong> וליצור את 10 אזורי הניקיון,
          ולאחר מכן לשייך אליהם את הרחובות שיובאו.
        </div>
      )}
    </div>
  );
}
