/**
 * §17 — learning from execution.
 *
 * Runs once, right after a `TaskFieldReport` is saved. Three rules govern
 * every update this file makes:
 *
 *   1. A field a manager has locked (`manuallyOverriddenFields`) is skipped
 *      entirely — recomputation must never quietly undo a correction.
 *   2. One report never swings an average wildly: an outlier sample (outside
 *      [0.4×, 2.5×] of the current average, once ≥3 samples exist) is stored
 *      and excluded rather than blended in, and is reported as such.
 *   3. Every change is written to `ProfileLearningEvent` with the old value
 *      next to the new one, which is what the /learning screen reads.
 *
 * A Moving Average (EWMA) is used rather than a plain running mean so a
 * profile keeps responding to how a street behaves *now*, not to how it
 * behaved when the very first sample was taken a year ago. The weight given
 * to a new sample shrinks as more samples accumulate (`α = 1 / min(n+1, 10)`),
 * so the average stabilises rather than chasing every report forever.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const OUTLIER_LOW = 0.4;
const OUTLIER_HIGH = 2.5;
const OUTLIER_GUARD_MIN_SAMPLES = 3;
const EWMA_MAX_DIVISOR = 10;

export type LearningUpdate = {
  field: string;
  oldValue: number | null;
  newValue: number | null;
  sampleValue: number;
  sampleCount: number;
  excluded: boolean;
  reason: string;
};

function ewma(oldValue: number | null, sample: number, sampleCount: number): number {
  if (oldValue === null) return sample;
  const alpha = 1 / Math.min(sampleCount + 1, EWMA_MAX_DIVISOR);
  return oldValue + alpha * (sample - oldValue);
}

function isOutlier(oldValue: number | null, sample: number, sampleCount: number): boolean {
  if (oldValue === null || oldValue <= 0 || sampleCount < OUTLIER_GUARD_MIN_SAMPLES) return false;
  const ratio = sample / oldValue;
  return ratio < OUTLIER_LOW || ratio > OUTLIER_HIGH;
}

/**
 * Applies one learnable sample to a `StreetCleaningProfile` field, honouring
 * the manual-override lock and the outlier guard, and records the event.
 * Returns null when the field is locked — nothing was touched.
 */
async function applyProfileSample(params: {
  streetId: string;
  field: "avgActualCleanMin" | "dirtDynamicLevel" | "estWaterLitersPer100m";
  sample: number;
  sourceReportId: string;
}): Promise<LearningUpdate | null> {
  const { streetId, field, sample, sourceReportId } = params;

  const profile = await prisma.streetCleaningProfile.findUnique({ where: { streetId } });
  if (!profile) return null;
  if (profile.manuallyOverriddenFields.includes(field)) return null;

  const oldValue = profile[field];
  const sampleCount = profile.sampleCount;
  const outlier = isOutlier(oldValue, sample, sampleCount);
  const newValue = outlier ? oldValue : ewma(oldValue, sample, sampleCount);

  if (!outlier) {
    await prisma.streetCleaningProfile.update({
      where: { streetId },
      data: { [field]: newValue, sampleCount: sampleCount + 1 } as Prisma.StreetCleaningProfileUpdateInput,
    });
  }

  const event = await prisma.profileLearningEvent.create({
    data: {
      entityType: "StreetCleaningProfile",
      entityId: streetId,
      fieldName: field,
      oldValue,
      newValue: outlier ? oldValue : newValue,
      sampleValue: sample,
      sampleCount: outlier ? sampleCount : sampleCount + 1,
      sourceReportId,
      excluded: outlier,
      reason: outlier
        ? `דגימה (${sample.toFixed(1)}) חורגת מהטווח הסביר סביב הממוצע הנוכחי (${oldValue?.toFixed(1)}) — לא נכללה בממוצע`
        : "עדכון ממוצע נע לאחר ביצוע בשטח",
    },
  });

  return {
    field,
    oldValue,
    newValue: outlier ? oldValue : newValue,
    sampleValue: sample,
    sampleCount: outlier ? sampleCount : sampleCount + 1,
    excluded: outlier,
    reason: event.reason ?? "",
  };
}

