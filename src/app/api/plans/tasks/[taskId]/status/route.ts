import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const bodySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "NOT_DONE", "PROBLEM"]),
  employeeComment: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.workPlanTask.findUnique({
    where: { id: taskId },
    include: { resource: { select: { assignedEmployeeId: true } }, workPlan: { select: { date: true } } },
  });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Employees may only update their own assigned resource's tasks.
  if (session.user.role === "EMPLOYEE" && task.resource.assignedEmployeeId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const data: {
    status: "PENDING" | "IN_PROGRESS" | "DONE" | "NOT_DONE" | "PROBLEM";
    employeeComment?: string;
    actualStart?: Date;
    actualEnd?: Date;
  } = { status: parsed.data.status };
  if (parsed.data.employeeComment !== undefined) data.employeeComment = parsed.data.employeeComment;
  if (parsed.data.status === "IN_PROGRESS" && !task.actualStart) data.actualStart = now;
  if ((parsed.data.status === "DONE" || parsed.data.status === "NOT_DONE") && !task.actualEnd) data.actualEnd = now;

  const updated = await prisma.workPlanTask.update({ where: { id: taskId }, data });

  if (parsed.data.status === "DONE") {
    const existingLog = await prisma.streetCleaningLog.findFirst({ where: { workPlanTaskId: task.id } });
    if (existingLog) {
      await prisma.streetCleaningLog.update({ where: { id: existingLog.id }, data: { completed: true } });
    } else {
      await prisma.streetCleaningLog.create({
        data: { streetId: task.streetId, date: task.workPlan.date, workPlanTaskId: task.id, completed: true },
      });
    }
  }

  return NextResponse.json(updated);
}
