/**
 * Reads, writes and rescores street cleaning profiles (§1, §2, §3).
 *
 * Two invariants run through this file:
 *   1. A field a manager set by hand is recorded in `manuallyOverriddenFields`
 *      and is never written again by anything automatic. §11 of the brief is
 *      explicit that a manual change must survive recomputation.
 *   2. Nothing is invented. A street with no profile row scores `null`, not 0,
 *      and every screen must render that as "לא נבדק" rather than as "נקי".
 */
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { getDirtScoreThresholds, getDirtScoreWeights } from "@/server/settings/service";
import {
  computeDirtScore,
  DIRT_SCORE_FORMULA_VERSION,
  frequencyToIntervalDays,
  type DirtScoreInput,
  type DirtScoreResult,
} from "./dirtScore";
import { Prisma } from "@/generated/prisma/client";
import type { StreetCleaningProfileModel } from "@/generated/prisma/models";

/** Fields the learning layer may write, and which a manual edit therefore locks. */
export const LEARNABLE_FIELDS = [
  "avgActualCleanMin",
  "dirtDynamicLevel",
  "estWaterLitersPer100m",
] as const;
export type LearnableField = (typeof LEARNABLE_FIELDS)[number];

/** The fields that must be present for a profile to count as RULE_BASED. */
function isProfileComplete(p: {
  dirtBaseLevel: number | null;
  pedestrianTraffic: number | null;
  plannedCleanMin: number | null;
}): boolean {
  return p.dirtBaseLevel !== null && p.pedestrianTraffic !== null && p.plannedCleanMin !== null;
}

export type ScoredProfile = DirtScoreResult & {
  streetId: string;
  streetName: string;
  hasProfile: boolean;
};

/**
 * Rescores one street and persists the result.
 *
 * Returns null when the street has no profile at all — the caller should show
 * "טרם בוצע סקר" rather than a number.
 */
export async function rescoreStreet(streetId: string): Promise<ScoredProfile | null> {
  const [weights, thresholds] = await Promise.all([getDirtScoreWeights(), getDirtScoreThresholds()]);

  const street = await prisma.street.findUnique({
    where: { id: streetId },
    include: { cleaningProfile: true },
  });
  if (!street) return null;

  const profile = street.cleaningProfile;
  if (!profile) {
    return {
      streetId: street.id,
      streetName: street.name,
      hasProfile: false,
      score: null,
      factors: [],
      missingComponents: [],
      dataMode: "REQUIRES_REVIEW",
      confidence: "LOW",
      sampleCount: 0,
      computedAt: new Date(),
      formulaVersion: DIRT_SCORE_FORMULA_VERSION,
    };
  }

  const [openComplaints, surveyCount] = await Promise.all([
    prisma.complaint.count({
      where: { streetId, status: { notIn: ["RESOLVED", "REJECTED", "CLOSED"] } },
    }),
    prisma.streetSurvey.count({ where: { streetId } }),
  ]);

  const result = computeDirtScore(
    buildScoreInput(street, profile, openComplaints, surveyCount > 0),
    weights,
    thresholds
  );

  await prisma.streetCleaningProfile.update({
    where: { id: profile.id },
    data: {
      dirtScore: result.score,
      dirtScoreFactors: {
        factors: result.factors,
        missingComponents: result.missingComponents,
        weightsUsed: weights,
        formulaVersion: result.formulaVersion,
      } as unknown as Prisma.InputJsonValue,
      dirtScoreAt: result.computedAt,
      dataMode: result.dataMode,
      confidence: result.confidence,
    },
  });

  return { ...result, streetId: street.id, streetName: street.name, hasProfile: true };
}

