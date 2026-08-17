import { prisma } from "@/lib/prisma";
import { defaultCleanMinutes } from "@/server/scheduling/estimate";

/**
 * Recommends how to divide the contracted vehicles and workers among the ten
 * operational zones, per §"מנגנון המלצה לחלוקת משאבים" in the tender
 * requirements.
 *
 * The demand signal is real, derived data only: street/path length per zone
 * (from the spatial-join StreetSegments), weighted by how often the street
 * must be cleaned and its priority. Two inputs the tender's own wish-list
 * names — "צפיפות עירונית" (urban density) and "מרכזים מסחריים" (commercial
 * centres) — have no corresponding field anywhere in the data model, so they
 * are deliberately left out rather than approximated from nothing; recent
 * defect and complaint counts are surfaced as supporting context in the
 * explanation instead of folded into the score, so the number a manager sees
 * is never inflated by a feedback loop of the recommendation's own past
 * effects.
 *
 * When no zone in a contract area has any StreetSegment yet (true today: no
 * zone has a drawn boundary), the total workload score is zero and the engine
 * returns `insufficientData: true` with an all-zero suggestion rather than
 * splitting the quota evenly — an even split would misrepresent "we don't
 * know" as "we calculated they're equal".
 */

type CleaningFrequency =
  | { type: "DAILY" }
  | { type: "TIMES_PER_WEEK"; timesPerWeek: number }
  | { type: "WEEKLY" }
  | { type: "SPECIFIC_DAYS"; days: string[] }
  | { type: "AS_NEEDED" };

function weeklyVisitWeight(freq: unknown): number {
  const f = freq as CleaningFrequency;
  switch (f?.type) {
    case "DAILY":
      return 6;
    case "WEEKLY":
      return 1;
    case "TIMES_PER_WEEK":
      return Math.max(1, f.timesPerWeek ?? 1);
    case "SPECIFIC_DAYS":
      return Math.max(1, (f.days ?? []).length);
    case "AS_NEEDED":
    default:
      return 0.5;
  }
}

const PRIORITY_WEIGHT: Record<string, number> = { CRITICAL: 2, HIGH: 1.5, NORMAL: 1, LOW: 0.7 };

type ResourceTypeSuitability = { suitableForRoad: boolean; suitableForSidewalk: boolean; suitableForPath: boolean };

function isSuitable(rt: ResourceTypeSuitability, streetType: string): boolean {
  switch (streetType) {
    case "STREET":
      return rt.suitableForRoad;
    case "PATH":
      return rt.suitableForPath;
    case "PEDESTRIAN_MALL":
      return rt.suitableForSidewalk || rt.suitableForPath;
    case "PUBLIC_AREA":
      return rt.suitableForRoad || rt.suitableForSidewalk || rt.suitableForPath;
    default:
      return true;
  }
}

/** Largest-remainder apportionment: shares sum to exactly `total`, unlike naive rounding. */
function apportion(shares: number[], total: number): number[] {
  if (shares.every((s) => s === 0) || total === 0) return shares.map(() => 0);
  const sumShares = shares.reduce((a, b) => a + b, 0);
  const raw = shares.map((s) => (s / sumShares) * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floors[order[k].i]++;
  }
  return floors;
}

export type ZoneAllocation = {
  zoneId: string;
  zoneName: string;
  zoneCode: string;
  hasBoundaryData: boolean;
  workloadSharePercent: number | null;
  streetKm: number;
  pathKm: number;
  estimatedCleanHours: number;
  suggestedQuantity: number;
  currentQuantity: number;
  variance: number;
  defectCount90d: number;
  complaintCount90d: number;
  explanation: string;
};

export type ResourceTypeAllocation = {
  resourceTypeId: string;
  resourceTypeName: string;
  category: string;
  contractedQuantity: number;
  activePoolSize: number;
  unassignedPoolSize: number;
  poolShortfall: number;
  insufficientData: boolean;
  zones: ZoneAllocation[];
};

