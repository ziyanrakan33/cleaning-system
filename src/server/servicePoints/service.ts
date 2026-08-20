/**
 * §4, §5 — water refill and waste disposal points, and the eligibility rules
 * the router uses to pick one.
 *
 * The selection logic lives here rather than in the optimiser so that the
 * "which point would you use, and why" question has one answer, whether it is
 * asked by the planner, by the map popup or by a test.
 *
 * A point is never silently substituted: when the nearest one is out of
 * service the caller gets both the chosen point and the reason the closer one
 * was rejected, which is what §21's scenario ג requires the UI to show.
 */
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { roadNetworkRouting, type LonLat } from "@/server/routing/graph";
import type { ServicePointStatus } from "@/generated/prisma/enums";

export const SERVICE_POINT_STATUS_LABELS: Record<ServicePointStatus, string> = {
  ACTIVE: "פעילה",
  BROKEN: "תקולה",
  TEMPORARILY_CLOSED: "סגורה זמנית",
  REQUIRES_REVIEW: "דורשת אישור",
};

export type OpeningHours = { day?: string; from: string; to: string }[];

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Whether a point is open at a given wall-clock minute on a given day code.
 *
 * No stored hours means "no restriction is known", which is treated as open —
 * the alternative, treating unknown as closed, would make every unsurveyed
 * point unusable and push the planner into pretending there is nowhere to
 * refill.
 */
export function isOpenAt(hours: unknown, dayCode: string, minuteOfDay: number): boolean {
  if (!Array.isArray(hours) || hours.length === 0) return true;
  const windows = hours as OpeningHours;
  const todays = windows.filter((w) => !w.day || w.day === dayCode);
  if (todays.length === 0) return false;
  return todays.some((w) => {
    const from = hhmmToMinutes(w.from);
    const to = hhmmToMinutes(w.to);
    return minuteOfDay >= from && minuteOfDay <= to;
  });
}

export type VehicleConstraints = {
  resourceTypeId: string;
  widthM: number | null;
  heightM: number | null;
};

export type WaterPointCandidate = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: ServicePointStatus;
  distanceM: number;
  travelMinutes: number;
  fillMinutes: number;
  waitMinutes: number;
  /** Travel there + wait + fill. What the route actually pays. */
  totalCostMinutes: number;
  flowLitersPerMin: number | null;
  eligible: boolean;
  /** Populated when `eligible` is false — shown to the manager verbatim. */
  rejectionReason: string | null;
};

const DEFAULT_FILL_MINUTES = 12;
const DEFAULT_WAIT_MINUTES = 0;
const DEFAULT_TRAVEL_SPEED_M_PER_MIN = (20 * 1000) / 60;

export function travelMinutesFor(distanceM: number, speedKmh: number | null): number {
  const mPerMin = speedKmh && speedKmh > 0 ? (speedKmh * 1000) / 60 : DEFAULT_TRAVEL_SPEED_M_PER_MIN;
  return distanceM / mPerMin;
}

export type WaterPointRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: ServicePointStatus;
  availabilityHours: unknown;
  flowLitersPerMin: number | null;
  avgFillMinutes: number | null;
  avgWaitMinutes: number | null;
  maxVehicleWidthM: number | null;
  maxVehicleHeightM: number | null;
  allowedResourceTypes: { id: string }[];
};

export type RankParams = {
  from: LonLat;
  vehicle: VehicleConstraints;
  dayCode: string;
  atMinute: number;
  travelSpeedKmh?: number | null;
};

/**
 * Pure ranking over an already-fetched list of points — no database access.
 * Used by the route simulator, which calls this once per candidate stop and
 * must not issue a query each time.
 *
 * Returns *all* of them, ineligible ones included with their reason, rather
 * than a filtered list — the map and the plan explanation both need to be able
 * to say "the closest point was skipped because it is broken".
 */
