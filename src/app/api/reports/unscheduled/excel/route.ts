import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { getDashboardStats } from "@/server/dashboard";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return new Response("unauthorized", { status: 401 });
  }

  const stats = await getDashboardStats();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("רחובות שלא שובצו", { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "רחוב", key: "name", width: 26 },
    { header: "עדיפות", key: "priority", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const s of stats.unplannedTodayFull) {
    sheet.addRow({ name: s.name, priority: PRIORITY_LABEL[s.priority] ?? s.priority });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="unscheduled-${formatDateOnly(todayDateOnly())}.xlsx"`,
    },
  });
}
