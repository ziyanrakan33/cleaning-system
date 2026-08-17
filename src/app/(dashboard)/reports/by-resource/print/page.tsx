import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportPrintLayout } from "../../report-print-layout";
import { byResourceReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ByResourcePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceId?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const params = await searchParams;
  if (!params.resourceId) {
    return <div className="p-8 text-sm text-danger">חסר פרמטר resourceId</div>;
  }

  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -6);
  const to = params.to ? parseDateOnly(params.to) : today;

  const [resource, result] = await Promise.all([
    prisma.resource.findUnique({ where: { id: params.resourceId }, select: { identifier: true, resourceType: { select: { name: true } } } }),
    byResourceReport(params.resourceId, from, to),
  ]);

  return (
    <ReportPrintLayout
      title="דוח לפי כלי רכב / מספר רישוי"
      subtitle={`${resource ? `${resource.resourceType.name} ${resource.identifier}` : params.resourceId} · ${formatDateOnly(from)} עד ${formatDateOnly(to)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