export function rankWaterPointsSync(points: WaterPointRow[], params: RankParams): WaterPointCandidate[] {
  return points
    .map((p): WaterPointCandidate => {
      const distanceM = roadNetworkRouting.distanceMeters(params.from, [p.lon, p.lat]);
      const travel = travelMinutesFor(distanceM, params.travelSpeedKmh ?? null);
      const fill = p.avgFillMinutes ?? DEFAULT_FILL_MINUTES;
      const wait = p.avgWaitMinutes ?? DEFAULT_WAIT_MINUTES;

      let rejectionReason: string | null = null;
      if (p.status !== "ACTIVE") {
        rejectionReason = `הנקודה מסומנת כ"${SERVICE_POINT_STATUS_LABELS[p.status]}"`;
      } else if (!isOpenAt(p.availabilityHours, params.dayCode, params.atMinute)) {
        rejectionReason = "מחוץ לשעות הפעילות של הנקודה";
      } else if (
        p.allowedResourceTypes.length > 0 &&
        !p.allowedResourceTypes.some((t) => t.id === params.vehicle.resourceTypeId)
      ) {
        rejectionReason = "סוג הכלי אינו מורשה בנקודה זו";
      } else if (p.maxVehicleWidthM !== null && params.vehicle.widthM !== null && params.vehicle.widthM > p.maxVehicleWidthM) {
        rejectionReason = `רוחב הכלי ${params.vehicle.widthM} מ׳ עולה על המגבלה ${p.maxVehicleWidthM} מ׳`;
      } else if (
        p.maxVehicleHeightM !== null &&
        params.vehicle.heightM !== null &&
        params.vehicle.heightM > p.maxVehicleHeightM
      ) {
        rejectionReason = `גובה הכלי ${params.vehicle.heightM} מ׳ עולה על המגבלה ${p.maxVehicleHeightM} מ׳`;
      }

      return {
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        status: p.status,
        distanceM: Math.round(distanceM),
        travelMinutes: Math.round(travel * 10) / 10,
        fillMinutes: fill,
        waitMinutes: wait,
        totalCostMinutes: Math.round((travel + fill + wait) * 10) / 10,
        flowLitersPerMin: p.flowLitersPerMin,
        eligible: rejectionReason === null,
        rejectionReason,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.totalCostMinutes - b.totalCostMinutes;
    });
}

/** DB-backed convenience wrapper around `rankWaterPointsSync`, for one-off callers (API routes, the map). */
export async function rankWaterPoints(
  params: RankParams & { zoneIds?: string[]; includeDemo?: boolean }
): Promise<WaterPointCandidate[]> {
  const points = await prisma.waterRefillPoint.findMany({
    where: {
      active: true,
      ...(params.includeDemo ? {} : { isDemo: false }),
      ...(params.zoneIds && params.zoneIds.length > 0 ? { zoneId: { in: params.zoneIds } } : {}),
    },
    include: { allowedResourceTypes: { select: { id: true } } },
  });
  return rankWaterPointsSync(points, params);
}

export type WastePointCandidate = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: ServicePointStatus;
  distanceM: number;
  travelMinutes: number;
  dumpMinutes: number;
  waitMinutes: number;
  totalCostMinutes: number;
  eligible: boolean;
  rejectionReason: string | null;
};

const DEFAULT_DUMP_MINUTES = 15;

export type WastePointRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: ServicePointStatus;
  availabilityHours: unknown;
  avgDumpMinutes: number | null;
  avgWaitMinutes: number | null;
  maxVehicleWidthM: number | null;
  maxVehicleHeightM: number | null;
  allowedResourceTypes: { id: string }[];
};