export type ContractAreaAllocation = {
  contractAreaId: string;
  contractAreaName: string;
  contractorName: string | null;
  zonesWithoutBoundary: number;
  resourceTypes: ResourceTypeAllocation[];
};

export async function computeAllocationRecommendation(
  contractAreaFilter?: string | null
): Promise<ContractAreaAllocation[]> {
  const contractAreas = await prisma.contractArea.findMany({
    where: contractAreaFilter ? { id: contractAreaFilter } : {},
    include: {
      contractor: { select: { name: true } },
      operationalZones: { where: { active: true }, select: { id: true, name: true, code: true } },
      quotas: { include: { resourceType: true } },
    },
    orderBy: { areaNumber: "asc" },
  });

  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const results: ContractAreaAllocation[] = [];

  for (const area of contractAreas) {
    const zoneIds = area.operationalZones.map((z) => z.id);

    const [segments, defectCounts, complaintCounts, resourceCounts] = await Promise.all([
      prisma.streetSegment.findMany({
        where: { zoneId: { in: zoneIds } },
        select: {
          zoneId: true,
          lengthM: true,
          street: { select: { type: true, priority: true, cleaningFrequency: true } },
        },
      }),
      prisma.defect.groupBy({ by: ["zoneId"], where: { zoneId: { in: zoneIds }, reportedAt: { gte: since90d } }, _count: true }),
      prisma.complaint.groupBy({ by: ["zoneId"], where: { zoneId: { in: zoneIds }, receivedAt: { gte: since90d } }, _count: true }),
      // Active resources per type currently restricted to each of this area's zones.
      prisma.resource.findMany({
        where: { active: true, allowedZones: { some: { id: { in: zoneIds } } } },
        select: { resourceTypeId: true, allowedZones: { select: { id: true } } },
      }),
    ]);

    const defectByZone = new Map(defectCounts.map((d) => [d.zoneId, d._count]));
    const complaintByZone = new Map(complaintCounts.map((c) => [c.zoneId, c._count]));
    const zonesWithBoundaryData = new Set(segments.map((s) => s.zoneId).filter((id): id is string => !!id));

    const resourceTypes: ResourceTypeAllocation[] = [];

    for (const quota of area.quotas) {
      const rt = quota.resourceType;

      const [activePoolSize, unassignedPoolSize] = await Promise.all([
        prisma.resource.count({ where: { active: true, resourceTypeId: rt.id } }),
        prisma.resource.count({ where: { active: true, resourceTypeId: rt.id, allowedZones: { none: {} } } }),
      ]);

      let totalScore = 0;
      const zoneStats = area.operationalZones.map((z) => {
        let score = 0;
        let streetM = 0;
        let pathM = 0;
        let cleanMin = 0;
        for (const seg of segments) {
          if (seg.zoneId !== z.id) continue;
          const len = seg.lengthM ?? 0;
          if (seg.street.type === "STREET") streetM += len;
          else if (seg.street.type === "PATH" || seg.street.type === "PEDESTRIAN_MALL") pathM += len;
          if (!isSuitable(rt, seg.street.type)) continue;
          const weight = weeklyVisitWeight(seg.street.cleaningFrequency) * (PRIORITY_WEIGHT[seg.street.priority] ?? 1);
          score += len * weight;
          cleanMin += defaultCleanMinutes(len);
        }
        totalScore += score;
        const currentQuantity = resourceCounts.filter(
          (r) => r.resourceTypeId === rt.id && r.allowedZones.some((az) => az.id === z.id)
        ).length;
        return { z, score, streetM, pathM, cleanMin, currentQuantity };
      });

      const insufficientData = totalScore === 0;
      const suggested = insufficientData
        ? zoneStats.map(() => 0)
        : apportion(zoneStats.map((zs) => zs.score), quota.quantity);

      const zones: ZoneAllocation[] = zoneStats.map((zs, i) => {
        const sharePercent = insufficientData ? null : Math.round((zs.score / totalScore) * 1000) / 10;
        const defectCount = defectByZone.get(zs.z.id) ?? 0;
        const complaintCount = complaintByZone.get(zs.z.id) ?? 0;
        const hasBoundaryData = zonesWithBoundaryData.has(zs.z.id);

        const explanation = !hasBoundaryData
          ? "לאזור זה טרם הוגדר גבול גיאוגרפי — אין נתוני רחובות לחישוב המלצה."
          : `${(zs.streetM / 1000).toFixed(1)} ק"מ רחובות ו-${(zs.pathM / 1000).toFixed(1)} ק"מ שבילים, ` +
            `במשקל תדירות ניקיון ועדיפות, מהווים ${sharePercent}% מעומס אזור המכרז לסוג משאב זה. ` +
            `זמן ניקיון משוער: ${(zs.cleanMin / 60).toFixed(1)} שעות. ` +
            `${defectCount} ליקויים ו-${complaintCount} תלונות ב-90 הימים האחרונים (להקשר בלבד, לא נכלל בחישוב).`;

        return {
          zoneId: zs.z.id,
          zoneName: zs.z.name,
          zoneCode: zs.z.code,
          hasBoundaryData,
          workloadSharePercent: sharePercent,
          streetKm: Math.round((zs.streetM / 1000) * 10) / 10,
          pathKm: Math.round((zs.pathM / 1000) * 10) / 10,
          estimatedCleanHours: Math.round((zs.cleanMin / 60) * 10) / 10,
          suggestedQuantity: suggested[i],
          currentQuantity: zs.currentQuantity,
          variance: suggested[i] - zs.currentQuantity,
          defectCount90d: defectCount,
          complaintCount90d: complaintCount,
          explanation,
        };
      });

      resourceTypes.push({
        resourceTypeId: rt.id,
        resourceTypeName: rt.name,
        category: rt.category,
        contractedQuantity: quota.quantity,
        activePoolSize,
        unassignedPoolSize,
        poolShortfall: Math.max(0, quota.quantity - activePoolSize),
        insufficientData,
        zones,
      });
    }

    results.push({
      contractAreaId: area.id,
      contractAreaName: area.name,
      contractorName: area.contractor?.name ?? null,
      zonesWithoutBoundary: area.operationalZones.filter((z) => !zonesWithBoundaryData.has(z.id)).length,
      resourceTypes,
    });
  }

  return results;
}