/**
 * Called after a `TaskFieldReport` is saved. Updates the street's measured
 * clean time and dirt level, and — separately — the vehicle's measured water
 * consumption rate, then triggers a rescore so the dirt score reflects the new
 * sample immediately rather than at the next scheduled refresh.
 */
export async function learnFromTaskFieldReport(reportId: string): Promise<LearningUpdate[]> {
  const report = await prisma.taskFieldReport.findUnique({
    where: { id: reportId },
    include: {
      workPlanTask: {
        include: {
          street: { select: { id: true } },
          resource: { select: { id: true } },
        },
      },
    },
  });
  if (!report) return [];

  const updates: LearningUpdate[] = [];
  const streetId = report.workPlanTask.streetId;

  // -- actual clean time --
  if (report.startedAt && report.endedAt) {
    const minutes = (report.endedAt.getTime() - report.startedAt.getTime()) / 60000;
    if (minutes > 0 && minutes < 24 * 60) {
      const u = await applyProfileSample({ streetId, field: "avgActualCleanMin", sample: minutes, sourceReportId: reportId });
      if (u) updates.push(u);
    }
  }

  // -- measured dirt level: the "before" rating the crew observed on arrival --
  if (report.dirtBefore !== null) {
    const u = await applyProfileSample({
      streetId,
      field: "dirtDynamicLevel",
      sample: report.dirtBefore,
      sourceReportId: reportId,
    });
    if (u) updates.push(u);
  }

  // -- measured water use per 100m, when the report gives us before/after and
  //    the street/vehicle context to convert it --
  if (report.waterBeforeL !== null && report.waterAfterL !== null) {
    const street = await prisma.street.findUnique({ where: { id: streetId }, select: { lengthM: true } });
    const used = report.waterBeforeL - report.waterAfterL;
    if (used > 0 && street?.lengthM && street.lengthM > 0) {
      const per100m = (used / street.lengthM) * 100;
      const u = await applyProfileSample({
        streetId,
        field: "estWaterLitersPer100m",
        sample: per100m,
        sourceReportId: reportId,
      });
      if (u) updates.push(u);
    }
  }

  // -- last-cleaned timestamp: always advances, not a learned average, but it
  //    is what the "time since last clean" component of the score reads --
  if (report.endedAt) {
    await prisma.streetCleaningProfile.updateMany({
      where: { streetId, OR: [{ lastCleanedAt: null }, { lastCleanedAt: { lt: report.endedAt } }] },
      data: { lastCleanedAt: report.endedAt },
    });
  }

  // Rescore so the dirt score and data mode reflect the new sample count and
  // measured values right away.
  const { rescoreStreet } = await import("@/server/cleaning/profileService");
  await rescoreStreet(streetId);

  return updates;
}

/** Lets a manager void one bad sample: excludes it and recomputes the field from what remains. */
export async function excludeLearningEvent(eventId: string, userId: string): Promise<void> {
  const event = await prisma.profileLearningEvent.findUnique({ where: { id: eventId } });
  if (!event || event.excluded) return;

  await prisma.profileLearningEvent.update({
    where: { id: eventId },
    data: { excluded: true, excludedById: userId, excludedAt: new Date() },
  });

  if (event.entityType !== "StreetCleaningProfile") return;
  const field = event.fieldName as "avgActualCleanMin" | "dirtDynamicLevel" | "estWaterLitersPer100m";

  // Rebuild the field from the surviving, non-excluded events in order, so
  // voiding one sample produces the average as if it had never been reported.
  const events = await prisma.profileLearningEvent.findMany({
    where: { entityType: "StreetCleaningProfile", entityId: event.entityId, fieldName: field, excluded: false },
    orderBy: { createdAt: "asc" },
  });

  let value: number | null = null;
  let count = 0;
  for (const e of events) {
    value = ewma(value, e.sampleValue ?? 0, count);
    count++;
  }

  const profile = await prisma.streetCleaningProfile.findUnique({ where: { streetId: event.entityId } });
  if (profile && !profile.manuallyOverriddenFields.includes(field)) {
    await prisma.streetCleaningProfile.update({
      where: { streetId: event.entityId },
      data: { [field]: value, sampleCount: count } as Prisma.StreetCleaningProfileUpdateInput,
    });
    const { rescoreStreet } = await import("@/server/cleaning/profileService");
    await rescoreStreet(event.entityId);
  }
}
