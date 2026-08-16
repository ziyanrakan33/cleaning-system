import { prisma } from "@/lib/prisma";
import { dayCodeOf } from "@/server/dateUtils";

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

type CleaningFrequency =
  | { type: "DAILY" }
  | { type: "TIMES_PER_WEEK"; timesPerWeek: number }
  | { type: "WEEKLY" }
  | { type: "SPECIFIC_DAYS"; days: string[] }
  | { type: "AS_NEEDED" };

/**
 * A street is "due" if its cleaning frequency calls for cleaning on this date
 * and it hasn't already been cleaned recently enough. AS_NEEDED streets are
 * never auto-scheduled — an exception the manager adds by hand.
 */
export async function getDueStreets(date: Date) {
  const streets = await prisma.street.findMany({
    where: { active: true },
    include: { allowedResourceTypes: { select: { id: true } } },
  });

  const lastCleanedRows = await prisma.streetCleaningLog.groupBy({
    by: ["streetId"],
    where: { completed: true, date: { lt: date } },
    _max: { date: true },
  });
  const lastCleanedMap = new Map(lastCleanedRows.map((r) => [r.streetId, r._max.date]));

  const dayCode = dayCodeOf(date);

  const due = streets.filter((s) => {
    const freq = s.cleaningFrequency as CleaningFrequency;
    const last = lastCleanedMap.get(s.id);
    const daysSince = last ? Math.floor((date.getTime() - last.getTime()) / 86_400_000) : Infinity;

    switch (freq.type) {
      case "DAILY":
        return true;
      case "WEEKLY":
        return daysSince >= 7;
      case "TIMES_PER_WEEK": {
        const interval = Math.max(1, Math.floor(7 / Math.max(1, freq.timesPerWeek ?? 1)));
        return daysSince >= interval;
      }
      case "SPECIFIC_DAYS":
        return (freq.days ?? []).includes(dayCode);
      case "AS_NEEDED":
      default:
        return false;
    }
  });

  return due.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export type DueStreet = Awaited<ReturnType<typeof getDueStreets>>[number];
