/**
 * Fallback operational estimates used only when the manager hasn't entered a
 * real value for a street/resource yet. Always prefer real data
 * (street.estimatedCleanMinutes, resource.attributes) over these — they
 * exist so the engine still produces a usable plan on day one, not as a
 * claim of precision.
 */

/** ~80 m/min hand/machine cleaning pace assumption. */
export function defaultCleanMinutes(lengthM: number | null): number {
  if (!lengthM) return 10;
  return Math.max(5, Math.round(lengthM / 80));
}

/** ~20 km/h average urban travel speed assumption (driving with stops). */
const DEFAULT_TRAVEL_SPEED_M_PER_MIN = (20 * 1000) / 60;

export function travelMinutes(distanceM: number, attributes: unknown): number {
  const speedKmh =
    typeof attributes === "object" && attributes !== null && "travelSpeedKmh" in attributes
      ? Number((attributes as Record<string, unknown>).travelSpeedKmh)
      : NaN;
  const speedMPerMin = Number.isFinite(speedKmh) && speedKmh > 0 ? (speedKmh * 1000) / 60 : DEFAULT_TRAVEL_SPEED_M_PER_MIN;
  return distanceM / speedMPerMin;
}
