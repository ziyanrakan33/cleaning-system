import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  zoneId: z.string().nullable().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  cleaningFrequency: z
    .object({
      type: z.enum(["DAILY", "TIMES_PER_WEEK", "WEEKLY", "SPECIFIC_DAYS", "AS_NEEDED"]),
      timesPerWeek: z.number().int().min(1).max(7).optional(),
      days: z.array(z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"])).optional(),
    })
    .optional(),
  estimatedCleanMinutes: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "streets.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const street = await prisma.street.update({
    where: { id },
    data: parsed.data,
  });

  await audit({
    entityType: "Street",
    entityId: street.id,
    action: "STREET_UPDATED",
    userId: session.user.id,
    after: parsed.data,
    description: `רחוב "${street.name}" עודכן`,
  });

  return NextResponse.json(street);
}
