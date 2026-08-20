import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getReport } from "@/server/reports/registry";
import { buildCsv, buildExcelBuffer, csvResponse, excelResponse } from "@/server/reports/export";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";
import { resolveContractAreaScope } from "@/server/scope";

/**
 * One dispatcher for every report's Excel/CSV download, e.g.
 *   /api/reports/export?type=weekly-zone&format=xlsx&start=2026-08-17
 *
 * Kept as a single route rather than a directory per report (the pattern the
 * two original reports used) because the report count grew to 15 — the
 * registry in src/server/reports/registry.ts is the thing that actually
 * varies per report, not the HTTP plumbing around it.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "reports.view")) {
    return new Response("unauthorized", { status: 401 });
  }
  // §SEC-02: none of the report queries in the registry are scoped to a
  // single contract area yet (most are intentionally city-wide, e.g. the
  // contractor-comparison report). Until each report is reviewed and given
  // real per-contract-area scoping, a contractor-side account must be denied
  // here rather than silently see every contractor's data — fail closed, not
  // open. Tracked as a follow-up in docs/PRE_DATA_COMPLETION_PLAN.md.
  if (resolveContractAreaScope(session.user).restricted) {
    return new Response("דוחות מרוכזים אינם זמינים עדיין לחשבונות קבלן — בבדיקה", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (!type) return new Response("missing type", { status: 400 });

  const entry = getReport(type);
  if (!entry) return new Response("unknown report type", { status: 404 });

  const params = entry.parseParams(searchParams);
  if (!params) return new Response("missing or invalid parameters", { status: 400 });

  const showMoney = can(session.user.role, "finance.view");
  const result = await entry.run(params, { showMoney });

  const filename = `${type}-${formatDateOnly(todayDateOnly())}`;
  if (format === "csv") {
    return csvResponse(buildCsv(result.columns, result.rows), filename);
  }
  const buffer = await buildExcelBuffer(entry.sheetName, result.columns, result.rows);
  return excelResponse(buffer, filename);
}
