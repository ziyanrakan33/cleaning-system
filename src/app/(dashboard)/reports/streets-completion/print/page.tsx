import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { streetsCompletionReport } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

const RESULT_LABEL: Record<string, string> = { all: "הכל", done: "בוצעו", "not-done": "לא בוצעו" };

export default async function StreetsCompletionPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; zoneId?: string; result?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -6);
  const to = params.to ? parseDateOnly(params.to) : today;
  const resultFilter = (params.result as "all" | "done" | "not-done") ?? "all";

  const result = await streetsCompletionReport(from, to, params.zoneId ?? null, resultFilter);

  return (
    <ReportPrintLayout
      title="רחובות שבוצעו / לא בוצעו"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)} · ${RESULT_LABEL[resultFilter]}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
