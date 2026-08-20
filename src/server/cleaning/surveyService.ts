/**
 * §3 — the initial field survey.
 *
 * This is where the whole system gets its first honest numbers. Before any
 * street has been surveyed there is nothing to plan on but geometry, which is
 * exactly the situation the upgrade exists to end.
 *
 * A submission is stored twice on purpose: verbatim in `StreetSurvey.answers`
 * (append-only, so a later disagreement can always be traced back to what the
 * surveyor actually said) and projected onto `StreetCleaningProfile`, which is
 * what the planner reads. The projection is one-way and re-runnable.
 */
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { updateProfile, type ProfilePatch } from "./profileService";
import type { Prisma } from "@/generated/prisma/client";
import type { SurveyProgress } from "@/generated/prisma/enums";

export type SurveyAnswers = {
  /** 1–5: how quickly this place gets dirty. */
  dirtLevel: number;
  /** How many times a week it needs cleaning. 0 = as needed. */
  timesPerWeek: number;
  /** Estimated minutes to clean it once. */
  estimatedCleanMinutes: number;
  /** ResourceType ids the surveyor considers suitable. */
  suitableResourceTypeIds: string[];
  hasAccessProblem: boolean;
  isNarrowRoad: boolean;
  /** [{ from: "07:00", to: "08:30", reason: "..." }] */
  blockedHours: { from: string; to: string; reason?: string }[];
  requiresWater: boolean;
  /** Litres per 100 m, the surveyor's estimate. */
  estimatedWaterLitersPer100m: number | null;
  preferredWaterPointId: string | null;
  preferredWastePointId: string | null;
  permanentHazards: string | null;
  notes: string | null;

  // Context questions that feed the score but are not strictly part of the
  // brief's question list — all optional, all droppable.
  pedestrianTraffic?: number | null;
  nearSchool?: boolean | null;
  nearCommerce?: boolean | null;
  nearBusStop?: boolean | null;
  binCount?: number | null;
  treeCount?: number | null;
  leafFallLevel?: number | null;
  widthM?: number | null;
};

/** Turns the surveyor's "how many times a week" into the stored frequency shape. */
export function timesPerWeekToFrequency(timesPerWeek: number): Prisma.InputJsonValue {
  if (timesPerWeek <= 0) return { type: "AS_NEEDED" };
  if (timesPerWeek >= 6) return { type: "DAILY" };
  if (timesPerWeek === 1) return { type: "WEEKLY" };
  return { type: "TIMES_PER_WEEK", timesPerWeek };
}

/**
 * Records a survey and projects it onto the profile.
 *
 * `progress` lets a surveyor flag a street as needing a second look — a street
 * he could not reach, or one whose answer he is unsure of — instead of leaving
 * a confident-looking row behind.
 */
