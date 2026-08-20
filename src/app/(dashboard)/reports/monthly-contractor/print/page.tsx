import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { monthlyContractorReport } from "@/server/reports/queries-execution";
import { monthBounds, parseYearMonth } from "@/server/reports/shared";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function MonthlyContractorPrintPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const today = todayDateOnly();
  const monthStr = params.month ?? `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const { year, month1to12 } = parseYearMonth(monthStr);
  const { from, to } = monthBounds(year, month1to12);

  const result = await monthlyContractorReport(from, to, can(session?.user?.role, "finance.view"));

  return (
    <ReportPrintLayout
      title="דוח חודשי לפי קבלן"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
