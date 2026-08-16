import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "BROKEN", "MAINTENANCE", "INACTIVE"]).optional(),
  assignedEmployeeId: z.string().nullable().optional(),
  workHoursStart: z.string().nullable().optional(),
  workHoursEnd: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const resource = await prisma.resource.update({ where: { id }, data: parsed.data });
  return NextResponse.json(resource);
}
