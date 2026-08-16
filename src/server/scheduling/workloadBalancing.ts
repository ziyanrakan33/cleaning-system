import type { DueStreet } from "./dueStreets";
import { defaultCleanMinutes } from "./estimate";

export type EligibleResource = {
  id: string;
  resourceTypeId: string;
  allowedZoneIds: string[];
  allowedStreetIds: string[];
  workHoursStart: string;
  workHoursEnd: string;
};

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isEligible(resource: EligibleResource, street: DueStreet): boolean {
  if (resource.allowedZoneIds.length > 0) {
    // Zone-restricted resource: a street with no zone assigned yet is not
    // "in" the allowed zone, so it must be rejected too — not just streets
    // explicitly assigned to a *different* zone.
    if (!street.zoneId || !resource.allowedZoneIds.includes(street.zoneId)) {
      return false;
    }
  }
  if (resource.allowedStreetIds.length > 0 && !resource.allowedStreetIds.includes(street.id)) {
    return false;
  }
  const allowedTypes = street.allowedResourceTypes.map((t) => t.id);
  if (allowedTypes.length > 0 && !allowedTypes.includes(resource.resourceTypeId)) {
    return false;
  }
  return true;
}

/**
 * Greedy load-balancing: process streets highest-priority first; for each,
 * assign it to the eligible resource with the least work assigned so far
 * that still has capacity. Streets nobody has room/eligibility for come
 * back as `unassigned` so the manager can see the gap immediately.
 */
export function balanceWorkload(streets: DueStreet[], resources: EligibleResource[]) {
  const capacityMin = new Map<string, number>();
  const loadMin = new Map<string, number>();
  for (const r of resources) {
    capacityMin.set(r.id, hhmmToMinutes(r.workHoursEnd) - hhmmToMinutes(r.workHoursStart));
    loadMin.set(r.id, 0);
  }

  const assignments = new Map<string, DueStreet[]>();
  for (const r of resources) assignments.set(r.id, []);
  const unassigned: DueStreet[] = [];

  for (const street of streets) {
    const cleanMinutes = street.estimatedCleanMinutes ?? defaultCleanMinutes(street.lengthM);
    const eligible = resources.filter((r) => isEligible(r, street));
    const withCapacity = eligible.filter((r) => (loadMin.get(r.id) ?? 0) + cleanMinutes <= (capacityMin.get(r.id) ?? 0));

    if (withCapacity.length === 0) {
      unassigned.push(street);
      continue;
    }

    withCapacity.sort((a, b) => (loadMin.get(a.id) ?? 0) - (loadMin.get(b.id) ?? 0));
    const chosen = withCapacity[0];
    assignments.get(chosen.id)!.push(street);
    loadMin.set(chosen.id, (loadMin.get(chosen.id) ?? 0) + cleanMinutes);
  }

  return { assignments, unassigned };
}
