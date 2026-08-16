import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PlanGenerator } from "./plan-generator";

export default async function PlansPage() {
  const [zoneCount, resourceCount, streetCount] = await Promise.all([
    prisma.zone.count({ where: { active: true } }),
    prisma.resource.count({ where: { active: true, status: "ACTIVE" } }),
    prisma.street.count({ where: { active: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="תוכניות עבודה"
        subtitle="מנוע התזמון: הקצאת רחובות למשאבים לפי עדיפות ותדירות, וסידור מסלול לפי הרשת הכבישים האמיתית"
      />
      <PlanGenerator zoneCount={zoneCount} resourceCount={resourceCount} streetCount={streetCount} />
    </div>
  );
}
