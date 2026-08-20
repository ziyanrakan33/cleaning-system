import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveContractAreaScope } from "@/server/scope";
import { ReportPrintLayout } from "../../report-print-layout";
import { sourceConflictsReport } from "@/server/reports/queries-sources";

export default async function SourceConflictsPrintPage() {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");
  if (resolveContractAreaScope({ role: session?.user?.role ?? "", contractAreaId: session?.user?.contractAreaId }).restricted) redirect("/reports");

  const result = await sourceConflictsReport();

  return (
    <ReportPrintLayout
      title="דוח סתירות בנתוני המקור"
      subtitle="ראו גם /sources — שם ניתן להכריע בסתירות, לא רק לצפות בהן"
      columns={result.columns}
      rows={result.rows}
      emptyMessage="לא נמצאו סתירות בין המקורות"
    />
  );
}