export function rankWastePointsSync(points: WastePointRow[], params: RankParams): WastePointCandidate[] {
  return points
    .map((p): WastePointCandidate => {
      const distanceM = roadNetworkRouting.distanceMeters(params.from, [p.lon, p.lat]);
      const travel = travelMinutesFor(distanceM, params.travelSpeedKmh ?? null);
      const dump = p.avgDumpMinutes ?? DEFAULT_DUMP_MINUTES;
      const wait = p.avgWaitMinutes ?? DEFAULT_WAIT_MINUTES;

      let rejectionReason: string | null = null;
      if (p.status !== "ACTIVE") {
        rejectionReason = `הנקודה מסומנת כ"${SERVICE_POINT_STATUS_LABELS[p.status]}"`;
      } else if (!isOpenAt(p.availabilityHours, params.dayCode, params.atMinute)) {
        rejectionReason = "מחוץ לשעות הפעילות של הנקודה";
      } else if (
        p.allowedResourceTypes.length > 0 &&
        !p.allowedResourceTypes.some((t) => t.id === params.vehicle.resourceTypeId)
      ) {
        rejectionReason = "סוג הכלי אינו מורשה בנקודה זו";
      } else if (p.maxVehicleWidthM !== null && params.vehicle.widthM !== null && params.vehicle.widthM > p.maxVehicleWidthM) {
        rejectionReason = `רוחב הכלי ${params.vehicle.widthM} מ׳ עולה על המגבלה ${p.maxVehicleWidthM} מ׳`;
      }

      return {
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        status: p.status,
        distanceM: Math.round(distanceM),
        travelMinutes: Math.round(travel * 10) / 10,
        dumpMinutes: dump,
        waitMinutes: wait,
        totalCostMinutes: Math.round((travel + dump + wait) * 10) / 10,
        eligible: rejectionReason === null,
        rejectionReason,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.totalCostMinutes - b.totalCostMinutes;
    });
}

/** DB-backed convenience wrapper around `rankWastePointsSync`. */
export async function rankWastePoints(
  params: RankParams & { zoneIds?: string[]; includeDemo?: boolean }
): Promise<WastePointCandidate[]> {
  const points = await prisma.wasteDisposalPoint.findMany({
    where: {
      active: true,
      ...(params.includeDemo ? {} : { isDemo: false }),
      ...(params.zoneIds && params.zoneIds.length > 0 ? { zoneId: { in: params.zoneIds } } : {}),
    },
    include: { allowedResourceTypes: { select: { id: true } } },
  });
  return rankWastePointsSync(points, params);
}

// ---------------------------------------------------------------------------
// Fault reporting (§4)
// ---------------------------------------------------------------------------

/**
 * Marks a point out of service. Kept as a distinct operation from a general
 * edit so the audit trail records *who said it was broken and when* — the
 * planner's route explanations quote this.
 */
export async function reportServicePointFault(params: {
  kind: "WATER" | "WASTE";
  id: string;
  status: ServicePointStatus;
  note: string;
  userId: string;
}) {
  const { kind, id, status, note, userId } = params;

  if (kind === "WATER") {
    const before = await prisma.waterRefillPoint.findUnique({ where: { id } });
    if (!before) throw new Error("Water point not found");
    await prisma.waterRefillPoint.update({
      where: { id },
      data: {
        status,
        notes: note ? `${before.notes ? `${before.notes}\n` : ""}${new Date().toLocaleDateString("he-IL")}: ${note}` : before.notes,
        lastCheckedAt: new Date(),
      },
    });
    await audit({
      entityType: "WaterRefillPoint",
      entityId: id,
      action: "SERVICE_POINT_STATUS_CHANGED",
      userId,
      before: { status: before.status },
      after: { status },
      description: `נקודת מים "${before.name}" סומנה כ"${SERVICE_POINT_STATUS_LABELS[status]}"${note ? ` — ${note}` : ""}`,
    });
    return;
  }

  const before = await prisma.wasteDisposalPoint.findUnique({ where: { id } });
  if (!before) throw new Error("Waste point not found");
  await prisma.wasteDisposalPoint.update({
    where: { id },
    data: {
      status,
      notes: note ? `${before.notes ? `${before.notes}\n` : ""}${new Date().toLocaleDateString("he-IL")}: ${note}` : before.notes,
    },
  });
  await audit({
    entityType: "WasteDisposalPoint",
    entityId: id,
    action: "SERVICE_POINT_STATUS_CHANGED",
    userId,
    before: { status: before.status },
    after: { status },
    description: `נקודת פריקה "${before.name}" סומנה כ"${SERVICE_POINT_STATUS_LABELS[status]}"${note ? ` — ${note}` : ""}`,
  });
}
