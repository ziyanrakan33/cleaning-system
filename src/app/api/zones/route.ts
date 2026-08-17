import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const zone = await prisma.operationalZone.create({ data: parsed.data });
  return NextResponse.json(zone, { status: 201 });
}
