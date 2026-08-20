/**
 * §13 — the pre-publish feasibility check.
 *
 * Runs against what is actually saved in the database, not against the
 * generation-time simulation — a manager can drag a task to a different
 * resource or a different time after generation (`manualEdit.ts`), and a
 * feasibility check that only remembered the original plan would miss exactly
 * the kind of problem a manual edit can introduce. This is also why it is a
 * separate, callable-anytime function rather than a value cached at
 * generation.
 *
 * Every check returns a reason in Hebrew, not just pass/fail — §13 requires
 * the violations to be shown as clear warnings, and a boolean alone cannot do
 * that.
 */
import { prisma } from "@/lib/prisma";
import { getDueStreets } from "@/server/scheduling/dueStreets";
import { resolveVehicleProfile, checkVehicleFitsStreet } from "@/server/resources/operationalProfile";

export type FeasibilityCheckId =
  | "SHIFT_TIME"
  | "WATER_SUFFICIENT"
  | "WATER_POINT_AVAILABLE"
  | "WASTE_CAPACITY"
  | "WASTE_POINT_AVAILABLE"
  | "VEHICLE_FIT"
  | "MISSING_CLEAN_TIME"
  | "RESOURCE_OVERLAP"
  | "DUPLICATE_ASSIGNMENT"
  | "HIGH_PRIORITY_UNASSIGNED"
  | "DATA_BASIS";

export type FeasibilityCheck = {
  id: FeasibilityCheckId;
  label: string;
  passed: boolean;
  /** WARNING checks may still be published with a reason; BLOCKING ones need it too, same as WARNING — §13 only requires a reason, not a hard stop, but blocking ones are highlighted more strongly. */
  severity: "INFO" | "WARNING" | "BLOCKING";
  detail: string;
  affected?: string[];
};

export type FeasibilityResult = {
  workPlanId: string;
  checkedAt: string;
  ok: boolean;
  checks: FeasibilityCheck[];
};

const CHECK_LABELS: Record<FeasibilityCheckId, string> = {
  SHIFT_TIME: "עמידה בשעות המשמרת",
  WATER_SUFFICIENT: "מספיק מים לכל המסלול",
  WATER_POINT_AVAILABLE: "נקודת מילוי זמינה בעת הצורך",
  WASTE_CAPACITY: "קיבולת פסולת מספיקה",
  WASTE_POINT_AVAILABLE: "נקודת פריקה זמינה בעת הצורך",
  VEHICLE_FIT: "התאמת הכלי לכל המקטעים",
  MISSING_CLEAN_TIME: "זמן ניקיון מוגדר לכל משימה",
  RESOURCE_OVERLAP: "אין חפיפת זמנים באותו כלי",
  DUPLICATE_ASSIGNMENT: "אין שיבוץ כפול לאותו מקטע",
  HIGH_PRIORITY_UNASSIGNED: "כל המקטעים בעדיפות גבוהה שובצו",
  DATA_BASIS: "בסיס הנתונים — הערכה או היסטוריה",
};

