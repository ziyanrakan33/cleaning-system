import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resources = await prisma.resource.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    include: {
      resourceType: true,
      assignedEmployee: { select: { id: true, name: true } },
      allowedZones: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json(resources);
}

const createSchema = z.object({
  resourceTypeId: z.string().min(1),
  identifier: z.string().min(1),
  name: z.string().optional(),
  status: z.enum(["ACTIVE", "BROKEN", "MAINTENANCE", "INACTIVE"]).default("ACTIVE"),
  assignedEmployeeId: z.string().nullable().optional(),
  workHoursStart: z.string().optional(),
  workHoursEnd: z.string().optional(),
  allowedZoneIds: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "resources.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { allowedZoneIds, ...data } = parsed.data;

  const resource = await prisma.resource.create({
    data: {
      ...data,
      attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
      allowedZones: allowedZoneIds ? { connect: allowedZoneIds.map((id) => ({ id })) } : undefined,
    },
  });
  return NextResponse.json(resource, { status: 201 });
}
