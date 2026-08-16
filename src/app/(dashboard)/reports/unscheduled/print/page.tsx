import { getDashboardStats } from "@/server/dashboard";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";
import { PrintButton } from "../../print-button";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };

export default async function UnscheduledPrintPage() {
  const stats = await getDashboardStats();

  return (
    <div className="mx-auto max-w-3xl p-8 print:p-0">
      <PrintButton />
      <h1 className="mb-1 text-xl font-bold">רחובות שלא שובצו — {formatDateOnly(todayDateOnly())}</h1>
      <p className="mb-6 text-sm text-muted">
        {stats.unplannedTodayCount} מתוך {stats.dueTodayCount} רחובות חייבי ניקיון היום עדיין לא שובצו בתוכנית עבודה
      </p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="p-2 text-start">רחוב</th>
            <th className="p-2 text-start">עדיפות</th>
          </tr>
        </thead>
        <tbody>
          {stats.unplannedTodayFull.map((s) => (
            <tr key={s.id} className="border-b border-panel-border">
              <td className="p-2">{s.name}</td>
              <td className="p-2">{PRIORITY_LABEL[s.priority] ?? s.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