function buildScoreInput(
  street: { cleaningFrequency: Prisma.JsonValue },
  profile: StreetCleaningProfileModel,
  openComplaints: number,
  hasSurvey: boolean
): DirtScoreInput {
  const daysSinceLastClean = profile.lastCleanedAt
    ? Math.floor((Date.now() - profile.lastCleanedAt.getTime()) / 86_400_000)
    : null;

  // The recommended frequency the surveyor gave wins over the schedule in
  // force; they are allowed to disagree, and the recommendation is the honest
  // yardstick for "overdue".
  const recommendedIntervalDays =
    frequencyToIntervalDays(profile.recommendedFrequency) ?? frequencyToIntervalDays(street.cleaningFrequency);

  const seasonal =
    profile.seasonalSensitivity && typeof profile.seasonalSensitivity === "object" && !Array.isArray(profile.seasonalSensitivity)
      ? (profile.seasonalSensitivity as Record<string, number>)
      : null;

  return {
    dirtBaseLevel: profile.dirtBaseLevel,
    dirtDynamicLevel: profile.dirtDynamicLevel,
    daysSinceLastClean,
    recommendedIntervalDays,
    openComplaints,
    pedestrianTraffic: profile.pedestrianTraffic,
    nearSchool: profile.nearSchool,
    nearCommerce: profile.nearCommerce,
    nearBusStop: profile.nearBusStop,
    leafFallLevel: profile.leafFallLevel,
    seasonalSensitivity: seasonal,
    hasSpecialEvent: !!profile.specialEvents?.trim(),
    sampleCount: profile.sampleCount,
    lastUpdatedAt: profile.updatedAt,
    hasSurvey,
    profileComplete: isProfileComplete(profile),
    month: new Date().getMonth() + 1,
  };
}

/**
 * Rescores every street that has a profile. Used after a weights change and by
 * the nightly-ish refresh — the "days since last clean" component moves on its
 * own even when nothing is edited.
 *
 * Batched rather than one big transaction so a rescore of a thousand streets
 * cannot hold a write lock across the whole table.
 */
export async function rescoreAll(options: { batchSize?: number } = {}): Promise<{ rescored: number }> {
  const batchSize = options.batchSize ?? 200;
  const [weights, thresholds] = await Promise.all([getDirtScoreWeights(), getDirtScoreThresholds()]);

  let cursor: string | undefined;
  let rescored = 0;

  for (;;) {
    const batch = await prisma.streetCleaningProfile.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: { street: { select: { id: true, cleaningFrequency: true } } },
    });
    if (batch.length === 0) break;

    const streetIds = batch.map((p) => p.streetId);
    const complaintCounts = await prisma.complaint.groupBy({
      by: ["streetId"],
      where: { streetId: { in: streetIds }, status: { notIn: ["RESOLVED", "REJECTED", "CLOSED"] } },
      _count: true,
    });
    const complaintsByStreet = new Map(complaintCounts.map((c) => [c.streetId, c._count]));

    const surveyed = await prisma.streetSurvey.groupBy({
      by: ["streetId"],
      where: { streetId: { in: streetIds } },
      _count: true,
    });
    const surveyedSet = new Set(surveyed.map((s) => s.streetId));

    for (const profile of batch) {
      const result = computeDirtScore(
        buildScoreInput(
          profile.street,
          profile,
          complaintsByStreet.get(profile.streetId) ?? 0,
          surveyedSet.has(profile.streetId)
        ),
        weights,
        thresholds
      );
      await prisma.streetCleaningProfile.update({
        where: { id: profile.id },
        data: {
          dirtScore: result.score,
          dirtScoreFactors: {
            factors: result.factors,
            missingComponents: result.missingComponents,
            weightsUsed: weights,
            formulaVersion: result.formulaVersion,
          } as unknown as Prisma.InputJsonValue,
          dirtScoreAt: result.computedAt,
          dataMode: result.dataMode,
          confidence: result.confidence,
        },
      });
      rescored++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }

  return { rescored };
}

// ---------------------------------------------------------------------------
// Manual editing (§1, §11)
// ---------------------------------------------------------------------------

