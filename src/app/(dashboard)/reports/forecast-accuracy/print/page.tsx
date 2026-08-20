import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { forecastAccuracyReport } from "@/server/reports/queries-water";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ForecastAccuracyPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -30);
  const to = params.to ? parseDateOnly(params.to) : today;

  const result = await forecastAccuracyReport(from, to);

  return (
    <ReportPrintLayout
      title="דוח דיוק תחזית זמן ניקיון"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)} · מבוסס אך ורק על דיווחי ביצוע בפועל (§8) — שורה לכל דיווח שכולל שעת התחלה וסיום`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
