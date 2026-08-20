import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { byWorkerReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ByWorkerPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  if (!params.userId) {
    return <div className="p-8 text-sm text-danger">חסר פרמטר userId</div>;
  }

  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -6);
  const to = params.to ? parseDateOnly(params.to) : today;

  const [worker, result] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.userId }, select: { name: true } }),
    byWorkerReport(params.userId, from, to),
  ]);

  return (
    <ReportPrintLayout
      title="דוח לפי מנהל עבודה / נהג"
      subtitle={`${worker?.name ?? params.userId} · ${formatDateOnly(from)} עד ${formatDateOnly(to)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
