import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportPrintLayout } from "../../report-print-layout";
import { kmPlannedVsActualReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function KmPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; groupBy?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const params = await searchParams;
  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -6);
  const to = params.to ? parseDateOnly(params.to) : today;
  const groupBy = params.groupBy === "contractor" ? "contractor" : "zone";

  const result = await kmPlannedVsActualReport(from, to, groupBy);

  return (
    <ReportPrintLayout
      title='קילומטרים מתוכננים מול מבוצעים'
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)} · לפי ${groupBy === "zone" ? "אזור" : "קבלן"}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