/**
 * Applies a recommendation for one resource type within one contract area: a
 * full repartition of that type's pool (resources already dedicated
 * elsewhere, outside this contract area, are left untouched) across the
 * area's zones according to `suggestedQuantity` — or a manager's edited
 * quantities, passed in `overrideQuantities`.
 */
export async function pickResourcesForAllocation(
  contractAreaId: string,
  resourceTypeId: string,
  quantitiesByZoneId: Record<string, number>
): Promise<{ zoneId: string; resourceIds: string[] }[]> {
  const zoneIds = Object.keys(quantitiesByZoneId);
  const areaZones = await prisma.operationalZone.findMany({
    where: { contractAreaId },
    select: { id: true },
  });
  const areaZoneIds = new Set(areaZones.map((z) => z.id));

  // Eligible pool: active resources of this type not already dedicated to a
  // zone outside this contract area (those stay untouched — this apply only
  // repartitions the slice of the pool that already belongs here or is free).
  const pool = await prisma.resource.findMany({
    where: {
      active: true,
      resourceTypeId,
      allowedZones: { every: { id: { in: [...areaZoneIds] } } },
    },
    select: { id: true, identifier: true },
    orderBy: { identifier: "asc" },
  });

  const assignments: { zoneId: string; resourceIds: string[] }[] = [];
  let cursor = 0;
  for (const zoneId of zoneIds) {
    if (!areaZoneIds.has(zoneId)) continue;
    const qty = quantitiesByZoneId[zoneId] ?? 0;
    const picked = pool.slice(cursor, cursor + qty).map((r) => r.id);
    cursor += qty;
    assignments.push({ zoneId, resourceIds: picked });
  }
  return assignments;
}
