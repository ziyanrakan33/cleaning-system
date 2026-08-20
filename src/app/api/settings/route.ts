import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  DEFAULT_DIRT_SCORE_THRESHOLDS,
  DEFAULT_DIRT_SCORE_WEIGHTS,
  DEFAULT_ORGANIZATION_SETTINGS,
  DEFAULT_ROUTE_COST_WEIGHTS,
  SETTING_KEYS,
  getDirtScoreThresholds,
  getDirtScoreWeights,
  getOrganizationSettings,
  getRouteCostWeights,
  isCustomised,
  setSetting,
} from "@/server/settings/service";
import { rescoreAll } from "@/server/cleaning/profileService";

const weightsSchema = z.object({
  historicalDirt: z.number().min(0).max(100),
  timeSinceLastClean: z.number().min(0).max(100),
  openComplaints: z.number().min(0).max(100),
  pedestrianTraffic: z.number().min(0).max(100),
  proximity: z.number().min(0).max(100),
  seasonalAndEvents: z.number().min(0).max(100),
  supervisorEstimate: z.number().min(0).max(100),
});

const thresholdsSchema = z.object({
  dataInformedMinSamples: z.number().int().min(1).max(1000),
  staleAfterDays: z.number().int().min(1).max(3650),
  complaintSaturation: z.number().int().min(1).max(100),
});

const organizationSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  timezone: z.string().min(1).max(60),
  language: z.string().min(2).max(10),
  dateFormat: z.string().min(1).max(20),
  targetZoneCount: z.number().int().min(1).max(1000),
});

const costWeightsSchema = z.object({
  travelMinute: z.number().min(0).max(1000),
  deadKilometre: z.number().min(0).max(1000),
  cleanMinute: z.number().min(0).max(1000),
  refillMinute: z.number().min(0).max(1000),
  disposalMinute: z.number().min(0).max(1000),
  overtimeMinute: z.number().min(0).max(1000),
  unassignedSegment: z.number().min(0).max(10000),
  skippedHighPriority: z.number().min(0).max(10000),
  distantWaterPoint: z.number().min(0).max(1000),
  unsuitableVehicle: z.number().min(0).max(10000),
  belowWaterReserve: z.number().min(0).max(1000),
  redundantRevisit: z.number().min(0).max(10000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "routing.configure")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const [dirtWeights, thresholds, costWeights, organization] = await Promise.all([
    getDirtScoreWeights(),
    getDirtScoreThresholds(),
    getRouteCostWeights(),
    getOrganizationSettings(),
  ]);

  return NextResponse.json({
    dirtScoreWeights: {
      current: dirtWeights,
      defaults: DEFAULT_DIRT_SCORE_WEIGHTS,
      customised: isCustomised(dirtWeights, DEFAULT_DIRT_SCORE_WEIGHTS),
      sum: Object.values(dirtWeights).reduce((a, b) => a + b, 0),
    },
    dirtScoreThresholds: {
      current: thresholds,
      defaults: DEFAULT_DIRT_SCORE_THRESHOLDS,
      customised: isCustomised(thresholds, DEFAULT_DIRT_SCORE_THRESHOLDS),
    },
    routeCostWeights: {
      current: costWeights,
      defaults: DEFAULT_ROUTE_COST_WEIGHTS,
      customised: isCustomised(costWeights, DEFAULT_ROUTE_COST_WEIGHTS),
    },
    organization: {
      current: organization,
      defaults: DEFAULT_ORGANIZATION_SETTINGS,
      customised: isCustomised(organization, DEFAULT_ORGANIZATION_SETTINGS),
    },
  });
}

/**
 * Saves one settings group.
 *
 * Changing the dirt-score weights or thresholds invalidates every stored score,
 * so the whole set is recomputed straight away. Leaving stale scores behind
 * would mean the map and the planner disagreed with the weights screen — the
 * exact kind of silent inconsistency §2 is trying to prevent.
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "routing.configure")) {
    return NextResponse.json({ error: "אין הרשאה לשנות הגדרות" }, { status: 403 });
  }

  const body = await req.json();
  const group = String(body?.group ?? "");

  if (group === "dirtScoreWeights") {
    const parsed = weightsSchema.safeParse(body.value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const sum = Object.values(parsed.data).reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      return NextResponse.json({ error: "סכום המשקלים חייב להיות גדול מאפס" }, { status: 400 });
    }
    await setSetting(SETTING_KEYS.dirtScoreWeights, parsed.data, session.user.id, "משקלי ציון הלכלוך (§2)");
    const { rescored } = await rescoreAll();
    return NextResponse.json({ ok: true, rescored, weightSum: sum });
  }

  if (group === "dirtScoreThresholds") {
    const parsed = thresholdsSchema.safeParse(body.value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    await setSetting(SETTING_KEYS.dirtScoreThresholds, parsed.data, session.user.id, "ספי מעבר למצב מבוסס-נתונים (§2)");
    const { rescored } = await rescoreAll();
    return NextResponse.json({ ok: true, rescored });
  }

  if (group === "organization") {
    const parsed = organizationSchema.safeParse(body.value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    await setSetting(SETTING_KEYS.organization, parsed.data, session.user.id, "מיתוג הארגון (שם, לוגו, אזור זמן וכו')");
    return NextResponse.json({ ok: true });
  }

  if (group === "routeCostWeights") {
    const parsed = costWeightsSchema.safeParse(body.value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    await setSetting(SETTING_KEYS.routeCostWeights, parsed.data, session.user.id, "משקלי פונקציית עלות המסלול (§11)");
    // Cost weights affect the *next* plan generated; existing plans keep the
    // explanation they were built with, so nothing is recomputed here.
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "קבוצת הגדרות לא מוכרת" }, { status: 400 });
}
