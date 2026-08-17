import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PlanGenerator } from "./plan-generator";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const [zoneCount, resourceCount, streetCount] = await Promise.all([
    prisma.operationalZone.count({ where: { active: true } }),
    prisma.resource.count({ where: { active: true, status: "ACTIVE" } }),
    prisma.street.count({ where: { active: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="תוכניות עבודה"
        subtitle="מנוע התזמון: הקצאת רחובות למשאבים לפי עדיפות ותדירות, וסידור מסלול לפי הרשת הכבישים האמיתית"
      />
      <PlanGenerator
        zoneCount={zoneCount}
        resourceCount={resourceCount}
        streetCount={streetCount}
        initialDate={params.date}
      />
    </div>
  );
}
