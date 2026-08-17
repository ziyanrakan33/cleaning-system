import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ZoneBoundaryEditor } from "./zone-boundary-editor";

export default async function ZoneBoundaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await prisma.operationalZone.findUnique({ where: { id } });
  if (!zone) notFound();

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title={`גבול אזור: ${zone.name}`}
        subtitle="סמנו נקודות על המפה כדי לצייר את גבול האזור. ניתן לצייר גם על גבי רחובות אמיתיים לצורך דיוק."
      />
      <ZoneBoundaryEditor zoneId={zone.id} zoneName={zone.name} zoneColor={zone.color} />
    </div>
  );
}
