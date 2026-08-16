/**
 * Date-only values (WorkPlan.date, ResourceAvailability.date,
 * StreetCleaningLog.date — all `@db.Date` in the Prisma schema) must be
 * timezone-safe: `new Date(y, m-1, d)` builds *local* midnight, and on a
 * server whose local zone is ahead of UTC (e.g. Asia/Jerusalem, UTC+3),
 * Postgres ends up storing the *previous* calendar day — confirmed by
 * direct DB inspection during development. Always go through these helpers
 * for date-only fields; never construct them with `new Date(y, m-1, d)` or
 * format them with `.toISOString()` derived from a locally-constructed Date.
 *
 * DateTime fields that represent a real wall-clock instant (plannedStart,
 * actualStart, etc.) are a different case and should keep using local Date
 * construction — see `localDateAtTime` below.
 */

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type DayCode = (typeof DAY_CODES)[number];

/** Parses a "YYYY-MM-DD" string into a UTC-midnight Date safe for `@db.Date` fields. */
export function parseDateOnly(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a `@db.Date` value back to "YYYY-MM-DD" using its UTC calendar components. */
export function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's calendar date (as the server's local clock sees it), safe for `@db.Date` fields. */
export function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Adds N days to a `@db.Date` value, staying UTC-safe. */
export function addDaysToDateOnly(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Day-of-week code for a `@db.Date` value, matching the `cleaning_frequency.days` convention. */
export function dayCodeOf(date: Date): DayCode {
  return DAY_CODES[date.getUTCDay()];
}

/**
 * Builds a real wall-clock DateTime for the given `@db.Date` calendar day at
 * a specific local hour/minute — e.g. "the plan's date at 07:00 local time".
 * Extracts the calendar day from UTC components (so it's correct regardless
 * of server timezone sign) and constructs a *local* Date at that day/time,
 * which is what a DateTime column should hold for a real scheduled event.
 */
export function localDateAtTime(dateOnly: Date, hours: number, minutes: number): Date {
  const d = new Date(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate());
  d.setHours(hours, minutes, 0, 0);
  return d;
}
