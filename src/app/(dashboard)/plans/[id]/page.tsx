import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PlanDetail } from "./plan-detail";

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await prisma.workPlan.findUnique({ where: { id }, select: { id: true, date: true, versionNumber: true } });
  if (!plan) notFound();

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title={`תוכנית עבודה — ${plan.date.toISOString().slice(0, 10)}`}
        subtitle={`גרסה ${plan.versionNumber}`}
      />
      <PlanDetail workPlanId={plan.id} />
    </div>
  );
}
