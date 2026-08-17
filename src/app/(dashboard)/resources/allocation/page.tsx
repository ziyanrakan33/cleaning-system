import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { computeAllocationRecommendation } from "@/server/resources/allocationEngine";
import { AllocationManager } from "./allocation-manager";

export const dynamic = "force-dynamic";

export default async function AllocationPage() {
  const session = await auth();
  if (!can(session?.user?.role, "resources.edit")) redirect("/resources");

  const canApply = can(session!.user.role, "resources.transfer");
  const areas = await computeAllocationRecommendation();

  const zonesWithoutAnyBoundary = areas.reduce((s, a) => s + a.zonesWithoutBoundary, 0);
  const totalZones = areas.reduce((s, a) => s + (a.resourceTypes[0]?.zones.length ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="המלצת חלוקת משאבים"
        subtitle={
          zonesWithoutAnyBoundary > 0
            ? `${zonesWithoutAnyBoundary} מתוך ${totalZones || 10} אזורים ללא גבול מוגדר — עבורם לא ניתן לחשב המלצה`
            : "חלוקה מוצעת של כלי הרכב והעובדים בין האזורים, לפי אורך תשתית, תדירות ועדיפות"
        }
      />
      <AllocationManager initialAreas={areas} canApply={canApply} />
    </div>
  );
}
