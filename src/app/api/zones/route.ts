import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  color: z.string().min(4),
  description: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const zones = await prisma.operationalZone.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: { _count: { select: { streets: true } } },
  });
  return NextResponse.json(zones);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "zones.editBoundary")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const zone = await prisma.operationalZone.create({ data: { ...parsed.data, createdById: session.user.id } });

  await audit({
    entityType: "OperationalZone",
    entityId: zone.id,
    action: "ZONE_CREATED",
    userId: session.user.id,
    after: { name: zone.name, code: zone.code },
    description: `נוצר אזור תפעולי "${zone.name}"`,
  });

  return NextResponse.json(zone, { status: 201 });
}
