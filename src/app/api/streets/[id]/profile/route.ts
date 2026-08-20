import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { rescoreStreet, releaseOverride, updateProfile, LEARNABLE_FIELDS } from "@/server/cleaning/profileService";

const rating = z.number().int().min(1).max(5).nullable();

const patchSchema = z.object({
  infrastructureKind: z.string().max(120).nullable().optional(),
  widthM: z.number().min(0).max(100).nullable().optional(),
  areaM2: z.number().min(0).nullable().optional(),
  dirtBaseLevel: rating.optional(),
  dirtDynamicLevel: z.number().min(1).max(5).nullable().optional(),
  recommendedFrequency: z
    .object({
      type: z.enum(["DAILY", "TIMES_PER_WEEK", "WEEKLY", "SPECIFIC_DAYS", "AS_NEEDED"]),
      timesPerWeek: z.number().int().min(1).max(7).optional(),
      days: z.array(z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"])).optional(),
    })
    .nullable()
    .optional(),
  plannedCleanMin: z.number().min(0).max(1440).nullable().optional(),
  avgActualCleanMin: z.number().min(0).max(1440).nullable().optional(),
  pedestrianTraffic: rating.optional(),
  nearSchool: z.boolean().nullable().optional(),
  nearCommerce: z.boolean().nullable().optional(),
  nearBusStop: z.boolean().nullable().optional(),
  binCount: z.number().int().min(0).nullable().optional(),
  treeCount: z.number().int().min(0).nullable().optional(),
  leafFallLevel: rating.optional(),
  seasonalSensitivity: z.record(z.string(), z.number().int().min(1).max(5)).nullable().optional(),
  specialEvents: z.string().max(500).nullable().optional(),
  requiresWater: z.boolean().optional(),
  estWaterLitersPer100m: z.number().min(0).max(10000).nullable().optional(),
  usesPressureWash: z.boolean().optional(),
  preferredWaterPointId: z.string().nullable().optional(),
  preferredWastePointId: z.string().nullable().optional(),
  accessIssue: z.boolean().optional(),
  narrowRoad: z.boolean().optional(),
  blockedHours: z
    .array(z.object({ from: z.string(), to: z.string(), reason: z.string().optional() }))
    .nullable()
    .optional(),
  permanentHazards: z.string().max(1000).nullable().optional(),
  supervisorNote: z.string().max(1000).nullable().optional(),
});

/** Full profile plus its current score and explanation. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  const street = await prisma.street.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      lengthM: true,
      cleaningFrequency: true,
      cleaningProfile: true,
      allowedResourceTypes: { select: { id: true, name: true } },
    },
  });
  if (!street) return NextResponse.json({ error: "רחוב לא נמצא" }, { status: 404 });

  const [openComplaints, surveyCount, lastSurvey] = await Promise.all([
    prisma.complaint.count({ where: { streetId: id, status: { notIn: ["RESOLVED", "REJECTED", "CLOSED"] } } }),
    prisma.streetSurvey.count({ where: { streetId: id } }),
    prisma.streetSurvey.findFirst({
      where: { streetId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, progress: true, createdAt: true, surveyedBy: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    street: {
      id: street.id,
      name: street.name,
      type: street.type,
      lengthM: street.lengthM,
      cleaningFrequency: street.cleaningFrequency,
      allowedResourceTypes: street.allowedResourceTypes,
    },
    profile: street.cleaningProfile,
    openComplaints,
    surveyCount,
    lastSurvey: lastSurvey
      ? { ...lastSurvey, createdAt: lastSurvey.createdAt.toISOString(), surveyedByName: lastSurvey.surveyedBy.name }
      : null,
    learnableFields: LEARNABLE_FIELDS,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "profiles.edit")) {
    return NextResponse.json({ error: "אין הרשאה לערוך פרופיל ניקיון" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const street = await prisma.street.findUnique({ where: { id }, select: { id: true } });
  if (!street) return NextResponse.json({ error: "רחוב לא נמצא" }, { status: 404 });

  const scored = await updateProfile(id, parsed.data, session.user.id);
  return NextResponse.json(scored);
}

/**
 * Clears a manual lock (`?release=avgActualCleanMin`) so the learning layer may
 * resume updating that field, or forces a rescore with no other change.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "profiles.edit")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const release = new URL(req.url).searchParams.get("release");

  if (release) {
    if (!(LEARNABLE_FIELDS as readonly string[]).includes(release)) {
      return NextResponse.json({ error: "שדה לא ניתן לשחרור" }, { status: 400 });
    }
    await releaseOverride(id, release as (typeof LEARNABLE_FIELDS)[number], session.user.id);
  }

  return NextResponse.json(await rescoreStreet(id));
}
