import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { pendingVerificationReport } from "@/server/reports/queries-sources";

export default async function PendingVerificationPrintPage() {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const result = await pendingVerificationReport();

  return (
    <ReportPrintLayout
      title="דוח נתונים הממתינים לאימות"
      subtitle="ראו גם /sources לאישור, תיקון או דחייה של כל רשומה"
      columns={result.columns}
      rows={result.rows}
      emptyMessage="כל הנתונים אומתו"
    />
  );
}
