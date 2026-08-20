import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { waterConsumptionReport } from "@/server/reports/queries-water";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function WaterConsumptionPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; groupBy?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const params = await searchParams;
  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -6);
  const to = params.to ? parseDateOnly(params.to) : today;
  const groupBy = (params.groupBy as "resource" | "zone" | "infrastructure") || "resource";

  const result = await waterConsumptionReport(from, to, groupBy);

  return (
    <ReportPrintLayout
      title="דוח צריכת מים (מתוכנן)"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)} · מקור: תוכניות עבודה שפורסמו — אחוז המבוסס-מדידה מציין כמה מהנתונים נלמדו מביצוע בפועל`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
