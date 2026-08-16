import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("רחובות", { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "שם", key: "name", width: 20 },
    { header: "סוג", key: "type", width: 14 },
    { header: "אזור", key: "zone", width: 18 },
    { header: "עדיפות", key: "priority", width: 10 },
    { header: "תדירות", key: "frequency", width: 14 },
    { header: "אורך_מטר", key: "lengthM", width: 12 },
    { header: "זמן_ניקיון_דקות", key: "cleanMinutes", width: 16 },
    { header: "הערות", key: "notes", width: 24 },
    { header: "קו_רוחב_התחלה", key: "startLat", width: 14 },
    { header: "קו_אורך_התחלה", key: "startLon", width: 14 },
    { header: "קו_רוחב_סיום", key: "endLat", width: 14 },
    { header: "קו_אורך_סיום", key: "endLon", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    name: "רחוב לדוגמה",
    type: "רחוב",
    zone: "",
    priority: "רגיל",
    frequency: "פעם בשבוע",
    lengthM: 150,
    cleanMinutes: 15,
    notes: "",
    startLat: "",
    startLon: "",
    endLat: "",
    endLon: "",
  });
  sheet.addRow({});
  sheet.addRow({ name: "סוג: רחוב / שביל / מדרחוב / שטח ציבורי / אחר · עדיפות: קריטי / גבוה / רגיל / נמוך · תדירות: כל יום / פעם בשבוע / לפי צורך" });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="streets-import-template.xlsx"`,
    },
  });
}
