import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { parseDateOnly, formatDateOnly } from "@/server/dateUtils";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };
const STATUS_LABEL: Record<string, string> = { PENDING: "ממתין", IN_PROGRESS: "בביצוע", DONE: "בוצע", NOT_DONE: "לא בוצע", PROBLEM: "בעיה" };

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "reports.view")) {
    return new Response("unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  if (!dateStr) return new Response("missing date", { status: 400 });
  const date = parseDateOnly(dateStr);

  const plan = await prisma.workPlan.findFirst({
    where: { date },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        orderBy: [{ resourceId: "asc" }, { sequenceOrder: "asc" }],
        include: {
          street: { select: { name: true, priority: true, zone: { select: { name: true } } } },
          resource: { select: { identifier: true, resourceType: { select: { name: true } } } },
        },
      },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`תוכנית ${formatDateOnly(date)}`, { views: [{ rightToLeft: true }] });

  sheet.columns = [
    { header: "כלי", key: "resource", width: 22 },
    { header: "#", key: "seq", width: 6 },
    { header: "רחוב", key: "street", width: 24 },
    { header: "אזור", key: "zone", width: 18 },
    { header: "עדיפות", key: "priority", width: 10 },
    { header: "התחלה", key: "start", width: 10 },
    { header: "סיום", key: "end", width: 10 },
    { header: "מרחק (מ')", key: "dist", width: 10 },
    { header: "סטטוס", key: "status", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const t of plan?.tasks ?? []) {
    sheet.addRow({
      resource: `${t.resource.resourceType.name} ${t.resource.identifier}`,
      seq: t.sequenceOrder + 1,
      street: t.street.name,
      zone: t.street.zone?.name ?? "ללא אזור",
      priority: PRIORITY_LABEL[t.street.priority] ?? t.street.priority,
      start: t.plannedStart.toTimeString().slice(0, 5),
      end: t.plannedEnd.toTimeString().slice(0, 5),
      dist: t.distanceM ? Math.round(t.distanceM) : 0,
      status: STATUS_LABEL[t.status] ?? t.status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="daily-plan-${formatDateOnly(date)}.xlsx"`,
    },
  });
}
