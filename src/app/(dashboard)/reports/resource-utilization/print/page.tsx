import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportPrintLayout } from "../../report-print-layout";
import { resourceUtilizationReport } from "@/server/reports/queries-quality";
import { monthBounds, parseYearMonth } from "@/server/reports/shared";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ResourceUtilizationPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; contractAreaId?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const params = await searchParams;
  const today = todayDateOnly();
  const monthStr = params.month ?? `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const { year, month1to12 } = parseYearMonth(monthStr);
  const { from, to } = monthBounds(year, month1to12);

  const result = await resourceUtilizationReport(from, to, params.contractAreaId ?? null);

  return (
    <ReportPrintLayout
      title="דוח ניצול משאבים מול ההסכם"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)} · חריגה מסומנת ב"כן" בעמודה האחרונה`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
