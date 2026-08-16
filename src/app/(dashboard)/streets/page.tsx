import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StreetsExplorer } from "./streets-explorer";

const TYPE_LABELS: Record<string, string> = {
  STREET: "רחוב",
  PATH: "שביל",
  PEDESTRIAN_MALL: "מדרחוב",
  PUBLIC_AREA: "שטח ציבורי",
  OTHER: "אחר",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "קריטי",
  HIGH: "גבוה",
  NORMAL: "רגיל",
  LOW: "נמוך",
};

export default async function StreetsPage() {
  const [streets, zones] = await Promise.all([
    prisma.street.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { zone: { select: { id: true, name: true, color: true } } },
    }),
    prisma.zone.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = streets.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    typeLabel: TYPE_LABELS[s.type] ?? s.type,
    zoneId: s.zoneId,
    zoneName: s.zone?.name ?? null,
    lengthM: s.lengthM,
    priority: s.priority,
    priorityLabel: PRIORITY_LABELS[s.priority] ?? s.priority,
    frequency: s.cleaningFrequency as { type: string; timesPerWeek?: number; days?: string[] },
    source: s.source,
  }));

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="רחובות ושבילים"
        subtitle={`${streets.length} רחובות ושבילים פעילים · נתונים אמיתיים מ-OpenStreetMap`}
      />
      <StreetsExplorer rows={rows} zones={zones.map((z) => ({ id: z.id, name: z.name, color: z.color }))} />
    </div>
  );
}