export async function runFeasibilityCheck(workPlanId: string): Promise<FeasibilityResult> {
  const plan = await prisma.workPlan.findUnique({
    where: { id: workPlanId },
    include: {
      tasks: {
        include: {
          street: { select: { id: true, name: true, type: true, allowedResourceTypes: { select: { id: true } } } },
          resource: { include: { resourceType: true, operationalProfile: true } },
        },
      },
      serviceStops: { include: { waterRefillPoint: true, wasteDisposalPoint: true, resource: true } },
    },
  });
  if (!plan) throw new Error("Work plan not found");

  const checks: FeasibilityCheck[] = [];

  // -- SHIFT_TIME --
  const byResource = new Map<string, typeof plan.tasks>();
  for (const t of plan.tasks) {
    const arr = byResource.get(t.resourceId) ?? [];
    arr.push(t);
    byResource.set(t.resourceId, arr);
  }
  const overCapacityResources: string[] = [];
  for (const [resourceId, tasks] of byResource) {
    const resource = tasks[0].resource;
    if (!resource.workHoursEnd) continue;
    const [eh, em] = resource.workHoursEnd.split(":").map(Number);
    const shiftEndMin = eh * 60 + em;
    const lastEnd = tasks.reduce((max, t) => Math.max(max, t.plannedEnd.getHours() * 60 + t.plannedEnd.getMinutes()), 0);
    const lastServiceStop = plan.serviceStops
      .filter((s) => s.resourceId === resourceId)
      .reduce((max, s) => Math.max(max, s.plannedDeparture.getHours() * 60 + s.plannedDeparture.getMinutes()), 0);
    if (Math.max(lastEnd, lastServiceStop) > shiftEndMin) {
      overCapacityResources.push(`${resource.resourceType.name} ${resource.identifier}`);
    }
  }
  checks.push({
    id: "SHIFT_TIME",
    label: CHECK_LABELS.SHIFT_TIME,
    passed: overCapacityResources.length === 0,
    severity: "BLOCKING",
    detail:
      overCapacityResources.length === 0
        ? "כל הכלים מסיימים במסגרת שעות המשמרת."
        : `הכלים הבאים חורגים משעת סיום המשמרת: ${overCapacityResources.join(", ")}.`,
    affected: overCapacityResources,
  });

  // -- WATER_SUFFICIENT / WATER_POINT_AVAILABLE --
  const belowReserveTasks = plan.tasks.filter((t) => t.projectedWaterAfterL !== null && t.projectedWaterAfterL <= 0);
  checks.push({
    id: "WATER_SUFFICIENT",
    label: CHECK_LABELS.WATER_SUFFICIENT,
    passed: belowReserveTasks.length === 0,
    severity: "BLOCKING",
    detail:
      belowReserveTasks.length === 0
        ? "כמות המים הצפויה מספיקה לכל מקטע, בהתחשב בעצירות המילוי המתוכננות."
        : `המים צפויים להיגמר לפני: ${belowReserveTasks.map((t) => t.street.name).join(", ")}.`,
    affected: belowReserveTasks.map((t) => t.street.name),
  });

  const brokenWaterStops = plan.serviceStops.filter(
    (s) => s.kind === "WATER_REFILL" && s.waterRefillPoint && s.waterRefillPoint.status !== "ACTIVE"
  );
  checks.push({
    id: "WATER_POINT_AVAILABLE",
    label: CHECK_LABELS.WATER_POINT_AVAILABLE,
    passed: brokenWaterStops.length === 0,
    severity: "BLOCKING",
    detail:
      brokenWaterStops.length === 0
        ? "כל נקודות המילוי במסלול פעילות."
        : `נעשה שימוש בנקודות מים לא פעילות: ${brokenWaterStops.map((s) => s.waterRefillPoint!.name).join(", ")}.`,
    affected: brokenWaterStops.map((s) => s.waterRefillPoint!.name),
  });

  // -- WASTE_CAPACITY -- two parts: (a) is capacity even known, and (b) given
  // the per-task projection now stored on each task (projectedWasteAfterKg),
  // does the plan as actually saved overflow the tank — the same "saved
  // state, not generation-time simulation" principle WATER_SUFFICIENT uses.
  const resourcesWithNoWasteData = [...byResource.values()]
    .map((tasks) => tasks[0].resource)
    .filter((r) => r.operationalProfile?.wasteCapacityKg == null);
  const overflowingWasteTasks = plan.tasks.filter((t) => t.projectedWasteAfterKg !== null && t.projectedWasteAfterKg < 0);
  checks.push({
    id: "WASTE_CAPACITY",
    label: CHECK_LABELS.WASTE_CAPACITY,
    passed: resourcesWithNoWasteData.length === 0 && overflowingWasteTasks.length === 0,
    severity: overflowingWasteTasks.length > 0 ? "BLOCKING" : "WARNING",
    detail:
      overflowingWasteTasks.length > 0
        ? `מיכל הפסולת צפוי לגלוש לפני: ${overflowingWasteTasks.map((t) => t.street.name).join(", ")}.`
        : resourcesWithNoWasteData.length === 0
          ? "קיבולת הפסולת של כל הכלים ידועה ואינה צפויה לגלוש."
          : `לא הוגדרה קיבולת פסולת עבור: ${resourcesWithNoWasteData.map((r) => `${r.resourceType.name} ${r.identifier}`).join(", ")} — לא ניתן לוודא מספיק פריקות.`,
    affected: overflowingWasteTasks.map((t) => t.street.name),
  });

  // -- WASTE_POINT_AVAILABLE -- same idea as WATER_POINT_AVAILABLE, for disposal stops.
  const brokenWasteStops = plan.serviceStops.filter(
    (s) => s.kind === "WASTE_DISPOSAL" && s.wasteDisposalPoint && s.wasteDisposalPoint.status !== "ACTIVE"
  );
  checks.push({
    id: "WASTE_POINT_AVAILABLE",
    label: CHECK_LABELS.WASTE_POINT_AVAILABLE,
    passed: brokenWasteStops.length === 0,
    severity: "BLOCKING",
    detail:
      brokenWasteStops.length === 0
        ? "כל נקודות הפריקה במסלול פעילות."
        : `נעשה שימוש בנקודות פריקה לא פעילות: ${brokenWasteStops.map((s) => s.wasteDisposalPoint!.name).join(", ")}.`,
    affected: brokenWasteStops.map((s) => s.wasteDisposalPoint!.name),
  });

  // -- VEHICLE_FIT --
  const unfitTasks = plan.tasks.filter((t) => {
    const profile = resolveVehicleProfile(t.resource);
    const check = checkVehicleFitsStreet(profile, {
      type: t.street.type,
      allowedResourceTypeIds: t.street.allowedResourceTypes.map((r) => r.id),
      profileWidthM: null,
      narrowRoad: false,
    });
    return !check.fits;
  });
  checks.push({
    id: "VEHICLE_FIT",
    label: CHECK_LABELS.VEHICLE_FIT,
    passed: unfitTasks.length === 0,
    severity: "BLOCKING",
    detail:
      unfitTasks.length === 0
        ? "כל הכלים מתאימים למקטעים שהוקצו להם."
        : `אי-התאמת כלי במקטעים: ${unfitTasks.map((t) => t.street.name).join(", ")}.`,
    affected: unfitTasks.map((t) => t.street.name),
  });

  // -- MISSING_CLEAN_TIME --
  const missingTime = plan.tasks.filter((t) => t.cleanTimeMin === null || t.cleanTimeMin === 0);
  checks.push({
    id: "MISSING_CLEAN_TIME",
    label: CHECK_LABELS.MISSING_CLEAN_TIME,
    passed: missingTime.length === 0,
    severity: "WARNING",
    detail:
      missingTime.length === 0
        ? "לכל המשימות זמן ניקיון מוגדר."
        : `זמן ניקיון חסר עבור: ${missingTime.map((t) => t.street.name).join(", ")}.`,
  });

  // -- RESOURCE_OVERLAP --
  const overlaps: string[] = [];
  for (const [, tasks] of byResource) {
    const sorted = [...tasks].sort((a, b) => a.plannedStart.getTime() - b.plannedStart.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].plannedStart.getTime() < sorted[i - 1].plannedEnd.getTime()) {
        overlaps.push(`${sorted[i - 1].street.name} / ${sorted[i].street.name}`);
      }
    }
  }

  // A worker/vehicle must never be double-booked across two separate plans
  // for the same date either — a resource being confirmed here while it is
  // also confirmed on another plan for this date is the same violation as an
  // overlap inside one plan, just invisible to the per-plan scan above.
  const resourceIds = [...byResource.keys()];
  if (resourceIds.length > 0) {
    const siblingPlans = await prisma.workPlan.findMany({
      where: { date: plan.date, status: "CONFIRMED", id: { not: workPlanId } },
      include: {
        tasks: {
          where: { resourceId: { in: resourceIds } },
          select: { resourceId: true, plannedStart: true, plannedEnd: true, street: { select: { name: true } } },
        },
      },
    });
    for (const sibling of siblingPlans) {
      for (const otherTask of sibling.tasks) {
        const mine = byResource.get(otherTask.resourceId) ?? [];
        for (const myTask of mine) {
          const overlap =
            myTask.plannedStart.getTime() < otherTask.plannedEnd.getTime() &&
            otherTask.plannedStart.getTime() < myTask.plannedEnd.getTime();
          if (overlap) {
            overlaps.push(`${myTask.street.name} (תוכנית זו) / ${otherTask.street.name} (תוכנית מאושרת אחרת לאותו תאריך)`);
          }
        }
      }
    }
  }

  checks.push({
    id: "RESOURCE_OVERLAP",
    label: CHECK_LABELS.RESOURCE_OVERLAP,
    passed: overlaps.length === 0,
    severity: "BLOCKING",
    detail: overlaps.length === 0 ? "אין חפיפת זמנים בין משימות של אותו כלי." : `חפיפת זמנים: ${overlaps.join(", ")}.`,
    affected: overlaps,
  });

  // -- DUPLICATE_ASSIGNMENT --
  const streetCounts = new Map<string, number>();
  for (const t of plan.tasks) streetCounts.set(t.street.name, (streetCounts.get(t.street.name) ?? 0) + 1);
  const duplicated = [...streetCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
  checks.push({
    id: "DUPLICATE_ASSIGNMENT",
    label: CHECK_LABELS.DUPLICATE_ASSIGNMENT,
    passed: duplicated.length === 0,
    severity: "BLOCKING",
    detail: duplicated.length === 0 ? "כל מקטע שובץ פעם אחת בלבד." : `שיבוץ כפול: ${duplicated.join(", ")}.`,
    affected: duplicated,
  });

  // -- HIGH_PRIORITY_UNASSIGNED --
  const dueToday = await getDueStreets(plan.date);
  const plannedStreetIds = new Set(plan.tasks.map((t) => t.streetId));
  const missingHighPriority = dueToday.filter(
    (s) => (s.priority === "CRITICAL" || s.priority === "HIGH") && !plannedStreetIds.has(s.id)
  );
  checks.push({
    id: "HIGH_PRIORITY_UNASSIGNED",
    label: CHECK_LABELS.HIGH_PRIORITY_UNASSIGNED,
    passed: missingHighPriority.length === 0,
    severity: "WARNING",
    detail:
      missingHighPriority.length === 0
        ? "כל המקטעים בעדיפות קריטית/גבוהה שובצו."
        : `לא שובצו: ${missingHighPriority.map((s) => s.name).join(", ")}.`,
    affected: missingHighPriority.map((s) => s.name),
  });

  // -- DATA_BASIS --
  const estimatedTaskCount = plan.tasks.filter((t) => t.waterBasis === "ESTIMATED" || t.waterBasis === null).length;
  const straightLineTaskCount = plan.tasks.filter((t) => t.distanceBasis === "STRAIGHT_LINE").length;
  const dataBasisParts: string[] = [];
  dataBasisParts.push(
    estimatedTaskCount === 0
      ? "כל נתוני הצריכה במסלול מבוססים על מדידה בפועל."
      : `${estimatedTaskCount} מתוך ${plan.tasks.length} משימות מבוססות על הערכה, לא על מדידה בפועל.`
  );
  if (straightLineTaskCount > 0) {
    dataBasisParts.push(
      `${straightLineTaskCount} מתוך ${plan.tasks.length} מרחקי נסיעה מבוססים על קו ישיר (הגרף לא כיסה את הקטע), לא על רשת הכבישים בפועל.`
    );
  }
  checks.push({
    id: "DATA_BASIS",
    label: CHECK_LABELS.DATA_BASIS,
    passed: true,
    severity: "INFO",
    detail: dataBasisParts.join(" "),
  });

  const blockingFailed = checks.some((c) => c.severity === "BLOCKING" && !c.passed);

  return {
    workPlanId,
    checkedAt: new Date().toISOString(),
    ok: !blockingFailed,
    checks,
  };
}