export type ProfilePatch = Partial<{
  infrastructureKind: string | null;
  widthM: number | null;
  areaM2: number | null;
  dirtBaseLevel: number | null;
  dirtDynamicLevel: number | null;
  recommendedFrequency: Prisma.InputJsonValue | null;
  plannedCleanMin: number | null;
  avgActualCleanMin: number | null;
  pedestrianTraffic: number | null;
  nearSchool: boolean | null;
  nearCommerce: boolean | null;
  nearBusStop: boolean | null;
  binCount: number | null;
  treeCount: number | null;
  leafFallLevel: number | null;
  seasonalSensitivity: Prisma.InputJsonValue | null;
  specialEvents: string | null;
  requiresWater: boolean;
  estWaterLitersPer100m: number | null;
  usesPressureWash: boolean;
  preferredWaterPointId: string | null;
  preferredWastePointId: string | null;
  accessIssue: boolean;
  narrowRoad: boolean;
  blockedHours: Prisma.InputJsonValue | null;
  permanentHazards: string | null;
  supervisorNote: string | null;
}>;

/**
 * Applies a manager's edit. Any learnable field touched here is added to
 * `manuallyOverriddenFields`, which is what stops the learning layer from
 * quietly writing over the correction on the next completed job.
 */
/** Json columns need Prisma's DbNull sentinel to be cleared; plain null is a type error. */
const JSON_FIELDS = ["recommendedFrequency", "seasonalSensitivity", "blockedHours"] as const;

export async function updateProfile(
  streetId: string,
  patch: ProfilePatch,
  userId: string
): Promise<ScoredProfile | null> {
  const existing = await prisma.streetCleaningProfile.findUnique({ where: { streetId } });

  const touchedLearnable = LEARNABLE_FIELDS.filter((f) => f in patch);
  const overriddenFields = [...new Set([...(existing?.manuallyOverriddenFields ?? []), ...touchedLearnable])];

  const data: Prisma.StreetCleaningProfileUncheckedUpdateInput = {
    ...(patch as Prisma.StreetCleaningProfileUncheckedUpdateInput),
    ...(touchedLearnable.length > 0
      ? { manuallyOverridden: true, manuallyOverriddenFields: overriddenFields }
      : {}),
  };
  for (const f of JSON_FIELDS) {
    if (f in patch && patch[f] === null) data[f] = Prisma.DbNull;
  }

  if (existing) {
    await prisma.streetCleaningProfile.update({ where: { streetId }, data });
  } else {
    await prisma.streetCleaningProfile.create({
      data: { ...(data as Prisma.StreetCleaningProfileUncheckedCreateInput), streetId },
    });
  }

  // Manual corrections are evidence in their own right — recorded the same way
  // a segment-zone correction is, so an automated pass can check before writing.
  for (const field of touchedLearnable) {
    await prisma.manualOverride.create({
      data: {
        entityType: "StreetCleaningProfile",
        entityId: streetId,
        fieldName: field,
        previousValue: existing ? String(existing[field] ?? "") : null,
        newValue: String(patch[field] ?? ""),
        reason: "עריכה ידנית במסך פרופיל הניקיון",
        overriddenById: userId,
      },
    });
  }

  await audit({
    entityType: "StreetCleaningProfile",
    entityId: streetId,
    action: existing ? "PROFILE_UPDATED" : "PROFILE_CREATED",
    userId,
    before: (existing ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
    after: patch as unknown as Prisma.InputJsonValue,
    description: `פרופיל ניקיון עודכן${touchedLearnable.length > 0 ? ` (דריסה ידנית: ${touchedLearnable.join(", ")})` : ""}`,
  });

  return rescoreStreet(streetId);
}

/** Clears a manual lock so the learning layer may resume updating that field. */
export async function releaseOverride(streetId: string, field: LearnableField, userId: string) {
  const profile = await prisma.streetCleaningProfile.findUnique({ where: { streetId } });
  if (!profile) return;

  const remaining = profile.manuallyOverriddenFields.filter((f) => f !== field);
  await prisma.streetCleaningProfile.update({
    where: { streetId },
    data: { manuallyOverriddenFields: remaining, manuallyOverridden: remaining.length > 0 },
  });

  await audit({
    entityType: "StreetCleaningProfile",
    entityId: streetId,
    action: "PROFILE_OVERRIDE_RELEASED",
    userId,
    description: `הדריסה הידנית על "${field}" בוטלה — הלמידה תעדכן שוב שדה זה`,
  });
}
