import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSurveyProgress, submitSurvey } from "@/server/cleaning/surveyService";

const answersSchema = z.object({
  dirtLevel: z.number().int().min(1).max(5),
  timesPerWeek: z.number().int().min(0).max(7),
  estimatedCleanMinutes: z.number().int().min(1).max(1440),
  suitableResourceTypeIds: z.array(z.string()).default([]),
  hasAccessProblem: z.boolean().default(false),
  isNarrowRoad: z.boolean().default(false),
  blockedHours: z
    .array(
      z.object({
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
        reason: z.string().max(200).optional(),
      })
    )
    .default([]),
  requiresWater: z.boolean().default(false),
  estimatedWaterLitersPer100m: z.number().min(0).max(10000).nullable().default(null),
  preferredWaterPointId: z.string().nullable().default(null),
  preferredWastePointId: z.string().nullable().default(null),
  permanentHazards: z.string().max(1000).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),

  pedestrianTraffic: z.number().int().min(1).max(5).nullable().optional(),
  nearSchool: z.boolean().nullable().optional(),
  nearCommerce: z.boolean().nullable().optional(),
  nearBusStop: z.boolean().nullable().optional(),
  binCount: z.number().int().min(0).nullable().optional(),
  treeCount: z.number().int().min(0).nullable().optional(),
  leafFallLevel: z.number().int().min(1).max(5).nullable().optional(),
  widthM: z.number().min(0).max(100).nullable().optional(),
});

const bodySchema = z.object({
  streetId: z.string().min(1),
  progress: z.enum(["COMPLETED", "NEEDS_RECHECK"]).default("COMPLETED"),
  notes: z.string().max(1000).nullable().optional(),
  answers: answersSchema,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "profiles.edit")) {
    return NextResponse.json({ error: "אין הרשאה למלא סקר שטח" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await submitSurvey({
      streetId: parsed.data.streetId,
      answers: parsed.data.answers,
      progress: parsed.data.progress,
      notes: parsed.data.notes ?? null,
      userId: session.user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if ((err as Error).message === "Street not found") {
      return NextResponse.json({ error: "רחוב לא נמצא" }, { status: 404 });
    }
    throw err;
  }
}

/** §3's progress header: filled in, still missing, flagged for a re-check. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  return NextResponse.json(await getSurveyProgress());
}
