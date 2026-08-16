import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const types = await prisma.resourceType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { resources: true } } },
  });
  return NextResponse.json(types);
}

const createSchema = z.object({ name: z.string().min(1), code: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const type = await prisma.resourceType.create({ data: parsed.data });
  return NextResponse.json(type, { status: 201 });
}
