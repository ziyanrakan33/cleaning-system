import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { weeklyZoneReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";
import { startOfWeek } from "@/server/reports/shared";

export default async function WeeklyZonePrintPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const start = params.start ? parseDateOnly(params.start) : startOfWeek(todayDateOnly());
  const end = addDaysToDateOnly(start, 6);
  const result = await weeklyZoneReport(start, end);

  return (
    <ReportPrintLayout
      title="דוח שבועי לפי אזור"
      subtitle={`${formatDateOnly(start)} עד ${formatDateOnly(end)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
