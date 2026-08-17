import { prisma } from "@/lib/prisma";
import { addDaysToDateOnly } from "@/server/dateUtils";

/** All calendar days from `from` to `to` inclusive, as `@db.Date`-safe values. */
export function dateRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  let cursor = from;
  // Cap at a year so a swapped from/to can't spin the loop indefinitely.
  for (let i = 0; i < 366 && cursor.getTime() <= to.getTime(); i++) {
    days.push(cursor);
    cursor = addDaysToDateOnly(cursor, 1);
  }
  return days;
}

/** The Sunday on or before `date` — the week-start convention used by /plans/weekly. */
export function startOfWeek(date: Date): Date {
  const dow = date.getUTCDay();
  return addDaysToDateOnly(date, -dow);
}

/** First and last calendar day of the given month, both `@db.Date`-safe (UTC midnight). */
export function monthBounds(year: number, month1to12: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month1to12 - 1, 1));
  const to = new Date(Date.UTC(year, month1to12, 0));
  return { from, to };
}

/** Parses "YYYY-MM" into { year, month1to12 }; throws on a malformed string. */
export function parseYearMonth(str: string): { year: number; month1to12: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(str);
  if (!m) throw new Error(`חודש לא תקין: ${str} (צפוי YYYY-MM)`);
  const year = Number(m[1]);
  const month1to12 = Number(m[2]);
  if (month1to12 < 1 || month1to12 > 12) throw new Error(`חודש לא תקין: ${str}`);
  return { year, month1to12 };
}

export type PlanTaskRow = {
  date: string;
  workPlanId: string;
  versionNumber: number;
  taskId: string;
  status: string;
  resourceId: string;
  resourceIdentifier: string;
  resourceName: string | null;
  resourceTypeName: string;
  streetId: string;
  streetName: string;
  streetType: string;
  zoneId: string | null;
  zoneName: string | null;
  contractAreaId: string | null;
  plannedStart: Date;
  plannedEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  distanceM: number | null;
  cleanTimeMin: number | null;
  travelTimeMin: number | null;
};

/**
 * Flattens the *latest published version* of the work plan for every day in
 * range into one row-per-task array. Every report below that spans more than
 * a single day is built on this, so "planned" figures always mean "what the
 * current plan says", never a stale draft or a since-superseded version —
 * matching the same latest-version-per-date convention already used by
 * src/server/dashboard.ts and /api/plans/week.
 */
export async function getPlanTaskRowsForRange(from: Date, to: Date): Promise<PlanTaskRow[]> {
  const days = dateRange(from, to);

  const plansPerDay = await Promise.all(
    days.map((date) =>
      prisma.workPlan.findFirst({
        where: { date },
        orderBy: { versionNumber: "desc" },
        include: {
          tasks: {
            include: {
              resource: { select: { id: true, identifier: true, name: true, resourceType: { select: { name: true } } } },
              street: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  zoneId: true,
                  zone: { select: { id: true, name: true, contractAreaId: true } },
                },
              },
            },
          },
        },
      })
    )
  );

  const rows: PlanTaskRow[] = [];
  for (let i = 0; i < days.length; i++) {
    const plan = plansPerDay[i];
    if (!plan) continue;
    const dateStr = days[i].toISOString().slice(0, 10);
    for (const t of plan.tasks) {
      rows.push({
        date: dateStr,
        workPlanId: plan.id,
        versionNumber: plan.versionNumber,
        taskId: t.id,
        status: t.status,
        resourceId: t.resource.id,
        resourceIdentifier: t.resource.identifier,
        resourceName: t.resource.name,
        resourceTypeName: t.resource.resourceType.name,
        streetId: t.street.id,
        streetName: t.street.name,
        streetType: t.street.type,
        zoneId: t.street.zoneId,
        zoneName: t.street.zone?.name ?? null,
        contractAreaId: t.street.zone?.contractAreaId ?? null,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        actualStart: t.actualStart,
        actualEnd: t.actualEnd,
        distanceM: t.distanceM,
        cleanTimeMin: t.cleanTimeMin,
        travelTimeMin: t.travelTimeMin,
      });
    }
  }
  return rows;
}

export const DONE_LIKE = ["DONE"] as const;
export const NOT_DONE_LIKE = ["NOT_DONE", "PROBLEM"] as const;

export const STREET_TYPE_LABEL: Record<string, string> = {
  STREET: "רחוב",
  PATH: "שביל",
  PEDESTRIAN_MALL: "מדרחוב",
  PUBLIC_AREA: "שטח ציבורי",
  OTHER: "אחר",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: "ממתין",
  IN_PROGRESS: "בביצוע",
  DONE: "בוצע",
  NOT_DONE: "לא בוצע",
  PROBLEM: "בעיה",
};

export const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "קריטי",
  HIGH: "גבוה",
  NORMAL: "רגיל",
  LOW: "נמוך",
};

export const SHIFT_TYPE_LABEL: Record<string, string> = {
  MORNING: "משמרת בוקר",
  AFTERNOON: "משמרת צהריים",
  NIGHT: "משמרת לילה",
  REST_DAY: "יום מנוחה",
  FLEXIBLE: "גמיש",
};

type CleaningFrequency =
  | { type: "DAILY" }
  | { type: "TIMES_PER_WEEK"; timesPerWeek: number }
  | { type: "WEEKLY" }
  | { type: "SPECIFIC_DAYS"; days: string[] }
  | { type: "AS_NEEDED" };

export function formatFrequency(freq: unknown): string {
  const f = freq as CleaningFrequency;
  switch (f?.type) {
    case "DAILY":
      return "כל יום";
    case "WEEKLY":
      return "פעם בשבוע";
    case "TIMES_PER_WEEK":
      return `${f.timesPerWeek} פעמים בשבוע`;
    case "SPECIFIC_DAYS":
      return `ימים: ${(f.days ?? []).join(", ")}`;
    case "AS_NEEDED":
      return "לפי צורך";
    default:
      return "לא הוגדר";
  }
}

/**
 * Maximum days allowed between cleanings under this frequency, mirroring the
 * interval math in src/server/scheduling/dueStreets.ts. Returns null for
 * AS_NEEDED and SPECIFIC_DAYS, which aren't interval-based — a coverage report
 * can say "last cleaned N days ago" for them but not "overdue by X".
 */
export function maxDaysAllowed(freq: unknown): number | null {
  const f = freq as CleaningFrequency;
  switch (f?.type) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "TIMES_PER_WEEK":
      return Math.max(1, Math.floor(7 / Math.max(1, f.timesPerWeek ?? 1)));
    default:
      return null;
  }
}
