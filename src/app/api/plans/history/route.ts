import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/server/dateUtils";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "missing date" }, { status: 400 });

  const date = parseDateOnly(dateStr);

  const versions = await prisma.workPlan.findMany({
    where: { date },
    orderBy: { versionNumber: "asc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { tasks: true } },
      changes: { include: { changedBy: { select: { name: true } } }, orderBy: { changedAt: "asc" } },
    },
  });

  return NextResponse.json(
    versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      createdByName: v.createdBy.name,
      createdAt: v.createdAt,
      taskCount: v._count.tasks,
      parentVersionId: v.parentVersionId,
      changes: v.changes.map((c) => ({
        description: c.description,
        changedByName: c.changedBy.name,
        changedAt: c.changedAt,
        changeType: c.changeType,
      })),
    }))
  );
}
