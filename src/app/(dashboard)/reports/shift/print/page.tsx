import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportPrintLayout } from "../../report-print-layout";
import { shiftReport, SHIFT_TYPE_LABEL } from "@/server/reports/queries-execution";
import { parseDateOnly, formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function ShiftPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftType?: string; date?: string }>;
}) {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  const params = await searchParams;
  const shiftType = params.shiftType ?? "MORNING";
  const date = params.date ? parseDateOnly(params.date) : todayDateOnly();

  const result = await shiftReport(shiftType, date);

  return (
    <ReportPrintLayout
      title={`דוח ${SHIFT_TYPE_LABEL[shiftType] ?? shiftType}`}
      subtitle={formatDateOnly(date)}
      columns={result.columns}
      rows={result.rows}
    />
  );
}
