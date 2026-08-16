import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { setStreetGeometry } from "@/server/geo.service";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["STREET", "PATH", "PEDESTRIAN_MALL", "PUBLIC_AREA", "OTHER"]),
  zoneId: z.string().nullable().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).default("NORMAL"),
  cleaningFrequency: z.object({
    type: z.enum(["DAILY", "TIMES_PER_WEEK", "WEEKLY", "SPECIFIC_DAYS", "AS_NEEDED"]),
    timesPerWeek: z.number().int().min(1).max(7).optional(),
    days: z.array(z.string()).optional(),
  }),
  estimatedCleanMinutes: z.number().int().min(0).nullable().optional(),
  notes: z.string().optional(),
  startLat: z.number().optional(),
  startLon: z.number().optional(),
  endLat: z.number().optional(),
  endLon: z.number().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { startLat, startLon, endLat, endLon, ...data } = parsed.data;

  const street = await prisma.street.create({ data: { ...data, source: "MANUAL" } });

  if (startLat != null && startLon != null && endLat != null && endLon != null) {
    await setStreetGeometry(street.id, [
      [startLon, startLat],
      [endLon, endLat],
    ]);
  }

  return NextResponse.json(street, { status: 201 });
}
