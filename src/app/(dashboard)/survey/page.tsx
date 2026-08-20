import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { getSurveyProgress } from "@/server/cleaning/surveyService";
import { SurveyClient } from "./survey-client";

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const [progress, streets, resourceTypes, water, waste] = await Promise.all([
    getSurveyProgress(),
    prisma.street.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        zoneId: true,
        zone: { select: { name: true } },
        surveys: { orderBy: { createdAt: "desc" }, take: 1, select: { progress: true, createdAt: true } },
      },
    }),
    prisma.resourceType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.waterRefillPoint.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.wasteDisposalPoint.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="סקר שטח ראשוני"
        subtitle={`${progress.surveyed}/${progress.totalStreets} מקטעים מולאו (${progress.percentComplete}%) · ${progress.missing} חסרים · ${progress.needsRecheck} דורשים בדיקה חוזרת`}
      />
      <SurveyClient
        progress={progress}
        streets={streets.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          zoneName: s.zone?.name ?? null,
          lastSurveyProgress: s.surveys[0]?.progress ?? null,
          lastSurveyAt: s.surveys[0]?.createdAt.toISOString() ?? null,
        }))}
        resourceTypes={resourceTypes}
        waterPoints={water}
        wastePoints={waste}
      />
    </div>
  );
}