export async function submitSurvey(params: {
  streetId: string;
  answers: SurveyAnswers;
  progress: SurveyProgress;
  notes?: string | null;
  userId: string;
}) {
  const { streetId, answers, progress, userId } = params;

  const street = await prisma.street.findUnique({ where: { id: streetId }, select: { id: true, name: true } });
  if (!street) throw new Error("Street not found");

  const survey = await prisma.streetSurvey.create({
    data: {
      streetId,
      surveyedById: userId,
      answers: answers as unknown as Prisma.InputJsonValue,
      progress,
      notes: params.notes ?? null,
    },
  });

  const patch: ProfilePatch = {
    dirtBaseLevel: answers.dirtLevel,
    recommendedFrequency: timesPerWeekToFrequency(answers.timesPerWeek),
    plannedCleanMin: answers.estimatedCleanMinutes,
    accessIssue: answers.hasAccessProblem,
    narrowRoad: answers.isNarrowRoad,
    blockedHours:
      answers.blockedHours.length > 0 ? (answers.blockedHours as unknown as Prisma.InputJsonValue) : null,
    requiresWater: answers.requiresWater,
    estWaterLitersPer100m: answers.requiresWater ? answers.estimatedWaterLitersPer100m : null,
    preferredWaterPointId: answers.preferredWaterPointId,
    preferredWastePointId: answers.preferredWastePointId,
    permanentHazards: answers.permanentHazards,
    supervisorNote: answers.notes,
  };

  // Only project the optional context answers the surveyor actually filled in.
  // Writing `null` for a question he skipped would turn "not asked" into
  // "answered: none", which is precisely what the scoring layer must not see.
  for (const key of [
    "pedestrianTraffic",
    "nearSchool",
    "nearCommerce",
    "nearBusStop",
    "binCount",
    "treeCount",
    "leafFallLevel",
    "widthM",
  ] as const) {
    const value = answers[key];
    if (value !== undefined && value !== null) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  const scored = await updateProfile(streetId, patch, userId);

  // The surveyor's judgement of which vehicles fit is a real constraint the
  // planner enforces, so it is written to the street's own allow-list.
  if (answers.suitableResourceTypeIds.length > 0) {
    await prisma.street.update({
      where: { id: streetId },
      data: { allowedResourceTypes: { set: answers.suitableResourceTypeIds.map((id) => ({ id })) } },
    });
  }

  await audit({
    entityType: "StreetSurvey",
    entityId: survey.id,
    action: "SURVEY_SUBMITTED",
    userId,
    after: answers as unknown as Prisma.InputJsonValue,
    description: `סקר שטח נרשם עבור "${street.name}"${progress === "NEEDS_RECHECK" ? " — סומן לבדיקה חוזרת" : ""}`,
  });

  return { surveyId: survey.id, profile: scored };
}

export type SurveyProgressSummary = {
  totalStreets: number;
  surveyed: number;
  missing: number;
  needsRecheck: number;
  percentComplete: number;
  byZone: {
    zoneId: string | null;
    zoneName: string;
    total: number;
    surveyed: number;
    needsRecheck: number;
  }[];
};

/** §3's progress header: how many segments are done, missing, or flagged. */
export async function getSurveyProgress(): Promise<SurveyProgressSummary> {
  const [streets, latestSurveys, zones] = await Promise.all([
    prisma.street.findMany({
      where: { active: true },
      select: { id: true, zoneId: true },
    }),
    // The latest survey per street decides its state — an old COMPLETED row
    // must not mask a newer NEEDS_RECHECK.
    prisma.streetSurvey.findMany({
      orderBy: { createdAt: "desc" },
      select: { streetId: true, progress: true, createdAt: true },
    }),
    prisma.operationalZone.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  const latestByStreet = new Map<string, SurveyProgress>();
  for (const s of latestSurveys) {
    if (!latestByStreet.has(s.streetId)) latestByStreet.set(s.streetId, s.progress);
  }

  const zoneNames = new Map(zones.map((z) => [z.id, z.name]));
  const byZone = new Map<string | null, { zoneName: string; total: number; surveyed: number; needsRecheck: number }>();

  let surveyed = 0;
  let needsRecheck = 0;

  for (const street of streets) {
    const state = latestByStreet.get(street.id);
    const key = street.zoneId;
    const bucket =
      byZone.get(key) ??
      { zoneName: key ? (zoneNames.get(key) ?? "אזור לא ידוע") : "ללא שיוך אזור", total: 0, surveyed: 0, needsRecheck: 0 };
    bucket.total++;
    if (state) {
      surveyed++;
      bucket.surveyed++;
      if (state === "NEEDS_RECHECK") {
        needsRecheck++;
        bucket.needsRecheck++;
      }
    }
    byZone.set(key, bucket);
  }

  return {
    totalStreets: streets.length,
    surveyed,
    missing: streets.length - surveyed,
    needsRecheck,
    percentComplete: streets.length > 0 ? Math.round((surveyed / streets.length) * 100) : 0,
    byZone: [...byZone.entries()]
      .map(([zoneId, v]) => ({ zoneId, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}
