import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { zoneVehiclesReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ZoneVehiclesPrintPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const date = params.date ? parseDateOnly(params.date) : todayDateOnly();
  const result = await zoneVehiclesReport(date);

  return (
    <ReportPrintLayout title="כלי רכב שעבדו בכל אזור" subtitle={formatDateOnly(date)} columns={result.columns} rows={result.rows} />
  );
}
