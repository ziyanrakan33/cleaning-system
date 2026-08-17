import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { getDefectDetail } from "@/server/defects/getDefectDetail";
import { DefectDetail } from "./defect-detail";

export const dynamic = "force-dynamic";

export default async function DefectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!can(session?.user?.role, "defects.view")) redirect("/");

  const { id } = await params;
  const initial = await getDefectDetail(id, session!.user.role);
  if (!initial) notFound();

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="ליקוי" subtitle="מעקב, הוכחת ביצוע, קיזוז וערעור" />
      <DefectDetail defectId={id} initial={initial} />
    </div>
  );
}
