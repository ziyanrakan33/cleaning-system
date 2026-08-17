import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ComingSoon } from "@/components/coming-soon";

/**
 * The tender requires reporting GPS stops and route deviations, but no
 * GPS/Ituran integration has been connected — TelemetryEvent exists in the
 * schema and is schema-ready, but has zero rows and no live adapter. Showing
 * a report here would mean either an empty table presented as "no
 * deviations" (false reassurance) or fabricated sample data, both of which
 * the project's data-integrity rules forbid. This screen says so plainly
 * instead.
 */
export default async function GpsDeviationsPage() {
  const session = await auth();
  if (!can(session?.user?.role, "reports.view")) redirect("/");

  return (
    <ComingSoon
      title="עצירות וחריגות GPS"
      phase="ממתין לחיבור מערכת איתור"
      description={
        'המכרז מחייב דיווח על עצירות וחריגות מסלול של כלי הרכב, אך המערכת עדיין אינה מחוברת לספק GPS/איתורן. ' +
        'מבנה הנתונים (TelemetryEvent) מוכן בסכימה ומחכה לחיבור בפועל — ראו את שכבת האינטגרציה המתוכננת. ' +
        "עד לחיבור, לא יוצג כאן דוח עם נתוני דמה במקום נתונים אמיתיים."
      }
    />
  );
}
