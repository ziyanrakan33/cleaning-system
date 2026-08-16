import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseDateOnly } from "@/server/dateUtils";

const setSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "BROKEN", "MAINTENANCE"]),
  reason: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await prisma.resourceAvailability.findMany({
    where: { resourceId: id },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(rows);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = setSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const date = parseDateOnly(parsed.data.date);

  const row = await prisma.resourceAvailability.upsert({
    where: { resourceId_date: { resourceId: id, date } },
    create: { resourceId: id, date, status: parsed.data.status, reason: parsed.data.reason },
    update: { status: parsed.data.status, reason: parsed.data.reason },
  });

  return NextResponse.json(row);
}
