import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportPrintLayout } from "../../report-print-layout";
import { defectsReport } from "@/server/reports/queries-quality";
import { parseDateOnly, formatDateOnly, addDaysToDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function DefectsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; zoneId?: string; contractAreaId?: string; status?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const params = await searchParams;
  const today = todayDateOnly();
  const from = params.from ? parseDateOnly(params.from) : addDaysToDateOnly(today, -30);
  const to = params.to ? parseDateOnly(params.to) : today;

  const result = await defectsReport({
    from,
    to,
    zoneId: params.zoneId ?? null,
    contractAreaId: params.contractAreaId ?? null,
    status: params.status ?? null,
    showMoney: can(session?.user?.role, "finance.view"),
  });

  return (
    <ReportPrintLayout
      title="דוח ליקויים פתוחים וסגורים"
      subtitle={`${formatDateOnly(from)} עד ${formatDateOnly(to)}`}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
