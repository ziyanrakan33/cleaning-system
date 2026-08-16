import { prisma } from "@/lib/prisma";
import { generateWorkPlan } from "@/server/scheduling/engine";
import { recomputePlan } from "@/server/scheduling/recompute";
import { todayDateOnly } from "@/server/dateUtils";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("no admin");

  // Clean slate.
  await prisma.workPlanTask.deleteMany({});
  await prisma.workPlan.deleteMany({});
  await prisma.resourceAvailability.deleteMany({});

  const today = todayDateOnly();

  const plan = await generateWorkPlan(today, admin.id);
  console.log("Initial plan:", plan.resources.map((r) => `${r.identifier}: ${r.taskCount} tasks`));

  const resource01 = await prisma.resource.findFirst({ where: { identifier: "01" } });
  if (!resource01) throw new Error("resource 01 not found");

  // Mark a few tasks DONE (as if the crew already finished part of the street before breaking down).
  const tasksForR1 = await prisma.workPlanTask.findMany({
    where: { workPlanId: plan.workPlanId, resourceId: resource01.id },
    orderBy: { sequenceOrder: "asc" },
  });
  const doneCount = Math.floor(tasksForR1.length / 3);
  await prisma.workPlanTask.updateMany({
    where: { id: { in: tasksForR1.slice(0, doneCount).map((t) => t.id) } },
    data: { status: "DONE" },
  });
  console.log(`Marked ${doneCount}/${tasksForR1.length} tasks DONE for resource 01.`);

  // Simulate breakdown: mark resource 01 unavailable for today.
  await prisma.resourceAvailability.upsert({
    where: { resourceId_date: { resourceId: resource01.id, date: today } },
    create: { resourceId: resource01.id, date: today, status: "BROKEN", reason: "תקלה מכנית" },
    update: { status: "BROKEN", reason: "תקלה מכנית" },
  });

  const result = await recomputePlan(plan.workPlanId, admin.id);
  console.log("\nRecompute result:", result);

  const newTasks = await prisma.workPlanTask.findMany({
    where: { workPlanId: result.newWorkPlanId },
    include: { resource: { select: { identifier: true } }, street: { select: { name: true } } },
  });
  const byResource = new Map<string, number>();
  const doneByResource = new Map<string, number>();
  for (const t of newTasks) {
    byResource.set(t.resource.identifier, (byResource.get(t.resource.identifier) ?? 0) + 1);
    if (t.status === "DONE") doneByResource.set(t.resource.identifier, (doneByResource.get(t.resource.identifier) ?? 0) + 1);
  }
  console.log("\nNew plan task counts by resource:", Object.fromEntries(byResource));
  console.log("DONE tasks preserved by resource:", Object.fromEntries(doneByResource));

  const r1TasksInNewPlan = newTasks.filter((t) => t.resource.identifier === "01");
  console.log(`\nResource 01 (now broken) has ${r1TasksInNewPlan.length} tasks in new plan (should equal doneCount=${doneCount}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
