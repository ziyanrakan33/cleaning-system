import { prisma } from "@/lib/prisma";
import { moveTask } from "@/server/scheduling/manualEdit";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("no admin");

  const plan = await prisma.workPlan.findFirst({ orderBy: { versionNumber: "desc" } });
  if (!plan) throw new Error("no plan — run test-recompute.ts first");

  const r1 = await prisma.resource.findFirst({ where: { identifier: "01" } });
  const r2 = await prisma.resource.findFirst({ where: { identifier: "02" } });
  if (!r1 || !r2) throw new Error("resources not found");

  const before1 = await prisma.workPlanTask.count({ where: { workPlanId: plan.id, resourceId: r1.id } });
  const before2 = await prisma.workPlanTask.count({ where: { workPlanId: plan.id, resourceId: r2.id } });
  console.log(`Before: r1=${before1} tasks, r2=${before2} tasks`);

  const firstTaskOfR1 = await prisma.workPlanTask.findFirst({
    where: { workPlanId: plan.id, resourceId: r1.id },
    orderBy: { sequenceOrder: "asc" },
    include: { street: { select: { name: true } } },
  });
  if (!firstTaskOfR1) throw new Error("r1 has no tasks");
  console.log(`Moving task "${firstTaskOfR1.street.name}" from r1 to r2, index 0`);

  const result = await moveTask(firstTaskOfR1.id, r2.id, 0, admin.id);
  console.log("Move result:", result);

  const after1 = await prisma.workPlanTask.count({ where: { workPlanId: plan.id, resourceId: r1.id } });
  const after2 = await prisma.workPlanTask.count({ where: { workPlanId: plan.id, resourceId: r2.id } });
  console.log(`After: r1=${after1} tasks, r2=${after2} tasks`);

  const r2FirstTask = await prisma.workPlanTask.findFirst({
    where: { workPlanId: plan.id, resourceId: r2.id },
    orderBy: { sequenceOrder: "asc" },
    include: { street: { select: { name: true } } },
  });
  console.log(`r2's task #0 is now: "${r2FirstTask?.street.name}" (should be "${firstTaskOfR1.street.name}")`);
  console.log(`r2 task #0 planned: ${r2FirstTask?.plannedStart.toTimeString().slice(0, 5)}-${r2FirstTask?.plannedEnd.toTimeString().slice(0, 5)}`);

  // Check r2's second task time now reflects real travel from the newly-inserted first task.
  const r2SecondTask = await prisma.workPlanTask.findFirst({
    where: { workPlanId: plan.id, resourceId: r2.id, sequenceOrder: 1 },
    include: { street: { select: { name: true } } },
  });
  console.log(`r2's task #1: "${r2SecondTask?.street.name}", distance from prev: ${Math.round(r2SecondTask?.distanceM ?? 0)}m, planned: ${r2SecondTask?.plannedStart.toTimeString().slice(0,5)}-${r2SecondTask?.plannedEnd.toTimeString().slice(0,5)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
