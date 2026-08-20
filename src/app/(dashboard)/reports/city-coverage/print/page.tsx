import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { cityCoverageReport } from "@/server/reports/queries-quality";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function CityCoveragePrintPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const date = params.date ? parseDateOnly(params.date) : todayDateOnly();
  const result = await cityCoverageReport(date);

  return (
    <ReportPrintLayout
      title="דוח כיסוי עירוני"
      subtitle={`נכון לתאריך ${formatDateOnly(date)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
